-- New detail writes publish an immutable R2 object through a fenced D1 pointer.
-- Legacy rows retain their mutable <id>.json archive until reconciled.
ALTER TABLE EarthquakeEvents ADD COLUMN detail_archive_key TEXT;
ALTER TABLE EarthquakeEvents ADD COLUMN detail_archive_revision_ms INTEGER;
ALTER TABLE EarthquakeEvents ADD COLUMN detail_metadata_revision_ms INTEGER;

-- The job is durable before an R2 write. A Queue message is only a wake-up;
-- retries can also find pending jobs without depending on Queue delivery.
CREATE TABLE EarthquakeDetailJobs (
  event_id TEXT NOT NULL,
  target_revision_ms INTEGER NOT NULL,
  archive_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'leased', 'completed', 'superseded', 'parked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER NOT NULL,
  lease_token TEXT,
  lease_until_ms INTEGER,
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (event_id, target_revision_ms)
);

CREATE INDEX idx_earthquake_detail_jobs_due
  ON EarthquakeDetailJobs (next_attempt_at_ms, event_id)
  WHERE status = 'pending';

CREATE INDEX idx_earthquake_detail_jobs_expired_lease
  ON EarthquakeDetailJobs (lease_until_ms, event_id)
  WHERE status = 'leased';

-- A newer authoritative summary makes older pending/parked detail work moot.
-- This also covers the brief transition while an older Worker is still live.
CREATE TRIGGER trg_earthquake_detail_jobs_supersede
AFTER UPDATE OF source_updated_at_ms ON EarthquakeEvents
FOR EACH ROW
WHEN NEW.source_updated_at_ms IS NOT NULL
  AND (OLD.source_updated_at_ms IS NULL OR NEW.source_updated_at_ms > OLD.source_updated_at_ms)
BEGIN
  UPDATE EarthquakeDetailJobs SET status = 'superseded', lease_token = NULL,
    lease_until_ms = NULL, updated_at_ms = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE event_id = NEW.id AND target_revision_ms < NEW.source_updated_at_ms
    AND status IN ('pending', 'leased', 'parked');
END;
