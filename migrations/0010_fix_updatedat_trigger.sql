DROP TRIGGER IF EXISTS trg_ClusterDefinitions_AutoUpdate_UpdatedAt;
CREATE TRIGGER trg_ClusterDefinitions_AutoUpdate_UpdatedAt
AFTER UPDATE ON ClusterDefinitions
FOR EACH ROW
BEGIN
    UPDATE ClusterDefinitions SET updatedAt = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE id = OLD.id;
END;