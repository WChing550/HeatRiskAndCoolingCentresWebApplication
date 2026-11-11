import React, { useEffect, useRef, useState } from 'react';
import './lib/chartSetup.js';
import 'leaflet/dist/leaflet.css';
import { api, asset, dt, status } from './lib/api.js';
import Auth from './pages/auth/Auth.jsx';
import Landing from './pages/Landing.jsx';
import WorkspaceNav from './components/WorkspaceNav.jsx';
import AdminOverview from './modules/admin/AdminOverview.jsx';
import { Sun, Activity, MapPin, ThermometerSun, Users, ClipboardList, Building2, LogOut, Menu, X, Plus, Search, CheckCircle2, XCircle, Clock3, FileText, Eye, RefreshCw, LayoutDashboard, UserRound, HeartPulse, LocateFixed, ShieldCheck, BellRing, ScrollText } from 'lucide-react';
import { Field, Photo, Metric, Panel, Empty, ReportTable, ReportCard, PasswordPanel } from './components/Shared.jsx';
import CoolingCentres from './modules/admin/CoolingCentres.jsx';
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
import ActivityLog from './modules/admin/ActivityLog.jsx';
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
    [centresLoaded, CL] = useState(false);

  const weatherRequests = useRef({ city: 0, location: 0 });
  const pendingWeather = useRef(0);
  const refreshRequest = useRef(0);
  const isAdmin = user?.role === 'admin';

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

    navigator.geolocation.getCurrentPosition(
      p => {
        const coords = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        };

        SET_USER_COORDS(coords);
        if (typeof onLocated === 'function') onLocated(coords);
        getWeather(coords);
      },
      () => LWE(
        'Location permission denied. Allow location access in your browser settings and try again.',
      ),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
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
      ['activity', 'Activity Log', ScrollText],
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
    centres,
    reports,
    dash,
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
                              : page === 'activity'
                                ? 'A traceable record of administrator actions.'
                                : page === 'trends'
                                  ? (isAdmin
                                    ? 'Analyse heat readings over time, compare periods and export reports.'
                                    : 'Understand recent heat patterns and reporting activity.')
                                  : page === 'profile'
                                    ? 'Manage account details and security.'
                                    : 'Manage reports and facility details.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ThemeToggle />

              {isAdmin && page !== 'heat' && (
                <button
                  className="btn secondary weather-refresh"
                  disabled={weatherLoading}
                  onClick={refreshWeather}
                >
                  <RefreshCw
                    size={15}
                    className={weatherLoading ? 'spin' : ''}
                  />
                  {weatherLoading
                    ? 'Refreshing Kuala Lumpur weather…'
                    : 'Refresh Kuala Lumpur weather'}
                </button>
              )}
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

          {(page === 'centres' || page === 'centreform') && (
            <CoolingCentres
              page={page}
              userCoords={userCoords}
              locate={locate}
              weatherError={localWeatherError}
              isAdmin={isAdmin}
              attention={dash?.centres?.attention || 0}
              centres={centres}
              loaded={centresLoaded}
              refresh={refresh}
              setError={E}
              setSuccess={S}
              setPage={goPage}
            />
          )}

          {page === 'submit' && user && <SubmitReport ctx={ctx} />}
          {page === 'myreports' && user && <MyReports ctx={ctx} />}
          {page === 'reports' && isAdmin && <ReportReview ctx={ctx} />}
          {page === 'verification' && isAdmin && <CentreVerification ctx={ctx} />}
          {page === 'alerts' && isAdmin && <AlertManagement ctx={ctx} />}
          {page === 'users' && isAdmin && <UserManagement ctx={ctx} />}
          {page === 'activity' && isAdmin && <ActivityLog ctx={ctx} />}
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