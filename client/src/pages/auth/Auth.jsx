import React, { useState, useEffect } from 'react';
import { Sun, ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import { api } from '../../lib/api.js';
import ClimateArt from '../../components/ClimateArt.jsx';
import { Field } from '../../components/Shared.jsx';

const COPY = {
  login: { title: 'Welcome back', sub: 'Sign in to access heat insights and your reports.', button: 'Sign in' },
  register: { title: 'Create your account', sub: 'Join the community and help keep KL safer.', button: 'Create account' },
  forgot: { title: 'Forgot your password?', sub: "Enter your email and we'll send you a link to reset it.", button: 'Send reset link' },
  reset: { title: 'Set a new password', sub: 'Choose a new password for your account.', button: 'Update password' },
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

// Password input with a show/hide (eye) button. Each field keeps its own visibility state.
function PasswordInput({ error, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <div className="pw-wrap">
        <input {...inputProps} type={visible ? 'text' : 'password'} />
        <button
          type="button"
          className="pw-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
    </>
  );
}

function Auth({ home, mode, setMode, done, guest }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    username: '',
    login: '',
    password: '',
    confirmPassword: '',
  });

  // Track field-specific errors
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  // When set, a "Resend verification email" button is shown (value = email or username to resend to)
  const [resendLogin, setResendLogin] = useState('');
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get('token') || ''
  );

  const isRegister = mode === 'register';
  const isLogin = mode === 'login';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  const copy = COPY[mode] || COPY.login;

  useEffect(() => {
    if (resetToken) setMode('reset');
  }, [resetToken]);

  // Opened from the link in the verification email: /?verify=TOKEN
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('verify');
    if (!token) return;
    // remove the token from the address bar straight away (also prevents a double call in React StrictMode)
    window.history.replaceState({}, '', window.location.pathname);
    setBusy(true);
    api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then((data) => {
        setMode('login');
        setSuccess(data.message || 'Email verified. You can now sign in.');
      })
      .catch((err) => {
        setMode('login');
        setError(err.message);
      })
      .finally(() => setBusy(false));
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    // Clear error for field when user edits it
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  }

  function changeMode(next) {
    setMode(next);
    setError('');
    setSuccess('');
    setFieldErrors({});
    setResendLogin('');
  }

  // Perform per-field validation
  function validateForm() {
    const errors = {};

    if (isRegister) {
      if (!form.fullName.trim()) {
        errors.fullName = 'Please enter your full name.';
      }

      if (!form.username.trim()) {
        errors.username = 'Please enter a username.';
      } else if (!USERNAME_REGEX.test(form.username.trim())) {
        errors.username = 'Username must be 3–20 characters and contain only letters, numbers, underscores, or hyphens.';
      }

      if (!form.email.trim()) {
        errors.email = 'Please enter your email.';
      } else if (!EMAIL_REGEX.test(form.email.trim())) {
        errors.email = 'Please enter a valid email address.';
      }

      if (!form.password) {
        errors.password = 'Please enter a password.';
      } else if (!PASSWORD_REGEX.test(form.password)) {
        errors.password = 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number.';
      }

      if (!form.confirmPassword) {
        errors.confirmPassword = 'Please confirm your password.';
      } else if (form.password !== form.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match.';
      }
    }

    if (isReset) {
      if (!form.password) {
        errors.password = 'Please enter a new password.';
      } else if (!PASSWORD_REGEX.test(form.password)) {
        errors.password = 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number.';
      }

      if (!form.confirmPassword) {
        errors.confirmPassword = 'Please confirm your password.';
      } else if (form.password !== form.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match.';
      }
    }

    if (isForgot) {
      if (!form.email.trim()) errors.email = 'Please enter your email.';
      else if (!EMAIL_REGEX.test(form.email.trim())) errors.email = 'Please enter a valid email address.';
    }

    if (isLogin) {
      if (!form.login.trim()) errors.login = 'Please enter your email or username.';
      if (!form.password) errors.password = 'Please enter your password.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setResendLogin('');

    if (!validateForm()) return;

    setBusy(true);

    try {
      if (isRegister) {
        const payload = {
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          username: form.username.trim(),
          password: form.password,
        };

        const data = await api('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
        setMode('login');
        setForm((prev) => ({ ...prev, login: payload.email, password: '', confirmPassword: '' }));
        // The server tells us whether the verification email went out
        setSuccess(data.message || 'Account created. Please check your email to verify your account.');
        if (data.emailSent === false) setResendLogin(payload.email);
      } else if (isForgot) {
        const data = await api('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: form.email.trim().toLowerCase() }),
        });
        setSuccess(data.message || 'If that email is registered, a reset link has been sent. Please check your inbox.');
      } else if (isReset) {
        await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, password: form.password }),
        });
        window.history.replaceState({}, '', window.location.pathname);
        setResetToken('');
        setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
        setMode('login');
        setSuccess('Password updated. Please sign in with your new password.');
      } else {
        const data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ login: form.login.trim().toLowerCase(), password: form.password }),
        });
        done(data.user);
      }
    } catch (err) {
      setError(err.message);
      // Correct password but email not verified yet -> offer to resend the link
      if (err.code === 'EMAIL_NOT_VERIFIED') setResendLogin(form.login.trim().toLowerCase());
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const data = await api('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ login: resendLogin }),
      });
      setSuccess(data.message);
      setResendLogin('');
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

        {resendLogin && (
          <p className="switch" style={{ margin: '0 0 12px' }}>
            <button type="button" onClick={handleResend} disabled={busy}>
              Resend verification email
            </button>
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {isRegister && (
            <>
              <Field label="Full name">
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="e.g. Sarah Ahmad"
                />
                {fieldErrors.fullName && (
                  <span className="field-error">{fieldErrors.fullName}</span>
                )}
              </Field>

              <Field label="Username">
                <input
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="e.g. sarah_kl"
                />
                {fieldErrors.username && (
                  <span className="field-error">{fieldErrors.username}</span>
                )}
              </Field>
            </>
          )}

          {(isRegister || isForgot) && (
            <Field label="Email">
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
              />
              {fieldErrors.email && (
                <span className="field-error">{fieldErrors.email}</span>
              )}
            </Field>
          )}

          {isLogin && (
            <Field label="Email or username">
              <input
                name="login"
                value={form.login}
                onChange={handleChange}
              />
              {fieldErrors.login && (
                <span className="field-error">{fieldErrors.login}</span>
              )}
            </Field>
          )}

          {!isForgot && (
            <Field label={isReset ? 'New password' : 'Password'}>
              <PasswordInput
                name="password"
                value={form.password}
                onChange={handleChange}
                error={fieldErrors.password}
              />
            </Field>
          )}

          {(isRegister || isReset) && (
            <Field label="Confirm password">
              <PasswordInput
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                error={fieldErrors.confirmPassword}
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
