import React, { useEffect, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { api, asset, dt } from '../../lib/api.js';

const EMPTY_FILTERS = { search: '', module: '', action: '', from: '', to: '' };

function Details({ details }) {
  if (!details) return null;
  const changes = Object.entries(details.changes || {});
  const extras = Object.entries(details).filter(([key]) => key !== 'changes' && details[key]);
  return (
    <div className="logdetail">
      {changes.length > 0 && (
        <>
          <b>Changes</b>
          <ul>
            {changes.map(([label, c]) => (
              <li key={label}><b>{label}:</b> <code>{c.from ?? '—'}</code> → <code>{c.to ?? '—'}</code></li>
            ))}
          </ul>
        </>
      )}
      {extras.map(([key, value]) => (
        <div key={key} style={{ marginTop: 6 }}>
          <b style={{ textTransform: 'capitalize' }}>{key}:</b>{' '}
          {String(value).startsWith('/uploads/') ? <a href={asset(value)} target="_blank" rel="noreferrer">View file</a> : String(value)}
        </div>
      ))}
      {!changes.length && !extras.length && <span>No additional detail was recorded.</span>}
    </div>
  );
}

export default function ActivityLog({ ctx }) {
  const { Panel, Empty, E: setError } = ctx;
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, pageSize: 25, modules: [], actions: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  // Wait briefly after typing before querying the server.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters.search), 350);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (debounced) params.set('search', debounced);
    ['module', 'action', 'from', 'to'].forEach(key => { if (filters[key]) params.set(key, filters[key]); });
    api('/admin/activity?' + params.toString())
      .then(result => { if (!cancelled) { setData(result); setOpen(null); } })
      .catch(error => { if (!cancelled) setError(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, debounced, filters.module, filters.action, filters.from, filters.to]);

  const set = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="toolbar">
        <div className="search"><Search size={16} /><input value={filters.search} onChange={e => set('search', e.target.value)} placeholder="Search administrator, action or record…" /></div>
        <select value={filters.module} onChange={e => set('module', e.target.value)} aria-label="Filter by module">
          <option value="">All modules</option>{data.modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filters.action} onChange={e => set('action', e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>{data.actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={filters.from} max={filters.to || undefined} onChange={e => set('from', e.target.value)} aria-label="From date" />
        <input type="date" value={filters.to} min={filters.from || undefined} onChange={e => set('to', e.target.value)} aria-label="To date" />
        {filtered && <button className="btn secondary small" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>Clear</button>}
      </div>

      <Panel title="Administrator activity" sub={`${data.total} recorded action${data.total === 1 ? '' : 's'} · newest first · times shown in your local time zone`}>
        {loading && !data.rows.length ? <Empty title="Loading activity…" text="Please wait." /> : data.rows.length ? (
          <>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Date &amp; time</th><th>Administrator</th><th>Action</th><th>Module</th><th>Record</th><th></th></tr></thead>
                <tbody>
                  {data.rows.map(row => (
                    <React.Fragment key={row.id}>
                      <tr>
                        <td>{dt(row.created_at)}</td>
                        <td>{row.admin_name}</td>
                        <td className="wrap"><b>{row.action}</b><small className="subtle">{row.summary}</small></td>
                        <td>{row.module}</td>
                        <td>{row.record_type ? `${row.record_type.replace('_', ' ')} #${row.record_id}` : '—'}</td>
                        <td>
                          {row.details && (
                            <button className="iconbtn" aria-label="Show details" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>
                              <ChevronDown size={16} style={{ transform: open === row.id ? 'rotate(180deg)' : 'none' }} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {open === row.id && <tr><td colSpan={6} className="wrap"><Details details={row.details} /></td></tr>}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span>Page {data.page} of {pages}</span>
              <div>
                <button className="btn secondary small" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Previous</button>
                <button className="btn secondary small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight size={14} /></button>
              </div>
            </div>
          </>
        ) : <Empty title={filtered ? 'No activity matches these filters' : 'No activity recorded yet'} text={filtered ? 'Try widening the date range or clearing filters.' : 'Administrator actions such as approving reports or editing cooling centres will appear here.'} />}
      </Panel>
    </>
  );
}
