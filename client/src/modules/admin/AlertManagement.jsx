import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, Plus, Pencil, Copy, Send, Power, X, CalendarClock, FileText, Radio } from 'lucide-react';
import { api, dt, status } from '../../lib/api.js';
import { AlertCard, ALERT_DISCLAIMER } from '../../components/AlertBanner.jsx';

const pad = n => String(n).padStart(2, '0');
// <input type="datetime-local"> works in local time without a zone, so convert both ways.
const toLocalInput = value => { const d = new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const blank = () => ({ title: '', severity: 'High', affectedArea: 'Kuala Lumpur', startsAt: toLocalInput(new Date()), endsAt: toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)), description: '', publish: false });
const SUGGESTION = 'High heat-index conditions have been recorded. Residents should reduce outdoor exposure, stay hydrated and use available cooling facilities.';

export default function AlertManagement({ ctx }) {
  const { Metric, Panel, Empty, Field, refresh, E: setError, S: setSuccess } = ctx;
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // null | { id|null, form }
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setAlerts(await api('/admin/alerts'));
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

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

      <Panel title="Heat alerts" sub="Create, publish and track advisories shown to users.">
        {loading ? <Empty title="Loading alerts…" text="Please wait." /> : rows.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Alert</th><th>Severity</th><th>Area</th><th>Active window</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id}>
                    <td className="wrap"><b>{a.title}</b><small className="subtle">Created by {a.created_by_name || 'a removed administrator'} · {dt(a.created_at)}</small></td>
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
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modalhead">
              <div><small>{editing.id ? `EDIT ALERT · #${editing.id}` : 'NEW HEAT ALERT'}</small><h2>{editing.id ? 'Edit heat alert' : 'Create heat alert'}</h2></div>
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
                <small className="muted" style={{ display: 'block', marginTop: 10 }}>{ALERT_DISCLAIMER} This notice is added automatically.</small>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
