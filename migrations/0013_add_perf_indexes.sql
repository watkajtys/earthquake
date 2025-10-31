-- Migration number: 0013 	 2025-10-31T15:16:24.466697Z

-- Add a composite index to optimize the main data-fetching query
CREATE INDEX IF NOT EXISTS idx_earthquakeevents_time_mag ON EarthquakeEvents (event_time, magnitude);

-- Add an index to optimize the backfill process
CREATE INDEX IF NOT EXISTS idx_earthquakeevents_fetched_time ON EarthquakeEvents (detail_fetched, event_time);
