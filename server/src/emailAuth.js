import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import { sendMail } from './mailer.js';

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const VERIFY_MINUTES = 60 * 24; // verification link valid for 24 hours
const RESET_MINUTES = 30;       // reset link valid for 30 minutes

const clientUrl = () => (process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- tokens: only a SHA-256 hash is stored, the raw token only goes in the email ---------- */

async function issueToken(userId, purpose, minutes) {
  // one active token per user per purpose
  await pool.query('DELETE FROM email_tokens WHERE user_id=$1 AND purpose=$2', [userId, purpose]);
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    "INSERT INTO email_tokens(user_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,NOW()+make_interval(mins => $4::int))",
    [userId, purpose, sha256(token), minutes]
  );
  return token;
}

// Atomic + single-use: marks the token used and returns the user id, or null if invalid/expired/used.
async function consumeToken(token, purpose) {
  const r = await pool.query(
    'UPDATE email_tokens SET used_at=NOW() WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at>NOW() RETURNING user_id',
    [sha256(token || ''), purpose]
  );
  return r.rowCount ? r.rows[0].user_id : null;
}

/* ---------- email templates ---------- */

function template({ heading, intro, button, link, note }) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
      <tr><td style="font-size:13px;letter-spacing:2px;color:#c2410c;font-weight:bold">HEATSAFE KL</td></tr>
      <tr><td style="font-size:22px;font-weight:bold;padding:12px 0 8px">${esc(heading)}</td></tr>
      <tr><td style="font-size:15px;line-height:1.5;padding-bottom:20px">${esc(intro)}</td></tr>
      <tr><td><a href="${esc(link)}" style="display:inline-block;background:#c2410c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">${esc(button)}</a></td></tr>
      <tr><td style="font-size:12px;color:#666;padding-top:20px;line-height:1.5">${esc(note)}<br><br>If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${esc(link)}</span></td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/* ---------- senders (exported: register route in index.js calls sendVerification) ---------- */

export async function sendVerification(user) {
  const token = await issueToken(user.id, 'verify', VERIFY_MINUTES);
  const link = `${clientUrl()}/?verify=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your HeatSafe KL email',
    text: `Hi ${user.full_name}, verify your email to activate your HeatSafe KL account (valid 24 hours): ${link}`,
    html: template({
      heading: `Welcome, ${user.full_name}!`,
      intro: 'Please confirm your email address to activate your HeatSafe KL account.',
      button: 'Verify my email',
      link,
      note: 'This link is valid for 24 hours. If you did not create this account, you can ignore this email.',
    }),
  });
}

async function sendReset(user) {
  const token = await issueToken(user.id, 'reset', RESET_MINUTES);
  const link = `${clientUrl()}/?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your HeatSafe KL password',
    text: `Reset your HeatSafe KL password (valid ${RESET_MINUTES} minutes): ${link}`,
    html: template({
      heading: 'Reset your password',
      intro: 'We received a request to reset the password for your HeatSafe KL account.',
      button: 'Choose a new password',
      link,
      note: `This link is valid for ${RESET_MINUTES} minutes and can be used once. If you did not request this, you can ignore this email - your password will not change.`,
    }),
  });
}

/* ---------- routes ---------- */

export function registerEmailAuth(app, { ar, str }) {
  // Strict limit on anything that sends mail, so nobody can burn your Gmail quota.
  const mailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again in a few minutes.' },
  });
  const tokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  });

  // Click on the link in the verification email
  app.post('/api/auth/verify-email', tokenLimiter, ar(async (q, s) => {
    const userId = await consumeToken(str(q.body.token), 'verify');
    if (!userId) return s.status(400).json({ error: 'This verification link is invalid or has expired. Please request a new one.' });
    await pool.query('UPDATE users SET email_verified=TRUE,updated_at=NOW() WHERE id=$1', [userId]);
    s.json({ message: 'Email verified. You can now sign in.' });
  }));

  // "Resend verification email" (accepts email or username; same answer whether or not it exists)
  app.post('/api/auth/resend-verification', mailLimiter, ar(async (q, s) => {
    const login = str(q.body.login || q.body.email).toLowerCase();
    if (login) {
      const r = await pool.query(
        "SELECT * FROM users WHERE (LOWER(email)=$1 OR LOWER(username)=$1) AND email_verified=FALSE AND account_status='active' LIMIT 1",
        [login]
      );
      if (r.rowCount) sendVerification(r.rows[0]).catch((e) => console.error('[mail] resend verification failed:', e.message));
    }
    s.json({ message: 'If that account needs verification, a new link has been sent. Please check your inbox.' });
  }));

  // "Forgot password?" - never reveals whether the email is registered
  app.post('/api/auth/forgot-password', mailLimiter, ar(async (q, s) => {
    const email = str(q.body.email).toLowerCase();
    if (!EMAIL_REGEX.test(email)) return s.status(400).json({ error: 'Please enter a valid email address.' });
    const r = await pool.query("SELECT * FROM users WHERE LOWER(email)=$1 AND account_status='active' LIMIT 1", [email]);
    // not awaited on purpose: response time is the same for registered and unregistered emails
    if (r.rowCount) sendReset(r.rows[0]).catch((e) => console.error('[mail] reset email failed:', e.message));
    s.json({ message: 'If that email is registered, a reset link has been sent.' });
  }));

  // Submit the new password from the reset link
  app.post('/api/auth/reset-password', tokenLimiter, ar(async (q, s) => {
    const password = String(q.body.password || '');
    if (!PASSWORD_REGEX.test(password)) {
      return s.status(400).json({ error: 'Password must be at least 8 characters with an uppercase letter, a lowercase letter and a number.' });
    }
    const userId = await consumeToken(str(q.body.token), 'reset');
    if (!userId) return s.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });

    // Opening a link sent to the mailbox also proves ownership of the email, so mark it verified.
    await pool.query('UPDATE users SET password_hash=$1,email_verified=TRUE,updated_at=NOW() WHERE id=$2', [await bcrypt.hash(password, 12), userId]);
    await pool.query("DELETE FROM email_tokens WHERE user_id=$1 AND purpose='reset'", [userId]);
    // sign the user out everywhere (e.g. someone who had the old password)
    await pool.query("DELETE FROM user_sessions WHERE (sess->'user'->>'id')=$1", [String(userId)]).catch(() => {});
    s.json({ message: 'Password updated. Please sign in with your new password.' });
  }));
}
