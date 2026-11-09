import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { calculateHeatIndex, riskLevel, riskAdvice } from './heat.js';
import { registerCentrePhotoRoutes } from './centrePhotos.js';
import { registerCentreLocationRoutes } from './centreLocation.js';
import {
  registerAdminFeatures,
  logActivity,
  diffFields,
  centreOut,
  TODAY_KL,
  EXPIRED_SQL,
} from './adminFeatures.js';

/* ------------------------------------------------------------------ */
/* App setup                                                           */
/* ------------------------------------------------------------------ */

const app = express();
const PORT = process.env.PORT || 4000;
const here = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(here, '..', process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));

const PgStore = pgSession(session);
app.use(
  session({
    store: new PgStore({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
    name: 'heat.sid',
    secret: process.env.SESSION_SECRET || 'development-only-change-this-secret-32chars',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 43200000, // 12 hours
    },
  })
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// General rate limit: 30 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 900000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Image uploads (JPG, PNG, WebP, max 5 MB, 1 file)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, f, cb) =>
    cb(
      null,
      Date.now() + '-' + crypto.randomBytes(6).toString('hex') + path.extname(f.originalname).toLowerCase()
    ),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, f, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimetype)),
});

// Wraps async route handlers so errors reach the error handler
const ar = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Trimmed string, or '' if the value is not a string
const str = (x) => (typeof x === 'string' ? x.trim() : '');

// Number, or null for empty values
const n = (x) => (x === '' || x == null ? null : Number(x));

// User fields that are safe to send to the browser
const userSafe = (u) => ({
  id: u.id,
  fullName: u.full_name,
  email: u.email,
  username: u.username,
  role: u.role,
  avatarUrl: u.avatar_url || null,
});

// Must be signed in
const auth = (req, res, next) =>
  req.session.user ? next() : res.status(401).json({ error: 'Please sign in first.' });

// Must be an administrator
const admin = (req, res, next) =>
  req.session.user?.role === 'admin'
    ? next()
    : res.status(403).json({ error: 'Administrator access required.' });

// Public path of the uploaded file on this request, or null
const file = (req) => (req.file ? '/uploads/' + req.file.filename : null);

// Is the coordinate inside Kuala Lumpur?
const kl = (a, b) =>
  Number(a) >= 3 && Number(a) <= 3.3 && Number(b) >= 101.55 && Number(b) <= 101.8;

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));

app.post(
  '/api/auth/register',
  limiter,
  ar(async (req, res) => {
    const { fullName, email, username, password } = req.body;

    if (!str(fullName) || !str(email) || !str(username) || String(password || '').length < 8) {
      return res
        .status(400)
        .json({ error: 'Enter name, valid email, username and password (8+ characters).' });
    }

    try {
      const result = await pool.query(
        "INSERT INTO users(full_name,email,username,password_hash,role) VALUES($1,$2,$3,$4,'user') RETURNING *",
        [str(fullName), str(email).toLowerCase(), str(username), await bcrypt.hash(password, 12)]
      );
      res.status(201).json({
        message: 'Account created. Please sign in.',
        user: userSafe(result.rows[0]),
      });
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: 'Email or username already exists.' });
      }
      throw e;
    }
  })
);

app.post(
  '/api/auth/login',
  limiter,
  ar(async (req, res) => {
    const login = str(req.body.login).toLowerCase();
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email)=$1 OR LOWER(username)=$1 LIMIT 1',
      [login]
    );

    if (
      !result.rowCount ||
      !(await bcrypt.compare(String(req.body.password || ''), result.rows[0].password_hash))
    ) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const account = result.rows[0];

    if (account.account_status === 'deactivated') {
      return res
        .status(403)
        .json({ error: 'This account has been deactivated. Please contact an administrator.' });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error.' });

      req.session.user = userSafe(account);
      req.session.save((saveErr) =>
        saveErr
          ? res.status(500).json({ error: 'Session save error.' })
          : res.json({ user: req.session.user })
      );
    });
  })
);

app.post('/api/auth/logout', (req, res) =>
  req.session.destroy(() => {
    res.clearCookie('heat.sid');
    res.json({ message: 'Signed out' });
  })
);

/* ------------------------------------------------------------------ */
/* Forgot / reset password (email)                                     */
/* ------------------------------------------------------------------ */

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// Stricter limit: 5 reset requests per 15 minutes
const resetLimiter = rateLimit({
  windowMs: 900000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post(
  '/api/auth/forgot-password',
  resetLimiter,
  ar(async (req, res) => {
    const email = str(req.body.email).toLowerCase();
    if (!email) return res.status(400).json({ error: 'Enter your email.' });

    const result = await pool.query(
      'SELECT email,full_name,account_status FROM users WHERE LOWER(email)=$1 LIMIT 1',
      [email]
    );

    if (result.rowCount && result.rows[0].account_status !== 'deactivated') {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // One active reset link per email
      await pool.query('DELETE FROM password_resets WHERE email=$1', [email]);
      await pool.query(
        "INSERT INTO password_resets(email,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '15 minutes')",
        [email, tokenHash]
      );

      const link = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/?token=${token}`;
      const name = result.rows[0].full_name;

      try {
        await mailer.sendMail({
          from: process.env.MAIL_FROM,
          to: email,
          subject: 'Reset your HeatSafe KL password',
          text:
            `Hi ${name},\n\n` +
            `Use this link to set a new password (valid for 15 minutes):\n${link}\n\n` +
            'If you did not request this, you can ignore this email.',
          html:
            `<p>Hi ${name},</p>` +
            '<p>Use this link to set a new password (valid for 15 minutes):</p>' +
            `<p><a href="${link}">Reset my password</a></p>` +
            '<p>If you did not request this, you can ignore this email.</p>',
        });
      } catch (e) {
        console.error('Reset email failed:', e.message);
      }
    }

    // Same answer whether or not the email exists
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  })
);

app.post(
  '/api/auth/reset-password',
  limiter,
  ar(async (req, res) => {
    const token = str(req.body.token);
    const password = String(req.body.password || '');

    if (!token) return res.status(400).json({ error: 'Reset link is invalid.' });
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must have at least 8 characters.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'SELECT id,email FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()',
      [tokenHash]
    );

    if (!result.rowCount) {
      return res
        .status(400)
        .json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    await pool.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE LOWER(email)=$2', [
      await bcrypt.hash(password, 12),
      result.rows[0].email,
    ]);
    await pool.query('UPDATE password_resets SET used_at=NOW() WHERE id=$1', [result.rows[0].id]);

    res.json({ message: 'Password updated.' });
  })
);

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

app.patch(
  '/api/account/profile',
  auth,
  ar(async (req, res) => {
    try {
      const result = await pool.query(
        'UPDATE users SET full_name=$1,username=$2,updated_at=NOW() WHERE id=$3 RETURNING *',
        [str(req.body.fullName), str(req.body.username), req.session.user.id]
      );
      req.session.user = userSafe(result.rows[0]);
      res.json({ user: req.session.user });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Username already in use.' });
      throw e;
    }
  })
);

app.post(
  '/api/account/avatar',
  auth,
  upload.single('avatar'),
  ar(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG or WebP image.' });

    const old = await pool.query('SELECT avatar_url FROM users WHERE id=$1', [req.session.user.id]);
    const result = await pool.query(
      'UPDATE users SET avatar_url=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [file(req), req.session.user.id]
    );

    // Delete the previous photo so storage does not fill up
    const previous = old.rows[0]?.avatar_url;
    if (previous && previous.startsWith('/uploads/')) {
      fs.promises.unlink(path.join(uploadDir, path.basename(previous))).catch(() => {});
    }

    req.session.user = userSafe(result.rows[0]);
    res.json({ user: req.session.user });
  })
);

app.patch(
  '/api/account/password',
  auth,
  ar(async (req, res) => {
    if (String(req.body.newPassword || '').length < 8) {
      return res.status(400).json({ error: 'New password must have at least 8 characters.' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [
      req.session.user.id,
    ]);

    if (!(await bcrypt.compare(String(req.body.currentPassword || ''), result.rows[0].password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
      await bcrypt.hash(req.body.newPassword, 12),
      req.session.user.id,
    ]);

    res.json({ message: 'Password updated.' });
  })
);

/* ------------------------------------------------------------------ */
/* Weather                                                             */
/* ------------------------------------------------------------------ */

async function weather(lat, lon) {
  if (!process.env.OPENWEATHER_API_KEY) {
    throw Object.assign(
      new Error('Live weather unavailable: configure OPENWEATHER_API_KEY in server/.env.'),
      { status: 503 }
    );
  }

  const geo =
    lat != null && lon != null
      ? `lat=${lat}&lon=${lon}`
      : `q=${encodeURIComponent('Kuala Lumpur,MY')}`;

  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${geo}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
  );
  const data = await response.json();

  if (!response.ok) {
    throw Object.assign(new Error(data.message || 'Weather service failed.'), { status: 502 });
  }

  let calculation;
  try {
    calculation = calculateHeatIndex(data.main?.temp, data.main?.humidity);
  } catch (error) {
    throw Object.assign(new Error('Weather data invalid: ' + error.message), { status: 502 });
  }

  const temperature = calculation.temperature_c;
  const humidity = calculation.relative_humidity;
  const heatIndex = calculation.heat_index_c;
  const level = riskLevel(heatIndex);

  const reading = {
    city: data.name || 'Kuala Lumpur',
    latitude: lat ?? data.coord?.lat,
    longitude: lon ?? data.coord?.lon,
    temperature_c: temperature,
    humidity,
    heat_index_c: heatIndex,
    heat_index_calculation: calculation,
    risk_level: level,
    weather_description: data.weather?.[0]?.description || '',
    observed_at: new Date((data.dt || Date.now() / 1000) * 1000).toISOString(),
    advice: riskAdvice(level),
  };

  await pool.query(
    'INSERT INTO heat_risk_logs(city,latitude,longitude,temperature_c,humidity,heat_index_c,risk_level,weather_description,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      reading.city,
      reading.latitude,
      reading.longitude,
      temperature,
      humidity,
      heatIndex,
      level,
      reading.weather_description,
      reading.observed_at,
    ]
  );

  return reading;
}

app.get(
  '/api/weather/current',
  ar(async (req, res) => {
    if ((req.query.lat == null) !== (req.query.lon == null)) {
      return res.status(400).json({ error: 'Provide both latitude and longitude.' });
    }

    const lat = n(req.query.lat);
    const lon = n(req.query.lon);

    if (
      lat != null &&
      (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    ) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }

    res.json(await weather(lat, lon));
  })
);

app.post(
  '/api/admin/weather/refresh',
  auth,
  admin,
  ar(async (req, res) => {
    const reading = await weather();

    await logActivity(req, {
      action: 'Refreshed weather',
      module: 'Heat Monitoring',
      recordType: 'heat_risk_log',
      summary: `Refreshed weather reading: heat index ${reading.heat_index_c}°C (${reading.risk_level} risk)`,
    });

    res.json(reading);
  })
);

app.get(
  '/api/weather/history',
  ar(async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));

    const result = await pool.query(
      "SELECT date_trunc('day',observed_at)::date AS day,ROUND(AVG(heat_index_c)::numeric,1)::float AS avg_heat_index,ROUND(MAX(heat_index_c)::numeric,1)::float AS max_heat_index,COUNT(*)::int AS readings FROM heat_risk_logs WHERE observed_at>=NOW()-($1::text||' days')::interval GROUP BY 1 ORDER BY 1",
      [days]
    );

    res.json({ rows: result.rows });
  })
);

/* ------------------------------------------------------------------ */
/* Cooling centres                                                     */
/* ------------------------------------------------------------------ */

app.get(
  '/api/centres',
  ar(async (req, res) => {
    const all = req.query.all === 'true' && req.session.user?.role === 'admin';

    const result = await pool.query(
      `SELECT c.*,${EXPIRED_SQL} AS expired FROM cooling_centres c ${
        all ? '' : 'WHERE c.verified=TRUE AND NOT ' + EXPIRED_SQL
      } ORDER BY c.name`
    );

    res.json(result.rows.map(centreOut));
  })
);

registerCentrePhotoRoutes(app, {
  pool,
  auth,
  admin,
  ar,
  str,
  n,
  kl,
  logActivity,
  centreOut,
  diffFields,
  uploadDir,
});

registerCentreLocationRoutes(app, { auth, admin, ar });

app.patch(
  '/api/admin/centres/:id/status',
  auth,
  admin,
  ar(async (req, res) => {
    if (!['open', 'temporarily_closed', 'maintenance', 'unavailable'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const before = await pool.query('SELECT status FROM cooling_centres WHERE id=$1', [req.params.id]);
    if (!before.rowCount) return res.status(404).json({ error: 'Centre not found.' });

    const result = await pool.query(
      'UPDATE cooling_centres SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [req.body.status, req.params.id]
    );

    await logActivity(req, {
      action: 'Updated centre status',
      module: 'Cooling Centres',
      recordType: 'cooling_centre',
      recordId: result.rows[0].id,
      summary: `Changed "${result.rows[0].name}" status to ${req.body.status}`,
      details: {
        changes: { 'Operational status': { from: before.rows[0].status, to: req.body.status } },
      },
    });

    res.json(centreOut(result.rows[0]));
  })
);

app.delete(
  '/api/admin/centres/:id',
  auth,
  admin,
  ar(async (req, res) => {
    const result = await pool.query('DELETE FROM cooling_centres WHERE id=$1 RETURNING id,name', [
      req.params.id,
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Centre not found.' });

    await logActivity(req, {
      action: 'Deleted cooling centre',
      module: 'Cooling Centres',
      recordType: 'cooling_centre',
      recordId: result.rows[0].id,
      summary: `Deleted cooling centre "${result.rows[0].name}"`,
    });

    res.json({ message: 'Deleted' });
  })
);

/* ------------------------------------------------------------------ */
/* User reports                                                        */
/* ------------------------------------------------------------------ */

app.post(
  '/api/reports',
  auth,
  upload.single('image'),
  ar(async (req, res) => {
    const b = req.body;

    if (!str(b.title) || !str(b.category) || !str(b.description) || !str(b.location)) {
      return res
        .status(400)
        .json({ error: 'Title, category, description and location are required.' });
    }

    const lat = n(b.latitude);
    const lon = n(b.longitude);

    if ((lat == null) !== (lon == null)) {
      return res.status(400).json({ error: 'Provide both coordinates or leave both empty.' });
    }
    if (lat != null && !kl(lat, lon)) {
      return res.status(400).json({ error: 'Reports must be located in Kuala Lumpur.' });
    }

    const result = await pool.query(
      'INSERT INTO user_reports(user_id,title,category,description,location_text,latitude,longitude,image_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [
        req.session.user.id,
        str(b.title),
        str(b.category),
        str(b.description),
        str(b.location),
        lat,
        lon,
        file(req),
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

app.get(
  '/api/reports/mine',
  auth,
  ar(async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM user_reports WHERE user_id=$1 ORDER BY created_at DESC',
      [req.session.user.id]
    );
    res.json(result.rows);
  })
);

app.get(
  '/api/admin/reports',
  auth,
  admin,
  ar(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status)
      ? req.query.status
      : null;

    const result = await pool.query(
      `SELECT r.*,u.full_name reporter_name,u.email reporter_email FROM user_reports r JOIN users u ON u.id=r.user_id ${
        status ? 'WHERE r.status=$1' : ''
      } ORDER BY r.created_at DESC`,
      status ? [status] : []
    );

    res.json(result.rows);
  })
);

app.post(
  '/api/admin/reports/:id/review',
  auth,
  admin,
  upload.single('reviewImage'),
  ar(async (req, res) => {
    const status = req.body.status;
    const note = str(req.body.note);

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Choose approve or reject.' });
    }
    if (status === 'rejected' && !note) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    const result = await pool.query(
      'UPDATE user_reports SET status=$1,review_note=$2,reviewed_by=$3,reviewed_at=NOW(),review_image_url=COALESCE($4,review_image_url),updated_at=NOW() WHERE id=$5 RETURNING *',
      [status, note || null, req.session.user.id, file(req), req.params.id]
    );

    if (!result.rowCount) return res.status(404).json({ error: 'Report not found.' });

    await logActivity(req, {
      action: status === 'approved' ? 'Approved user report' : 'Rejected user report',
      module: 'Report Review',
      recordType: 'user_report',
      recordId: result.rows[0].id,
      summary: `${status === 'approved' ? 'Approved' : 'Rejected'} report "${result.rows[0].title}"`,
      details: note ? { note, evidence: file(req) } : null,
    });

    res.json(result.rows[0]);
  })
);

/* ------------------------------------------------------------------ */
/* Dashboards                                                          */
/* ------------------------------------------------------------------ */

app.get(
  '/api/admin/dashboard',
  auth,
  admin,
  ar(async (_req, res) => {
    const [centres, reports, users, heat, riskLevels, hotspots] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE c.status='open' AND c.verified AND NOT ${EXPIRED_SQL})::int open,COUNT(*) FILTER(WHERE c.verification_status='pending' OR (c.verification_status='verified' AND c.next_inspection_date IS NOT NULL AND c.next_inspection_date<=${TODAY_KL}+30))::int attention FROM cooling_centres c`
      ),
      pool.query(
        "SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='pending')::int pending,COUNT(*) FILTER(WHERE status='approved')::int approved,COUNT(*) FILTER(WHERE status='rejected')::int rejected FROM user_reports"
      ),
      pool.query("SELECT COUNT(*)::int total FROM users WHERE role='user'"),
      pool.query(
        "SELECT ROUND(AVG(heat_index_c)::numeric,1)::float avg_heat,ROUND(MAX(heat_index_c)::numeric,1)::float max_heat,MAX(observed_at) last_reading FROM heat_risk_logs WHERE observed_at>NOW()-INTERVAL '24 hours'"
      ),
      pool.query(
        "SELECT risk_level,COUNT(*)::int count FROM heat_risk_logs WHERE observed_at>NOW()-INTERVAL '7 days' GROUP BY risk_level"
      ),
      pool.query(
        "SELECT location_text,COUNT(*)::int count FROM user_reports WHERE status='approved' GROUP BY location_text ORDER BY count DESC LIMIT 5"
      ),
    ]);

    res.json({
      centres: centres.rows[0],
      reports: reports.rows[0],
      users: users.rows[0],
      heat: heat.rows[0],
      riskLevels: riskLevels.rows,
      hotspots: hotspots.rows,
    });
  })
);

app.get(
  '/api/dashboard/public',
  ar(async (_req, res) => {
    const [heat, levels, approved] = await Promise.all([
      pool.query(
        "SELECT ROUND(AVG(heat_index_c)::numeric,1)::float avg_heat,MAX(observed_at) last_reading FROM heat_risk_logs WHERE observed_at>NOW()-INTERVAL '24 hours'"
      ),
      pool.query(
        "SELECT risk_level,COUNT(*)::int count FROM heat_risk_logs WHERE observed_at>NOW()-INTERVAL '7 days' GROUP BY risk_level"
      ),
      pool.query("SELECT COUNT(*)::int total FROM user_reports WHERE status='approved'"),
    ]);

    res.json({
      heat: heat.rows[0],
      riskLevels: levels.rows,
      approvedReports: approved.rows[0].total,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Other admin features (alerts, users, activity log, ...)             */
/* ------------------------------------------------------------------ */

registerAdminFeatures(app, { auth, admin, ar, upload, str, file });

/* ------------------------------------------------------------------ */
/* Error handler + start                                               */
/* ------------------------------------------------------------------ */

app.use((e, _req, res, _next) => {
  console.error(e.stack || e.message);

  if (e instanceof multer.MulterError) {
    return res.status(400).json({
      error:
        e.code === 'LIMIT_FILE_SIZE'
          ? 'Each image must be at most 5 MB.'
          : e.code === 'LIMIT_FILE_COUNT'
            ? 'A centre can have up to 10 photos.'
            : 'Image upload failed. Check file types and upload count.',
    });
  }

  if (e.message === 'Unexpected field') {
    return res.status(400).json({ error: 'Unexpected upload field.' });
  }

  res.status(e.status || 500).json({
    error: e.status ? e.message : 'Server error. Check the API terminal.',
  });
});

app.listen(PORT, () => console.log(`HeatSafe KL API running on http://localhost:${PORT}`));