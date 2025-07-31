-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trg_ClusterDefinitions_AutoUpdate_UpdatedAt;
DROP TRIGGER IF EXISTS trg_ClusterDefinitions_AutoInsert_UpdatedAt;

-- Trigger to automatically update `updatedAt` timestamp on row UPDATE
CREATE TRIGGER trg_ClusterDefinitions_AutoUpdate_UpdatedAt
AFTER UPDATE ON ClusterDefinitions
FOR EACH ROW
BEGIN
    -- Update the `updatedAt` timestamp to the current time for the affected row
    UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE id = OLD.id;
END;

-- Trigger to automatically set `updatedAt` timestamp on row INSERT
CREATE TRIGGER trg_ClusterDefinitions_AutoInsert_UpdatedAt
AFTER INSERT ON ClusterDefinitions
FOR EACH ROW
BEGIN
    -- Set the `updatedAt` timestamp to the current time for the newly inserted row
    UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE id = NEW.id;
END;