-- Migration 0015: Add retry logic columns to EarthquakeEvents table
-- This migration adds columns to support an intelligent retry mechanism for fetching
-- detailed earthquake data from the USGS API. A 409 Conflict error from the API
-- often means the data isn't ready yet, so we need to back off and try again later.

ALTER TABLE EarthquakeEvents
ADD COLUMN detail_fetch_attempts INTEGER DEFAULT 0;

ALTER TABLE EarthquakeEvents
ADD COLUMN last_detail_fetch_attempt INTEGER;

ALTER TABLE EarthquakeEvents
ADD COLUMN next_detail_fetch_attempt INTEGER;

-- Add an index to efficiently query for events that are due for a retry.
-- We only need to query for events that haven't been fetched and have a `next_detail_fetch_attempt` timestamp
-- that is in the past.
CREATE INDEX IF NOT EXISTS idx_earthquake_events_retry
ON EarthquakeEvents (detail_fetched, next_detail_fetch_attempt)
WHERE detail_fetched = FALSE AND next_detail_fetch_attempt IS NOT NULL;
