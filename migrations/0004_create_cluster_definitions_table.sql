-- Migration script to create the ClusterDefinitions table
DROP TABLE IF EXISTS ClusterDefinitions;

CREATE TABLE ClusterDefinitions (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    title TEXT,
    description TEXT,
    locationName TEXT,
    centroidLat REAL,
    centroidLon REAL,
    radiusKm REAL,
    depthRange TEXT, -- Consider JSON for {min, max} or two REAL columns
    startTime INTEGER, -- UNIX timestamp (seconds)
    endTime INTEGER,   -- UNIX timestamp (seconds)
    durationHours REAL,
    quakeCount INTEGER,
    strongestQuakeId TEXT, -- Foreign key to EarthquakeEvents.id
    earthquakeIds TEXT, -- JSON array of TEXT (EarthquakeEvents.id)
    maxMagnitude REAL,
    meanMagnitude REAL,
    minMagnitude REAL,
    significanceScore REAL, -- Custom score based on magnitude, count, recency etc.
    version TEXT,           -- Version of the clustering algorithm or definition format
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (strongestQuakeId) REFERENCES EarthquakeEvents(id)
);

-- Indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_slug ON ClusterDefinitions(slug);
CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_startTime ON ClusterDefinitions(startTime);
CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_endTime ON ClusterDefinitions(endTime);
CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_maxMagnitude ON ClusterDefinitions(maxMagnitude);
CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_locationName ON ClusterDefinitions(locationName);

-- Optional: Trigger to automatically update `updatedAt` timestamp on row modification.
-- This might need to be adapted based on D1's exact SQL dialect for triggers.
DROP TRIGGER IF EXISTS trg_ClusterDefinitions_AutoUpdate_UpdatedAt;
CREATE TRIGGER trg_ClusterDefinitions_AutoUpdate_UpdatedAt
AFTER UPDATE ON ClusterDefinitions
FOR EACH ROW
BEGIN
    UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE id = OLD.id;
END;
