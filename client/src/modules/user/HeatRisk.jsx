import React, { useEffect, useMemo, useState } from 'react';
import { LocateFixed, RefreshCw, MapPin } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { api } from '../../lib/api.js';

const forecastTime = value => new Date(value).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
const number = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—';

function HeatForecast({ isAdmin }) {
  const [data, setData] = useState(null), [status, setStatus] = useState(null), [error, setError] = useState('');
  const [windowHours, setWindowHours] = useState(72), [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (document.hidden) return;
      try {
        const result = await api('/weather/forecast', { signal: controller.signal });
        setData(result); setError('');
        if (isAdmin) setStatus(await api('/admin/forecast/status', { signal: controller.signal }).catch(() => null));
      } catch (e) { if (e.name !== 'AbortError') { setData(null); setError(e.message); } }
    };
    load(); const timer = setInterval(load, 60000);
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { controller.abort(); clearInterval(timer); observer.disconnect(); };
  }, [isAdmin]);
  const points = data?.forecasts || [];
  const visible = points.filter(p => Number(p.horizon_hours) <= windowHours);
  const peak = visible.reduce((a, p) => !a || Number(p.feels_like_c) > Number(a.feels_like_c) ? p : a, null);
  const chart = useMemo(() => ({
    labels: visible.map(p => forecastTime(p.target_at)),
    datasets: [
      { label: 'Predicted feels-like temperature °C', data: visible.map(p => Number(p.feels_like_c)), borderColor: dark ? '#ffba83' : '#ce6a34', backgroundColor: dark ? '#ffba831c' : '#e9a16820', fill: true, tension: .25, pointRadius: windowHours > 24 ? 1.5 : 3 },
      { label: 'Predicted air temperature °C', data: visible.map(p => Number(p.temperature_c)), borderColor: dark ? '#88dcd2' : '#6488a8', tension: .25, pointRadius: windowHours > 24 ? 1 : 2 },
    ],
  }), [data, windowHours, dark]);
  const color = dark ? '#dce5f4' : '#506675', grid = dark ? '#3c465a' : '#e1e7eb';
  return <section className="panel heat-forecast" aria-label="Kuala Lumpur feels-like forecast">
    <header className="panelhead"><div><small className="eyebrow">LOOK AHEAD · KUALA LUMPUR</small><h3>Plan the next three days</h3><p>Hourly feels-like estimates for the next 72 hours.</p></div><span className="pill draft">ML forecast estimate</span></header>
    {points.length ? <>
      <div className="forecast-choices" role="group" aria-label="Forecast window">{[24, 48, 72].map(h => {
        const p = points.find(p => Number(p.horizon_hours) === h);
        return <button key={h} type="button" className={'forecast-choice' + (windowHours === h ? ' selected' : '')} aria-pressed={windowHours === h} onClick={() => setWindowHours(h)}>
          <span>At +{h} hours</span><strong>{p ? number(p.feels_like_c) + '°C' : '—'}</strong><small>{p ? forecastTime(p.target_at) + ' MYT' : 'Estimate unavailable'}</small>{p && <span className={'pill ' + p.risk_level} aria-label={`${p.risk_level} project risk at +${h} hours`}>{p.risk_level}</span>}
        </button>;
      })}</div>
      {peak && <div className="forecast-peak"><div><small>HIGHEST IN THIS {windowHours}-HOUR WINDOW</small><b>{number(peak.feels_like_c)}°C · {forecastTime(peak.target_at)} MYT</b></div><span className={'pill ' + peak.risk_level}>{peak.risk_level} project risk</span></div>}
      <div className="forecast-plot"><Line data={chart} aria-label="Predicted feels-like temperature and air temperature by hour" role="img" options={{ responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { position: 'bottom', labels: { color, boxWidth: 14, padding: 18 } }, tooltip: { callbacks: { afterBody: items => visible[items[0]?.dataIndex] ? visible[items[0].dataIndex].risk_level + ' project risk' : '' } } },
        scales: { x: { grid: { display: false }, ticks: { color, maxTicksLimit: 4, maxRotation: 0, callback: (_value, i) => visible[i] ? [new Date(visible[i].target_at).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short' }), new Date(visible[i].target_at).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', hour12: true })] : '' }, title: { display: true, text: 'Malaysia time', color } }, y: { grid: { color: grid }, ticks: { color }, title: { display: true, text: '°C', color } } } }} /></div>
      <details className="forecast-hour-details"><summary>View all {visible.length} hourly estimates</summary><div className="forecast-hour-grid">{visible.map(p => <article key={p.horizon_hours}><time dateTime={p.target_at}>{forecastTime(p.target_at)} MYT</time><b>{number(p.feels_like_c)}°C <span className={'pill ' + p.risk_level}>{p.risk_level}</span></b><small>Air {number(p.temperature_c)}°C · Humidity {Math.round(Number(p.humidity))}%</small></article>)}</div></details>
      <p className="forecast-footnote">Issued {forecastTime(data.batch.issued_at)} MYT · Input hour {forecastTime(data.batch.input_at)} MYT. The +24/+48/+72 hour targets are measured from this input hour.</p>
    </> : <p role="status">{error ? isAdmin ? error : 'Forecasts are temporarily unavailable.' : data?.message || 'Loading hourly forecasts…'}</p>}
    <p className="forecast-footnote">Feels-like forecasts are generated by HeatSafe KL's trained model using recent weather inputs. Automatic advisories cover predicted heat risk in the next 24 hours.</p>
    <p className="forecast-footnote">These estimates describe a city reference point. Conditions at individual locations can differ. Weather inputs: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · modelled GFS data.</p>
    {isAdmin && status && <details className="forecast-evaluation"><summary>Model evaluation and processing</summary>{status.model_ready ? <><p>Compare errors at each lead time before enabling automatic publication. Lower average error does not establish reliable detection of extreme heat.</p><div className="tablewrap"><table><thead><tr><th>Target</th><th>Selected model</th><th>Test feels-like MAE</th><th>Persistence</th><th>Daily baseline</th><th>High test samples / recall</th></tr></thead><tbody>{[24, 48, 72].map(h => { const e = status.model?.horizons_evaluation?.[h]; return <tr key={h}><td>+{h} hours</td><td>{e?.selected_model?.replaceAll('_', ' ') || '—'}</td><td>{number(e?.test?.feels_like_mae_c)}°C</td><td>{number(e?.persistence?.feels_like_mae_c)}°C</td><td>{number(e?.seasonal_naive?.feels_like_mae_c)}°C</td><td>{e?.test?.high_reference_samples ?? '—'} / {e?.test?.high_recall == null ? 'Not measurable' : Math.round(e.test.high_recall * 100) + '%'}</td></tr>; })}</tbody></table></div><p>Model: {status.model.version}</p></> : <p>Train the new 72-hour feels-like model, then run the forecast job. Previous heat-index models cannot be used.</p>}
      <p>Last job: {status.jobs[0] ? status.jobs[0].status + ' · ' + forecastTime(status.jobs[0].started_at) + ' MYT' : 'Not run yet'}{status.jobs[0]?.error ? ' · ' + status.jobs[0].error : ''}</p>
    </details>}
  </section>;
}

export default function HeatRisk({ ctx }) {
  const {
    page,
    weather,
    weatherError,
    getWeather,
    locate,
    dt,
    Panel,
    isAdmin,
    weatherScope = 'city',
    setWeatherScope,
    userCoords,
    weatherLoading,
    locationError,
    refreshWeather,
  } = ctx;

  if (page !== 'heat') return null;

  const risk = weather?.risk_level;
  const personal = weatherScope === 'location';

  return (
    <>
      <div className="weather-scope">
        <div>
          <MapPin size={17} />

          <span>
            <b>
              {personal ? 'My current location' : 'Kuala Lumpur weather'}
            </b>

            <small>
              {personal
                ? 'Weather near your detected coordinates. This does not replace city monitoring.'
                : 'City monitoring uses Kuala Lumpur coordinates, regardless of your device location.'}
            </small>
          </span>
        </div>

        <div className="weather-scope-actions">
          <button
            className={`btn secondary ${!personal ? 'scope-selected' : ''}`}
            disabled={weatherLoading}
            onClick={() => {
              setWeatherScope('city');
              (isAdmin ? refreshWeather : getWeather)();
            }}
          >
            <RefreshCw size={14} />
            Refresh Kuala Lumpur weather
          </button>

          {personal && userCoords && (
            <button
              className="btn secondary"
              disabled={weatherLoading}
              onClick={() => getWeather(userCoords)}
            >
              <RefreshCw size={14} />
              Refresh my location weather
            </button>
          )}

          <button
            className="btn secondary"
            disabled={weatherLoading}
            onClick={() => locate(() => setWeatherScope('location'))}
          >
            <LocateFixed size={14} />
            {personal
              ? 'Detect my location again'
              : 'Use my current location'}
          </button>
        </div>
      </div>

      {weatherError && (
        <div className="notice" role="alert">
          {weatherError}
        </div>
      )}

      {locationError && locationError !== weatherError && (
        <div className="notice" role="alert">
          {locationError}
        </div>
      )}

      <div className={isAdmin ? 'admin-heat-reading' : 'columns heatcols'}>
        <div
          className={
            'heatbox ' +
            (risk === 'High'
              ? 'high'
              : risk === 'Moderate'
                ? 'moderate'
                : risk === 'Low'
                  ? 'low'
                  : 'unavailable')
          }
          aria-busy={weatherLoading}
        >
          <div className="heatbox-head">
            <b>
              ● {personal ? 'MY LOCATION' : 'KUALA LUMPUR'} FEELS-LIKE TEMPERATURE
            </b>

            <span>
              {risk ? `${risk} Risk` : 'Reading unavailable'}
            </span>
          </div>

          <div className="bigtemp">
            {weather?.feels_like_c ?? '—'}
            <small>°C</small>
          </div>

          <p>Feels-like temperature</p>

          <div className="heatstats">
            <div>
              <small>Air temperature</small>
              <b>{weather ? `${weather.temperature_c}°C` : '—'}</b>
            </div>

            <div>
              <small>Humidity</small>
              <b>{weather ? `${weather.humidity}%` : '—'}</b>
            </div>

            <div>
              <small>Conditions</small>
              <b>{weather?.weather_description || 'Unavailable'}</b>
            </div>
          </div>

          <small className="lastread">
            {personal
              ? `My location · ${weather?.city || 'Detected coordinates'}`
              : 'Kuala Lumpur'}
            {' · '}
            {weather?.observed_at ? forecastTime(weather.observed_at) + ' MYT' : 'Reading unavailable'}
          </small>

          <p className="forecast-footnote">Source: Open-Meteo GFS apparent temperature. Air temperature and feels-like temperature are different readings.</p>

          {personal && userCoords && (
            <small className="weather-coordinates">
              {Number(userCoords.latitude).toFixed(4)}°,{' '}
              {Number(userCoords.longitude).toFixed(4)}°
            </small>
          )}
        </div>

        {!isAdmin && (
          <Panel title="Recommended action" sub="Heat safety guidance">
            <h2>
              {risk === 'High'
                ? 'Reduce heat exposure'
                : risk === 'Moderate'
                  ? 'Take regular precautions'
                  : risk === 'Low'
                    ? 'Stay prepared'
                    : 'No current reading'}
            </h2>

            <p className="bodytext">
              {weather?.advice ||
                'Refresh the weather to load current conditions and guidance.'}
            </p>

            <ul className="guidelist">
              <li>✓ Drink water regularly</li>
              <li>✓ Take shade or indoor breaks</li>
              <li>✓ Check on vulnerable people</li>
            </ul>
          </Panel>
        )}
      </div>

      {!personal && <HeatForecast isAdmin={isAdmin} />}

      <div className="sectionhead">
        <div>
          <h3>Risk level reference</h3>
          <p>Project risk bands use feels-like temperature.</p>
        </div>
      </div>

      <div className="riskrefs">
        <div>
          <b>🟢 Low</b>
          <strong>≤ 32°C</strong>
          <p>Stay hydrated and use sensible precautions.</p>
        </div>

        <div>
          <b>🟠 Moderate</b>
          <strong>&gt; 32°C – 40°C</strong>
          <p>
            Limit strenuous outdoor activity and take shade breaks.
          </p>
        </div>

        <div>
          <b>🔴 High</b>
          <strong>&gt; 40°C</strong>
          <p>Reduce exposure and move to a cooler place.</p>
        </div>
      </div>
    </>
  );
}