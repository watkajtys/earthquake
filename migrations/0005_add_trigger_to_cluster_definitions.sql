-- Create a trigger to update updatedAt on ClusterDefinitions row update
CREATE TRIGGER trigger_cluster_definitions_update_updatedAt
AFTER UPDATE ON ClusterDefinitions
FOR EACH ROW
BEGIN
    UPDATE ClusterDefinitions SET updatedAt = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
