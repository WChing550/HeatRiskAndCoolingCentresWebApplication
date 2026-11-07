import {savedPhotos} from './centrePhotos.js';
// HeatSafe KL — Admin submodules:
//   1. User Management            4. Heat Alert Management
//   2. Centre Verification        5. Activity Log / Audit Trail
//   3. Advanced Heat Analytics
// Registered from index.js with registerAdminFeatures(app, helpers).
import {pool} from './db.js';
import {riskLevel} from './heat.js';

const TZ = 'Asia/Kuala_Lumpur';

/* ---------- shared SQL fragments & helpers (also used by index.js) ---------- */
export const TODAY_KL = `(NOW() AT TIME ZONE '${TZ}')::date`;
// A centre is "expired" when it is verified but its next inspection date has passed.
export const EXPIRED_SQL = `(c.verification_status='verified' AND c.next_inspection_date IS NOT NULL AND c.next_inspection_date<${TODAY_KL})`;

const pad = v => String(v).padStart(2, '0');
// node-pg returns DATE columns as local-midnight Date objects; turn them back into 'YYYY-MM-DD'.
export const ymd = v => v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : v ?? null;
const todayKL = () => new Date().toLocaleDateString('en-CA', {timeZone: TZ});
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const isId = v => /^\d+$/.test(String(v));
const bad = (res, msg, code = 400) => res.status(code).json({error: msg});

// Shape a cooling_centres row for the API. `verified` now means "currently verified and not expired",
// so every existing client check (centres.filter(c=>c.verified)) keeps working.
export function centreOut(row) {
  if (!row) return row;
  const expired = row.expired ?? (row.verification_status === 'verified' && row.next_inspection_date != null && ymd(row.next_inspection_date) < todayKL());
  const {expired: _drop, ...rest} = row;
  return {
    ...rest,
    image_urls: savedPhotos(row),
    last_inspection_date: ymd(row.last_inspection_date),
    next_inspection_date: ymd(row.next_inspection_date),
    verified: Boolean(row.verified) && !expired,
    effective_status: row.verification_status === 'verified' && expired ? 'expired' : row.verification_status
  };
}

/* ---------- audit trail ---------- */
export async function logActivity(req, {action, module, recordType = null, recordId = null, summary, details = null}) {
  try {
    const u = req.session.user;
    await pool.query(
      'INSERT INTO admin_activity_logs(admin_id,admin_name,action,module,record_type,record_id,summary,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [u.id, u.fullName, action, module, recordType, recordId == null ? null : String(recordId), summary, details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    // An audit-log failure must never block the admin's real action.
    console.error('Activity log failed:', e.message);
  }
}

const norm = v => Array.isArray(v) ? v.join(', ') : v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
// Build {Label:{from,to}} for fields that actually changed.
export function diffFields(before, after, fields) {
  const out = {};
  for (const [key, label] of Object.entries(fields)) {
    if (norm(before?.[key]) !== norm(after?.[key])) out[label] = {from: norm(before?.[key]) || null, to: norm(after?.[key]) || null};
  }
  return out;
}

/* ---------- heat alerts ---------- */
const SEVERITIES = ['Low', 'Moderate', 'High'];
const alertState = a => {
  if (a.status !== 'published') return a.status;
  const now = Date.now();
  return now < +new Date(a.starts_at) ? 'scheduled' : now >= +new Date(a.ends_at) ? 'expired' : 'active';
};
function parseAlert(b, str) {
  const title = str(b.title), description = str(b.description), severity = b.severity, area = str(b.affectedArea) || 'Kuala Lumpur';
  const starts = new Date(b.startsAt), ends = new Date(b.endsAt);
  if (!title || title.length > 160) return {error: 'Enter an alert title (up to 160 characters).'};
  if (!description) return {error: 'Enter an alert description.'};
  if (!SEVERITIES.includes(severity)) return {error: 'Choose a severity: Low, Moderate or High.'};
  if (area.length > 160) return {error: 'Affected area is too long.'};
  if (isNaN(starts) || isNaN(ends)) return {error: 'Enter valid start and end times.'};
  if (ends <= starts) return {error: 'The end time must be after the start time.'};
  return {title, description, severity, area, starts: starts.toISOString(), ends: ends.toISOString()};
}
const ALERT_FIELDS = {title: 'Title', description: 'Description', severity: 'Severity', affected_area: 'Affected area', starts_at: 'Start', ends_at: 'End', status: 'Status'};

/* ---------- analytics thresholds ---------- */
const periodWhere = {
  current: 'observed_at>=NOW()-make_interval(days=>$1::int) AND observed_at<=NOW()',
  previous: 'observed_at>=NOW()-make_interval(days=>$1::int*2) AND observed_at<NOW()-make_interval(days=>$1::int)'
};
const SUMMARY_SQL = where => `SELECT COUNT(*)::int AS readings,
  ROUND(AVG(temperature_c)::numeric,1)::float AS avg_temp,
  ROUND(AVG(heat_index_c)::numeric,1)::float AS avg_hi,
  ROUND(MAX(heat_index_c)::numeric,1)::float AS max_hi,
  ROUND(MAX(temperature_c)::numeric,1)::float AS max_temp,
  COUNT(*) FILTER(WHERE risk_level='Low')::int AS low,
  COUNT(*) FILTER(WHERE risk_level='Moderate')::int AS moderate,
  COUNT(*) FILTER(WHERE risk_level='High')::int AS high
  FROM heat_risk_logs WHERE ${where}`;

export function registerAdminFeatures(app, {auth, admin, ar, upload, str, file}) {
  /* ================= 1. USER MANAGEMENT ================= */
  app.get('/api/admin/users', auth, admin, ar(async (_q, s) => {
    const r = await pool.query(`SELECT u.id,u.full_name,u.email,u.username,u.role,u.account_status,u.created_at,u.updated_at,
      COUNT(r.id)::int total_reports,
      COUNT(r.id) FILTER(WHERE r.status='pending')::int pending_reports,
      COUNT(r.id) FILTER(WHERE r.status='approved')::int approved_reports,
      COUNT(r.id) FILTER(WHERE r.status='rejected')::int rejected_reports,
      MAX(r.created_at) last_report_at
      FROM users u LEFT JOIN user_reports r ON r.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC`);
    s.json(r.rows);
  }));

  app.get('/api/admin/users/:id/reports', auth, admin, ar(async (q, s) => {
    if (!isId(q.params.id)) return bad(s, 'User not found.', 404);
    const u = await pool.query('SELECT id,full_name,email,username,role,account_status,created_at FROM users WHERE id=$1', [q.params.id]);
    if (!u.rowCount) return bad(s, 'User not found.', 404);
    const r = await pool.query('SELECT * FROM user_reports WHERE user_id=$1 ORDER BY created_at DESC', [q.params.id]);
    s.json({user: u.rows[0], reports: r.rows});
  }));

  app.patch('/api/admin/users/:id/status', auth, admin, ar(async (q, s) => {
    const id = q.params.id, st = q.body.status;
    if (!isId(id)) return bad(s, 'User not found.', 404);
    if (!['active', 'deactivated'].includes(st)) return bad(s, 'Status must be active or deactivated.');
    if (String(q.session.user.id) === String(id)) return bad(s, 'You cannot change the status of your own account.');
    const r = await pool.query('UPDATE users SET account_status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,full_name,email,username,role,account_status', [st, id]);
    if (!r.rowCount) return bad(s, 'User not found.', 404);
    // Deactivation takes effect immediately: end every live session this user has.
    if (st === 'deactivated') await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'id'=$1", [String(id)]).catch(e => console.error('Session cleanup failed:', e.message));
    await logActivity(q, {action: st === 'active' ? 'Activated user account' : 'Deactivated user account', module: 'User Management', recordType: 'user', recordId: id, summary: `${st === 'active' ? 'Activated' : 'Deactivated'} account of ${r.rows[0].full_name} (${r.rows[0].email})`});
    s.json(r.rows[0]);
  }));

  /* ================= 2. CENTRE VERIFICATION ================= */
  app.get('/api/admin/verification', auth, admin, ar(async (_q, s) => {
    const r = await pool.query(`SELECT c.id,c.name,c.address,c.status,c.verification_status,c.verified_at,
      to_char(c.last_inspection_date,'YYYY-MM-DD') last_inspection_date,
      to_char(c.next_inspection_date,'YYYY-MM-DD') next_inspection_date,
      vu.full_name verified_by_name,${EXPIRED_SQL} expired,
      (c.next_inspection_date-${TODAY_KL}) days_until_next,
      (SELECT COUNT(*)::int FROM centre_inspections i WHERE i.centre_id=c.id) inspection_count
      FROM cooling_centres c LEFT JOIN users vu ON vu.id=c.verified_by ORDER BY c.name`);
    const summary = {total: r.rowCount, verified: 0, pending: 0, rejected: 0, expired: 0, dueSoon: 0, overdue: 0};
    const centres = r.rows.map(row => {
      const days = row.days_until_next == null ? null : Number(row.days_until_next);
      const effective = row.verification_status === 'verified' && row.expired ? 'expired' : row.verification_status;
      // Reminder logic: overdue = date passed, due_soon = within 30 days (verified or scheduled-pending centres only).
      const due = days != null && ['verified', 'pending'].includes(row.verification_status) ? (days < 0 ? 'overdue' : days <= 30 ? 'due_soon' : 'ok') : null;
      summary[effective]++;
      if (due === 'overdue') summary.overdue++;
      if (due === 'due_soon') summary.dueSoon++;
      const {expired: _e, days_until_next: _d, ...rest} = row;
      return {...rest, effective_status: effective, days_until_next: days, due};
    });
    s.json({summary, centres});
  }));

  app.get('/api/admin/centres/:id/inspections', auth, admin, ar(async (q, s) => {
    if (!isId(q.params.id)) return bad(s, 'Centre not found.', 404);
    const r = await pool.query(`SELECT i.id,i.outcome,to_char(i.inspected_at,'YYYY-MM-DD') inspected_at,
      to_char(i.next_inspection_date,'YYYY-MM-DD') next_inspection_date,i.remarks,i.evidence_url,i.created_at,u.full_name inspector_name
      FROM centre_inspections i LEFT JOIN users u ON u.id=i.inspected_by WHERE i.centre_id=$1 ORDER BY i.created_at DESC,i.id DESC`, [q.params.id]);
    s.json(r.rows);
  }));

  app.post('/api/admin/centres/:id/inspections', auth, admin, upload.single('evidence'), ar(async (q, s) => {
    const id = q.params.id, b = q.body, outcome = b.outcome, inspectedAt = str(b.inspectedAt), remarks = str(b.remarks);
    let next = str(b.nextInspectionDate) || null;
    if (!isId(id)) return bad(s, 'Centre not found.', 404);
    if (!['verified', 'rejected', 'pending'].includes(outcome)) return bad(s, 'Choose a verification outcome.');
    if (!isDate(inspectedAt)) return bad(s, 'Enter a valid inspection date.');
    if (inspectedAt > todayKL()) return bad(s, 'The inspection date cannot be in the future.');
    if (next && !isDate(next)) return bad(s, 'Enter a valid next inspection date.');
    if (next && next <= inspectedAt) return bad(s, 'The next inspection date must be after the inspection date.');
    if (outcome === 'verified' && !next) return bad(s, 'Set a next inspection date so the verification can expire and be re-checked.');
    if (outcome === 'rejected' && !remarks) return bad(s, 'Remarks are required when rejecting a centre.');
    if (outcome === 'rejected') next = null;

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const cur = await db.query('SELECT id,name,verification_status FROM cooling_centres WHERE id=$1 FOR UPDATE', [id]);
      if (!cur.rowCount) { await db.query('ROLLBACK'); return bad(s, 'Centre not found.', 404); }
      const ins = await db.query('INSERT INTO centre_inspections(centre_id,inspected_by,outcome,inspected_at,next_inspection_date,remarks,evidence_url) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [id, q.session.user.id, outcome, inspectedAt, next, remarks || null, file(q)]);
      const upd = await db.query(`UPDATE cooling_centres SET verification_status=$1::varchar,verified=($1::varchar='verified'),
        verified_at=CASE WHEN $1::varchar='verified' THEN NOW() ELSE NULL END,
        verified_by=CASE WHEN $1::varchar='verified' THEN $2::bigint ELSE NULL END,
        last_inspection_date=$3::date,next_inspection_date=$4::date,updated_at=NOW() WHERE id=$5 RETURNING *`, [outcome, q.session.user.id, inspectedAt, next, id]);
      await db.query('COMMIT');
      await logActivity(q, {
        action: outcome === 'verified' ? 'Verified cooling centre' : outcome === 'rejected' ? 'Rejected cooling centre verification' : 'Reset centre to pending',
        module: 'Centre Verification', recordType: 'cooling_centre', recordId: id,
        summary: `Recorded ${outcome} inspection for "${cur.rows[0].name}"`,
        details: {changes: {'Verification status': {from: cur.rows[0].verification_status, to: outcome}, 'Inspection date': {from: null, to: inspectedAt}, 'Next inspection': {from: null, to: next}}, remarks: remarks || null, evidence: file(q)}
      });
      s.status(201).json({inspectionId: ins.rows[0].id, centre: centreOut(upd.rows[0])});
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }));

  /* ================= 3. HEAT ALERTS ================= */
  // Public: only alerts that are published AND inside their start/end window.
  app.get('/api/alerts/active', ar(async (_q, s) => {
    const r = await pool.query(`SELECT id,title,description,severity,affected_area,starts_at,ends_at,published_at FROM heat_alerts
      WHERE status='published' AND starts_at<=NOW() AND ends_at>NOW()
      ORDER BY CASE severity WHEN 'High' THEN 1 WHEN 'Moderate' THEN 2 ELSE 3 END,starts_at DESC LIMIT 10`);
    s.json(r.rows);
  }));

  app.get('/api/admin/alerts', auth, admin, ar(async (_q, s) => {
    const r = await pool.query('SELECT a.*,u.full_name created_by_name FROM heat_alerts a LEFT JOIN users u ON u.id=a.created_by ORDER BY a.created_at DESC LIMIT 300');
    s.json(r.rows.map(a => ({...a, state: alertState(a)})));
  }));

  app.post('/api/admin/alerts', auth, admin, ar(async (q, s) => {
    const p = parseAlert(q.body, str);
    if (p.error) return bad(s, p.error);
    const publish = q.body.publish === true || q.body.publish === 'true';
    if (publish && new Date(p.ends) <= new Date()) return bad(s, 'The end time has already passed, so this alert cannot be published.');
    const r = await pool.query(`INSERT INTO heat_alerts(title,description,severity,affected_area,starts_at,ends_at,status,created_by,published_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7::varchar='published' THEN NOW() END) RETURNING *`,
      [p.title, p.description, p.severity, p.area, p.starts, p.ends, publish ? 'published' : 'draft', q.session.user.id]);
    const a = r.rows[0];
    await logActivity(q, {action: publish ? 'Published heat alert' : 'Created heat alert draft', module: 'Alert Management', recordType: 'heat_alert', recordId: a.id, summary: `${publish ? 'Published' : 'Created draft of'} ${a.severity} alert "${a.title}" for ${a.affected_area}`});
    s.status(201).json({...a, state: alertState(a)});
  }));

  app.put('/api/admin/alerts/:id', auth, admin, ar(async (q, s) => {
    if (!isId(q.params.id)) return bad(s, 'Alert not found.', 404);
    const p = parseAlert(q.body, str);
    if (p.error) return bad(s, p.error);
    const before = await pool.query('SELECT * FROM heat_alerts WHERE id=$1', [q.params.id]);
    if (!before.rowCount) return bad(s, 'Alert not found.', 404);
    if (before.rows[0].status === 'published' && new Date(p.ends) <= new Date()) return bad(s, 'A published alert cannot end in the past. Deactivate it instead.');
    const r = await pool.query('UPDATE heat_alerts SET title=$1,description=$2,severity=$3,affected_area=$4,starts_at=$5,ends_at=$6,updated_at=NOW() WHERE id=$7 RETURNING *', [p.title, p.description, p.severity, p.area, p.starts, p.ends, q.params.id]);
    const a = r.rows[0], changes = diffFields(before.rows[0], a, ALERT_FIELDS);
    if (Object.keys(changes).length) await logActivity(q, {action: 'Updated heat alert', module: 'Alert Management', recordType: 'heat_alert', recordId: a.id, summary: `Updated alert "${a.title}"`, details: {changes}});
    s.json({...a, state: alertState(a)});
  }));

  app.patch('/api/admin/alerts/:id/status', auth, admin, ar(async (q, s) => {
    const st = q.body.status;
    if (!isId(q.params.id)) return bad(s, 'Alert not found.', 404);
    if (!['published', 'deactivated', 'draft'].includes(st)) return bad(s, 'Invalid alert status.');
    const before = await pool.query('SELECT * FROM heat_alerts WHERE id=$1', [q.params.id]);
    if (!before.rowCount) return bad(s, 'Alert not found.', 404);
    if (st === 'published' && new Date(before.rows[0].ends_at) <= new Date()) return bad(s, 'The end time has already passed. Edit the alert times before publishing.');
    const r = await pool.query("UPDATE heat_alerts SET status=$1::varchar,published_at=CASE WHEN $1::varchar='published' THEN NOW() ELSE published_at END,updated_at=NOW() WHERE id=$2 RETURNING *", [st, q.params.id]);
    const a = r.rows[0];
    await logActivity(q, {action: st === 'published' ? 'Published heat alert' : st === 'deactivated' ? 'Deactivated heat alert' : 'Moved heat alert to draft', module: 'Alert Management', recordType: 'heat_alert', recordId: a.id, summary: `${st === 'published' ? 'Published' : st === 'deactivated' ? 'Deactivated' : 'Moved to draft:'} alert "${a.title}"`, details: {changes: {Status: {from: before.rows[0].status, to: st}}}});
    s.json({...a, state: alertState(a)});
  }));

  /* ================= 4. ACTIVITY LOG ================= */
  app.get('/api/admin/activity', auth, admin, ar(async (q, s) => {
    const page = Math.max(1, parseInt(q.query.page) || 1), size = 25, where = [], params = [];
    const bind = v => { params.push(v); return '$' + params.length; };
    const mod = str(q.query.module), act = str(q.query.action), search = str(q.query.search), from = str(q.query.from), to = str(q.query.to);
    if (mod) where.push(`module=${bind(mod)}`);
    if (act) where.push(`action=${bind(act)}`);
    if (search) {
      const like = bind('%' + search.replace(/[%_\\]/g, '\\$&') + '%');
      where.push(`(admin_name ILIKE ${like} OR summary ILIKE ${like} OR action ILIKE ${like} OR COALESCE(record_id,'') ILIKE ${like})`);
    }
    if (isDate(from)) where.push(`created_at>=(${bind(from)}::date)::timestamp AT TIME ZONE '${TZ}'`);
    if (isDate(to)) where.push(`created_at<((${bind(to)}::date)+1)::timestamp AT TIME ZONE '${TZ}'`);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows, total, mods, acts] = await Promise.all([
      pool.query(`SELECT id,admin_id,admin_name,action,module,record_type,record_id,summary,details,created_at FROM admin_activity_logs ${w} ORDER BY created_at DESC,id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, params),
      pool.query(`SELECT COUNT(*)::int total FROM admin_activity_logs ${w}`, params),
      pool.query('SELECT DISTINCT module FROM admin_activity_logs ORDER BY module'),
      pool.query('SELECT DISTINCT action FROM admin_activity_logs ORDER BY action')
    ]);
    s.json({rows: rows.rows, total: total.rows[0].total, page, pageSize: size, modules: mods.rows.map(x => x.module), actions: acts.rows.map(x => x.action)});
  }));

  /* ================= 5. ADVANCED ANALYTICS ================= */
  app.get('/api/admin/analytics', auth, admin, ar(async (q, s) => {
    const days = [7, 30, 90].includes(Number(q.query.days)) ? Number(q.query.days) : 7, p = [days];
    const [cur, prev, daily, hourly, peak, loc, rep] = await Promise.all([
      pool.query(SUMMARY_SQL(periodWhere.current), p),
      pool.query(SUMMARY_SQL(periodWhere.previous), p),
      pool.query(`SELECT to_char((observed_at AT TIME ZONE '${TZ}')::date,'YYYY-MM-DD') AS day,
        ROUND(AVG(temperature_c)::numeric,1)::float AS avg_temp,ROUND(AVG(heat_index_c)::numeric,1)::float AS avg_hi,ROUND(MAX(heat_index_c)::numeric,1)::float AS max_hi,
        COUNT(*)::int AS readings,COUNT(*) FILTER(WHERE risk_level='Low')::int AS low,COUNT(*) FILTER(WHERE risk_level='Moderate')::int AS moderate,COUNT(*) FILTER(WHERE risk_level='High')::int AS high
        FROM heat_risk_logs WHERE ${periodWhere.current} GROUP BY 1 ORDER BY 1`, p),
      pool.query(`SELECT EXTRACT(HOUR FROM observed_at AT TIME ZONE '${TZ}')::int AS hour,ROUND(AVG(heat_index_c)::numeric,1)::float AS avg_hi,ROUND(MAX(heat_index_c)::numeric,1)::float AS max_hi,COUNT(*)::int AS readings
        FROM heat_risk_logs WHERE ${periodWhere.current} GROUP BY 1 ORDER BY 1`, p),
      pool.query(`SELECT id,city,observed_at,heat_index_c::float AS heat_index_c,temperature_c::float AS temperature_c,humidity,risk_level
        FROM heat_risk_logs WHERE ${periodWhere.current} ORDER BY heat_index_c DESC,observed_at DESC LIMIT 5`, p),
      // Readings grouped into ~1 km cells (2 decimal places). Only places where readings were really recorded are returned.
      pool.query(`SELECT ROUND(latitude::numeric,2)::float AS lat,ROUND(longitude::numeric,2)::float AS lon,COUNT(*)::int AS readings,
        ROUND(AVG(heat_index_c)::numeric,1)::float AS avg_hi,ROUND(MAX(heat_index_c)::numeric,1)::float AS max_hi,COUNT(*) FILTER(WHERE risk_level='High')::int AS high
        FROM heat_risk_logs WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND ${periodWhere.current} GROUP BY 1,2 ORDER BY readings DESC LIMIT 200`, p),
      pool.query(`SELECT COUNT(*)::int AS submitted,COUNT(*) FILTER(WHERE status='pending')::int AS pending,COUNT(*) FILTER(WHERE status='approved')::int AS approved,COUNT(*) FILTER(WHERE status='rejected')::int AS rejected
        FROM user_reports WHERE created_at>=NOW()-make_interval(days=>$1::int)`, p)
    ]);
    const hourRows = hourly.rows, peakHour = hourRows.length ? hourRows.reduce((a, b) => b.avg_hi > a.avg_hi ? b : a) : null;
    s.json({
      days, timezone: TZ, generatedAt: new Date().toISOString(),
      current: cur.rows[0], previous: prev.rows[0], daily: daily.rows, hourly: hourRows, peakHour,
      peakReadings: peak.rows, locations: loc.rows.map(l => ({...l, risk_level: riskLevel(l.avg_hi)})), reports: rep.rows[0]
    });
  }));
}
