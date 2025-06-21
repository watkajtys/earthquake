-- Migration 0005: Add Indexes to ClusterDefinitions Table
-- Description: Adds indexes on strongestQuakeId and updatedAt columns of the ClusterDefinitions table.

CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_strongestQuakeId ON ClusterDefinitions(strongestQuakeId);
CREATE INDEX IF NOT EXISTS idx_ClusterDefinitions_updatedAt ON ClusterDefinitions(updatedAt);
