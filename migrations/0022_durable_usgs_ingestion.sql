-- Additive progress authority for trusted, opt-in summary ingestion.
-- Existing EarthquakeEvents and legacy KV data are intentionally untouched.
CREATE TABLE UsgsIngestionState (
  feed_key TEXT PRIMARY KEY CHECK (feed_key IN ('hour', 'day', 'week', 'month')),
  fence INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until_ms INTEGER,
  active_run_id TEXT,
  completed_run_id TEXT,
  completed_source_generated_at_ms INTEGER
);

CREATE TABLE UsgsIngestionRuns (
  run_id TEXT PRIMARY KEY,
  feed_key TEXT NOT NULL,
  snapshot_key TEXT NOT NULL UNIQUE,
  snapshot_sha256 TEXT NOT NULL,
  snapshot_bytes INTEGER NOT NULL CHECK (snapshot_bytes BETWEEN 1 AND 16777216),
  source_generated_at_ms INTEGER NOT NULL,
  feature_count INTEGER NOT NULL CHECK (feature_count BETWEEN 0 AND 30000),
  cursor INTEGER NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'retry', 'completed', 'completed_with_rejections', 'parked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER NOT NULL,
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  FOREIGN KEY (feed_key) REFERENCES UsgsIngestionState(feed_key)
);

CREATE INDEX idx_usgs_ingestion_runs_feed_due
  ON UsgsIngestionRuns(feed_key, status, next_attempt_at_ms);

CREATE TABLE UsgsIngestionIssues (
  run_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  source_updated_at_ms INTEGER NOT NULL,
  feature_sha256 TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (run_id, event_id),
  FOREIGN KEY (run_id) REFERENCES UsgsIngestionRuns(run_id)
);
