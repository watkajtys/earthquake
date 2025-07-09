-- Migration: Add stableKey to ClusterDefinitions
-- Reason: To provide a stable identifier for clusters that can persist across updates,
-- enabling more stable URLs and better SEO.

-- Add the new column 'stableKey' to the ClusterDefinitions table.
-- It's made TEXT and will store the generated stable key.
ALTER TABLE ClusterDefinitions ADD COLUMN stableKey TEXT;

-- Create an index on the stableKey column for faster lookups.
-- This index is beneficial even with the unique index, particularly if not all queries
-- are strictly for unique key lookup (though in our case, they mostly will be).
CREATE INDEX IF NOT EXISTS idx_clusterdefinitions_stablekey ON ClusterDefinitions(stableKey);

-- Add a UNIQUE index on stableKey. This also serves as a constraint.
-- Using CREATE UNIQUE INDEX is generally preferred in SQLite for adding unique constraints after table creation
-- and is well-supported in D1. This will enforce that all non-NULL values in stableKey are unique.
-- If an INSERT or UPDATE attempts to create a duplicate non-NULL stableKey, it will fail.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_clusterdefinitions_stablekey ON ClusterDefinitions(stableKey);

-- Note on backfilling:
-- Backfilling existing rows with a placeholder or generated stableKey (e.g., from existing slug components)
-- is a separate, complex task. For this migration, we focus on enabling the new system.
-- Existing rows will have NULL for stableKey. The application logic in
-- storeClusterDefinitionsInBackground queries for stableKey; NULLs won't match,
-- so an "old" cluster, if re-processed, would be treated as "new" under this system
-- and get a proper stableKey and potentially a new slug (if its old slug was random-based).
-- This is an acceptable path for rollout. A dedicated backfill script could later
-- attempt to generate stableKeys for old records if desired, but requires careful validation.
