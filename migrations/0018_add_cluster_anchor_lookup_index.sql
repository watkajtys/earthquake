-- Additive bridge for the existing legacy timestamp selector. This does not
-- normalize timestamps, repair revisions, or alter cluster rows/triggers.
CREATE INDEX IF NOT EXISTS idx_clusterdefinitions_anchor_updated_id_legacy
ON ClusterDefinitions(strongestQuakeId, updatedAt DESC, id ASC);
