"""Train and run direct 72-hour feels-like forecasts using past-only weather inputs."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
import joblib
import numpy as np
import pandas as pd
import requests
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent
HORIZONS = list(range(1, 73))
SOURCE = 'gfs_seamless'
METRIC = 'feels_like'
FEATURE_VERSION = 'kl-feels-lags72-direct72-v1'
COLUMNS = ['temperature', 'humidity', 'feels_like']
API_COLUMNS = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature']


def rounded(values):
    return np.floor(np.asarray(values) * 10 + .5) / 10


def risk(values):
    return np.where(values <= 32, 'Low', np.where(values <= 40, 'Moderate', 'High'))


def frame_from_hourly(hourly):
    frame = pd.DataFrame({'time': hourly['time'], **{c: hourly[a] for c, a in zip(COLUMNS, API_COLUMNS)}})
    frame.index = pd.to_datetime(frame.pop('time'), utc=True)
    if frame.index.isna().any():
        raise ValueError('Dataset contains invalid timestamps')
    frame = frame[~frame.index.duplicated()].sort_index().asfreq('h')
    for col in COLUMNS:
        frame[col] = pd.to_numeric(frame[col], errors='coerce')
    for col, lower, upper in [('temperature', -60, 60), ('humidity', 0, 100), ('feels_like', -100, 100)]:
        frame.loc[~frame[col].between(lower, upper), col] = np.nan
    return frame


def features(frame):
    x = pd.DataFrame(index=frame.index)
    for col in COLUMNS:
        for lag in [0, 1, 2, 3, 6, 12, 24, 25, 48, 72]:
            x[f'{col}_lag_{lag}'] = frame[col].shift(lag)
        for window in [3, 6, 12, 24, 48, 72]:
            x[f'{col}_mean_{window}'] = frame[col].rolling(window).mean()
        x[f'{col}_trend_3'] = frame[col] - frame[col].shift(3)
        x[f'{col}_change_24'] = frame[col] - frame[col].shift(24)
    local = frame.index.tz_convert('Asia/Kuala_Lumpur')
    for name, values, period in [('hour', local.hour, 24), ('year', local.day_of_year, 365.25)]:
        x[f'{name}_sin'] = np.sin(2 * np.pi * values / period)
        x[f'{name}_cos'] = np.cos(2 * np.pi * values / period)
    return x


def download(start, end, refresh=False):
    if pd.Timestamp(start) >= pd.Timestamp(end):
        raise ValueError('Start date must precede end date')
    if pd.Timestamp(end, tz='UTC') >= pd.Timestamp.now(tz='UTC').normalize() - pd.Timedelta(days=2):
        raise ValueError('End the dataset at least three days before today')
    path = ROOT/'data'/f'kl-feels-like-hourly-{start}-{end}.csv'
    if path.exists() and not refresh:
        raw = pd.read_csv(path)
        if not set(['time'] + COLUMNS).issubset(raw.columns):
            raise ValueError('Dataset lacks apparent-temperature targets; download with --refresh')
        return frame_from_hourly({'time': raw.time, **{a: raw[c] for c, a in zip(COLUMNS, API_COLUMNS)}}), path
    batches = []
    for year in range(pd.Timestamp(start).year, pd.Timestamp(end).year + 1):
        first, last = max(start, f'{year}-01-01'), min(end, f'{year}-12-31')
        print(f'Downloading {first} to {last}', file=sys.stderr, flush=True)
        for attempt in range(3):
            try:
                response = requests.get('https://historical-forecast-api.open-meteo.com/v1/forecast',
                    params={'latitude': 3.139, 'longitude': 101.6869, 'start_date': first, 'end_date': last,
                            'hourly': ','.join(API_COLUMNS), 'models': SOURCE, 'timezone': 'UTC'}, timeout=120)
                response.raise_for_status()
                batches.append(frame_from_hourly(response.json()['hourly']))
                break
            except (requests.RequestException, KeyError, ValueError) as cause:
                if attempt == 2:
                    raise ValueError('Archive download failed; the existing cached CSV has been kept') from cause
                time.sleep(5 * (attempt + 1))
        time.sleep(1)
    frame = pd.concat(batches).sort_index()
    frame = frame[~frame.index.duplicated()].asfreq('h')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.csv.tmp')
    frame.to_csv(temporary, index_label='time')
    temporary.replace(path)
    return frame, path


def score(actual, predicted):
    p = np.asarray(predicted).copy()
    p[:, 1] = np.clip(p[:, 1], 0, 100)
    reference, estimate = rounded(actual[:, 2]), rounded(p[:, 2])
    reference_risk, predicted_risk = risk(reference), risk(estimate)
    high, signalled = reference > 40, estimate > 40
    correct = int(np.sum(high & signalled))
    return {'samples': len(actual), 'feels_like_mae_c': float(np.abs(reference-estimate).mean()),
        'feels_like_mse_c2': float(((reference-estimate)**2).mean()),
        'feels_like_rmse_c': float(np.sqrt(((reference-estimate)**2).mean())),
        'temperature_mae_c': float(np.abs(actual[:, 0]-p[:, 0]).mean()),
        'humidity_mae_pct': float(np.abs(actual[:, 1]-p[:, 1]).mean()),
        'risk_accuracy': float((reference_risk == predicted_risk).mean()),
        'high_reference_samples': int(high.sum()), 'high_predicted_samples': int(signalled.sum()),
        'high_precision': correct/int(signalled.sum()) if signalled.sum() else None,
        'high_recall': correct/int(high.sum()) if high.sum() else None,
        'risk_confusion': {a: {b: int(((reference_risk == a)&(predicted_risk == b)).sum())
                               for b in ['Low', 'Moderate', 'High']} for a in ['Low', 'Moderate', 'High']}}


def prepare(frame, minimum_rows=5000):
    x = features(frame)
    y = pd.concat([frame[COLUMNS].shift(-h).rename(columns=lambda c: f'{c}_h{h}') for h in HORIZONS], axis=1)
    valid = x.notna().all(axis=1) & y.notna().all(axis=1)
    x, y = x.loc[valid], y.loc[valid]
    if len(x) < minimum_rows:
        raise ValueError(f'At least {minimum_rows} complete training origins are required')
    first, second = int(len(x)*.70), int(len(x)*.85)
    purge = pd.Timedelta(hours=72)
    tr = x.index[x.index+purge < x.index[first]]
    va = x.index[(x.index >= x.index[first]) & (x.index+purge < x.index[second])]
    te = x.index[second:]
    if not len(tr) or not len(va) or not len(te):
        raise ValueError('Insufficient chronological data after the 72-hour target embargo')
    return x, y, tr, va, te


def train_models(frame, dataset_path, out, estimators=None, minimum_rows=5000, reference=None):
    x, y, tr, va, te = prepare(frame, minimum_rows)
    models = estimators or {
        'linear_regression': make_pipeline(StandardScaler(), LinearRegression()),
        'random_forest': RandomForestRegressor(n_estimators=80, max_depth=8,
            min_samples_leaf=12, max_samples=.8, n_jobs=2, random_state=42),
        'gradient_boosting': MultiOutputRegressor(HistGradientBoostingRegressor(max_iter=80,
            max_leaf_nodes=12, l2_regularization=2, learning_rate=.06, early_stopping=False, random_state=42))}
    validation, comparison, predictions = {}, [], []
    for name, estimator in models.items():
        print('Training / validating '+name, file=sys.stderr, flush=True)
        estimator.fit(x.loc[tr], y.loc[tr])
        p = estimator.predict(x.loc[va])
        validation[name] = {str(h): score(y.loc[va].values[:, 3*i:3*i+3], p[:, 3*i:3*i+3]) for i, h in enumerate(HORIZONS)}
        comparison.extend({'phase': 'validation', 'model': name, 'horizon_hours': h,
                           **validation[name][str(h)]} for h in HORIZONS)
    chosen = {str(h): min(models, key=lambda n: validation[n][str(h)]['feels_like_mae_c']) for h in HORIZONS}
    train_valid = x.index[x.index+pd.Timedelta(hours=72) < te[0]]
    candidate_predictions = {}
    for name, estimator in models.items():
        print('Testing '+name, file=sys.stderr, flush=True)
        estimator.fit(x.loc[train_valid], y.loc[train_valid])
        candidate_predictions[name] = estimator.predict(x.loc[te])
    evaluation = {}
    for i, h in enumerate(HORIZONS):
        actual = y.loc[te].values[:, 3*i:3*i+3]
        selected = chosen[str(h)]
        p = candidate_predictions[selected][:, 3*i:3*i+3].copy()
        p[:, 1] = np.clip(p[:, 1], 0, 100)
        persistence = frame.loc[te, COLUMNS].values
        lag = math.ceil(h/24)*24-h
        seasonal = frame[COLUMNS].shift(lag).loc[te].values
        item = {'selected_model': selected, 'test': score(actual, p),
                'persistence': score(actual, persistence), 'seasonal_naive': score(actual, seasonal)}
        item['beats_best_baseline'] = item['test']['feels_like_mae_c'] < min(item['persistence']['feels_like_mae_c'], item['seasonal_naive']['feels_like_mae_c'])
        evaluation[str(h)] = item
        for name, values in candidate_predictions.items():
            comparison.append({'phase': 'test', 'model': name, 'horizon_hours': h, **score(actual, values[:, 3*i:3*i+3])})
        comparison.extend({'phase': 'test', 'model': name, 'horizon_hours': h, **item[key]}
                          for name, key in [('persistence', 'persistence'), ('seasonal_naive', 'seasonal_naive')])
        predictions.append(pd.DataFrame({'origin_utc': te, 'target_utc': te+pd.Timedelta(hours=h),
            'horizon_hours': h, 'model': selected, 'reference_temperature_c': actual[:, 0],
            'predicted_temperature_c': p[:, 0], 'reference_humidity': actual[:, 1], 'predicted_humidity': p[:, 1],
            'reference_feels_like_c': rounded(actual[:, 2]), 'predicted_feels_like_c': rounded(p[:, 2]),
            'reference_risk': risk(rounded(actual[:, 2])), 'predicted_risk': risk(rounded(p[:, 2]))}))
    digest = hashlib.sha256(Path(dataset_path).read_bytes()).hexdigest()
    meta = {'feature_version': FEATURE_VERSION, 'metric': METRIC, 'horizons': HORIZONS,
        'highlight_horizons': [24, 48, 72], 'source_model': SOURCE,
        'reference': reference or 'Open-Meteo GFS apparent_temperature; archived modelled feels-like weather, not independent station measurements',
        'dataset_sha256': digest, 'dataset_rows': len(frame), 'usable_origins': len(x),
        'feature_columns': list(x.columns), 'validation': validation, 'horizons_evaluation': evaluation,
        'partitions': {'training': [str(tr.min()), str(tr.max())], 'validation': [str(va.min()), str(va.max())],
            'test': [str(te.min()), str(te.max())], 'purge_hours': 72},
        'production_refit_through': str(x.index.max()+pd.Timedelta(hours=72)),
        'python': sys.version.split()[0], 'scikit_learn': sklearn.__version__,
        'attribution': 'Weather data by Open-Meteo.com (CC BY 4.0)'}
    signature = hashlib.sha256(json.dumps({n: str(m) for n, m in models.items()}, sort_keys=True).encode()).hexdigest()[:6]
    meta['version'] = FEATURE_VERSION+'-'+digest[:10]+'-'+signature
    for name, estimator in models.items():
        print('Production refit '+name, file=sys.stderr, flush=True)
        estimator.fit(x, y)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    temporary = out/'feels-like.joblib.tmp'
    joblib.dump({'models': models, 'metadata': meta}, temporary, compress=3)
    (out/'feels-like-evaluation.json').write_text(json.dumps(meta, indent=2, allow_nan=False), encoding='utf-8')
    pd.DataFrame(comparison).drop(columns=['risk_confusion']).to_csv(out/'feels-like-comparison.csv', index=False)
    pd.concat(predictions, ignore_index=True).to_csv(out/'feels-like-test-predictions.csv', index=False)
    temporary.replace(out/'feels-like.joblib')
    return meta


def predict(payload, artifacts=None):
    bundle = joblib.load(Path(artifacts or ROOT/'models')/'feels-like.joblib')
    meta = bundle['metadata']
    if meta.get('metric') != METRIC or meta.get('feature_version') != FEATURE_VERSION or meta.get('scikit_learn') != sklearn.__version__:
        raise ValueError('Install the pinned requirements and train the new 72-hour feels-like model; old heat-index models are incompatible')
    if payload.get('source_model') != meta['source_model']:
        raise ValueError('Input weather source must match the training source')
    clock = pd.Timestamp(payload['as_of'])
    if clock.tzinfo is None:
        raise ValueError('as_of requires a timezone')
    frame = frame_from_hourly(payload['hourly'])
    frame = frame.loc[frame.index <= clock]
    x = features(frame)
    if x.empty or not x.iloc[-1].notna().all():
        raise ValueError('73 complete recent hourly inputs are required; future rows are excluded')
    origin = x.index[-1]
    if clock-origin > pd.Timedelta(hours=2):
        raise ValueError('Recent weather is stale; no prediction was made')
    if origin <= pd.Timestamp(meta['production_refit_through']):
        raise ValueError('Prediction origin must be after the training dataset')
    used = {v['selected_model'] for v in meta['horizons_evaluation'].values()}
    values = {n: bundle['models'][n].predict(x.iloc[[-1]][meta['feature_columns']])[0] for n in used}
    forecasts = []
    for i, h in enumerate(HORIZONS):
        evaluation = meta['horizons_evaluation'][str(h)]
        p = values[evaluation['selected_model']]
        t, rh, feels = float(p[3*i]), float(np.clip(p[3*i+1], 0, 100)), float(rounded(p[3*i+2]))
        if not math.isfinite(t) or not -60 <= t <= 60 or not math.isfinite(feels) or not -100 <= feels <= 100:
            raise ValueError('The model produced an invalid weather value')
        forecasts.append({'horizon_hours': h, 'target_at': (origin+pd.Timedelta(hours=h)).isoformat(),
            'temperature_c': t, 'humidity': rh, 'feels_like_c': feels,
            'selected_model': evaluation['selected_model'], 'evaluation': evaluation})
    return {'input_at': origin.isoformat(), 'model_version': meta['version'], 'metric': METRIC,
        'source_model': SOURCE, 'reference': meta['reference'], 'forecasts': forecasts}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('task', choices=['download', 'train', 'inspect', 'predict'])
    parser.add_argument('--start', default='2023-01-01')
    parser.add_argument('--end', default='2026-10-31')
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    if args.task == 'predict':
        result = predict(json.load(sys.stdin))
    elif args.task == 'inspect':
        path = ROOT/'models/feels-like-evaluation.json'
        result = json.loads(path.read_text()) if path.exists() else {'model_ready': False, 'message': 'Train the new feels-like model first.'}
    else:
        frame, path = download(args.start, args.end, args.refresh)
        if args.task == 'download':
            result = {'csv': str(path), 'rows': len(frame), 'missing_values': frame.isna().sum().to_dict(),
                      'dataset_sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        else:
            meta = train_models(frame, path, ROOT/'models')
            result = {'version': meta['version'], 'output': str(ROOT/'models'),
                      'evaluation': {str(h): meta['horizons_evaluation'][str(h)] for h in [24, 48, 72]}}
    print(json.dumps(result, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as cause:
        print(str(cause), file=sys.stderr)
        sys.exit(1)
