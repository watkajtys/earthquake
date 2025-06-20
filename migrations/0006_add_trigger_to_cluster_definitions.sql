-- Migration 0006: Add updatedAt Trigger to ClusterDefinitions (Attempt 2)
-- Description: Adds a trigger to automatically update the updatedAt timestamp.
-- Includes DROP TRIGGER IF EXISTS to ensure clean application if trigger exists from prior attempt.

DROP TRIGGER IF EXISTS trg_ClusterDefinitions_AutoUpdate_UpdatedAt;

CREATE TRIGGER trg_ClusterDefinitions_AutoUpdate_UpdatedAt
AFTER UPDATE ON ClusterDefinitions
FOR EACH ROW
BEGIN
    UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE clusterId = OLD.clusterId;
END;
