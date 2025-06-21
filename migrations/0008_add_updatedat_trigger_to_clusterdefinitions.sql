-- Migration to add updatedAt trigger to ClusterDefinitions table

-- Optional: Trigger to automatically update `updatedAt` timestamp on row modification.
-- This might need to be adapted based on D1's exact SQL dialect for triggers.
DROP TRIGGER IF EXISTS trg_ClusterDefinitions_AutoUpdate_UpdatedAt;
CREATE TRIGGER trg_ClusterDefinitions_AutoUpdate_UpdatedAt
AFTER UPDATE ON ClusterDefinitions
FOR EACH ROW
BEGIN
    UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE id = OLD.id;
END;
