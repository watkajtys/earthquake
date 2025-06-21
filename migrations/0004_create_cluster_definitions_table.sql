CREATE TABLE IF NOT EXISTS ClusterDefinitions (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT,
    strongestQuakeId TEXT,
    earthquakeIds TEXT, -- JSON array of earthquake IDs
    title TEXT,
    description TEXT,
    locationName TEXT,
    maxMagnitude REAL NOT NULL,
    meanMagnitude REAL,
    minMagnitude REAL,
    depthRange TEXT,
    centroidLat REAL,
    centroidLon REAL,
    radiusKm REAL,
    startTime INTEGER NOT NULL,
    endTime INTEGER NOT NULL,
    durationHours REAL,
    quakeCount INTEGER NOT NULL,
    significanceScore REAL,
    version INTEGER DEFAULT 1,
    createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000), -- Store as milliseconds
    updatedAt INTEGER
);
