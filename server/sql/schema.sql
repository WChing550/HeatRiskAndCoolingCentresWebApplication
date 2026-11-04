CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,full_name VARCHAR(120) NOT NULL,email VARCHAR(255) UNIQUE NOT NULL,username VARCHAR(60) UNIQUE NOT NULL,password_hash TEXT NOT NULL,role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK(role IN('user','admin')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS cooling_centres(id BIGSERIAL PRIMARY KEY,name VARCHAR(180) NOT NULL,address TEXT NOT NULL,area VARCHAR(100) NOT NULL DEFAULT 'Kuala Lumpur',latitude NUMERIC(10,7) NOT NULL,longitude NUMERIC(10,7) NOT NULL,operating_hours VARCHAR(180) NOT NULL,contact VARCHAR(100),description TEXT,facilities TEXT[] NOT NULL DEFAULT '{}',capacity INTEGER CHECK(capacity IS NULL OR capacity>=0),status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK(status IN('open','temporarily_closed','maintenance','unavailable')),image_url TEXT,verified BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS heat_risk_logs(id BIGSERIAL PRIMARY KEY,city VARCHAR(160) NOT NULL DEFAULT 'Kuala Lumpur',latitude NUMERIC(10,7),longitude NUMERIC(10,7),temperature_c NUMERIC(5,2) NOT NULL,humidity INTEGER NOT NULL CHECK(humidity BETWEEN 0 AND 100),heat_index_c NUMERIC(5,2) NOT NULL,risk_level VARCHAR(20) NOT NULL CHECK(risk_level IN('Low','Moderate','High')),weather_description TEXT,observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS user_reports(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title VARCHAR(180) NOT NULL,category VARCHAR(60) NOT NULL,description TEXT NOT NULL,location_text TEXT NOT NULL,latitude NUMERIC(10,7),longitude NUMERIC(10,7),image_url TEXT,status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),review_note TEXT,reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,reviewed_at TIMESTAMPTZ,review_image_url TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON user_reports(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user_created ON user_reports(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heat_observed ON heat_risk_logs(observed_at DESC);

-- ============================================================
-- Admin submodule upgrade (safe to re-run: every statement is idempotent)
-- ============================================================

-- 1. User Management: account status
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'active';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_account_status_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK(account_status IN('active','deactivated'));
  END IF;
END $$;

-- 2. Cooling Centre Verification & Inspection
ALTER TABLE cooling_centres ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE cooling_centres ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE cooling_centres ADD COLUMN IF NOT EXISTS verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cooling_centres ADD COLUMN IF NOT EXISTS last_inspection_date DATE;
ALTER TABLE cooling_centres ADD COLUMN IF NOT EXISTS next_inspection_date DATE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cooling_centres_verification_status_check') THEN
    ALTER TABLE cooling_centres ADD CONSTRAINT cooling_centres_verification_status_check CHECK(verification_status IN('pending','verified','rejected'));
  END IF;
END $$;
-- Centres ticked as "verified" under the old checkbox are carried over as verified (no next-inspection date, so they do not expire until an admin schedules one).
UPDATE cooling_centres SET verification_status='verified',verified_at=COALESCE(verified_at,updated_at) WHERE verified=TRUE AND verification_status='pending';

CREATE TABLE IF NOT EXISTS centre_inspections(
  id BIGSERIAL PRIMARY KEY,
  centre_id BIGINT NOT NULL REFERENCES cooling_centres(id) ON DELETE CASCADE,
  inspected_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  outcome VARCHAR(20) NOT NULL CHECK(outcome IN('verified','rejected','pending')),
  inspected_at DATE NOT NULL,
  next_inspection_date DATE,
  remarks TEXT,
  evidence_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_inspections_centre ON centre_inspections(centre_id,created_at DESC);

-- 3. Heat Alert & Notification Management
CREATE TABLE IF NOT EXISTS heat_alerts(
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK(severity IN('Low','Moderate','High')),
  affected_area VARCHAR(160) NOT NULL DEFAULT 'Kuala Lumpur',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','deactivated')),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(ends_at>starts_at));
CREATE INDEX IF NOT EXISTS idx_alerts_status_window ON heat_alerts(status,starts_at,ends_at);

-- 4. System Activity Log / Audit Trail
CREATE TABLE IF NOT EXISTS admin_activity_logs(
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  admin_name VARCHAR(120) NOT NULL,
  action VARCHAR(60) NOT NULL,
  module VARCHAR(40) NOT NULL,
  record_type VARCHAR(40),
  record_id VARCHAR(40),
  summary TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_activity_created ON admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_module ON admin_activity_logs(module,created_at DESC);

-- 5. Analytics: speed up location grouping for the sampled-location map
CREATE INDEX IF NOT EXISTS idx_heat_coords ON heat_risk_logs(latitude,longitude);
