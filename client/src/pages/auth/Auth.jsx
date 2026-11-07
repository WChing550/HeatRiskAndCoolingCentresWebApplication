import React, { useState, useEffect } from 'react';
import { Sun, ArrowUpRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import ClimateArt from '../../components/ClimateArt.jsx';
import { Field } from '../../components/Shared.jsx';

const COPY = {
  login: { title: 'Welcome back', sub: 'Sign in to access heat insights and your reports.', button: 'Sign in' },
  register: { title: 'Create your account', sub: 'Join the community and help keep KL safer.', button: 'Create account' },
  forgot: { title: 'Forgot your password?', sub: "Enter your email and we'll send you a link to reset it.", button: 'Send reset link' },
  reset: { title: 'Set a new password', sub: 'Choose a new password for your account.', button: 'Update password' },
};

function Auth({ home, mode, setMode, done, guest }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    username: '',
    login: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get('token') || ''
  );

  const isRegister = mode === 'register';
  const isLogin = mode === 'login';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  const copy = COPY[mode] || COPY.login;

  // Open the reset form automatically when the user arrives from the email link
  useEffect(() => {
    if (resetToken) setMode('reset');
  }, [resetToken]);

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function changeMode(next) {
    setMode(next);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);

    try {
      if (isRegister) {
        await api('/auth/register', { method: 'POST', body: JSON.stringify(form) });
        setMode('login');
        setSuccess('Account created. Please sign in.');
      } else if (isForgot) {
        await api('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: form.email.trim() }),
        });
        // Same message whether or not the email exists, so nobody can probe for accounts
        setSuccess('If that email is registered, a reset link has been sent. Please check your inbox.');
      } else if (isReset) {
        if (form.password !== form.confirmPassword) {
          setError('Passwords do not match.');
          return;
        }
        await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, password: form.password }),
        });
        window.history.replaceState({}, '', window.location.pathname); // remove ?token= from the URL
        setResetToken('');
        setForm(previous => ({ ...previous, password: '', confirmPassword: '' }));
        setMode('login');
        setSuccess('Password updated. Please sign in with your new password.');
      } else {
        const data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ login: form.login, password: form.password }),
        });
        done(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-story">
        <button className="auth-back mono" onClick={home}>
          ← BACK TO HEATSAFE
        </button>

        <div>
          <span className="mono">YOUR CITY. YOUR COMMUNITY.</span>
          <h1>
            Better days.
            <br />
            <em>Together.</em>
          </h1>
          <p>
            A little awareness. A little care.
            <br />
            A cooler way to move through KL.
          </p>
        </div>

        <ClimateArt compact />

        <span className="mono auth-story-footer">KUALA LUMPUR / 3.1390° N, 101.6869° E</span>
      </section>

      <section className="auth-form">
        <div className="auth-brand">
          <span className="auth-brand-icon">
            <Sun size={22} />
          </span>
          <span>
            HEATSAFE <b>KL</b>
          </span>
        </div>

        <div className="eyebrow">SECURE COMMUNITY ACCESS</div>
        <h2>{copy.title}</h2>
        <p className="muted">{copy.sub}</p>

        {error && <div className="notice" role="alert">{error}</div>}
        {success && <div className="notice success" role="status">{success}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <Field label="Full name">
                <input name="fullName" value={form.fullName} onChange={handleChange} required />
              </Field>
              <Field label="Username">
                <input name="username" value={form.username} onChange={handleChange} required />
              </Field>
            </>
          )}

          {(isRegister || isForgot) && (
            <Field label="Email">
              <input type="email" name="email" value={form.email} onChange={handleChange} required />
            </Field>
          )}

          {isLogin && (
            <Field label="Email or username">
              <input name="login" value={form.login} onChange={handleChange} required />
            </Field>
          )}

          {!isForgot && (
            <Field label={isReset ? 'New password' : 'Password'}>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                minLength={isRegister || isReset ? 8 : 1}
                required
              />
            </Field>
          )}

          {isReset && (
            <Field label="Confirm new password">
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                minLength={8}
                required
              />
            </Field>
          )}

          {isLogin && (
            <p className="switch" style={{ textAlign: 'right', margin: '0 0 12px' }}>
              <button type="button" onClick={() => changeMode('forgot')}>
                Forgot password?
              </button>
            </p>
          )}

          <button className="btn primary wide" disabled={busy}>
            {busy ? 'Please wait…' : copy.button} <ArrowUpRight size={16} />
          </button>
        </form>

        {(isForgot || isReset) ? (
          <p className="switch">
            <button type="button" onClick={() => changeMode('login')}>← Back to sign in</button>
          </p>
        ) : (
          <>
            <p className="switch">
              {isRegister ? 'Already registered?' : 'New to HeatSafe?'}{' '}
              <button type="button" onClick={() => changeMode(isRegister ? 'login' : 'register')}>
                {isRegister ? 'Sign in' : 'Create an account'}
              </button>
            </p>
            <p className="switch">
              <button type="button" onClick={guest}>Continue as public visitor</button>
            </p>
          </>
        )}

        <p className="fine">
          Heat index is informational and is not a substitute for official emergency advice.
        </p>
      </section>
    </div>
  );
}

export default Auth;