import React, { useCallback, useEffect, useRef, useState } from 'react';
import './lib/chartSetup.js';
import 'leaflet/dist/leaflet.css';
import { api, asset, dt, status } from './lib/api.js';
import Auth from './pages/auth/Auth.jsx';
import Landing from './pages/Landing.jsx';
import WorkspaceNav from './components/WorkspaceNav.jsx';
import AdminOverview from './modules/admin/AdminOverview.jsx';
import { Sun, Activity, MapPin, ThermometerSun, Users, ClipboardList, Building2, LogOut, Menu, X, Plus, Search, CheckCircle2, XCircle, Clock3, FileText, Eye, RefreshCw, LayoutDashboard, UserRound, HeartPulse, LocateFixed, ShieldCheck, BellRing, LifeBuoy, ArrowUpRight, Check, CheckCheck, ChevronLeft, ChevronRight, Inbox, Lightbulb, MessageSquare, Wrench } from 'lucide-react';
import { Field, Photo, Metric, Panel, Empty, ReportTable, ReportCard, PasswordPanel } from './components/Shared.jsx';
import AdminCoolingCentres from './modules/admin/CoolingCentres.jsx';
import UserCoolingCentres from './modules/user/CoolingCentres.jsx';
import Overview from './modules/user/Overview.jsx';
import HeatRisk from './modules/user/HeatRisk.jsx';
import SubmitReport from './modules/user/SubmitReport.jsx';
import MyReports from './modules/user/MyReports.jsx';
import ReportReview from './modules/admin/ReportReview.jsx';
import Analytics from './modules/admin/Analytics.jsx';
import Profile from './modules/user/Profile.jsx';
import UserManagement from './modules/admin/UserManagement.jsx';
import CentreVerification from './modules/admin/CentreVerification.jsx';
import AlertManagement from './modules/admin/AlertManagement.jsx';
import AlertBanner from './components/AlertBanner.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

const btn = (label, fn, kind = 'primary', icon = null) => (
  <button className={'btn ' + kind} onClick={fn}>
    {icon}
    {label}
  </button>
);

const RESET_TOKEN_IN_URL = new URLSearchParams(window.location.search).has('token');

function App() {
  const [user, U] = useState(null),
    [userCoords, SET_USER_COORDS] = useState(null),
    [authMode, AM] = useState(
      RESET_TOKEN_IN_URL
        ? 'reset'
        : location.hash.startsWith('#/centres')
          ? 'public'
          : 'landing',
    ),
    [page, P] = useState(
      location.hash.startsWith('#/centres') ? 'centres' : 'overview',
    ),
    [module, M] = useState('user'),
    [navOpen, NO] = useState(false),
    [error, E] = useState(''),
    [success, S] = useState(''),
    [weather, W] = useState(null),
    [weatherError, WE] = useState(''),
    [centres, C] = useState([]),
    [reports, R] = useState([]),
    [dash, D] = useState(null),
    [history, H] = useState([]),
    [stats, ST] = useState(null),
    [alerts, SET_ALERTS] = useState([]),
    [busy, B] = useState(false);

  const [localWeather, LW] = useState(null),
    [localWeatherError, LWE] = useState(''),
    [weatherScope, WS] = useState('city'),
    [weatherLoading, WL] = useState(false),
    [centresLoaded, CL] = useState(false),
    [locating, setLocating] = useState(false),
    [favIds, setFavIds] = useState([]);

  const weatherRequests = useRef({ city: 0, location: 0 });
  const pendingWeather = useRef(0);
  const refreshRequest = useRef(0);
  const isAdmin = user?.role === 'admin';
  const [supportSummary, setSupportSummary] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      setSupportSummary(null);
      return;
    }
    let active = true;
    const load = () => {
      if (document.hidden) return;
      api('/admin/feedback/summary')
        .then(summary => { if (active) setSupportSummary(summary); })
        .catch(() => { if (active) setSupportSummary(null); });
    };
    load();
    const interval = setInterval(load, 30000);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', load);
    };
  }, [isAdmin, user?.id]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page, authMode]);

  function goPage(target) {
    if (target === 'centres' && /^#\/centres\/\d+$/.test(location.hash)) {
      location.hash = '/centres';
    }

    if (target !== 'centres' && location.hash.startsWith('#/centres')) {
      window.history.replaceState(null, '', location.pathname + location.search);
    }

    P(target);
  }

  useEffect(() => {
    const route = () => {
      if (location.hash.startsWith('#/centres')) {
        P('centres');
        AM('public');
      }
    };

    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);

  async function refresh() {
    const requestId = ++refreshRequest.current;
    CL(false);

    try {
      const [c, h, st, al] = await Promise.all([
        api(isAdmin ? '/centres?all=true' : '/centres'),
        api('/weather/history?days=7'),
        api('/dashboard/public'),
        api('/alerts/active').catch(() => []),
      ]);

      if (requestId !== refreshRequest.current) return;

      C(c);
      H(h.rows || []);
      ST(st);
      SET_ALERTS(al);

      if (isAdmin) {
        const [d, r] = await Promise.all([
          api('/admin/dashboard'),
          api('/admin/reports'),
        ]);

        if (requestId === refreshRequest.current) {
          D(d);
          R(r);
        }
      } else if (user) {
        const rows = await api('/reports/mine');
        if (requestId === refreshRequest.current) R(rows);
      }
    } catch (e) {
      if (requestId === refreshRequest.current) E(e.message);
    } finally {
      if (requestId === refreshRequest.current) CL(true);
    }
  }

  useEffect(() => {
    api('/auth/me')
      .then(d => {
        if (d.user) {
          U(d.user);
          M(d.user.role === 'admin' ? 'admin' : 'user');
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    refresh();
  }, [user]);

  useEffect(() => {
    getWeather().catch(e => WE(e.message));
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      api('/alerts/active').then(SET_ALERTS).catch(() => { });
    }, 300000);

    return () => clearInterval(t);
  }, []);

  async function getWeather(coords) {
    const scope = coords ? 'location' : 'city',
      requestId = ++weatherRequests.current[scope];

    pendingWeather.current++;
    WL(true);

    try {
      const qs = coords ? `?lat=${coords.latitude}&lon=${coords.longitude}` : '';
      const reading = await api('/weather/current' + qs);

      if (requestId === weatherRequests.current[scope]) {
        (coords ? LW : W)(reading);
        (coords ? LWE : WE)('');
      }
    } catch (e) {
      if (requestId === weatherRequests.current[scope]) {
        (coords ? LWE : WE)(
          (coords ? 'My location weather: ' : 'Kuala Lumpur weather: ') + e.message,
        );
      }
    } finally {
      pendingWeather.current--;
      WL(pendingWeather.current > 0);
    }
  }

  function locate(onLocated) {
    if (!navigator.geolocation) {
      LWE('Location detection is unavailable.');
      return;
    }

    LWE('');
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      p => {
        const coords = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        };

        SET_USER_COORDS(coords);
        setLocating(false);
        if (typeof onLocated === 'function') onLocated(coords);
        getWeather(coords);
      },
      err => {
        setLocating(false);
        LWE(
          err?.code === 1
            ? 'Location permission denied. Allow location access in your browser settings and try again.'
            : 'Could not get your location. Please try again.',
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  // Saved (favourite) cooling centres for signed-in community members
  useEffect(() => {
    if (!user || user.role === 'admin') {
      setFavIds([]);
      return;
    }
    api('/favourites').then(d => setFavIds(d.ids || [])).catch(() => { });
  }, [user?.id]);

  async function toggleFavourite(centreId) {
    const id = String(centreId);
    const had = favIds.includes(id);

    setFavIds(prev => (had ? prev.filter(x => x !== id) : [...prev, id]));

    try {
      await api('/favourites/' + id, { method: had ? 'DELETE' : 'POST' });
    } catch (e) {
      setFavIds(prev => (had ? [...prev, id] : prev.filter(x => x !== id)));
      E(e.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch { }

    U(null);
    M('user');
    C([]);
    CL(false);
    WS('city');
    goPage('overview');
  }

  async function refreshWeather() {
    const requestId = ++weatherRequests.current.city;
    pendingWeather.current++;
    WL(true);

    try {
      const reading = await api('/admin/weather/refresh', { method: 'POST' });

      if (requestId === weatherRequests.current.city) {
        W(reading);
        WE('');
      }

      S('Kuala Lumpur weather refreshed.');
      refresh();
    } catch (e) {
      WE('Kuala Lumpur weather: ' + e.message);
    } finally {
      pendingWeather.current--;
      WL(pendingWeather.current > 0);
    }
  }

  const nav = module === 'admin'
    ? [
      ['overview', 'Overview', LayoutDashboard],
      ['heat', 'Heat Risk', ThermometerSun],
      ['centres', 'Cooling Centres', Building2],
      ['reports', 'Report Review', ClipboardList],
      ['alerts', 'Heat Alerts', BellRing],
      ['users', 'User Management', Users],
      ['trends', 'Analytics', Activity],
      ['support', 'User Support', LifeBuoy],
      ['profile', 'My Profile', UserRound],
    ]
    : [
      ['overview', 'Overview', LayoutDashboard],
      ['heat', 'Heat risk', ThermometerSun],
      ['centres', 'Cooling centres', MapPin],
      ...(user
        ? [
          ['myreports', 'My reports', ClipboardList],
          ['submit', 'Submit report', Plus],
          ['profile', 'My profile', UserRound],
        ]
        : []),
      ['trends', 'Heat trends', Activity],
    ],
    title = nav.find(x => x[0] === page)?.[1] || (
      page === 'verification' ? 'Centre Verification' : 'Cooling centre form'
    );

  const ctx = {
    user,
    userCoords,
    page,
    module,
    error,
    success,
    weather: page !== 'heat' || weatherScope === 'city' ? weather : localWeather,
    cityWeather: weather,
    localWeather,
    weatherScope,
    setWeatherScope: WS,
    weatherLoading,
    weatherError: page !== 'heat' || weatherScope === 'city'
      ? weatherError
      : localWeatherError,
    locationError: localWeatherError,
    locating,
    favIds,
    toggleFavourite,
    centres,
    reports,
    dash,
    supportSummary,
    setSupportSummary,
    history,
    stats,
    busy,
    alerts,
    isAdmin,
    nav,
    title,
    refreshWeather,
    refresh,
    setPage: goPage,
    P: goPage,
    E,
    S,
    NO,
    U,
    M,
    AM,
    locate,
    getWeather,
    logout,
    dt,
    asset,
    status,
    Field,
    Photo,
    Metric,
    Panel,
    Empty,
    ReportTable,
    ReportCard,
    PasswordPanel,
    setCentres: C,
  };

  if (!user && authMode === 'landing') {
    return (
      <Landing
        enter={target => {
          P(target);
          AM('public');
        }}
        signIn={() => AM('login')}
        register={() => AM('register')}
      />
    );
  }

  if (!user && authMode !== 'public') {
    return (
      <Auth
        home={() => AM('landing')}
        mode={authMode}
        setMode={AM}
        guest={() => AM('public')}
        done={u => {
          U(u);
          M(u.role === 'admin' ? 'admin' : 'user');
          goPage('overview');
        }}
      />
    );
  }

  return (
    <div className={'shell premium-shell ' + (isAdmin ? 'admin-shell' : 'public-shell')}>
      <WorkspaceNav
        nav={nav}
        page={page}
        go={id => {
          goPage(id);
          E('');
        }}
        home={() => {
          goPage('overview');
          NO(false);
          if (!user) AM('landing');
        }}
        user={user}
        isAdmin={isAdmin}
        dash={dash}
        supportSummary={supportSummary}
        open={navOpen}
        setOpen={NO}
        logout={logout}
        signIn={() => AM('login')}
      />

      <main className="main" id="workspace-main">
        <div className="content">
          <div className="heading">
            <div>
              <small className="eyebrow">
                {isAdmin ? 'ADMINISTRATION CONSOLE' : 'PUBLIC HEAT SAFETY PORTAL'}
              </small>

              <h1>
                {isAdmin && page === 'overview' ? 'City overview' : title}
              </h1>

              <p>
                {page === 'overview'
                  ? 'A clearer view of heat conditions, public reports and cooling resources.'
                  : page === 'centres'
                    ? 'Explore real, verified cooling locations in Kuala Lumpur.'
                    : page === 'reports'
                      ? 'Review community submissions and record decisions with evidence.'
                      : page === 'heat'
                        ? 'Choose Kuala Lumpur or your current location. The two readings are kept separate.'
                        : page === 'verification'
                          ? 'Record inspections and keep public cooling centres verified.'
                          : page === 'alerts'
                            ? 'Create and publish heat advisories for users.'
                            : page === 'users'
                              ? 'Manage accounts and review each user\'s report history.'
                              : page === 'support'
                                ? 'Listen to feedback, investigate app problems and keep every request moving forward.'
                                : page === 'trends'
                                  ? (isAdmin
                                    ? 'Analyse heat readings over time, compare periods and export reports.'
                                    : 'Understand recent heat patterns and reporting activity.')
                                  : page === 'profile'
                                    ? (isAdmin ? 'Manage your account, security and administrator activity.' : 'Manage account details and security.')
                                    : 'Manage reports and facility details.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ThemeToggle />


            </div>

          </div>



          {error && (
            <div className="notice">
              {error}
              <button onClick={() => E('')}>×</button>
            </div>
          )}

          {isAdmin && page !== 'heat' && weatherError && (
            <div className="notice" role="alert">
              {weatherError}
            </div>
          )}

          {success && (
            <div className="success">
              {success}
              <button onClick={() => S('')}>×</button>
            </div>
          )}

          {(page === 'overview' || page === 'heat') && (
            <AlertBanner alerts={alerts} />
          )}

          {page === 'overview' && (
            isAdmin ? <AdminOverview ctx={ctx} /> : <Overview ctx={ctx} />
          )}

          {page === 'heat' && <HeatRisk ctx={ctx} />}

          {(page === 'centres' || page === 'centreform') && isAdmin && (
            <AdminCoolingCentres
              page={page}
              attention={dash?.centres?.attention || 0}
              centres={centres}
              loaded={centresLoaded}
              refresh={refresh}
              setError={E}
              setSuccess={S}
              setPage={goPage}
            />
          )}

          {page === 'centres' && !isAdmin && (
            <UserCoolingCentres
              page={page}
              userCoords={userCoords}
              locate={locate}
              locating={locating}
              favIds={favIds}
              onToggleFavourite={toggleFavourite}
              signedIn={!!user}
              onSignIn={() => AM('login')}
              locationError={localWeatherError}
              centres={centres}
              loaded={centresLoaded}
            />
          )}

          {page === 'submit' && user && <SubmitReport ctx={ctx} />}
          {page === 'myreports' && user && <MyReports ctx={ctx} />}
          {page === 'reports' && isAdmin && <ReportReview ctx={ctx} />}
          {page === 'verification' && isAdmin && <CentreVerification ctx={ctx} />}
          {page === 'alerts' && isAdmin && <AlertManagement ctx={ctx} />}
          {page === 'users' && isAdmin && <UserManagement ctx={ctx} />}
          {page === 'support' && isAdmin && <UserSupport ctx={ctx} />}
          {page === 'trends' && <Analytics ctx={ctx} />}
          {page === 'profile' && user && <Profile ctx={ctx} />}

          <footer className="footer">
            © {new Date().getFullYear()} HeatSafe KL
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;

/* User Support page */
const SUPPORT_STATUS_LABELS = { new: 'New', in_progress: 'In progress', resolved: 'Resolved' };
const EMPTY_SUPPORT_SUMMARY = { total: 0, new: 0, in_progress: 0, resolved: 0, open_problems: 0 };
const supportReviewForm = entry => ({ status: entry.status, adminNote: entry.admin_note || '', revision: entry.revision });

function UserSupport({ ctx }) {
  const onSummary = ctx.setSupportSummary;
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 12, summary: EMPTY_SUPPORT_SUMMARY });
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const selection = useRef(null);
  const request = useRef(0);
  const detail = useRef(null);

  const choose = useCallback(entry => {
    selection.current = entry ? String(entry.id) : null;
    setSelectedId(selection.current);
    setForm(entry ? supportReviewForm(entry) : null);
    setSaveError('');
  }, []);

  const load = useCallback(async ({ quiet = false, resetSelection = false } = {}) => {
    const id = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const query = new URLSearchParams({ status, kind, search: search.trim(), page: String(page) });
      const result = await api('/admin/feedback?' + query);
      if (id !== request.current) return;
      setData(result);
      setError('');
      onSummary(result.summary);
      const current = result.rows.find(entry => String(entry.id) === selection.current);
      if (!current || resetSelection) choose(current || result.rows[0] || null);
      if (result.page !== page) setPage(result.page);
    } catch (failure) {
      if (id === request.current) setError(failure.message || 'Could not load messages.');
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [status, kind, search, page, onSummary, choose]);

  useEffect(() => {
    const delay = setTimeout(() => load(), 200);
    const interval = setInterval(() => {
      if (!document.hidden) load({ quiet: true });
    }, 30000);
    return () => {
      clearTimeout(delay);
      clearInterval(interval);
      request.current++;
    };
  }, [load]);

  const selected = data.rows.find(entry => String(entry.id) === selectedId);
  const summary = data.summary;
  const changed = selected && form && (form.status !== selected.status || form.adminNote !== (selected.admin_note || ''));
  const activeFilters = status !== 'all' || kind !== 'all' || search.trim();

  async function save(event) {
    event.preventDefault();
    if (!selected || !form || saving) return;
    setSaving(true);
    setSaveError('');
    setSuccess('');
    try {
      const result = await api('/admin/feedback/' + selected.id, {
        method: 'PATCH', body: JSON.stringify(form),
      });
      setData(previous => ({ ...previous, rows: previous.rows.map(entry =>
        String(entry.id) === String(result.entry.id) ? result.entry : entry,
      ) }));
      choose(result.entry);
      setSuccess(`Review saved for “${result.entry.subject}”.`);
      await load({ quiet: true });
    } catch (failure) {
      setSaveError(failure.message || 'Could not save this review.');
    } finally {
      setSaving(false);
    }
  }

  function filter(setter, value) {
    setter(value);
    setPage(1);
    setSuccess('');
  }

  return (
    <section className="feedback-desk" aria-label="Feedback and problems inbox">
      <div className="feedback-hero">
        <div className="feedback-hero-copy">
          <span className="feedback-eyebrow"><span /> COMMUNITY DESK</span>
          <h2>A closer listen.<br /><em>A better HeatSafe.</em></h2>
          <p>Ideas worth hearing. Problems worth fixing.<br />Keep every community message moving forward.</p>
          <span className="feedback-live"><span /> Checks for new messages every 30 seconds</span>
        </div>
        <div className="feedback-hero-art" aria-hidden="true">
          <span className="feedback-art-orbit" />
          <div className="feedback-art-note"><MessageSquare size={28} /><span>Every voice<br /><b>has a place.</b></span></div>
          <span className="feedback-art-idea"><Lightbulb size={23} /></span>
          <span className="feedback-art-check"><Check size={20} /></span>
          <ArrowUpRight className="feedback-art-arrow" size={29} />
        </div>
        <div className="feedback-counts">
          {[
            ['new', 'New messages', Inbox],
            ['in_progress', 'In progress', Clock3],
            ['resolved', 'Resolved', CheckCheck],
          ].map(([key, label, Icon]) => (
            <button type="button" key={key} className={'feedback-count ' + key + (status === key ? ' selected' : '')}
              aria-pressed={status === key} onClick={() => filter(setStatus, status === key ? 'all' : key)} disabled={saving}>
              <Icon size={18} /><strong>{summary[key]}</strong><span>{label}</span>
            </button>
          ))}
          <span className="feedback-problem-count"><Wrench size={14} /> {summary.open_problems} open problem{summary.open_problems === 1 ? '' : 's'}</span>
        </div>
      </div>

      {success && <div className="feedback-success" role="status"><CheckCheck size={17} />{success}</div>}
      {error && <div className="feedback-error" role="alert">{error}<button type="button" onClick={() => load()}>Try again</button></div>}

      <div className="feedback-toolbar">
        <label className="feedback-search"><Search size={17} /><input aria-label="Search feedback and problems" maxLength={160}
          placeholder="Search message, name or email…" value={search} onChange={event => filter(setSearch, event.target.value)} disabled={saving} /></label>
        <select aria-label="Message type" value={kind} onChange={event => filter(setKind, event.target.value)} disabled={saving}>
          <option value="all">All messages</option><option value="problem">Problems</option><option value="feedback">Feedback</option>
        </select>
        <select aria-label="Message status" value={status} onChange={event => filter(setStatus, event.target.value)} disabled={saving}>
          <option value="all">All statuses</option><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option>
        </select>
        <button className="feedback-refresh" type="button" onClick={() => load()} disabled={loading || saving}><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="feedback-workspace" aria-busy={loading}>
        <section className="feedback-list-panel" aria-label="Message list">
          <header className="feedback-list-heading"><div><h3>The inbox</h3><span>{loading ? 'Loading messages…' : `${data.total} message${data.total === 1 ? '' : 's'}`}</span></div><span className="feedback-list-order">New problems first</span></header>
          <div className="feedback-message-list">
            {data.rows.map(entry => {
              const Icon = entry.kind === 'problem' ? Wrench : MessageSquare;
              return <button key={entry.id} type="button" disabled={saving}
                className={'feedback-ticket ' + entry.kind + (String(entry.id) === selectedId ? ' selected' : '')}
                aria-pressed={String(entry.id) === selectedId} onClick={() => {
                  choose(entry);
                  if (matchMedia('(max-width: 860px)').matches) detail.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
                }}>
                <div className="feedback-ticket-top"><span className="feedback-kind"><Icon size={13} />{entry.kind === 'problem' ? 'Problem' : 'Feedback'}</span><span className={'feedback-status ' + entry.status}>{SUPPORT_STATUS_LABELS[entry.status]}</span></div>
                <h4>{entry.subject}</h4><p>{entry.message}</p>
                <footer><span>{entry.sender_name || 'Removed account'}</span><time dateTime={entry.created_at}>{dt(entry.created_at)}</time></footer>
              </button>;
            })}
            {!loading && !data.rows.length && <div className="feedback-empty"><Inbox size={35} /><h4>{activeFilters ? 'No matching messages' : 'A little quiet here.'}</h4><p>{activeFilters ? 'Try another search or clear the filters.' : 'Messages sent from Profile → Help & feedback will arrive here.'}</p>
              {activeFilters && <button type="button" onClick={() => { setStatus('all'); setKind('all'); setSearch(''); setPage(1); }}>Clear filters</button>}
            </div>}
          </div>
          <footer className="feedback-pagination"><button type="button" aria-label="Previous messages" disabled={data.page <= 1 || loading || saving} onClick={() => setPage(data.page - 1)}><ChevronLeft size={17} /></button><span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" aria-label="Next messages" disabled={data.page * data.pageSize >= data.total || loading || saving} onClick={() => setPage(data.page + 1)}><ChevronRight size={17} /></button></footer>
        </section>

        <section ref={detail} className="feedback-detail" aria-label="Selected message">
          {selected && form ? <>
            <header className="feedback-detail-heading"><span className={'feedback-kind ' + selected.kind}>{selected.kind === 'problem' ? <Wrench size={15} /> : <MessageSquare size={15} />}{selected.kind === 'problem' ? 'PROBLEM REPORT' : 'COMMUNITY FEEDBACK'}</span><span className="feedback-reference">HS-{selected.id}</span><h3>{selected.subject}</h3></header>
            <div className="feedback-sender"><span className="feedback-avatar">{(selected.sender_name || '?').slice(0, 1).toUpperCase()}</span><div><b>{selected.sender_name || 'Removed account'}</b><span>{selected.sender_email || 'Account no longer available'}</span></div><time dateTime={selected.created_at}>{dt(selected.created_at)}</time></div>
            <div className="feedback-message-body">{selected.message}</div>
            <form className="feedback-review-form" onSubmit={save}>
              <div className="feedback-review-heading"><ShieldCheck size={17} /><h4>Admin workspace</h4><span>Private</span></div>
              <div className="feedback-progress" aria-label={'Current status: ' + SUPPORT_STATUS_LABELS[form.status]}>{Object.entries(SUPPORT_STATUS_LABELS).map(([key, label], index) => <span key={key} className={form.status === key ? 'active' : ''}><i>{index + 1}</i>{label}</span>)}</div>
              <label className="field"><span>Review status</span><select aria-label="Review status" value={form.status} disabled={saving} onChange={event => { setForm(previous => ({ ...previous, status: event.target.value })); setSaveError(''); }}>
                {Object.entries(SUPPORT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label className="field"><span>Private admin note</span><textarea rows={4} maxLength={2000} value={form.adminNote} disabled={saving} onChange={event => { setForm(previous => ({ ...previous, adminNote: event.target.value })); setSaveError(''); }} placeholder="What needs attention? Record your investigation, next step or resolution." /><small className="feedback-note-hint">Visible to administrators only. <span>{form.adminNote.length}/2000</span></small></label>
              {saveError && <div className="feedback-error" role="alert">{saveError}<button type="button" onClick={() => load({ resetSelection: true })} disabled={saving || loading}>Reload message</button></div>}
              <div className="feedback-review-actions"><small>{selected.reviewed_at ? `Last reviewed by ${selected.reviewer_name || 'a removed administrator'} · ${dt(selected.reviewed_at)}` : 'Not reviewed yet'}</small><button className="btn primary" disabled={saving || !changed}>{saving ? 'Saving…' : <><Check size={16} /> Save changes</>}</button></div>
            </form>
          </> : <div className="feedback-detail-empty"><span><MessageSquare size={40} /></span><h3>Make room for a voice.</h3><p>Select a message to read the details<br />and plan the next step.</p></div>}
        </section>
      </div>
    </section>
  );
}
