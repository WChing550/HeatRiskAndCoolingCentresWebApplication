import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { api } from '../../lib/api.js';

const MAX_AVATAR_MB = 2;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

export default function Profile({ ctx }) {
  const { user, isAdmin, S: setSuccess, E: setError, PasswordPanel, Field } = ctx;
  const [profile, setProfile] = useState({ fullName: user?.fullName || '', username: user?.username || '' });
  const [errors, setErrors] = useState({});
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setProfile({ fullName: user?.fullName || '', username: user?.username || '' });
  }, [user]);

  useEffect(() => {
    if (!avatarFile) { setAvatarPreview(''); return; }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

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
    setAvatarFile(message ? null : file);
  }

  async function uploadAvatar() {
    if (!avatarFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      const result = await api('/account/avatar', { method: 'POST', body: formData });
      ctx.U(result.user);
      setAvatarFile(null);
      setSuccess('Profile photo updated.');
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

    try {
      const payload = { fullName: profile.fullName.trim(), username: profile.username.trim() };
      const result = await api('/account/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      ctx.U(result.user);
      setSuccess('Profile updated.');
    } catch (error) {
      setError(error.message);
    }
  }

  if (!user) return null;

  const avatarSrc = avatarPreview || user.avatarUrl;
  const errorStyle = { color: '#dc2626', fontSize: 13, marginTop: 4, display: 'block' };

  return (
    <div className="columns profilecols">
      <section className="panel">
        <header className="panelhead"><div><h3>Account profile</h3><p>Manage your personal details</p></div></header>
        <div className="profilecenter">
          <label style={{ position: 'relative', cursor: 'pointer', display: 'inline-block' }}>
            {avatarSrc ? (
              <img src={avatarSrc} alt="Profile" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div className="bigavatar">{user.fullName?.[0]}</div>
            )}
            <span style={{
              position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: '50%',
              background: '#111', color: '#fff', display: 'grid', placeItems: 'center',
            }}>
              <Camera size={14} />
            </span>
            <input type="file" accept={ALLOWED_TYPES.join(',')} hidden onChange={pickAvatar} />
          </label>

          {avatarError && <span style={errorStyle}>{avatarError}</span>}
          {avatarFile && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn secondary" onClick={() => setAvatarFile(null)} disabled={uploading}>Cancel</button>
              <button type="button" className="btn primary" onClick={uploadAvatar} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Save photo'}
              </button>
            </div>
          )}

          <h3>{user.fullName}</h3><p>{user.email}</p>
          <span>{isAdmin ? 'Administrator' : 'Community member'}</span>
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
          <button className="btn primary">Save profile</button>
        </form>
      </section>
      <PasswordPanel />
    </div>
  );
}