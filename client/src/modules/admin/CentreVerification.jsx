import React, { useEffect, useMemo, useState } from 'react';
import { Search, BadgeCheck, Clock3, AlertTriangle, CalendarClock, X, ClipboardCheck, ArrowLeft } from 'lucide-react';
import { api, asset, day, dt, status } from '../../lib/api.js';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the browser's local time
const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const DEFAULT_INTERVAL_DAYS = 90;
const freshForm = () => ({ outcome: 'verified', inspectedAt: today(), nextInspectionDate: addDays(today(), DEFAULT_INTERVAL_DAYS), remarks: '' });

function DueLabel({ centre }) {
  if (!centre.next_inspection_date) return <span className="due">Not scheduled</span>;
  const n = centre.days_until_next;
  const text = centre.due === 'overdue' ? `Overdue by ${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'}` : n === 0 ? 'Due today' : `In ${n} day${n === 1 ? '' : 's'}`;
  return <span className={'due ' + (centre.due || '')}>{text}</span>;
}

export default function CentreVerification({ ctx }) {
  const { Metric, Panel, Empty, Field, Photo, refresh, E: setError, S: setSuccess } = ctx;
  const [data, setData] = useState({ summary: null, centres: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [form, setForm] = useState(freshForm());
  const [evidence, setEvidence] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setData(await api('/admin/verification'));
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function loadHistory(id) {
    try {
      setHistory(await api(`/admin/centres/${id}/inspections`));
    } catch (error) {
      setHistory([]);
      setError(error.message);
    }
  }

  function openCentre(centre) {
    setSelected(centre);
    setHistory(null);
    setForm(freshForm());
    setEvidence(null);
    loadHistory(centre.id);
  }
  const close = () => { setSelected(null); setHistory(null); setEvidence(null); };
  const setField = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  function changeOutcome(outcome) {
    setForm(previous => ({
      ...previous,
      outcome,
      nextInspectionDate: outcome === 'rejected' ? '' : previous.nextInspectionDate || (outcome === 'verified' ? addDays(previous.inspectedAt || today(), DEFAULT_INTERVAL_DAYS) : '')
    }));
  }

  async function submit(event) {
    event.preventDefault();
    if (form.outcome === 'verified' && !form.nextInspectionDate) { setError('Set a next inspection date for a verified centre.'); return; }
    if (form.outcome === 'rejected' && !form.remarks.trim()) { setError('Remarks are required when rejecting a centre.'); return; }
    const body = new FormData();
    body.append('outcome', form.outcome);
    body.append('inspectedAt', form.inspectedAt);
    body.append('nextInspectionDate', form.outcome === 'rejected' ? '' : form.nextInspectionDate);
    body.append('remarks', form.remarks);
    if (evidence) body.append('evidence', evidence);
    setSaving(true);
    try {
      await api(`/admin/centres/${selected.id}/inspections`, { method: 'POST', body });
      setSuccess(`Inspection recorded for ${selected.name}.`);
      setForm(freshForm());
      setEvidence(null);
      await Promise.all([load(), loadHistory(selected.id), refresh()]);
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.centres.filter(c => {
      const matchFilter = filter === 'all' || (filter === 'attention' ? (c.due === 'overdue' || c.due === 'due_soon') : c.effective_status === filter);
      return matchFilter && (!q || `${c.name} ${c.address}`.toLowerCase().includes(q));
    });
  }, [data.centres, search, filter]);

  const s = data.summary;
  // Keep the open modal in sync with the freshly loaded row.
  const current = selected ? data.centres.find(c => String(c.id) === String(selected.id)) || selected : null;

  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn secondary" onClick={() => ctx.setPage('centres')}><ArrowLeft size={16} /> Back to cooling centres</button>
      </div>
      {s && (s.overdue > 0 || s.dueSoon > 0 || s.pending > 0) && (
        <div className={'vreminder ' + (s.overdue > 0 ? 'bad' : '')}>
          <CalendarClock size={18} />
          {s.overdue > 0 && <span><b>{s.overdue}</b> centre{s.overdue === 1 ? ' is' : 's are'} overdue for inspection</span>}
          {s.dueSoon > 0 && <span><b>{s.dueSoon}</b> due within 30 days</span>}
          {s.pending > 0 && <span><b>{s.pending}</b> awaiting first verification</span>}
          <button className="textlink" onClick={() => setFilter(s.overdue + s.dueSoon > 0 ? 'attention' : 'pending')}>Show these ↗</button>
        </div>
      )}

      <div className="metrics">
        <Metric icon={BadgeCheck} label="Verified" value={s?.verified ?? '—'} note="Listed publicly" color="green" />
        <Metric icon={Clock3} label="Pending" value={s?.pending ?? '—'} note="Not yet inspected" color="orange" />
        <Metric icon={AlertTriangle} label="Expired" value={s?.expired ?? '—'} note="Hidden from the public" color="purple" />
        <Metric icon={CalendarClock} label="Due ≤ 30 days" value={s ? s.dueSoon : '—'} note="Plan the next inspection" color="blue" />
      </div>

      <div className="toolbar">
        <div className="search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search centre or address…" /></div>
        <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by verification">
          <option value="all">All centres</option>
          <option value="attention">Needs attention (overdue / due soon)</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
          <option value="rejected">Rejected</option>
        </select>
        <small>{rows.length} centres</small>
      </div>

      <Panel title="Verification & inspection register" sub="Only currently verified centres appear in Cooling Centres. Manage pending, rejected and expired records here.">
        {loading ? <Empty title="Loading…" text="Please wait." /> : rows.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Cooling centre</th><th>Verification</th><th>Last inspection</th><th>Next inspection</th><th>Verified by</th><th></th></tr></thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b><small className="subtle">{c.address}</small></td>
                    <td><span className={'pill ' + c.effective_status}>{status(c.effective_status)}</span></td>
                    <td>{c.last_inspection_date ? day(c.last_inspection_date) : '—'}{c.inspection_count > 0 && <small className="subtle">{c.inspection_count} inspection{c.inspection_count === 1 ? '' : 's'}</small>}</td>
                    <td>{c.next_inspection_date ? day(c.next_inspection_date) : '—'}<DueLabel centre={c} /></td>
                    <td>{c.verified_by_name || '—'}{c.verified_at && <small className="subtle">{dt(c.verified_at)}</small>}</td>
                    <td><div className="rowactions"><button className="btn secondary small" onClick={() => openCentre(c)}><ClipboardCheck size={14} /> {c.verification_status === 'pending' ? 'Verify' : 'Inspect'}</button><button type="button" className="btn secondary small" onClick={()=>{ctx.setPage('centres');window.location.hash='/centres/'+c.id;}}>Details</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title={data.centres.length ? 'No centres match' : 'No cooling centres yet'} text={data.centres.length ? 'Try a different search or filter.' : 'Add a cooling centre first, then verify it here.'} />}
      </Panel>

      {current && (
        <div className="overlay" onClick={close}>
          <div className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modalhead">
              <div><small>RECORD INSPECTION · #{current.id}</small><h2>{current.name}</h2></div>
              <button className="iconbtn" aria-label="Close" onClick={close}><X /></button>
            </div>
            <div className="kv">
              <div><small>Address</small><span>{current.address}</span></div>
              <div><small>Current verification</small><span><span className={'pill ' + current.effective_status}>{status(current.effective_status)}</span></span></div>
              <div><small>Last inspection</small><span>{current.last_inspection_date ? day(current.last_inspection_date) : '—'}</span></div>
              <div><small>Next inspection</small><span>{current.next_inspection_date ? day(current.next_inspection_date) : '—'}<DueLabel centre={current} /></span></div>
            </div>

            <form className="stack" onSubmit={submit}>
              <div className="formgrid">
                <Field label="Outcome">
                  <select value={form.outcome} onChange={e => changeOutcome(e.target.value)}>
                    <option value="verified">Verified — list publicly</option>
                    <option value="rejected">Rejected — not suitable</option>
                    <option value="pending">Pending — needs re-inspection</option>
                  </select>
                </Field>
                <Field label="Inspection date">
                  <input type="date" required max={today()} value={form.inspectedAt} onChange={e => setField('inspectedAt', e.target.value)} />
                </Field>
                {form.outcome !== 'rejected' && (
                  <Field label={form.outcome === 'verified' ? 'Next inspection date *' : 'Scheduled re-inspection (optional)'}>
                    <input type="date" required={form.outcome === 'verified'} min={form.inspectedAt ? addDays(form.inspectedAt, 1) : undefined} value={form.nextInspectionDate} onChange={e => setField('nextInspectionDate', e.target.value)} />
                  </Field>
                )}
                <div className="span2">
                  <Field label={form.outcome === 'rejected' ? 'Inspection remarks (required)' : 'Inspection remarks'}>
                    <textarea rows="3" required={form.outcome === 'rejected'} value={form.remarks} onChange={e => setField('remarks', e.target.value)} placeholder="Condition of the facility, public access, opening hours confirmed, contact verified…" />
                  </Field>
                </div>
                <div className="span2"><Photo label="Inspection evidence (optional)" file={evidence} onChange={setEvidence} /></div>
              </div>
              <div className="actions">
                <button type="button" className="btn secondary" onClick={close}>Close</button>
                <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Record inspection'}</button>
              </div>
            </form>

            <h4>Verification history</h4>
            {history === null ? <small className="muted">Loading history…</small> : history.length ? (
              <div className="hist">
                {history.map(h => (
                  <div className="hist-item" key={h.id}>
                    <div className="hist-top">
                      <span className={'pill ' + h.outcome}>{status(h.outcome)}</span>
                      <b>Inspected {day(h.inspected_at)}</b>
                      {h.next_inspection_date && <span>Next: {day(h.next_inspection_date)}</span>}
                      <span>by {h.inspector_name || 'a removed administrator'} · recorded {dt(h.created_at)}</span>
                    </div>
                    {h.remarks && <p>{h.remarks}</p>}
                    {h.evidence_url && <a href={asset(h.evidence_url)} target="_blank" rel="noreferrer"><img src={asset(h.evidence_url)} alt="Inspection evidence" /></a>}
                  </div>
                ))}
              </div>
            ) : <small className="muted">No inspections have been recorded for this centre yet.</small>}
          </div>
        </div>
      )}
    </>
  );
}
