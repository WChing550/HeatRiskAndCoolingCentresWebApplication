import React, { useEffect, useMemo, useState } from 'react';
import { Camera, User, Heart, Bell, ShieldCheck, LifeBuoy, MapPin, ScrollText } from 'lucide-react';
import { api } from '../../lib/api.js';
import { centrePhotos } from '../../lib/centrePhotos.js';
import { isPublishedCentre } from '../../lib/centreVisibility.js';
import ActivityLog from '../admin/ActivityLog.jsx';

const MAX_AVATAR_MB = 2;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const USER_TABS = [
  ['account', 'Account', User],
  ['saved', 'Saved places', Heart],
  ['notifications', 'Notifications', Bell],
  ['help', 'Help & feedback', LifeBuoy],
  ['security', 'Security', ShieldCheck],
];
const ADMIN_TABS = [
  ['account', 'Account', User],
  ['security', 'Security', ShieldCheck],
  ['activity', 'Activity Log', ScrollText],
];

const FAQ = [
  ['How do I save a cooling centre?', 'Tap the heart on a centre card or its details page. Saved places appear in the Saved places tab, and you can filter the Cooling centres page to show only them.'],
  ['Why is "Locate me" not working?', 'Your browser needs permission to share your location, and the site must be opened over HTTPS (or localhost). Allow location access in your browser settings and try again.'],
  ['How are cooling centres verified?', 'Only centres that administrators have verified, and whose inspection is still current, are listed on the portal.'],
  ['What is the difference between a report and feedback?', 'Use Submit report to tell us about a heat-related situation in the community. Use this page to give feedback about the HeatSafe KL app itself or to report a problem with it.'],
];

function validateProfile({ fullName, username }) {
  const errors = {};
  const name = fullName.trim();
  const uname = username.trim();

  if (!name) errors.fullName = 'Full name is required.';
  else if (name.length < 2 || name.length > 60) errors.fullName = 'Full name must be 2 to 60 characters.';
  else if (!/^[\p{L}\s'.-]+$/u.test(name)) errors.fullName = 'Use letters, spaces, apostrophes, dots or hyphens only.';

  if (!uname) errors.username = 'Username is required.';
  else if (uname.length < 3 || uname.length > 20) errors.username = 'Username must be 3 to 20 characters.';
  else if (!/^[a-zA-Z0-9_]+$/.test(uname)) errors.username = 'Use letters, numbers and underscores only.';

  return errors;
}

function validateAvatar(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Please choose a JPG, PNG or WebP image.';
  if (file.size > MAX_AVATAR_MB * 1024 * 1024) return `Image must be smaller than ${MAX_AVATAR_MB} MB.`;
  return '';
}

/* ---------------- Account ---------------- */
function AccountTab({ ctx, avatarSrc, setAvatarPreviewFile, avatarFile }) {
  const { user, S: setSuccess, E: setError, Field } = ctx;
  const [profile, setProfile] = useState({ fullName: user.fullName || '', username: user.username || '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setProfile({ fullName: user.fullName || '', username: user.username || '' });
  }, [user.fullName, user.username]);

  const dirty = profile.fullName.trim() !== user.fullName || profile.username.trim() !== user.username;
  const errorStyle = { color: '#dc2626', fontSize: 13, marginTop: 4, display: 'block' };

  const setField = (key, value) => {
    setProfile(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: '' }));
  };

  function pickAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const message = validateAvatar(file);
    setAvatarError(message);
    setAvatarPreviewFile(message ? null : file);
  }

  async function uploadAvatar() {
    if (!avatarFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      const result = await api('/account/avatar', { method: 'POST', body: formData });
      ctx.U(result.user);
      setAvatarPreviewFile(null);
      setSuccess('Profile photo updated.');
    } catch (error) {
      setError(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      const result = await api('/account/avatar', { method: 'DELETE' });
      ctx.U(result.user);
      setSuccess('Profile photo removed.');
    } catch (error) {
      setError(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const found = validateProfile(profile);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const payload = { fullName: profile.fullName.trim(), username: profile.username.trim() };
      const result = await api('/account/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      ctx.U(result.user);
      setSuccess('Profile updated.');
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" role="tabpanel">
      <header className="panelhead"><div><h3>Account details</h3><p>Manage your personal details and profile photo</p></div></header>

      <div className="profile-photo-block">
        <label className="profile-avatar-pick">
          {avatarSrc
            ? <img src={avatarSrc} alt="Profile" className="profile-avatar-img" />
            : <div className="bigavatar">{user.fullName?.[0]}</div>}
          <span className="profile-avatar-badge"><Camera size={14} /></span>
          <input type="file" accept={ALLOWED_TYPES.join(',')} hidden onChange={pickAvatar} />
        </label>
        <div className="profile-photo-actions">
          {avatarFile ? (
            <>
              <button type="button" className="btn secondary small" onClick={() => setAvatarPreviewFile(null)} disabled={uploading}>Cancel</button>
              <button type="button" className="btn primary small" onClick={uploadAvatar} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Save photo'}
              </button>
            </>
          ) : user.avatarUrl ? (
            <button type="button" className="btn secondary small" onClick={removeAvatar} disabled={uploading}>Remove photo</button>
          ) : (
            <small className="profile-hint">JPG, PNG or WebP, up to {MAX_AVATAR_MB} MB</small>
          )}
        </div>
        {avatarError && <span style={errorStyle}>{avatarError}</span>}
      </div>

      <form className="stack" onSubmit={saveProfile} noValidate>
        <Field label="Full name">
          <input value={profile.fullName} onChange={e => setField('fullName', e.target.value)} aria-invalid={!!errors.fullName} />
          {errors.fullName && <span style={errorStyle}>{errors.fullName}</span>}
        </Field>
        <Field label="Username">
          <input value={profile.username} onChange={e => setField('username', e.target.value)} aria-invalid={!!errors.username} />
          {errors.username && <span style={errorStyle}>{errors.username}</span>}
        </Field>
        <Field label="Email">
          <input value={user.email} disabled readOnly />
          <small className="profile-hint">Your email is your sign-in address and can't be changed here.</small>
        </Field>
        <button className="btn primary" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </section>
  );
}

/* ---------------- Saved places ---------------- */
function SavedTab({ ctx, saved }) {
  const { asset, status, Empty, toggleFavourite } = ctx;

  function openCentre(centre) {
    window.location.hash = '/centres/' + centre.id;
  }

  return (
    <section className="panel" role="tabpanel">
      <header className="panelhead">
        <div><h3>Saved places</h3><p>Cooling centres you saved for quick access</p></div>
      </header>

      {saved.length === 0 ? (
        <>
          <Empty title="No saved places yet" text="Tap the heart on any cooling centre to save it here." />
          <div className="profile-center">
            <button type="button" className="btn primary" onClick={() => ctx.setPage('centres')}>Browse cooling centres</button>
          </div>
        </>
      ) : (
        <ul className="saved-list">
          {saved.map(centre => {
            const cover = centrePhotos(centre)[0];
            return (
              <li key={centre.id} className="saved-row">
                <div className="saved-thumb">
                  {cover ? <img src={asset(cover)} alt="" loading="lazy" /> : <MapPin size={22} />}
                </div>
                <div className="saved-info">
                  <b>{centre.name}</b>
                  <span>{centre.address}</span>
                  <span className={'pill ' + centre.status}>{status(centre.status)}</span>
                </div>
                <div className="saved-actions">
                  <button type="button" className="btn secondary small" onClick={() => openCentre(centre)}>View details</button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => toggleFavourite(centre.id)}
                    aria-label={`Remove ${centre.name} from saved places`}
                  >
                    <Heart size={14} fill="currentColor" /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Notifications ---------------- */
function NotificationsTab({ ctx }) {
  const { user, S: setSuccess, E: setError } = ctx;
  const [saving, setSaving] = useState(false);

  async function setAlertEmails(next) {
    setSaving(true);
    try {
      const result = await api('/account/preferences', { method: 'PATCH', body: JSON.stringify({ alertEmails: next }) });
      ctx.U(result.user);
      setSuccess(next ? 'Heat advisory emails turned on.' : 'Heat advisory emails turned off.');
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" role="tabpanel">
      <header className="panelhead"><div><h3>Notifications</h3><p>Choose how HeatSafe KL contacts you</p></div></header>
      <label className="pref-toggle-row">
        <div>
          <b>Email me heat advisories</b>
          <p>Get an email at {user.email} when administrators publish a new heat alert for Kuala Lumpur.</p>
        </div>
        <input
          type="checkbox"
          role="switch"
          className="pref-toggle"
          checked={!!user.alertEmails}
          disabled={saving}
          onChange={e => setAlertEmails(e.target.checked)}
        />
      </label>
    </section>
  );
}

/* ---------------- Help & feedback ---------------- */
function HelpTab() {
  const [form, setForm] = useState({ kind: 'feedback', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState({ type: '', text: '' });

  const set = (key, value) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setResult({ type: '', text: '' });
  };

  async function submit(event) {
    event.preventDefault();
    if (form.subject.trim().length < 3) return setResult({ type: 'error', text: 'Please enter a subject (at least 3 characters).' });
    if (form.message.trim().length < 10) return setResult({ type: 'error', text: 'Please describe it in at least 10 characters.' });

    setSending(true);
    try {
      const data = await api('/feedback', { method: 'POST', body: JSON.stringify(form) });
      setResult({ type: 'success', text: data.message });
      setForm({ kind: form.kind, subject: '', message: '' });
    } catch (error) {
      setResult({ type: 'error', text: error.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="profile-help" role="tabpanel">
      <section className="panel">
        <header className="panelhead"><div><h3>Share feedback or report a problem</h3><p>About the HeatSafe KL app itself. For heat incidents, use Submit report.</p></div></header>
        <form className="stack" onSubmit={submit} noValidate>
          <div className="segmented" role="radiogroup" aria-label="Type of message">
            {[['feedback', 'Share feedback'], ['problem', 'Report a problem']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.kind === value}
                className={form.kind === value ? 'is-active' : ''}
                onClick={() => set('kind', value)}
              >{label}</button>
            ))}
          </div>
          <label className="field">
            <span>Subject</span>
            <input value={form.subject} maxLength={120} onChange={e => set('subject', e.target.value)} placeholder={form.kind === 'problem' ? 'e.g. Map does not load' : 'e.g. Idea for the cooling centres page'} />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea rows={6} value={form.message} maxLength={2000} onChange={e => set('message', e.target.value)} placeholder={form.kind === 'problem' ? 'What happened, and what did you expect to happen?' : 'Tell us what you think.'} />
            <small className="profile-hint">{form.message.length}/2000</small>
          </label>
          {result.text && (
            <div className={result.type === 'success' ? 'success' : 'notice'} role={result.type === 'error' ? 'alert' : 'status'}>{result.text}</div>
          )}
          <button className="btn primary" disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
        </form>
      </section>

      <section className="panel">
        <header className="panelhead"><div><h3>Quick answers</h3><p>Common questions</p></div></header>
        <div className="faq">
          {FAQ.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Profile({ ctx }) {
  const { user, isAdmin, PasswordPanel, asset, centres = [], favIds = [] } = ctx;
  const [tab, setTab] = useState('account');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');

  useEffect(() => {
    const availableTabs = isAdmin ? ADMIN_TABS : USER_TABS;
    if (!availableTabs.some(([id]) => id === tab)) setTab('account');
  }, [isAdmin, tab]);

  useEffect(() => {
    if (!avatarFile) { setAvatarPreview(''); return; }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const saved = useMemo(
    () => centres.filter(centre => isPublishedCentre(centre) && favIds.includes(String(centre.id))),
    [centres, favIds]
  );

  if (!user) return null;

  const tabs = isAdmin ? ADMIN_TABS : USER_TABS;
  const avatarSrc = avatarPreview || (user.avatarUrl ? asset(user.avatarUrl) : '');
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="profile-page">
      <section className="panel profile-hero">
        {avatarSrc
          ? <img src={avatarSrc} alt="" className="profile-hero-img" />
          : <div className="bigavatar profile-hero-initial">{user.fullName?.[0]}</div>}
        <div className="profile-hero-main">
          <h2>{user.fullName}</h2>
          <p>{user.email}</p>
          <div className="profile-hero-meta">
            <span className="profile-role">{isAdmin ? 'Administrator' : 'Community member'}</span>
            {memberSince && <small>Member since {memberSince}</small>}
          </div>
        </div>
        {!isAdmin && (
          <div className="profile-stat">
            <b>{saved.length}</b>
            <small>Saved places</small>
          </div>
        )}
      </section>

      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={'profile-tab' + (tab === id ? ' is-active' : '')}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {tab === 'account' && (
        <AccountTab ctx={ctx} avatarSrc={avatarSrc} avatarFile={avatarFile} setAvatarPreviewFile={setAvatarFile} />
      )}
      {tab === 'saved' && !isAdmin && <SavedTab ctx={ctx} saved={saved} />}
      {tab === 'notifications' && !isAdmin && <NotificationsTab ctx={ctx} />}
      {tab === 'help' && !isAdmin && <HelpTab />}
      {tab === 'security' && <PasswordPanel />}
      {tab === 'activity' && isAdmin && (
        <div className="profile-activity" role="tabpanel" aria-label="Activity Log">
          <ActivityLog ctx={ctx} />
        </div>
      )}
    </div>
  );
}