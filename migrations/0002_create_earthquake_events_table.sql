CREATE TABLE IF NOT EXISTS EarthquakeEvents (
    id TEXT PRIMARY KEY,
    event_time INTEGER,
    latitude REAL,
    longitude REAL,
    depth REAL,
    magnitude REAL,
    place TEXT,
    usgs_detail_url TEXT,
    geojson_feature TEXT,
    retrieved_at INTEGER
);

-- Optional: Add an index for retrieved_at if it will be frequently queried for sorting or filtering.
CREATE INDEX IF NOT EXISTS idx_earthquakeevents_retrieved_at ON EarthquakeEvents (retrieved_at);
-- Optional: Add an index for event_time if it will be frequently queried.
CREATE INDEX IF NOT EXISTS idx_earthquakeevents_event_time ON EarthquakeEvents (event_time);
