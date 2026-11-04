import React, { useEffect, useState } from 'react';
import './lib/chartSetup.js';
import 'leaflet/dist/leaflet.css';
import { api, asset, dt, status } from './lib/api.js';
import Auth from './pages/auth/Auth.jsx';
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

const btn = (label, fn, kind = 'primary', icon = null) => <button className={'btn ' + kind} onClick={fn}>{icon}{label}</button>;
function App() {
    const [user, U] = useState(null), [userCoords, SET_USER_COORDS] = useState(null), [authMode, AM] = useState('login'), [page, P] = useState('overview'), [module, M] = useState('user'), [navOpen, NO] = useState(false), [error, E] = useState(''), [success, S] = useState(''), [weather, W] = useState(null), [weatherError, WE] = useState(''), [centres, C] = useState([]), [reports, R] = useState([]), [dash, D] = useState(null), [history, H] = useState([]), [stats, ST] = useState(null), [alerts, SET_ALERTS] = useState([]), [busy, B] = useState(false);
    const isAdmin = user?.role === 'admin';
    async function refresh() { try { let [c, h, st, al] = await Promise.all([api(isAdmin ? '/centres?all=true' : '/centres'), api('/weather/history?days=7'), api('/dashboard/public'), api('/alerts/active').catch(() => [])]); C(c); H(h.rows || []); ST(st); SET_ALERTS(al); if (isAdmin) { let [d, r] = await Promise.all([api('/admin/dashboard'), api('/admin/reports')]); D(d); R(r) } else if (user) { R(await api('/reports/mine')); } } catch (e) { E(e.message) } }
    useEffect(() => { api('/auth/me').then(d => { if (d.user) { U(d.user); M(d.user.role === 'admin' ? 'admin' : 'user') } }).catch(() => { }) }, []); useEffect(() => { refresh() }, [user]); useEffect(() => { getWeather().catch(e => WE(e.message)) }, []); useEffect(() => { const t = setInterval(() => { api('/alerts/active').then(SET_ALERTS).catch(() => { }) }, 300000); return () => clearInterval(t) }, []);
    async function getWeather(coords) { try { let qs = coords ? `?lat=${coords.latitude}&lon=${coords.longitude}` : ''; W(await api('/weather/current' + qs)); WE('') } catch (e) { WE(e.message) } }
    function locate(onLocated) { if (!navigator.geolocation) { WE('Location detection is unavailable.'); return } navigator.geolocation.getCurrentPosition(p => { const coords = { latitude: p.coords.latitude, longitude: p.coords.longitude }; SET_USER_COORDS(coords); if (typeof onLocated === 'function') onLocated(coords); getWeather(coords); WE('') }, () => WE('Location permission denied. Allow location access in your browser settings and try again.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }) }
    async function logout() { try { await api('/auth/logout', { method: 'POST' }) } catch { } U(null); M('user'); P('overview') }
    async function refreshWeather() { try { W(await api('/admin/weather/refresh', { method: 'POST' })); S('Weather refreshed.'); refresh() } catch (e) { WE(e.message) } }
    const nav = module === 'admin' ? [['overview', 'Overview', LayoutDashboard], ['heat', 'Heat Risk', ThermometerSun], ['centres', 'Cooling Centres', Building2], ['reports', 'Report Review', ClipboardList], ['alerts', 'Heat Alerts', BellRing], ['users', 'User Management', Users], ['trends', 'Analytics', Activity], ['activity', 'Activity Log', ScrollText], ['profile', 'My Profile', UserRound]] : [['overview', 'Overview', LayoutDashboard], ['heat', 'Heat risk', ThermometerSun], ['centres', 'Cooling centres', MapPin], ...(user ? [['myreports', 'My reports', ClipboardList], ['submit', 'Submit report', Plus], ['profile', 'My profile', UserRound]] : []), ['trends', 'Heat trends', Activity]], title = nav.find(x => x[0] === page)?.[1] || (page === 'verification' ? 'Centre Verification' : 'Cooling centre form');
    const ctx = { user, userCoords, page, module, error, success, weather, weatherError, centres, reports, dash, history, stats, busy, alerts, isAdmin, nav, title, refreshWeather, refresh, setPage: P, P, E, S, NO, U, M, AM, locate, getWeather, logout, dt, asset, status, Field, Photo, Metric, Panel, Empty, ReportTable, ReportCard, PasswordPanel, setCentres: C };
    if (!user && authMode !== 'public') return <Auth mode={authMode} setMode={AM} guest={() => AM('public')} done={u => { U(u); M(u.role === 'admin' ? 'admin' : 'user'); P('overview') }} />;
    return <div className="shell"><aside className={'sidebar ' + (navOpen ? 'open' : '')}><div className="brand"><div className="brand-icon"><Sun /></div><div><b>HEATSAFE <em>KL</em></b><small>HEAT & COOLING INTELLIGENCE</small></div><button className="close" onClick={() => NO(false)}><X /></button></div><small className="nav-caption">WORKSPACE</small>{nav.map(([id, label, Icon]) => <button key={id} className={'navitem ' + (page === id || (id === 'centres' && ['centreform', 'verification'].includes(page)) ? 'active' : '')} onClick={() => { P(id); NO(false); E('') }}><Icon size={18} />{label}{id === 'reports' && dash?.reports?.pending > 0 && <b className="badge">{dash.reports.pending}</b>}{id === 'centres' && isAdmin && dash?.centres?.attention > 0 && <b className="badge">{dash.centres.attention}</b>}</button>)}<div className="sidebar-bottom"><div className="safety-mini"><HeartPulse /><b>Heat safety matters</b><p>Know the risk. Find shade. Stay hydrated.</p><button onClick={() => P('heat')}>View guidance ↗</button></div><div className="mini-profile"><div className="avatar">{user?.fullName?.[0] || 'G'}</div><div><b>{user?.fullName || 'Guest visitor'}</b><small>{isAdmin ? 'Administrator' : user ? 'Community member' : 'Public access'}</small></div>{user && <button className="iconbtn" onClick={logout}><LogOut size={15} /></button>}</div></div></aside>
        <main className="main"><header className="topbar"><button className="hamb" onClick={() => NO(!navOpen)}><Menu /></button><div className="crumb">HeatSafe KL <span>/</span> <b>{title}</b></div><div className="topright"><i />Kuala Lumpur monitoring{isAdmin && <span className="admin-tag"><ShieldCheck size={14} /> Admin</span>}{user && <button className="iconbtn" onClick={logout}><LogOut size={16} /></button>}{!user && <button className="btn secondary" onClick={() => AM('login')}>Sign in</button>}</div></header><div className="content"><div className="heading"><div><small className="eyebrow">{isAdmin ? 'ADMINISTRATION CONSOLE' : 'PUBLIC HEAT SAFETY PORTAL'}</small><h1>{title}</h1><p>{page === 'overview' ? 'A clearer view of heat conditions, public reports and cooling resources.' : page === 'centres' ? 'Explore real, verified cooling locations in Kuala Lumpur.' : page === 'reports' ? 'Review community submissions and record decisions with evidence.' : page === 'heat' ? 'Current conditions translated into actionable heat-risk guidance.' : page === 'verification' ? 'Record inspections and keep public cooling centres verified.' : page === 'alerts' ? 'Create and publish heat advisories for users.' : page === 'users' ? 'Manage accounts and review each user\'s report history.' : page === 'activity' ? 'A traceable record of administrator actions.' : page === 'trends' ? (isAdmin ? 'Analyse heat readings over time, compare periods and export reports.' : 'Understand recent heat patterns and reporting activity.') : page === 'profile' ? 'Manage account details and security.' : 'Manage reports and facility details.'}</p></div>{isAdmin && <button className="btn secondary" onClick={refreshWeather}><RefreshCw size={15} /> Refresh weather</button>}</div>{error && <div className="notice">{error}<button onClick={() => E('')}>×</button></div>}{success && <div className="success">{success}<button onClick={() => S('')}>×</button></div>}
            {(page === 'overview' || page === 'heat') && <AlertBanner alerts={alerts} />}
            {page === 'overview' && <Overview ctx={ctx} />}
            {page === 'heat' && <HeatRisk ctx={ctx} />}
            {(page === 'centres' || page === 'centreform') && <CoolingCentres page={page} userCoords={userCoords} locate={locate} weatherError={weatherError} isAdmin={isAdmin} attention={dash?.centres?.attention || 0} centres={centres} refresh={refresh} setError={E} setSuccess={S} setPage={P} />}
            {page === 'submit' && user && <SubmitReport ctx={ctx} />}
            {page === 'myreports' && user && <MyReports ctx={ctx} />}
            {page === 'reports' && isAdmin && <ReportReview ctx={ctx} />}
            {page === 'verification' && isAdmin && <CentreVerification ctx={ctx} />}
            {page === 'alerts' && isAdmin && <AlertManagement ctx={ctx} />}
            {page === 'users' && isAdmin && <UserManagement ctx={ctx} />}
            {page === 'activity' && isAdmin && <ActivityLog ctx={ctx} />}
            {page === 'trends' && <Analytics ctx={ctx} />}
            {page === 'profile' && user && <Profile ctx={ctx} />}

            <footer className="footer">© {new Date().getFullYear()} HeatSafe KL <span><ShieldCheck size={14} /> Designed for safer communities in Kuala Lumpur</span><span>Follow official heat advisories.</span></footer></div></main>
    </div>
}
export default App;
