import React, { useEffect, useMemo, useState } from 'react';
import { Search, Eye, UserCheck, UserX, Users, ShieldCheck, FileText, X } from 'lucide-react';
import { api, dt, status } from '../../lib/api.js';

export default function UserManagement({ ctx }) {
  const { user: me, Metric, Panel, Empty, ReportCard, E: setError, S: setSuccess } = ctx;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [state, setState] = useState('all');
  const [detail, setDetail] = useState(null); // { user, reports } | { loading: true, id }
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      setUsers(await api('/admin/users'));
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u =>
      (role === 'all' || u.role === role) &&
      (state === 'all' || u.account_status === state) &&
      (!q || `${u.full_name} ${u.username} ${u.email}`.toLowerCase().includes(q))
    );
  }, [users, search, role, state]);

  async function openDetail(u) {
    setDetail({ loading: true, id: u.id });
    try {
      setDetail(await api(`/admin/users/${u.id}/reports`));
    } catch (error) {
      setDetail(null);
      setError(error.message);
    }
  }

  async function toggle(u) {
    const next = u.account_status === 'active' ? 'deactivated' : 'active';
    if (next === 'deactivated' && !window.confirm(`Deactivate ${u.full_name}?\n\nThey will be signed out immediately and will not be able to sign in until the account is activated again.`)) return;
    setBusyId(u.id);
    try {
      await api(`/admin/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      setSuccess(`${u.full_name} ${next === 'active' ? 'activated' : 'deactivated'}.`);
      setDetail(current => current?.user?.id === u.id ? { ...current, user: { ...current.user, account_status: next } } : current);
      await load();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = users.filter(u => u.account_status === 'active').length;
  const detailRow = detail?.user ? users.find(u => String(u.id) === String(detail.user.id)) : null;

  return (
    <>
      <div className="metrics">
        <Metric icon={Users} label="Registered users" value={users.length} note="All accounts" color="blue" />
        <Metric icon={UserCheck} label="Active accounts" value={activeCount} note="Can sign in" color="green" />
        <Metric icon={UserX} label="Deactivated" value={users.length - activeCount} note="Sign-in blocked" color="orange" />
        <Metric icon={FileText} label="Users who reported" value={users.filter(u => u.total_reports > 0).length} note="At least one report" color="purple" />
      </div>

      <div className="toolbar">
        <div className="search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, username or email…" /></div>
        <select value={role} onChange={e => setRole(e.target.value)} aria-label="Filter by role">
          <option value="all">All roles</option><option value="user">Community members</option><option value="admin">Administrators</option>
        </select>
        <select value={state} onChange={e => setState(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option><option value="active">Active</option><option value="deactivated">Deactivated</option>
        </select>
        <small>{filtered.length} of {users.length} users</small>
      </div>

      <Panel title="User accounts" sub="Manage the people who use HeatSafe KL.">
        {loading ? <Empty title="Loading users…" text="Please wait." /> : filtered.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>User</th><th>Role</th><th>Status</th><th>Registered</th><th>Reports</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const self = String(u.id) === String(me?.id);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="cellname">
                          <div className="avatar">{u.full_name?.[0]}</div>
                          <span><b>{u.full_name}{self && ' (you)'}</b><small className="subtle">{u.email} · @{u.username}</small></span>
                        </div>
                      </td>
                      <td><span className={'pill ' + u.role}>{status(u.role)}</span></td>
                      <td><span className={'pill ' + u.account_status}>{status(u.account_status)}</span></td>
                      <td>{dt(u.created_at)}</td>
                      <td>{u.total_reports}{u.pending_reports > 0 && <small className="subtle">{u.pending_reports} pending</small>}</td>
                      <td>
                        <div className="rowactions">
                          <button className="iconbtn" aria-label={`View report history of ${u.full_name}`} onClick={() => openDetail(u)}><Eye size={16} /></button>
                          <button
                            className={'btn small ' + (u.account_status === 'active' ? 'danger-outline' : 'secondary')}
                            disabled={self || busyId === u.id}
                            title={self ? 'You cannot change your own account status' : undefined}
                            onClick={() => toggle(u)}
                          >
                            {u.account_status === 'active' ? <><UserX size={14} /> Deactivate</> : <><UserCheck size={14} /> Activate</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No users match" text="Try a different search or filter." />}
      </Panel>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal wide" onClick={e => e.stopPropagation()}>
            {detail.loading ? <Empty title="Loading user…" text="Please wait." /> : (
              <>
                <div className="modalhead">
                  <div><small>USER DETAILS · #{detail.user.id}</small><h2>{detail.user.full_name}</h2></div>
                  <button className="iconbtn" aria-label="Close" onClick={() => setDetail(null)}><X /></button>
                </div>
                <div className="kv">
                  <div><small>Email</small><span>{detail.user.email}</span></div>
                  <div><small>Username</small><span>@{detail.user.username}</span></div>
                  <div><small>Role</small><span><span className={'pill ' + detail.user.role}>{status(detail.user.role)}</span></span></div>
                  <div><small>Account status</small><span><span className={'pill ' + detail.user.account_status}>{status(detail.user.account_status)}</span></span></div>
                  <div><small>Registered</small><span>{dt(detail.user.created_at)}</span></div>
                  <div><small>Reports submitted</small><span>{detailRow ? `${detailRow.total_reports} (${detailRow.approved_reports} approved · ${detailRow.pending_reports} pending · ${detailRow.rejected_reports} rejected)` : detail.reports.length}</span></div>
                </div>
                {String(detail.user.id) !== String(me?.id) && (
                  <div className="actions" style={{ justifyContent: 'flex-start', margin: '0 0 6px' }}>
                    <button
                      className={'btn small ' + (detail.user.account_status === 'active' ? 'danger-outline' : 'secondary')}
                      style={{ flex: '0 0 auto' }}
                      disabled={busyId === detail.user.id}
                      onClick={() => toggle({ ...detail.user, ...(detailRow || {}) })}
                    >
                      {detail.user.account_status === 'active' ? <><UserX size={14} /> Deactivate account</> : <><UserCheck size={14} /> Activate account</>}
                    </button>
                  </div>
                )}
                <h4>Report history</h4>
                {detail.reports.length
                  ? <div className="reportcards">{detail.reports.map(r => <ReportCard key={r.id} r={r} />)}</div>
                  : <Empty title="No reports yet" text="This user has not submitted any reports." />}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
