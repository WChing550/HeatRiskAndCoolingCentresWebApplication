import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from './db.js';
import { feelsLikeC, riskLevel } from './heat.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ml = path.resolve(here, '../../ml/heat_risk_prediction');
const HOUR = 3600000;
export const ALERT_WINDOW_HOURS = 24;
const error = (message, status = 503) => Object.assign(new Error(message), { status });
const finite = value => typeof value === 'number' && Number.isFinite(value);
const validTime = value => Number.isFinite(+new Date(value));
export const localDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const localTime = value => new Date(value).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) + ' MYT';

export async function recentWeather(fetchImpl = fetch, asOf = new Date()) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: '3.139', longitude: '101.6869', models: 'gfs_seamless',
    timezone: 'UTC', past_days: '4', forecast_days: '1', hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature' });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json', 'User-Agent': 'HeatSafeKL-FYP-Forecast/2.0' } });
      if (!response.ok) throw new Error('Weather source returned HTTP ' + response.status);
      const data = await response.json();
      const hourly = data.hourly;
      if (!Array.isArray(hourly?.time) || !Array.isArray(hourly.temperature_2m) || !Array.isArray(hourly.relative_humidity_2m) || !Array.isArray(hourly.apparent_temperature) ||
          hourly.time.length !== hourly.temperature_2m.length || hourly.time.length !== hourly.relative_humidity_2m.length || hourly.time.length !== hourly.apparent_temperature.length)
        throw new Error('Weather source returned incomplete hourly data');
      // API future values never become inputs to our trained forecasting model.
      const past = hourly.time.map((time, i) => ({ time, i, at: Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(time) ? time : time + 'Z') }))
        .filter(row => Number.isFinite(row.at) && row.at <= +asOf);
      if (past.length < 73) throw new Error('Weather source returned fewer than 73 recent hourly inputs');
      return { time: past.map(row => row.time), temperature_2m: past.map(row => hourly.temperature_2m[row.i]),
        relative_humidity_2m: past.map(row => hourly.relative_humidity_2m[row.i]), apparent_temperature: past.map(row => hourly.apparent_temperature[row.i]) };
    } catch (cause) {
      if (attempt === 2) throw error(cause.message + '. Previous forecasts have been kept.');
      await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }
}

export async function predictWeather(payload) {
  try { await fs.access(path.join(ml, 'models/feels-like.joblib')); }
  catch { throw error('Forecast model is not trained. Follow TRAINING-AND-SETUP.txt and run python ../ml/heat_risk_prediction/forecast.py train.'); }
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
      [path.join(ml, 'forecast.py'), 'predict'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' } });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(error('Forecast worker timed out.')); }, 90000);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 4*1024*1024) child.kill(); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.on('error', () => { clearTimeout(timer); reject(error('Cannot start Python. Install the ML requirements and configure PYTHON_BIN.')); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0) return reject(error('Forecast failed: ' + stderr.trim()));
      try { resolve(JSON.parse(stdout)); } catch { reject(error('Forecast worker returned invalid JSON.')); } });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(payload));
  });
}

export function validatePrediction(prediction, clock) {
  const input = new Date(prediction.input_at);
  if (!validTime(input) || +input > +clock || +clock - +input > 2*HOUR || prediction.source_model !== 'gfs_seamless' ||
      prediction.metric !== 'feels_like' || !prediction.model_version || prediction.model_version.length > 160 || !Array.isArray(prediction.forecasts) || prediction.forecasts.length !== 72)
    throw error('Prediction is incomplete, stale or from the wrong weather source; no forecast was saved.');
  const horizons = new Set();
  return prediction.forecasts.map(p => {
    if (!Number.isInteger(p.horizon_hours) || p.horizon_hours < 1 || p.horizon_hours > 72 || horizons.has(p.horizon_hours) ||
        !validTime(p.target_at) || +new Date(p.target_at) !== +input + p.horizon_hours*HOUR || !finite(p.temperature_c) ||
        p.temperature_c < -60 || p.temperature_c > 60 || !finite(p.humidity) || p.humidity < 0 || p.humidity > 100 || !finite(p.feels_like_c) || p.feels_like_c < -100 || p.feels_like_c > 100 || !p.selected_model)
      throw error('Invalid forecast horizon, target time or weather values; no forecast was saved.');
    horizons.add(p.horizon_hours);
    const feels = feelsLikeC(p.feels_like_c);
    return { ...p, feels_like_c: feels, risk_level: riskLevel(feels) };
  }).sort((a, b) => a.horizon_hours - b.horizon_hours);
}

export function advisoryPlans(points, clock, minimum = 'High') {
  const cutoff = +clock + ALERT_WINDOW_HOURS * HOUR;
  const groups = new Map();
  for (const p of points) {
    const target = +new Date(p.target_at);
    if (!Number.isFinite(target) || target <= +clock || target > cutoff ||
        !(['High', ...(minimum === 'Moderate' ? ['Moderate'] : [])].includes(p.risk_level))) continue;
    const date = localDate(p.target_at);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(p);
  }
  return [...groups.entries()].map(([date, values]) => {
    const ordered = [...values].sort((a, b) => +new Date(a.target_at) - +new Date(b.target_at));
    const peak = values.reduce((a, b) => Number(a.feels_like_c) >= Number(b.feels_like_c) ? a : b);
    const start = new Date(ordered[0].target_at), end = new Date(Math.min(+new Date(ordered.at(-1).target_at) + HOUR, cutoff));
    const lead = (+new Date(peak.target_at) - +clock)/HOUR;
    return { key: 'kl-feels:' + date, date, peak, window_start: start.toISOString(), window_end: end.toISOString(),
      lead_hours: lead, title: `${peak.risk_level} feels-like forecast · Kuala Lumpur · ${localTime(peak.target_at)}`,
      description: `${peak.risk_level} heat risk is predicted on ${localTime(peak.target_at)} in Kuala Lumpur. ` +
        `Predicted feels-like temperature: ${Number(peak.feels_like_c).toFixed(1)}°C. ` +
        `Hours meeting the project alert threshold fall between ${localTime(start)} and ${localTime(end)}; conditions can vary within this period. ` +
        `This advisory covers the next 24 hours and uses HeatSafe KL's trained feels-like forecasting model. Values are estimates of Open-Meteo apparent temperature. ` +
        `Plan shade breaks and check cooling-centre opening hours.` };
  });
}

export function createForecastService({ db = pool, fetchImpl = fetch, predictImpl = predictWeather, now = () => new Date(),
  autoPublish = () => process.env.AUTO_PUBLISH_FORECAST_ALERTS === 'true', minimumRisk = () => process.env.FORECAST_ALERT_MIN_RISK === 'Moderate' ? 'Moderate' : 'High' } = {}) {
  async function latest() {
    const batch = (await db.query("SELECT * FROM weather_forecast_batches WHERE area='Kuala Lumpur' AND issued_at>$1 AND input_at>$2 AND input_at<=$3 ORDER BY issued_at DESC,id DESC LIMIT 1",
      [new Date(+now() - 90*60000), new Date(+now() - 2*HOUR), now()])).rows[0];
    if (!batch) return { batch: null, forecasts: [], message: 'No fresh forecast is available. The administrator can check the forecast job.' };
    const points = (await db.query('SELECT horizon_hours,target_at,temperature_c,humidity,feels_like_c,risk_level,selected_model FROM weather_forecast_points WHERE batch_id=$1 AND horizon_hours<=72 AND target_at>$2 ORDER BY horizon_hours', [batch.id, now()])).rows;
    return { batch, forecasts: points, message: null };
  }

  async function run({ dryRun = false } = {}) {
    if (predictImpl === predictWeather) {
      try { await fs.access(path.join(ml, 'models/feels-like.joblib')); }
      catch { throw error('Forecast model is not trained. Run python ../ml/heat_risk_prediction/forecast.py train first.'); }
    }
    const inputClock = now();
    const hourly = await recentWeather(fetchImpl, inputClock);
    const raw = await predictImpl({ hourly, source_model: 'gfs_seamless', as_of: inputClock.toISOString() });
    const clock = now();
    const points = validatePrediction(raw, clock), plans = advisoryPlans(points, clock, minimumRisk());
    if (dryRun) return { database_written: false, input_at: raw.input_at, issued_at: clock.toISOString(),
      model_version: raw.model_version, forecasts: points, proposed_advisories: plans,
      config: { auto_publish: autoPublish(), minimum_risk: minimumRisk(), alert_window_hours: ALERT_WINDOW_HOURS } };
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const batch = (await c.query("INSERT INTO weather_forecast_batches(area,issued_at,input_at,model_version,source_model,reference) VALUES('Kuala Lumpur',$1,$2,$3,$4,$5) ON CONFLICT(area,input_at,model_version) DO UPDATE SET issued_at=EXCLUDED.issued_at RETURNING *",
        [clock, raw.input_at, raw.model_version, raw.source_model, raw.reference || 'Modelled GFS weather'])).rows[0];
      for (const p of points) {
        const e = p.evaluation || {};
        await c.query('INSERT INTO weather_forecast_points(batch_id,horizon_hours,target_at,temperature_c,humidity,feels_like_c,risk_level,selected_model,evaluation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(batch_id,horizon_hours) DO UPDATE SET temperature_c=EXCLUDED.temperature_c,humidity=EXCLUDED.humidity,feels_like_c=EXCLUDED.feels_like_c,risk_level=EXCLUDED.risk_level,selected_model=EXCLUDED.selected_model,evaluation=EXCLUDED.evaluation',
          [batch.id, p.horizon_hours, p.target_at, p.temperature_c, p.humidity, p.feels_like_c, p.risk_level, p.selected_model,
            JSON.stringify({ test: e.test, persistence_mae_c: e.persistence?.feels_like_mae_c, seasonal_naive_mae_c: e.seasonal_naive?.feels_like_mae_c, beats_best_baseline: e.beats_best_baseline })]);
      }
      const outcomes = [];
      const existing = (await c.query("SELECT * FROM heat_alerts WHERE automation_key LIKE 'kl-feels:%' FOR UPDATE")).rows;
      for (const p of plans) {
        const old = existing.find(a => a.automation_key === p.key);
        if (old && !old.automation_managed) { outcomes.push({ date: p.date, action: 'admin_override' }); continue; }
        const status = autoPublish() || old?.status === 'published' ? 'published' : 'draft';
        const fields = [p.title, p.description, p.peak.risk_level, new Date(p.window_end), status,
          status === 'published' ? clock : null, batch.id, p.peak.target_at, p.window_start, p.window_end, p.lead_hours];
        if (old) {
          await c.query("UPDATE heat_alerts SET title=$1,description=$2,severity=$3,ends_at=$4,status=$5,published_at=COALESCE(published_at,$6),weather_forecast_batch_id=$7,forecast_target_at=$8,forecast_window_start=$9,forecast_window_end=$10,forecast_lead_hours=$11,forecast_initial_lead_hours=CASE WHEN $5::varchar='published' THEN COALESCE(forecast_initial_lead_hours,$11) ELSE forecast_initial_lead_hours END,forecast_revision_note='Updated from the latest forecast',suppressed_until=NULL,updated_at=NOW() WHERE id=$12", [...fields, old.id]);
          outcomes.push({ date: p.date, action: status === 'published' && old.status !== 'published' ? 'published' : 'updated', lead_hours: p.lead_hours });
        } else {
          await c.query("INSERT INTO heat_alerts(title,description,severity,ends_at,status,published_at,weather_forecast_batch_id,forecast_target_at,forecast_window_start,forecast_window_end,forecast_lead_hours,forecast_initial_lead_hours,affected_area,starts_at,origin,automation_key,automation_managed,forecast_metric) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CASE WHEN $5::varchar='published' THEN $11 ELSE NULL END,'Kuala Lumpur',$12,'forecast',$13,TRUE,'feels_like')", [...fields, clock, p.key]);
          outcomes.push({ date: p.date, action: status === 'published' ? 'published' : 'draft', lead_hours: p.lead_hours });
        }
      }
      const coveredStart = +new Date(points[0].target_at), coveredEnd = +new Date(points.at(-1).target_at) + HOUR;
      for (const a of existing) {
        if (!a.automation_managed || !['draft', 'published'].includes(a.status) || plans.some(p => p.key === a.automation_key)) continue;
        if (+new Date(a.forecast_target_at) > +clock + ALERT_WINDOW_HOURS * HOUR) {
          await c.query("UPDATE heat_alerts SET status='deactivated',forecast_revision_note='Withdrawn: predicted peak is outside the next 24 hours',updated_at=NOW() WHERE id=$1", [a.id]);
          outcomes.push({ date: localDate(a.forecast_target_at), action: 'outside_24_hour_window' });
          continue;
        }
        if (+new Date(a.forecast_window_start) >= coveredStart && +new Date(a.forecast_window_end) <= coveredEnd && +new Date(a.forecast_window_end) > +clock) {
          await c.query("UPDATE heat_alerts SET status='deactivated',forecast_revision_note='Cancelled: the latest forecast is below the configured alert threshold',updated_at=NOW() WHERE id=$1", [a.id]);
          outcomes.push({ date: localDate(a.forecast_target_at), action: 'cancelled_below_threshold' });
        }
      }
      await c.query('COMMIT');
      return { batch_id: batch.id, input_at: raw.input_at, model_version: raw.model_version, points: points.length,
        advisories: outcomes, config: { auto_publish: autoPublish(), minimum_risk: minimumRisk(), alert_window_hours: ALERT_WINDOW_HOURS } };
    } catch (cause) { await c.query('ROLLBACK').catch(() => {}); throw cause; }
    finally { c.release(); }
  }

  async function scheduled() {
    const c = await db.connect(); let acquired = false, job;
    try {
      acquired = (await c.query("SELECT pg_try_advisory_lock(hashtext('heatsafe-feels72')) AS acquired")).rows[0].acquired;
      if (!acquired) return { skipped: 'A forecast job is already running.' };
      job = (await c.query('INSERT INTO weather_forecast_jobs DEFAULT VALUES RETURNING id')).rows[0].id;
      const result = await run();
      await c.query("UPDATE weather_forecast_jobs SET status='success',finished_at=NOW(),summary=$1 WHERE id=$2", [JSON.stringify(result), job]);
      return result;
    } catch (cause) {
      if (job) await c.query("UPDATE weather_forecast_jobs SET status='failed',finished_at=NOW(),error=$1 WHERE id=$2", [cause.message.slice(0, 1600), job]).catch(() => {});
      throw cause;
    } finally { if (acquired) await c.query("SELECT pg_advisory_unlock(hashtext('heatsafe-feels72'))").catch(() => {}); c.release(); }
  }
  return { latest, run, scheduled };
}

export function registerForecastRoutes(app, { auth, admin, ar, db = pool, service = createForecastService({ db }) }) {
  const route = handler => ar(async (q, s) => { try { await handler(q, s); } catch (cause) {
    if (['42P01', '42703'].includes(cause.code)) throw error('Run server/sql/heat-risk-forecast.sql in the API database, then restart the server.');
    throw cause;
  } });
  app.get('/api/weather/forecast', route(async (_q, s) => { s.set('Cache-Control', 'no-store').json(await service.latest()); }));
  app.get('/api/admin/forecast/status', auth, admin, route(async (_q, s) => {
    let model = null, ready = false;
    try { model = JSON.parse(await fs.readFile(path.join(ml, 'models/feels-like-evaluation.json'), 'utf8')); await fs.access(path.join(ml, 'models/feels-like.joblib')); ready = model.metric === 'feels_like' && model.feature_version === 'kl-feels-lags72-direct72-v1'; } catch { /* user trains first */ }
    const jobs = (await db.query('SELECT * FROM weather_forecast_jobs ORDER BY started_at DESC,id DESC LIMIT 8')).rows;
    s.json({ model_ready: ready, model, jobs, public_horizons: [24, 48, 72], internal_horizon: 72, metric: 'feels_like', alert_window_hours: ALERT_WINDOW_HOURS });
  }));
}

function demonstration() {
  const clock = new Date(), input = new Date(clock); input.setUTCMinutes(0, 0, 0);
  const points = Array.from({ length: 72 }, (_, i) => ({ horizon_hours: i + 1, target_at: new Date(+input + (i + 1)*HOUR).toISOString(),
    feels_like_c: i === 2 ? 42 : i === 25 ? 45 : 30, risk_level: [2, 25].includes(i) ? 'High' : 'Low' }));
  return { demo: true, source: 'Synthetic demonstration, not an ML prediction', database_written: false,
    issued_at: clock.toISOString(), alert_window_hours: ALERT_WINDOW_HOURS,
    example_excluded_target: points[25].target_at, proposed_advisories: advisoryPlans(points, clock) };
}

async function main() {
  try {
    const task = process.argv[2];
    if (task === 'migrate') { await pool.query(await fs.readFile(path.resolve(here, '../sql/heat-risk-forecast.sql'), 'utf8')); console.log('Feels-like forecast migration complete.'); }
    else if (task === 'demo') console.log(JSON.stringify(demonstration(), null, 2));
    else if (task === 'run') { const service = createForecastService(); console.log(JSON.stringify(process.argv.includes('--dry-run') ? await service.run({ dryRun: true }) : await service.scheduled(), null, 2)); }
    else throw new Error('Usage: node src/forecast.js migrate|run [--dry-run]|demo');
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(cause => { console.error(cause.message); process.exitCode = 1; });
