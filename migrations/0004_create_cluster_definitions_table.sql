-- Migration 0004: Define ClusterDefinitions Table Schema (Simplified)
-- Description: Creates the ClusterDefinitions table with a simplified schema for initial deployment.
-- Indexes and triggers will be added in subsequent migrations if this succeeds.

CREATE TABLE IF NOT EXISTS ClusterDefinitions (
    clusterId TEXT PRIMARY KEY NOT NULL,
    earthquakeIds TEXT,
    strongestQuakeId TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP, -- Using standard CURRENT_TIMESTAMP
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP  -- Using standard CURRENT_TIMESTAMP
);

-- Indexes and Trigger removed for this attempt. They will be added later.
-- CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_strongestQuakeId ON ClusterDefinitions(strongestQuakeId);
-- CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_updatedAt ON ClusterDefinitions(updatedAt);

-- CREATE TRIGGER IF NOT EXISTS trg_ClusterDefinitions_UpdatedAt_Timestamp
-- AFTER UPDATE ON ClusterDefinitions
-- FOR EACH ROW
-- WHEN OLD.updatedAt = NEW.updatedAt OR OLD.updatedAt IS NULL
-- BEGIN
--     UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE clusterId = OLD.clusterId;
-- END;
