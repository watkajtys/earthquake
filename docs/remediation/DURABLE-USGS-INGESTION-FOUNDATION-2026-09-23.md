# Durable trusted USGS ingestion foundation — 2026-09-23 UTC

Status: **local candidate only; rollout gate off.** This branch starts at deployed
`f5f4341`. It adds no public mutation route and changes no production, preview,
or historical row. `handleTrustedUsgsIngestion` takes this path only when the
server environment sets `DURABLE_INGESTION_ENABLED=true` after migration 0022.
The current deployed writer remains the default.

## Progress and replay contract

- The trusted scheduled/import caller still uses the allowlisted USGS summary
  helper. The gated path additionally requires a safe source generation clock
  and matching metadata count. It serializes the validated source once into an
  immutable R2 object, at most 16 MiB, under `trusted-usgs-ingestion/v1/`.
  D1 stores its key, SHA-256, byte count, feature count, generation clock and
  deterministic ID-sorted cursor. A failed D1 run registration may leave only
  an unreferenced staged object; it cannot advance progress.
- `UsgsIngestionState` is the per-feed authority. A conditional lease advances
  a monotonically increasing fence. Each D1 transactional event batch checks
  that fence and active run, then advances the cursor in the same batch. The
  existing per-event upstream revision guard still prevents a delayed or
  overlapping feed from overwriting newer scientific fields. Equal revision
  conflicts are recorded in `UsgsIngestionIssues` and produce
  `completed_with_rejections`, not a clean KV checkpoint.
- After a transient batch failure the cursor stays before that batch. The run
  retains its immutable input and retries with bounded exponential delay and
  jitter. Six failures park it for operator review. A new invocation resumes
  the pending source before fetching possibly changed upstream data. At most
  three 90-event batches are attempted per invocation, across recovered and
  new runs. A genuine large source can therefore take multiple schedules.
- Run completion and D1's feed checkpoint change together. The legacy KV
  feature-array key is written only afterward and remains a derived cache.
  A failed KV write leaves the D1 completion available for the next invocation
  to republish. Response fields `newOrUpdatedFeatures`, `fullGeoJson` and
  `ingestion` remain on successful calls; incomplete calls return HTTP 503 so
  list generation does not treat partial work as complete.

## Isolated migration rehearsal

The earlier private, read-only production export restore was copied to
`/private/tmp/earthquake-durable-ingestion-0022-rehearsal.sqlite3`. Its source
SHA-256 was `e65b43c059a0194bc9388fc7a499370b21ad18ef0ca87012a7e453e396fdd787`.
That restore predates migration 0021, so the **copy only** received 0021 and
then 0022 (`0022` SHA-256
`00a311d86ef101f1ccdec56412355d6a9efd4a9274c61ad2d9a02d3616c5759f`).
`PRAGMA integrity_check` returned `ok`, `PRAGMA foreign_key_check` had no rows,
and all three new ingestion tables were empty. EarthquakeEvents remained at
190,126 rows and ClusterDefinitions at 45,393 before and after. The final
isolated copy SHA-256 was
`dfacbb6275a362760afe82a64a2825fd3fe90e13605cf3c3d4de7a72357467eb`.
This is an offline schema/data preservation rehearsal, not an execution on
Cloudflare D1.

## Release limits and remaining work

- The rollout flag must stay off until 0022 is applied to an isolated preview,
  actual Worker D1 transaction and R2 replay behavior are exercised, and a
  production backup/recovery point is captured. Do not apply this candidate
  against production merely because its code is packaged.
- The old KV checkpoint and public list writer have no cross-service CAS. A
  KV write delayed beyond the D1 lease could arrive after a newer run; D1
  progress and earthquake scientific fields remain fenced, while derived KV
  and list ordering still need generation-aware publication. The actual-handler
  regression `characterizes a KV rollback when an old write finishes after
  lease expiry` pauses the old KV write, expires its lease, completes a newer
  run, then lets the old write land. It verifies the D1 checkpoint stays on the
  newer run while the KV feature array regresses. **This blocks enabling the
  rollout flag**, even after 0022 is applied, until the derived cache and list
  publication are fenced. The new path
  also does not update the approximate `earthquake_stats` KV increment;
  authoritative D1 stats are a separate remediation stage.
- The existing due-detail selection remains in place; per-event detail jobs
  are not created atomically by these new summary batches. That belongs to
  the detail outbox integration stage. Stored source objects are retained for
  replay and audit. An orphan collector must check D1 references and age
  before deleting objects; until then, no automatic deletion is attempted.
- Preview/production migration history and bindings must be checked at the
  rollout point. Rolling deployment overlap with a previous binary can still
  write the legacy KV cache; arrange a guarded canary and verify at least two
  scheduled cycles before enabling this for routine production traffic.
