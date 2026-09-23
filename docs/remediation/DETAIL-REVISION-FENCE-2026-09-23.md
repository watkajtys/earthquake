# Detail revision guard — local follow-up, 2026-09-23 UTC

The source-revision branch guards summary-feed upserts, but the shared detail persistence helper also writes earthquake time, coordinates, magnitude and place. Previously, a delayed detail fetch could replace a newer summary without changing `source_updated_at_ms`. The next feed with that same revision would then be rejected as an equal-clock conflict.

This separate follow-up makes the detail helper check its validated USGS `properties.updated` before enqueueing or storing the archive. Its D1 upsert records that revision and updates an existing row only for a newer revision, a legacy null revision, or an equal revision whose summary fields match. The SQL predicate remains authoritative if a newer summary arrives after the preflight read. A guarded no-op is read back and treated as incomplete, leaving the backfill row eligible for retry.

The actual backfill-handler tests cover stale detail, equal-clock conflict, an equal revision with matching fields, a newer detail, and a concurrent summary write after preflight. Local verification passed: 1,547 tests across 125 files with three skips, build, changed-file ESLint and diff checks.

## Rollout boundary

- This code requires additive migration `0019_add_earthquake_source_revision.sql` before deployment. The nullable column is compatible with the old Worker while only the schema is changed. The migration and this code have not been applied to production.
- An old Worker invocation that remains active after the guarded code starts can still write summary fields without respecting `source_updated_at_ms`. Drain or otherwise exclude old scheduled/detail writers during cutover, and verify the active Worker version afterward. Rolling back to old writer code while retaining fenced data has the same risk.
- The legacy queue consumer still writes mutable `<event-id>.json` R2 keys without a revision check. An already queued older detail, or one queued just before a newer summary wins, can still replace that archive object. This change protects D1 scientific fields; it does not make D1, Queue, KV checkpoints and R2 publication atomic. A revisioned immutable archive/pointer or equivalent fenced consumer remains separate work.
- A later summary revision can advance the scientific fields while leaving product flags and `detail_fetched` from an older detail revision. This patch prevents detail writes from moving science backwards; it does not establish revision-specific completeness of detail metadata or schedule every later revision for enrichment.
- Historical rows retain null revisions until a validated source observation seeds them. This patch does not infer or repair historical revisions.
