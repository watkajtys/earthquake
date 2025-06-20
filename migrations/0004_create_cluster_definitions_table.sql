-- Define the ClusterDefinitions table
CREATE TABLE ClusterDefinitions (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    strongestQuakeId TEXT NOT NULL,
    earthquakeIds TEXT NOT NULL, -- JSON array of strings (earthquake IDs)
    title TEXT,
    description TEXT,
    locationName TEXT,
    maxMagnitude REAL,
    meanMagnitude REAL,
    minMagnitude REAL,
    depthRange TEXT, -- E.g., "5-15km"
    centroidLat REAL,
    centroidLon REAL,
    radiusKm REAL, -- Approximate radius
    startTime INTEGER, -- Timestamp of the earliest quake
    endTime INTEGER, -- Timestamp of the latest quake
    durationHours REAL,
    quakeCount INTEGER,
    significanceScore REAL,
    version INTEGER DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX idx_cluster_definitions_slug ON ClusterDefinitions(slug);
CREATE INDEX idx_cluster_definitions_strongestQuakeId ON ClusterDefinitions(strongestQuakeId);
CREATE INDEX idx_cluster_definitions_startTime ON ClusterDefinitions(startTime);
CREATE INDEX idx_cluster_definitions_endTime ON ClusterDefinitions(endTime);
CREATE INDEX idx_cluster_definitions_maxMagnitude ON ClusterDefinitions(maxMagnitude);
CREATE INDEX idx_cluster_definitions_significanceScore ON ClusterDefinitions(significanceScore);
