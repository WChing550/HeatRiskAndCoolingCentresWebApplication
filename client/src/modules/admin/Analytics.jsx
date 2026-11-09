import React, { useEffect, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { ClipboardList, Clock3, XCircle, Download, Printer, ThermometerSun, Gauge, TrendingUp, Activity, CheckCircle2 } from 'lucide-react';
import { api, dt } from '../../lib/api.js';
import './analytics-print.css';

const RISK_COLORS = { Low: '#35a57a', Moderate: '#e5a13a', High: '#dc5a4f' };
const num = (v, unit = '') => (v == null ? '—' : v + unit);
const shortDay = value => new Date(value + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const hourLabel = h => `${String(h).padStart(2, '0')}:00`;
const chartOpts = (legend = false) => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: legend, position: 'bottom' } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#edf1f4' } } } });

function AnalyticsChart({ component: Chart, data, wide = false }) {
  const options = chartOpts(wide);
  const printOptions = {
    ...options,
    responsive: false,
    animation: false,
    devicePixelRatio: 2,
    scales: {
      x: { ...options.scales.x, ticks: { maxRotation: 0, maxTicksLimit: wide ? 9 : 7 } },
      y: options.scales.y,
    },
  };

  return (
    <>
      <div className={wide ? 'chart tall no-print' : 'chart no-print'}>
        <Chart data={data} options={options} />
      </div>
      <div className="analytics-print-chart print-only" aria-hidden="true">
        <Chart data={data} options={printOptions} width={wide ? 660 : 310} height={wide ? 190 : 170} />
      </div>
    </>
  );
}

function Change({ cur, prev, unit = '', goodWhenDown = true }) {
  if (cur == null || prev == null) return <span className="delta flat">—</span>;
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return <span className="delta flat">No change</span>;
  const worse = goodWhenDown ? diff > 0 : diff < 0;
  return <span className={'delta ' + (worse ? 'up' : 'down')}>{diff > 0 ? '▲ +' : '▼ '}{diff}{unit}</span>;
}

function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (typeof value === 'string' && /^(?:\s*[=+\-@]|[\t\r\n])/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCsv(data) {
  const { current: c, previous: p, reports } = data;
  const rows = [
    ['HeatSafe KL — heat-risk analytics'],
    ['Period', `Last ${data.days} days`],
    ['Generated (UTC)', new Date(data.generatedAt).toISOString()],
    ['Time zone for days and hours', data.timezone],
    [],
    ['SUMMARY', 'Selected period', 'Previous period'],
    ['Readings', c.readings, p.readings],
    ['Average heat index (°C)', c.avg_hi, p.avg_hi],
    ['Maximum heat index (°C)', c.max_hi, p.max_hi],
    ['Average temperature (°C)', c.avg_temp, p.avg_temp],
    ['Low-risk readings', c.low, p.low],
    ['Moderate-risk readings', c.moderate, p.moderate],
    ['High-risk readings', c.high, p.high],
    [],
    ['RISK FREQUENCY'],
    ['Risk level', 'Readings', 'Share (%)'],
    ...Object.keys(RISK_COLORS).map(level => {
      const count = c[level.toLowerCase()];
      return [level, count, c.readings ? Math.round(100 * count / c.readings) : null];
    }),
    [],
    ['DAILY READINGS'],
    ['Date', 'Average temperature (°C)', 'Average heat index (°C)', 'Maximum heat index (°C)', 'Readings', 'Low', 'Moderate', 'High'],
    ...data.daily.map(d => [d.day, d.avg_temp, d.avg_hi, d.max_hi, d.readings, d.low, d.moderate, d.high]),
    [],
    ['PEAK READINGS'],
    ['Date & time (UTC)', 'Heat index (°C)', 'Temperature (°C)', 'Humidity (%)', 'Risk', 'City'],
    ...data.peakReadings.map(r => [new Date(r.observed_at).toISOString(), r.heat_index_c, r.temperature_c, r.humidity, r.risk_level, r.city]),
    [],
    ['PEAK HEAT HOURS'],
    ['Hour', 'Average heat index (°C)', 'Maximum heat index (°C)', 'Readings'],
    ...data.hourly.map(h => [hourLabel(h.hour), h.avg_hi, h.max_hi, h.readings]),
    [],
    ['SAMPLED LOCATIONS (~1 km cells)'],
    ['Latitude', 'Longitude', 'Readings', 'Average heat index (°C)', 'Maximum heat index (°C)', 'Risk of average'],
    ...data.locations.map(l => [l.lat, l.lon, l.readings, l.avg_hi, l.max_hi, l.risk_level]),
    [],
    ['COMMUNITY REPORTS'],
    ['Submitted', 'Approved', 'Pending review', 'Rejected'],
    [reports.submitted, reports.approved, reports.pending, reports.rejected],
  ];
  const columns = Math.max(...rows.map(row => row.length));
  const csv = '\ufeff' + rows.map(row =>
    Array.from({ length: columns }, (_, index) => csvCell(row[index])).join(',')
  ).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `heatsafe-analytics-${data.days}d-${new Date().toLocaleDateString('en-CA')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AdvancedAnalytics({ ctx }) {
  const { Metric, Panel, Empty, E: setError } = ctx;
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api('/admin/analytics?days=' + days)
      .then(result => { if (!cancelled) setData(result); })
      .catch(error => { if (!cancelled) setError(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const canExport = data?.days === days && !loading;
  const toolbar = (
    <div className="toolbar no-print">
      <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Analysis period">
        <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
      </select>
      <button className="btn secondary" disabled={!canExport || !data?.current.readings} onClick={() => exportCsv(data)}><Download size={15} /> Export CSV</button>
      <button className="btn secondary" disabled={!canExport} onClick={() => window.print()} title="Opens the print dialog — choose “Save as PDF”"><Printer size={15} /> Export PDF</button>
      {loading && data && <small>Updating…</small>}
    </div>
  );

  if (!data) return <>{toolbar}<Empty title={loading ? 'Loading analytics…' : 'Analytics unavailable'} text={loading ? 'Please wait.' : 'Could not load analytics. Try again shortly.'} /></>;

  const { current: c, previous: p, daily, hourly, peakReadings, reports } = data;
  const top = peakReadings[0];
  const highShare = c.readings ? Math.round((c.high / c.readings) * 100) : null;
  const prevHighShare = p.readings ? Math.round((p.high / p.readings) * 100) : null;
  const pct = n => Math.round((n / c.readings) * 100);

  const lineData = {
    labels: daily.map(d => shortDay(d.day)),
    datasets: [
      { label: 'Avg heat index °C', data: daily.map(d => d.avg_hi), borderColor: '#e66a3d', backgroundColor: 'rgba(230,106,61,.12)', fill: true, tension: .3 },
      { label: 'Max heat index °C', data: daily.map(d => d.max_hi), borderColor: '#dc5a4f', borderDash: [5, 4], pointRadius: 2, tension: .3 },
      { label: 'Avg air temperature °C', data: daily.map(d => d.avg_temp), borderColor: '#4e7fb9', tension: .3 }
    ]
  };
  const riskData = { labels: ['Low', 'Moderate', 'High'], datasets: [{ data: [c.low, c.moderate, c.high], backgroundColor: [RISK_COLORS.Low, RISK_COLORS.Moderate, RISK_COLORS.High], borderRadius: 7 }] };
  const hourData = { labels: hourly.map(h => hourLabel(h.hour)), datasets: [{ label: 'Average heat index °C', data: hourly.map(h => h.avg_hi), backgroundColor: hourly.map(h => (data.peakHour && h.hour === data.peakHour.hour ? '#dc5a4f' : '#f0a07d')), borderRadius: 6 }] };

  return (
    <div className="analytics-report">
      {toolbar}

      <div className="analytics-print-heading print-only" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>HeatSafe KL — Heat-risk analytics report</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12 }}>Period: last {data.days} days · Generated {dt(data.generatedAt)} · Days and hours in {data.timezone}</p>
      </div>

      {!c.readings ? (
        <Empty title="No heat readings in this period" text="Readings are recorded whenever live weather is fetched. Choose a longer period or refresh the weather." />
      ) : (
        <>
          <div className="metrics">
            <Metric icon={ThermometerSun} label="Maximum heat index" value={num(c.max_hi, '°C')} note={top ? dt(top.observed_at) : ''} color="orange" />
            <Metric icon={Gauge} label="Average heat index" value={num(c.avg_hi, '°C')} note={<>vs previous: <Change cur={c.avg_hi} prev={p.avg_hi} unit="°C" /></>} color="purple" />
            <Metric icon={TrendingUp} label="Average temperature" value={num(c.avg_temp, '°C')} note={<>vs previous: <Change cur={c.avg_temp} prev={p.avg_temp} unit="°C" /></>} color="blue" />
            <Metric icon={Activity} label="Readings recorded" value={c.readings} note={`${c.high} high-risk (${highShare}%)`} color="green" />
          </div>

          <Panel title="Daily temperature & heat index" sub={`Average and maximum per day · last ${data.days} days`}>
            <AnalyticsChart component={Line} data={lineData} wide />
          </Panel>

          <div className="columns">
            <Panel title="Risk frequency" sub={`Readings by risk level · ${c.readings} total`}>
              <AnalyticsChart component={Bar} data={riskData} />
              <p className="muted" style={{ marginTop: 10 }}>Low {c.low} ({pct(c.low)}%) · Moderate {c.moderate} ({pct(c.moderate)}%) · High {c.high} ({pct(c.high)}%)</p>
            </Panel>
            <Panel title="Peak heat hours" sub={data.peakHour ? `Hottest on average around ${hourLabel(data.peakHour.hour)} (${data.peakHour.avg_hi}°C)` : 'Average heat index by hour of day'}>
              <AnalyticsChart component={Bar} data={hourData} />
            </Panel>
          </div>

          <Panel title="Peak heat periods" sub="The five highest heat-index readings in this period">
            <div className="tablewrap">
              <table>
                <thead><tr><th>Date &amp; time</th><th>Location</th><th>Heat index</th><th>Air temp.</th><th>Humidity</th><th>Risk</th></tr></thead>
                <tbody>
                  {peakReadings.map(r => (
                    <tr key={r.id}>
                      <td>{dt(r.observed_at)}</td><td>{r.city}</td><td><b>{r.heat_index_c}°C</b></td><td>{r.temperature_c}°C</td><td>{r.humidity}%</td>
                      <td><span className={'pill ' + r.risk_level}>{r.risk_level}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      <Panel title="Risk trend comparison" sub={`Last ${data.days} days compared with the ${data.days} days before them`}>
        {p.readings === 0 && <p className="muted" style={{ marginBottom: 10 }}>No readings exist for the previous period yet, so changes cannot be calculated.</p>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>Measure</th><th>Selected period</th><th>Previous period</th><th>Change</th></tr></thead>
            <tbody>
              <tr><td>Readings recorded</td><td>{c.readings}</td><td>{p.readings}</td><td><Change cur={c.readings} prev={p.readings} goodWhenDown={false} /></td></tr>
              <tr><td>Average heat index</td><td>{num(c.avg_hi, '°C')}</td><td>{num(p.avg_hi, '°C')}</td><td><Change cur={c.avg_hi} prev={p.avg_hi} unit="°C" /></td></tr>
              <tr><td>Maximum heat index</td><td>{num(c.max_hi, '°C')}</td><td>{num(p.max_hi, '°C')}</td><td><Change cur={c.max_hi} prev={p.max_hi} unit="°C" /></td></tr>
              <tr><td>Average temperature</td><td>{num(c.avg_temp, '°C')}</td><td>{num(p.avg_temp, '°C')}</td><td><Change cur={c.avg_temp} prev={p.avg_temp} unit="°C" /></td></tr>
              <tr><td>High-risk readings</td><td>{c.high}</td><td>{p.high}</td><td><Change cur={c.high} prev={p.high} /></td></tr>
              <tr><td>High-risk share of readings</td><td>{num(highShare, '%')}</td><td>{num(prevHighShare, '%')}</td><td><Change cur={highShare} prev={prevHighShare} unit=" pts" /></td></tr>
            </tbody>
          </table>
        </div>
      </Panel>



      <Panel title="Community reports in this period" sub={`Submitted in the last ${data.days} days`}>
        <div className="metrics" style={{ margin: 0 }}>
          <Metric icon={ClipboardList} label="Submitted" value={reports.submitted} note="All statuses" color="blue" />
          <Metric icon={CheckCircle2} label="Approved" value={reports.approved} note="Verified submissions" color="green" />
          <Metric icon={Clock3} label="Pending review" value={reports.pending} note="Awaiting a decision" color="orange" />
          <Metric icon={XCircle} label="Rejected" value={reports.rejected} note="Excluded from verified data" color="purple" />
        </div>
      </Panel>
    </div>
  );
}

export default function Analytics({ ctx }) {
  const { page, isAdmin, history, dash, stats, Metric, Panel, Empty } = ctx;
  if (page !== 'trends') return null;
  if (isAdmin) return <AdvancedAnalytics ctx={ctx} />;

  // Public "Heat trends" view (unchanged)
  const chart = { labels: history.map(item => new Date(item.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })), datasets: [{ label: 'Average heat index °C', data: history.map(item => item.avg_heat_index), borderColor: '#e66a3d', backgroundColor: 'rgba(230,106,61,.13)', fill: true, tension: .35 }] };
  const risks = dash?.riskLevels || stats?.riskLevels || [];
  const bar = { labels: risks.map(item => item.risk_level), datasets: [{ data: risks.map(item => item.count), backgroundColor: ['#35a57a', '#e5a13a', '#dc5a4f'], borderRadius: 7 }] };
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#edf1f4' } } } };
  return (<>
    <div className="columns"><Panel title="Heat index trend" sub="Daily average recorded by the system">{history.length ? <div className="chart tall"><Line data={chart} options={opts} /></div> : <Empty title="No heat records yet" text="Configure weather API and record readings to populate trends." />}</Panel><Panel title="Risk distribution" sub="Recorded risk levels in the last 7 days">{risks.length ? <div className="chart tall"><Bar data={bar} options={opts} /></div> : <Empty title="No risk records yet" text="Risk distribution will appear after weather readings are recorded." />}</Panel></div>
    <div className="metrics"><Metric icon={ClipboardList} label="Approved reports" value={dash?.reports?.approved ?? stats?.approvedReports ?? 0} note="Verified submissions" color="green" /><Metric icon={Clock3} label="Pending review" value={dash?.reports?.pending ?? '—'} note="Admin view" color="orange" /><Metric icon={XCircle} label="Rejected reports" value={dash?.reports?.rejected ?? '—'} note="Excluded from verified data" color="purple" /></div>
  </>);
}
