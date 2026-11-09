import React from 'react';
import { Sun, Menu, X, LogOut, ArrowUpRight, ShieldCheck } from 'lucide-react';

export default function WorkspaceNav({ nav, page, go, home, user, isAdmin, dash, open, setOpen, logout, signIn }) {
  return <header className={'workspace-nav ' + (open ? 'menu-open' : '')}>
    <div className="workspace-masthead">
      <button className="workspace-logo" onClick={home} aria-label="HeatSafe home"><span><Sun size={23} /></span><b>HeatSafe <em>KL</em><sup>°</sup></b></button>
      <div className="workspace-account"><span className="connection-status"><i />Kuala Lumpur</span>{isAdmin && <span className="access-label"><ShieldCheck size={13} />Administrator</span>}{user ? <><span className="account-initial" title={user.fullName}>{user.fullName?.[0] || 'U'}</span><button className="nav-logout" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut size={17} /></button></> : <button className="nav-login" onClick={signIn}>Sign in<ArrowUpRight size={16} /></button>}<button className="workspace-menu" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="workspace-links" aria-label={open ? 'Close navigation' : 'Open navigation'}>{open ? <X size={21} /> : <Menu size={21} />}</button></div>
    </div>
    <nav id="workspace-links" className="workspace-links" aria-label={isAdmin ? 'Administration navigation' : 'Main navigation'}>{nav.map(([id, label, Icon]) => {
      const active = page === id || (id === 'centres' && ['centreform', 'verification'].includes(page));
      const count = id === 'reports' ? dash?.reports?.pending : id === 'centres' && isAdmin ? dash?.centres?.attention : 0;
      return <button key={id} className={'workspace-link ' + (active ? 'current' : '')} aria-current={active ? 'page' : undefined} onClick={() => { go(id); setOpen(false); }}><Icon size={15} /><span>{label}</span>{count > 0 && <b>{count}</b>}</button>;
    })}</nav>
  </header>;
}
