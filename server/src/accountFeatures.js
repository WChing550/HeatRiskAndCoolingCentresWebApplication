// HeatSafe KL - account features for signed-in users:
//   avatar upload, heat-advisory email preference, saved (favourite) cooling centres, app feedback.
// Registered from index.js with registerAccountFeatures(app, helpers).
import fs from 'node:fs';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import { sendMail } from './mailer.js';

const clientUrl = () => (process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isId = (v) => /^\d{1,18}$/.test(String(v));
const when = (d) => new Date(d).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });

/**
 * Emails every verified, active user who opted in to heat advisories.
 * Fire-and-forget: call it WITHOUT await so publishing an alert never waits for (or fails because of) email.
 */
export async function notifyAlertSubscribers(alert) {
  try {
    const r = await pool.query(
      "SELECT email,full_name FROM users WHERE alert_emails=TRUE AND email_verified=TRUE AND account_status='active'"
    );
    for (const u of r.rows) {
      const text =
        `Hello ${u.full_name},\n\nA ${alert.severity} heat advisory has been published for ${alert.affected_area}.\n\n` +
        `${alert.title}\n${alert.description}\n\nActive: ${when(alert.starts_at)} to ${when(alert.ends_at)}\n\n` +
        `You can turn these emails off any time in Profile > Notifications: ${clientUrl()}\n`;
      const html =
        `<p>Hello ${esc(u.full_name)},</p><p>A <b>${esc(alert.severity)}</b> heat advisory has been published for ${esc(alert.affected_area)}.</p>` +
        `<h3>${esc(alert.title)}</h3><p>${esc(alert.description).replace(/\n/g, '<br>')}</p>` +
        `<p>Active: ${esc(when(alert.starts_at))} to ${esc(when(alert.ends_at))}</p>` +
        `<p style="color:#666;font-size:12px">You can turn these emails off any time in Profile &gt; Notifications.</p>`;
      await sendMail({ to: u.email, subject: `Heat advisory (${alert.severity}): ${alert.title}`, html, text }).catch((e) =>
        console.error('[mail] advisory email failed:', e.message)
      );
    }
  } catch (e) {
    console.error('[mail] advisory notification failed:', e.message);
  }
}

export function registerAccountFeatures(app, { auth, ar, str, upload, userSafe, uploadDir }) {
  const feedbackLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many messages sent. Please try again later.' },
  });

  const removeOldAvatar = (url) => {
    if (!url || !url.startsWith('/uploads/')) return;
    fs.promises.unlink(path.join(uploadDir, path.basename(url))).catch(() => {});
  };

  /* ---------- avatar ---------- */
  app.post(
    '/api/account/avatar',
    auth,
    upload.single('avatar'),
    ar(async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'Please choose a JPG, PNG or WebP image (max 5 MB).' });
      const old = await pool.query('SELECT avatar_url FROM users WHERE id=$1', [req.session.user.id]);
      const r = await pool.query('UPDATE users SET avatar_url=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [
        '/uploads/' + req.file.filename,
        req.session.user.id,
      ]);
      removeOldAvatar(old.rows[0]?.avatar_url);
      req.session.user = userSafe(r.rows[0]);
      res.json({ user: req.session.user });
    })
  );

  app.delete(
    '/api/account/avatar',
    auth,
    ar(async (req, res) => {
      const old = await pool.query('SELECT avatar_url FROM users WHERE id=$1', [req.session.user.id]);
      const r = await pool.query('UPDATE users SET avatar_url=NULL,updated_at=NOW() WHERE id=$1 RETURNING *', [
        req.session.user.id,
      ]);
      removeOldAvatar(old.rows[0]?.avatar_url);
      req.session.user = userSafe(r.rows[0]);
      res.json({ user: req.session.user });
    })
  );

  /* ---------- notification preference ---------- */
  app.patch(
    '/api/account/preferences',
    auth,
    ar(async (req, res) => {
      if (typeof req.body.alertEmails !== 'boolean') return res.status(400).json({ error: 'Invalid preference.' });
      const r = await pool.query('UPDATE users SET alert_emails=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [
        req.body.alertEmails,
        req.session.user.id,
      ]);
      req.session.user = userSafe(r.rows[0]);
      res.json({ user: req.session.user });
    })
  );

  /* ---------- saved (favourite) cooling centres ---------- */
  app.get(
    '/api/favourites',
    auth,
    ar(async (req, res) => {
      const r = await pool.query(
        'SELECT centre_id FROM favourite_centres WHERE user_id=$1 ORDER BY created_at DESC',
        [req.session.user.id]
      );
      res.json({ ids: r.rows.map((x) => String(x.centre_id)) });
    })
  );

  app.post(
    '/api/favourites/:centreId',
    auth,
    ar(async (req, res) => {
      if (!isId(req.params.centreId)) return res.status(404).json({ error: 'Cooling centre not found.' });
      const exists = await pool.query('SELECT 1 FROM cooling_centres WHERE id=$1', [req.params.centreId]);
      if (!exists.rowCount) return res.status(404).json({ error: 'Cooling centre not found.' });
      await pool.query(
        'INSERT INTO favourite_centres(user_id,centre_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [req.session.user.id, req.params.centreId]
      );
      res.status(201).json({ saved: true });
    })
  );

  app.delete(
    '/api/favourites/:centreId',
    auth,
    ar(async (req, res) => {
      if (!isId(req.params.centreId)) return res.status(404).json({ error: 'Cooling centre not found.' });
      await pool.query('DELETE FROM favourite_centres WHERE user_id=$1 AND centre_id=$2', [
        req.session.user.id,
        req.params.centreId,
      ]);
      res.json({ saved: false });
    })
  );

  /* ---------- feedback / report a problem (about the app itself) ---------- */
  app.post(
    '/api/feedback',
    auth,
    feedbackLimiter,
    ar(async (req, res) => {
      const kind = str(req.body.kind);
      const subject = str(req.body.subject);
      const message = str(req.body.message);
      if (!['feedback', 'problem'].includes(kind)) return res.status(400).json({ error: 'Choose feedback or problem.' });
      if (subject.length < 3 || subject.length > 120) {
        return res.status(400).json({ error: 'Subject must be 3 to 120 characters.' });
      }
      if (message.length < 10 || message.length > 2000) {
        return res.status(400).json({ error: 'Message must be 10 to 2000 characters.' });
      }
      await pool.query('INSERT INTO app_feedback(user_id,kind,subject,message) VALUES($1,$2,$3,$4)', [
        req.session.user.id,
        kind,
        subject,
        message,
      ]);
      res.status(201).json({ message: 'Thank you. Your message has been received.' });
    })
  );
}
