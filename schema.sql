PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE EarthquakeEvents (
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
, has_shakemap BOOLEAN DEFAULT FALSE, has_moment_tensor BOOLEAN DEFAULT FALSE, has_focal_mechanism BOOLEAN DEFAULT FALSE, has_dyfi BOOLEAN DEFAULT FALSE, has_losspager BOOLEAN DEFAULT FALSE, has_finite_fault BOOLEAN DEFAULT FALSE, products_json TEXT, detail_fetched BOOLEAN DEFAULT FALSE, detail_fetch_time INTEGER, has_enhanced_data BOOLEAN DEFAULT FALSE);
