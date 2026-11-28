import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, Plus, Pencil, Copy, Send, Power, X, CalendarClock, FileText, Radio } from 'lucide-react';
import { api, dt, status } from '../../lib/api.js';
import { AlertCard } from '../../components/AlertBanner.jsx';
import { ViewportModal } from '../../components/Shared.jsx';

const pad = n => String(n).padStart(2, '0');
// <input type="datetime-local"> works in local time without a zone, so convert both ways.
const toLocalInput = value => { const d = new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const blank = () => ({ title: '', severity: 'High', affectedArea: 'Kuala Lumpur', startsAt: toLocalInput(new Date()), endsAt: toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)), description: '', publish: false });
const SUGGESTION = 'High feels-like conditions have been recorded. Residents should reduce outdoor exposure, stay hydrated and use available cooling facilities.';

export default function AlertManagement({ ctx }) {
  const { Metric, Panel, Empty, Field, refresh, E: setError, S: setSuccess } = ctx;
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // null | { id|null, form }
  const [saving, setSaving] = useState(false);
  const [forecastStatus, setForecastStatus] = useState(null);

  async function load() {
    try {
      setAlerts(await api('/admin/alerts'));
      setForecastStatus(await api('/admin/forecast/status').catch(() => null));
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const check = () => { if (!document.hidden) load(); };
    check();
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);

  const counts = useMemo(() => alerts.reduce((acc, a) => ({ ...acc, [a.state]: (acc[a.state] || 0) + 1 }), {}), [alerts]);
  const rows = useMemo(() => alerts.filter(a => filter === 'all' || a.state === filter), [alerts, filter]);

  const openNew = () => setEditing({ id: null, form: blank() });
  const openEdit = a => setEditing({ id: a.id, form: { title: a.title, severity: a.severity, affectedArea: a.affected_area, startsAt: toLocalInput(a.starts_at), endsAt: toLocalInput(a.ends_at), description: a.description, publish: false } });
  const duplicate = a => setEditing({ id: null, form: { ...blank(), title: a.title, severity: a.severity, affectedArea: a.affected_area, description: a.description } });
  const setField = (key, value) => setEditing(previous => ({ ...previous, form: { ...previous.form, [key]: value } }));

  async function save(event) {
    event.preventDefault();
    const f = editing.form, starts = new Date(f.startsAt), ends = new Date(f.endsAt);
    if (isNaN(starts) || isNaN(ends)) { setError('Enter valid start and end times.'); return; }
    if (ends <= starts) { setError('The end time must be after the start time.'); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({ title: f.title, severity: f.severity, affectedArea: f.affectedArea, description: f.description, startsAt: starts.toISOString(), endsAt: ends.toISOString(), publish: f.publish });
      await api(editing.id ? `/admin/alerts/${editing.id}` : '/admin/alerts', { method: editing.id ? 'PUT' : 'POST', body });
      setSuccess(editing.id ? 'Alert updated.' : f.publish ? 'Alert published.' : 'Alert saved as draft.');
      setEditing(null);
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(a, next) {
    const verb = next === 'published' ? 'Publish' : 'Deactivate';
    if (!window.confirm(`${verb} "${a.title}"?${next === 'published' ? '\n\nIt becomes visible to all users during its start–end window.' : '\n\nUsers will no longer see this alert.'}`)) return;
    try {
      await api(`/admin/alerts/${a.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      setSuccess(next === 'published' ? 'Alert published.' : 'Alert deactivated.');
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setError(error.message);
    }
  }

  const f = editing?.form;
  const preview = f && { ...f, affected_area: f.affectedArea, starts_at: f.startsAt && !isNaN(new Date(f.startsAt)) ? new Date(f.startsAt).toISOString() : null, ends_at: f.endsAt && !isNaN(new Date(f.endsAt)) ? new Date(f.endsAt).toISOString() : null };

  return (
    <>
      <div className="metrics">
        <Metric icon={Radio} label="Live now" value={counts.active || 0} note="Visible to users" color="orange" />
        <Metric icon={CalendarClock} label="Scheduled" value={counts.scheduled || 0} note="Published, not started" color="blue" />
        <Metric icon={FileText} label="Drafts" value={counts.draft || 0} note="Not published" color="purple" />
        <Metric icon={BellRing} label="All alerts" value={alerts.length} note="Including history" color="green" />
      </div>

      <div className="toolbar">
        <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter alerts">
          <option value="all">All alerts</option><option value="active">Live now</option><option value="scheduled">Scheduled</option>
          <option value="draft">Drafts</option><option value="expired">Expired</option><option value="deactivated">Deactivated</option>
        </select>
        <button className="btn primary" onClick={openNew}><Plus size={16} /> Create alert</button>
        <small>{rows.length} alerts</small>
      </div>

      {forecastStatus && <details className="panel forecast-job-status"><summary><b>Automatic forecast advisories</b> · {forecastStatus.jobs[0]?.status || 'Awaiting first job'}</summary><p>{forecastStatus.model_ready ? 'Your trained model generates 72-hour feels-like predictions. The risk bands use the predicted feels-like temperature.' : 'Train the model and install its output files before running the hourly job.'}</p><p>Automatic advisories cover only predicted risk in the next 24 hours from each job's run time. They appear immediately and show the expected heat-risk date and time in Malaysia time. Forecasts more than 24 hours away do not generate advisories.</p>{forecastStatus.jobs.map(j => <p key={j.id}>{dt(j.started_at)} · {j.status}{j.summary?.config ? ` · ${j.summary.config.auto_publish ? 'Automatic publication enabled' : 'Draft mode'} · Threshold: ${j.summary.config.minimum_risk}${j.summary.config.alert_window_hours ? ' · Next ' + j.summary.config.alert_window_hours + ' hours' : ''}` : ''}{j.error && <span role="status"> · {j.error}</span>}</p>)}</details>}
      <Panel title="Heat alerts" sub="Create manual advisories or review advisories generated from predicted feels-like conditions.">
        {loading ? <Empty title="Loading alerts…" text="Please wait." /> : rows.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Alert</th><th>Severity</th><th>Area</th><th>Active window</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id}>
                    <td className="wrap"><b>{a.title}</b><small className="subtle">{a.origin === 'forecast' ? 'ML forecast advisory' + (a.automation_managed ? ' · Automatic' : ' · Admin controlled') : 'Created by ' + (a.created_by_name || 'a removed administrator')} · {dt(a.created_at)}</small>{a.forecast_target_at && <small className="subtle">Expected {a.severity} heat risk: {new Date(a.forecast_target_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} MYT{a.forecast_initial_lead_hours != null ? ` · Initial published notice: ${Number(a.forecast_initial_lead_hours).toFixed(1)} hours` : ''}</small>}{a.forecast_revision_note && <small className="subtle">{a.forecast_revision_note}</small>}</td>
                    <td><span className={'pill ' + a.severity}>{a.severity}</span></td>
                    <td>{a.affected_area}</td>
                    <td>{dt(a.starts_at)}<small className="subtle">until {dt(a.ends_at)}</small></td>
                    <td><span className={'pill ' + a.state}>{a.state === 'active' ? 'Live now' : status(a.state)}</span></td>
                    <td>
                      <div className="rowactions">
                        {a.state !== 'expired' && <button className="iconbtn" title="Edit" aria-label="Edit alert" onClick={() => openEdit(a)}><Pencil size={15} /></button>}
                        <button className="iconbtn" title="Duplicate as new alert" aria-label="Duplicate alert" onClick={() => duplicate(a)}><Copy size={15} /></button>
                        {(a.state === 'draft' || a.state === 'deactivated') && <button className="btn secondary small" onClick={() => setStatus(a, 'published')}><Send size={13} /> Publish</button>}
                        {(a.state === 'active' || a.state === 'scheduled') && <button className="btn danger-outline small" onClick={() => setStatus(a, 'deactivated')}><Power size={13} /> Deactivate</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title={alerts.length ? 'No alerts in this view' : 'No alerts yet'} text={alerts.length ? 'Choose another filter.' : 'Create a draft or publish an advisory when heat conditions need public attention.'} />}
      </Panel>

      {editing && (
        <ViewportModal onClose={() => setEditing(null)} labelledBy="heat-alert-dialog-title" wide>
          <div className="modalhead">
            <div><small>{editing.id ? `EDIT ALERT · #${editing.id}` : 'NEW HEAT ALERT'}</small><h2 id="heat-alert-dialog-title">{editing.id ? 'Edit heat alert' : 'Create heat alert'}</h2></div>
            <button className="iconbtn" aria-label="Close" onClick={() => setEditing(null)}><X /></button>
          </div>
          <div className="alertstack">
            <form className="stack" onSubmit={save} style={{ borderTop: 0, paddingTop: 0, marginTop: 8 }}>
              <Field label="Alert title *"><input required maxLength={160} value={f.title} onChange={e => setField('title', e.target.value)} placeholder="High heat-risk conditions detected" /></Field>
              <Field label="Severity">
                <select value={f.severity} onChange={e => setField('severity', e.target.value)}>
                  <option value="Low">Low</option><option value="Moderate">Moderate</option><option value="High">High</option>
                </select>
              </Field>
              <Field label="Affected area *"><input required maxLength={160} value={f.affectedArea} onChange={e => setField('affectedArea', e.target.value)} /></Field>
              <Field label="Starts *"><input type="datetime-local" required value={f.startsAt} onChange={e => setField('startsAt', e.target.value)} /></Field>
              <Field label="Ends *"><input type="datetime-local" required min={f.startsAt} value={f.endsAt} onChange={e => setField('endsAt', e.target.value)} /></Field>
              <Field label="Description *"><textarea rows="4" required value={f.description} onChange={e => setField('description', e.target.value)} placeholder={SUGGESTION} /></Field>
              {!editing.id && (
                <label className="check">
                  <input type="checkbox" checked={f.publish} onChange={e => setField('publish', e.target.checked)} />
                  <span><b>Publish immediately</b><small>Otherwise it is saved as a draft. Published alerts show to every visitor between the start and end time.</small></span>
                </label>
              )}
              <div className="actions">
                <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : editing.id ? 'Save changes' : f.publish ? 'Publish alert' : 'Save draft'}</button>
              </div>
            </form>
            <div style={{ marginTop: 8 }}>
              <span className="previewlabel">HEAT ALERT PREVIEW</span>
              <AlertCard alert={preview} preview />
            </div>
          </div>
        </ViewportModal>
      )}
    </>
  );
}
