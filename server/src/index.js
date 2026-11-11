import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import multer from 'multer';

import { pool } from './db.js';
import { heatIndexC, riskLevel, riskAdvice } from './heat.js';
import {
  registerAdminFeatures,
  logActivity,
  diffFields,
  centreOut,
  TODAY_KL,
  EXPIRED_SQL,
} from './adminFeatures.js';
import { registerEmailAuth, sendVerification, EMAIL_REGEX, PASSWORD_REGEX } from './emailAuth.js';
import { verifyMailer } from './mailer.js';

/* ==========================================================================
   App setup
   ========================================================================== */

const PORT = process.env.PORT || 4000;
const here = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(here, '..', process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));

const PgStore = connectPgSimple(session);
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
      maxAge: 12 * 60 * 60 * 1000, // 12 hours
    },
  })
);

/* ==========================================================================
   Helpers and middleware
   ========================================================================== */

// Rate limit for register / login
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// File uploads (one image, max 5 MB, jpeg/png/webp only)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, uploaded, cb) =>
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + path.extname(uploaded.originalname).toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, uploaded, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(uploaded.mimetype)),
});

// Wrap async route handlers so errors reach the error handler at the bottom
const ar = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const str = (x) => (typeof x === 'string' ? x.trim() : '');
const toNum = (x) => (x === '' || x == null ? null : Number(x));
const file = (req) => (req.file ? '/uploads/' + req.file.filename : null);
const facilitiesList = (value) => str(value).split(',').map((x) => x.trim()).filter(Boolean);

// Coordinates must fall inside Kuala Lumpur
const inKL = (lat, lon) => Number(lat) >= 3 && Number(lat) <= 3.3 && Number(lon) >= 101.55 && Number(lon) <= 101.8;

// What the browser is allowed to know about a user
const userSafe = (u) => ({ id: u.id, fullName: u.full_name, email: u.email, username: u.username, role: u.role });

const auth = (req, res, next) =>
  req.session.user ? next() : res.status(401).json({ error: 'Please sign in first.' });
const admin = (req, res, next) =>
  req.session.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Administrator access required.' });

/* ==========================================================================
   Health + authentication
   ========================================================================== */

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));

app.post(
  '/api/auth/register',
  limiter,
  ar(async (req, res) => {
    const { fullName, email, username, password } = req.body;
    const invalid =
      !str(fullName) ||
      !str(email) ||
      !str(username) ||
      !EMAIL_REGEX.test(str(email)) ||
      !PASSWORD_REGEX.test(String(password || ''));
    if (invalid) {
      return res.status(400).json({
        error:
          'Enter your name, a valid email, a username and a password (8+ characters with an uppercase letter, a lowercase letter and a number).',
      });
    }

    try {
      const result = await pool.query(
        "INSERT INTO users(full_name,email,username,password_hash,role) VALUES($1,$2,$3,$4,'user') RETURNING *",
        [str(fullName), str(email).toLowerCase(), str(username), await bcrypt.hash(password, 12)]
      );
      const user = result.rows[0];

      // Send the verification email; a mail failure must not undo the registration
      const emailSent = await sendVerification(user).then(
        () => true,
        (e) => {
          console.error('[mail] verification email failed:', e.message);
          return false;
        }
      );

      res.status(201).json({
        message: emailSent
          ? `Account created. We sent a verification link to ${user.email}. Please verify your email, then sign in.`
          : 'Account created, but the verification email could not be sent. Use "Resend verification email" below.',
        emailSent,
        user: userSafe(user),
      });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Email or username already exists.' });
      throw e;
    }
  })
);

app.post(
  '/api/auth/login',
  limiter,
  ar(async (req, res) => {
    const login = str(req.body.login).toLowerCase();
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email)=$1 OR LOWER(username)=$1 LIMIT 1', [login]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }
    if (user.account_status === 'deactivated') {
      return res.status(403).json({ error: 'This account has been deactivated. Please contact an administrator.' });
    }
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email before signing in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error.' });
      req.session.user = userSafe(user);
      req.session.save((saveErr) =>
        saveErr ? res.status(500).json({ error: 'Session save error.' }) : res.json({ user: req.session.user })
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

/* ==========================================================================
   Account (signed-in user)
   ========================================================================== */

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

app.patch(
  '/api/account/password',
  auth,
  ar(async (req, res) => {
    if (String(req.body.newPassword || '').length < 8) {
      return res.status(400).json({ error: 'New password must have at least 8 characters.' });
    }
    const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.session.user.id]);
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

/* ==========================================================================
   Weather + heat risk
   ========================================================================== */

async function weather(lat, lon) {
  if (!process.env.OPENWEATHER_API_KEY) {
    throw Object.assign(new Error('Live weather unavailable: configure OPENWEATHER_API_KEY in server/.env.'), { status: 503 });
  }

  const location =
    lat != null && lon != null
      ? `lat=${lat}&lon=${lon}`
      : `q=${encodeURIComponent(process.env.WEATHER_DEFAULT_CITY || 'Kuala Lumpur,MY')}`;
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${location}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
  );
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'Weather service failed.'), { status: 502 });

  const temperature = Number(data.main?.temp);
  const humidity = Number(data.main?.humidity);
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
    throw Object.assign(new Error('Weather data incomplete.'), { status: 502 });
  }

  const heatIndex = heatIndexC(temperature, humidity);
  const level = riskLevel(heatIndex);
  const reading = {
    city: data.name || 'Kuala Lumpur',
    latitude: lat ?? data.coord?.lat,
    longitude: lon ?? data.coord?.lon,
    temperature_c: temperature,
    humidity,
    heat_index_c: heatIndex,
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
    res.json(await weather(toNum(req.query.lat), toNum(req.query.lon)));
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
      `SELECT date_trunc('day',observed_at)::date AS day,
              ROUND(AVG(heat_index_c)::numeric,1)::float AS avg_heat_index,
              ROUND(MAX(heat_index_c)::numeric,1)::float AS max_heat_index,
              COUNT(*)::int AS readings
         FROM heat_risk_logs
        WHERE observed_at>=NOW()-($1::text||' days')::interval
        GROUP BY 1 ORDER BY 1`,
      [days]
    );
    res.json({ rows: result.rows });
  })
);

/* ==========================================================================
   Cooling centres
   ========================================================================== */

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

app.post(
  '/api/admin/centres',
  auth,
  admin,
  upload.single('image'),
  ar(async (req, res) => {
    const b = req.body;
    if (!str(b.name) || !str(b.address) || !str(b.operatingHours)) {
      return res.status(400).json({ error: 'Name, address and operating hours are required.' });
    }
    if (!inKL(toNum(b.latitude), toNum(b.longitude))) {
      return res.status(400).json({ error: 'Coordinates must be within Kuala Lumpur (lat 3.00–3.30, lon 101.55–101.80).' });
    }

    const result = await pool.query(
      `INSERT INTO cooling_centres(name,address,area,latitude,longitude,operating_hours,contact,description,facilities,capacity,status,image_url,verified)
       VALUES($1,$2,'Kuala Lumpur',$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE) RETURNING *`,
      [
        str(b.name),
        str(b.address),
        toNum(b.latitude),
        toNum(b.longitude),
        str(b.operatingHours),
        str(b.contact) || null,
        str(b.description) || null,
        facilitiesList(b.facilities),
        toNum(b.capacity),
        b.status || 'open',
        file(req),
      ]
    );
    await logActivity(req, {
      action: 'Added cooling centre',
      module: 'Cooling Centres',
      recordType: 'cooling_centre',
      recordId: result.rows[0].id,
      summary: `Added cooling centre "${result.rows[0].name}" (pending verification)`,
    });
    res.status(201).json(centreOut(result.rows[0]));
  })
);

app.put(
  '/api/admin/centres/:id',
  auth,
  admin,
  upload.single('image'),
  ar(async (req, res) => {
    const b = req.body;
    if (!inKL(toNum(b.latitude), toNum(b.longitude))) {
      return res.status(400).json({ error: 'Coordinates must be within Kuala Lumpur.' });
    }
    const before = await pool.query('SELECT * FROM cooling_centres WHERE id=$1', [req.params.id]);
    if (!before.rowCount) return res.status(404).json({ error: 'Centre not found.' });

    const result = await pool.query(
      `UPDATE cooling_centres SET name=$1,address=$2,latitude=$3,longitude=$4,operating_hours=$5,contact=$6,
              description=$7,facilities=$8,capacity=$9,status=$10,image_url=COALESCE($11,image_url),updated_at=NOW()
        WHERE id=$12 RETURNING *`,
      [
        str(b.name),
        str(b.address),
        toNum(b.latitude),
        toNum(b.longitude),
        str(b.operatingHours),
        str(b.contact) || null,
        str(b.description) || null,
        facilitiesList(b.facilities),
        toNum(b.capacity),
        b.status || 'open',
        file(req),
        req.params.id,
      ]
    );

    const centre = result.rows[0];
    const changes = diffFields(before.rows[0], centre, {
      name: 'Name',
      address: 'Address',
      latitude: 'Latitude',
      longitude: 'Longitude',
      operating_hours: 'Operating hours',
      contact: 'Contact',
      description: 'Description',
      facilities: 'Facilities',
      capacity: 'Capacity',
      status: 'Operational status',
      image_url: 'Photo',
    });
    await logActivity(req, {
      action: 'Updated cooling centre',
      module: 'Cooling Centres',
      recordType: 'cooling_centre',
      recordId: centre.id,
      summary: `Updated cooling centre "${centre.name}"` + (Object.keys(changes).length ? '' : ' (no field changes)'),
      details: { changes },
    });
    res.json(centreOut(centre));
  })
);

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

    const result = await pool.query('UPDATE cooling_centres SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [
      req.body.status,
      req.params.id,
    ]);
    await logActivity(req, {
      action: 'Updated centre status',
      module: 'Cooling Centres',
      recordType: 'cooling_centre',
      recordId: result.rows[0].id,
      summary: `Changed "${result.rows[0].name}" status to ${req.body.status}`,
      details: { changes: { 'Operational status': { from: before.rows[0].status, to: req.body.status } } },
    });
    res.json(centreOut(result.rows[0]));
  })
);

app.delete(
  '/api/admin/centres/:id',
  auth,
  admin,
  ar(async (req, res) => {
    const result = await pool.query('DELETE FROM cooling_centres WHERE id=$1 RETURNING id,name', [req.params.id]);
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

/* ==========================================================================
   Community reports
   ========================================================================== */

app.post(
  '/api/reports',
  auth,
  upload.single('image'),
  ar(async (req, res) => {
    const b = req.body;
    if (!str(b.title) || !str(b.category) || !str(b.description) || !str(b.location)) {
      return res.status(400).json({ error: 'Title, category, description and location are required.' });
    }
    const lat = toNum(b.latitude);
    const lon = toNum(b.longitude);
    if ((lat == null) !== (lon == null)) {
      return res.status(400).json({ error: 'Provide both coordinates or leave both empty.' });
    }
    if (lat != null && !inKL(lat, lon)) {
      return res.status(400).json({ error: 'Reports must be located in Kuala Lumpur.' });
    }

    const result = await pool.query(
      'INSERT INTO user_reports(user_id,title,category,description,location_text,latitude,longitude,image_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [req.session.user.id, str(b.title), str(b.category), str(b.description), str(b.location), lat, lon, file(req)]
    );
    res.status(201).json(result.rows[0]);
  })
);

app.get(
  '/api/reports/mine',
  auth,
  ar(async (req, res) => {
    const result = await pool.query('SELECT * FROM user_reports WHERE user_id=$1 ORDER BY created_at DESC', [
      req.session.user.id,
    ]);
    res.json(result.rows);
  })
);

app.get(
  '/api/admin/reports',
  auth,
  admin,
  ar(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const result = await pool.query(
      `SELECT r.*,u.full_name reporter_name,u.email reporter_email
         FROM user_reports r JOIN users u ON u.id=r.user_id
         ${status ? 'WHERE r.status=$1' : ''}
        ORDER BY r.created_at DESC`,
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
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Choose approve or reject.' });
    if (status === 'rejected' && !note) return res.status(400).json({ error: 'A rejection reason is required.' });

    const result = await pool.query(
      `UPDATE user_reports SET status=$1,review_note=$2,reviewed_by=$3,reviewed_at=NOW(),
              review_image_url=COALESCE($4,review_image_url),updated_at=NOW()
        WHERE id=$5 RETURNING *`,
      [status, note || null, req.session.user.id, file(req), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Report not found.' });

    const approved = status === 'approved';
    await logActivity(req, {
      action: approved ? 'Approved user report' : 'Rejected user report',
      module: 'Report Review',
      recordType: 'user_report',
      recordId: result.rows[0].id,
      summary: `${approved ? 'Approved' : 'Rejected'} report "${result.rows[0].title}"`,
      details: note ? { note, evidence: file(req) } : null,
    });
    res.json(result.rows[0]);
  })
);

/* ==========================================================================
   Dashboards
   ========================================================================== */

app.get(
  '/api/admin/dashboard',
  auth,
  admin,
  ar(async (_req, res) => {
    const [centres, reports, users, heat, riskLevels, hotspots] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int total,
                COUNT(*) FILTER(WHERE c.status='open' AND c.verified AND NOT ${EXPIRED_SQL})::int open,
                COUNT(*) FILTER(WHERE c.verification_status='pending'
                                 OR (c.verification_status='verified' AND c.next_inspection_date IS NOT NULL
                                     AND c.next_inspection_date<=${TODAY_KL}+30))::int attention
           FROM cooling_centres c`
      ),
      pool.query(
        `SELECT COUNT(*)::int total,
                COUNT(*) FILTER(WHERE status='pending')::int pending,
                COUNT(*) FILTER(WHERE status='approved')::int approved,
                COUNT(*) FILTER(WHERE status='rejected')::int rejected
           FROM user_reports`
      ),
      pool.query("SELECT COUNT(*)::int total FROM users WHERE role='user'"),
      pool.query(
        `SELECT ROUND(AVG(heat_index_c)::numeric,1)::float avg_heat,
                ROUND(MAX(heat_index_c)::numeric,1)::float max_heat,
                MAX(observed_at) last_reading
           FROM heat_risk_logs WHERE observed_at>NOW()-INTERVAL '24 hours'`
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
    const [heat, riskLevels, reports] = await Promise.all([
      pool.query(
        "SELECT ROUND(AVG(heat_index_c)::numeric,1)::float avg_heat,MAX(observed_at) last_reading FROM heat_risk_logs WHERE observed_at>NOW()-INTERVAL '24 hours'"
      ),
      pool.query(
        "SELECT risk_level,COUNT(*)::int count FROM heat_risk_logs WHERE observed_at>NOW()-INTERVAL '7 days' GROUP BY risk_level"
      ),
      pool.query("SELECT COUNT(*)::int total FROM user_reports WHERE status='approved'"),
    ]);
    res.json({ heat: heat.rows[0], riskLevels: riskLevels.rows, approvedReports: reports.rows[0].total });
  })
);

/* ==========================================================================
   Feature modules (routes live in their own files)
   ========================================================================== */

registerAdminFeatures(app, { auth, admin, ar, upload, str, file });
registerEmailAuth(app, { ar, str }); // verify-email, resend-verification, forgot-password, reset-password

/* ==========================================================================
   Error handler + start
   ========================================================================== */

app.use((err, _req, res, _next) => {
  console.error(err.stack || err.message);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image limit is 5 MB.' : 'Image upload failed.' });
  }
  if (err.message === 'Unexpected field') return res.status(400).json({ error: 'Unexpected upload field.' });
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error. Check the API terminal.' });
});

verifyMailer();
app.listen(PORT, () => console.log(`HeatSafe KL API running on http://localhost:${PORT}`));