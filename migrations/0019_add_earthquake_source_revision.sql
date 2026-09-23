-- A source revision fence for new summary writes. Historical rows remain NULL
-- until a validated source revision is observed; do not infer one from retrieval
-- or event time.
ALTER TABLE EarthquakeEvents ADD COLUMN source_updated_at_ms INTEGER;
