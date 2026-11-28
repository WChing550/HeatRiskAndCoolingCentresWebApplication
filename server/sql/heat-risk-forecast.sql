BEGIN;

ALTER TABLE heat_risk_logs ADD COLUMN IF NOT EXISTS feels_like_c NUMERIC(5,2);
ALTER TABLE heat_risk_logs ADD COLUMN IF NOT EXISTS metric_kind VARCHAR(24) NOT NULL DEFAULT 'heat_index';
ALTER TABLE heat_risk_logs ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE heat_risk_logs ALTER COLUMN heat_index_c DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='heat_logs_feels_valid' AND conrelid='heat_risk_logs'::regclass) THEN
    ALTER TABLE heat_risk_logs ADD CONSTRAINT heat_logs_feels_valid
      CHECK(metric_kind<>'feels_like' OR (feels_like_c IS NOT NULL AND feels_like_c BETWEEN -100 AND 100));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_feels_reading_time ON heat_risk_logs(observed_at DESC) WHERE metric_kind='feels_like';
CREATE OR REPLACE VIEW feels_like_readings AS
  SELECT * FROM heat_risk_logs WHERE metric_kind='feels_like' AND feels_like_c IS NOT NULL;

CREATE TABLE IF NOT EXISTS weather_forecast_batches (
  id BIGSERIAL PRIMARY KEY,
  area VARCHAR(100) NOT NULL DEFAULT 'Kuala Lumpur',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_at TIMESTAMPTZ NOT NULL,
  metric VARCHAR(24) NOT NULL DEFAULT 'feels_like' CHECK(metric='feels_like'),
  model_version VARCHAR(160) NOT NULL,
  source_model VARCHAR(60) NOT NULL,
  reference TEXT NOT NULL,
  UNIQUE(area,input_at,model_version)
);
CREATE INDEX IF NOT EXISTS idx_weather_forecast_fresh ON weather_forecast_batches(issued_at DESC);
CREATE TABLE IF NOT EXISTS weather_forecast_points (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES weather_forecast_batches(id) ON DELETE CASCADE,
  horizon_hours INTEGER NOT NULL CHECK(horizon_hours BETWEEN 1 AND 72),
  target_at TIMESTAMPTZ NOT NULL,
  temperature_c DOUBLE PRECISION NOT NULL,
  humidity DOUBLE PRECISION NOT NULL CHECK(humidity BETWEEN 0 AND 100),
  feels_like_c DOUBLE PRECISION NOT NULL CHECK(feels_like_c BETWEEN -100 AND 100),
  risk_level VARCHAR(20) NOT NULL CHECK(risk_level IN('Low','Moderate','High')),
  selected_model VARCHAR(60) NOT NULL,
  evaluation JSONB NOT NULL DEFAULT '{}',
  UNIQUE(batch_id,horizon_hours)
);
CREATE INDEX IF NOT EXISTS idx_weather_forecast_target ON weather_forecast_points(target_at);
CREATE TABLE IF NOT EXISTS weather_forecast_jobs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK(status IN('running','success','failed')),
  summary JSONB NOT NULL DEFAULT '{}',
  error TEXT
);

ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS forecast_metric VARCHAR(24) NOT NULL DEFAULT 'manual';
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS automation_key TEXT;
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS automation_managed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS weather_forecast_batch_id BIGINT REFERENCES weather_forecast_batches(id) ON DELETE SET NULL;
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS forecast_target_at TIMESTAMPTZ;
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS forecast_window_start TIMESTAMPTZ;
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS forecast_window_end TIMESTAMPTZ;
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS forecast_lead_hours DOUBLE PRECISION;
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS forecast_initial_lead_hours DOUBLE PRECISION;
ALTER TABLE heat_alerts ADD COLUMN IF NOT EXISTS forecast_revision_note TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS heat_alert_automation_unique ON heat_alerts(automation_key) WHERE automation_key IS NOT NULL;
UPDATE heat_alerts SET status='deactivated',
  forecast_revision_note='Retired automatic forecast from the previous risk metric',updated_at=NOW()
WHERE origin='forecast' AND automation_managed AND forecast_metric<>'feels_like' AND status IN('draft','published');

COMMIT;
