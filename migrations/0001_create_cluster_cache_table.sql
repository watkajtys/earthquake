-- Migration script to create the ClusterCache table for D1
-- This table will store cached cluster calculation results.

DROP TABLE IF EXISTS ClusterCache;

CREATE TABLE ClusterCache (
    cacheKey TEXT PRIMARY KEY NOT NULL,    -- Unique key for the cache entry (e.g., derived from lastFetchTime and timeWindowHours)
    clusterData TEXT NOT NULL,             -- JSON string containing the calculated cluster data
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP -- Timestamp of when the cache entry was created
);

-- Optional: Index on createdAt for efficient querying of stale entries if needed in the future
-- CREATE INDEX IF NOT EXISTS idx_clusterCache_createdAt ON ClusterCache(createdAt);
