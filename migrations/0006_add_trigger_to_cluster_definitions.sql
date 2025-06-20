-- Migration 0006: Add updatedAt Trigger to ClusterDefinitions
-- Description: Adds a trigger to automatically update the updatedAt timestamp
--              on rows in the ClusterDefinitions table when they are updated.

CREATE TRIGGER IF NOT EXISTS trg_ClusterDefinitions_AutoUpdate_UpdatedAt
AFTER UPDATE ON ClusterDefinitions
FOR EACH ROW
BEGIN
    UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE clusterId = OLD.clusterId;
END;
