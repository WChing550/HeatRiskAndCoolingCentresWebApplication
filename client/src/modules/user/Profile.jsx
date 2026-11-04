import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

export default function Profile({ ctx }) {
  const { user, isAdmin, S: setSuccess, E: setError, PasswordPanel, Field } = ctx;
  const [profile, setProfile] = useState({ fullName: user?.fullName || '', username: user?.username || '' });

  useEffect(() => {
    setProfile({ fullName: user?.fullName || '', username: user?.username || '' });
  }, [user]);

  async function saveProfile(event) {
    event.preventDefault();
    try {
      const result = await api('/account/profile', { method: 'PATCH', body: JSON.stringify(profile) });
      ctx.U(result.user);
      setSuccess('Profile updated.');
    } catch (error) {
      setError(error.message);
    }
  }

  if (!user) return null;
  return (
    <div className="columns profilecols">
      <section className="panel">
        <header className="panelhead"><div><h3>Account profile</h3><p>Manage your personal details</p></div></header>
        <div className="profilecenter">
          <div className="bigavatar">{user.fullName?.[0]}</div>
          <h3>{user.fullName}</h3><p>{user.email}</p>
          <span>{isAdmin ? 'Administrator' : 'Community member'}</span>
        </div>
        <form className="stack" onSubmit={saveProfile}>
          <Field label="Full name"><input required value={profile.fullName} onChange={e => setProfile(previous => ({ ...previous, fullName: e.target.value }))} /></Field>
          <Field label="Username"><input required value={profile.username} onChange={e => setProfile(previous => ({ ...previous, username: e.target.value }))} /></Field>
          <button className="btn primary">Save profile</button>
        </form>
      </section>
      <PasswordPanel />
    </div>
  );
}
