-- Migration 0004: Define ClusterDefinitions Table Schema
-- Description: Creates the ClusterDefinitions table with the correct schema if it does not already exist.
-- If the table exists but has an incorrect schema (e.g., missing 'clusterId' or other columns),
-- this migration alone will NOT fix the existing table. Manual intervention (e.g., ALTER TABLE
-- or dropping and recreating the table, potentially with data migration) would be required
-- in such cases to align the existing table with this canonical schema.

CREATE TABLE IF NOT EXISTS ClusterDefinitions (
    clusterId TEXT PRIMARY KEY NOT NULL,
    earthquakeIds TEXT,                     -- JSON string array of earthquake event IDs belonging to this cluster
    strongestQuakeId TEXT,                  -- The event ID of the strongest earthquake defining this cluster
    createdAt TEXT DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), -- Explicit default for D1 compatibility
    updatedAt TEXT DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'))  -- Explicit default for D1 compatibility
);

-- Trigger to automatically update updatedAt timestamp on row updates
-- Note: Trigger names should be unique within the database.
CREATE TRIGGER IF NOT EXISTS trg_ClusterDefinitions_UpdatedAt_Timestamp
AFTER UPDATE ON ClusterDefinitions
FOR EACH ROW
WHEN OLD.updatedAt = NEW.updatedAt OR OLD.updatedAt IS NULL -- Avoid infinite loop if updatedAt is set manually
BEGIN
    UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE clusterId = OLD.clusterId;
END;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_strongestQuakeId ON ClusterDefinitions(strongestQuakeId);
CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_updatedAt ON ClusterDefinitions(updatedAt);
