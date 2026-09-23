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
  `completed_with_rejections`, not a clean list source.
- After a transient batch failure the cursor stays before that batch. The run
  retains its immutable input and retries with bounded exponential delay and
  jitter. Six failures park it for operator review. A new invocation resumes
  the pending source before fetching possibly changed upstream data. At most
  three 90-event batches are attempted per invocation, across recovered and
  new runs. A genuine large source can therefore take multiple schedules.
- Run completion and D1's feed checkpoint change together. Successful gated
  responses resolve `completed_run_id` through D1 to the immutable, checksummed
  R2 source and recheck the pointer after reading and classification. The mutable legacy KV
  feature-array key is neither read nor written on this path; it remains for
  older binaries and rollback. Response fields `newOrUpdatedFeatures`,
  `fullGeoJson` and `ingestion` remain on successful calls; incomplete calls
  return HTTP 503 so list generation does not treat partial work as complete.
- The scheduled legacy day/week/month R2 arrays retain their public shape.
  Before publication, all three existing objects are read and validated. Each
  event merge keeps the higher trusted `properties.updated` revision; equal
  revisions retain stored science and timestamps. A sparse D1 bootstrap row
  carries an additive `source_updated_at_ms` scalar when known, so older source
  data cannot overwrite a newer D1 row if an R2 list is missing. Each list is
  written with its R2 ETag or conditional create, and a lost write rereads,
  remerges and retries at most twice. A fresh window cutoff is used on each
  attempt. The three arrays remain separate R2 objects, not one transaction.

## Isolated migration rehearsal

The earlier private, read-only production export restore was copied to
`/private/tmp/earthquake-durable-ingestion-0022-rehearsal-v2.sqlite3`. Its source
SHA-256 was `e65b43c059a0194bc9388fc7a499370b21ad18ef0ca87012a7e453e396fdd787`.
That restore predates migration 0021, so the **copy only** received 0021 and
then 0022 (`0022` SHA-256
`4aa9a6a5b081f6de4c58d1ff26ab5c7b22606ac2fd9eb124428d99252da3062c`).
`PRAGMA integrity_check` returned `ok`, `PRAGMA foreign_key_check` had no rows,
and all three new ingestion tables were empty. EarthquakeEvents remained at
190,126 rows and ClusterDefinitions at 45,393 before and after. The unused KV
publication marker is absent from 0022. The final
isolated copy SHA-256 was
`eab1fbb136fadc11fcf741bf46429edf67365473119a4d59743bd283247ad8d3`.
This is an offline schema/data preservation rehearsal, not an execution on
Cloudflare D1.

## Release limits and remaining work

- The rollout flag must stay off until 0022 is applied to an isolated preview,
  actual Worker D1 transaction and R2 replay behavior are exercised, and a
  production backup/recovery point is captured. Do not apply this candidate
  against production merely because its code is packaged.
- An older Worker binary still has unconditional R2 list writes and mutable KV
  writes. Pause the five-minute cron or otherwise drain old scheduled
  invocations before enabling this candidate; a new CAS writer cannot fence an
  old writer that ignores CAS. The gated path ignores a late legacy KV value,
  as an actual-handler/list test demonstrates. The new path does not update the
  approximate `earthquake_stats` KV increment; authoritative D1 stats are a
  separate remediation stage.
- The existing due-detail selection remains in place; per-event detail jobs
  are not created atomically by these new summary batches. That belongs to
  the detail outbox integration stage. Stored source objects are retained for
  replay and audit. An orphan collector must check D1 references and age
  before deleting objects; until then, no automatic deletion is attempted.
- Preview/production migration history and bindings must be checked at the
  rollout point. Verify R2 conditional behavior and at least two canary
  scheduled cycles before enabling this for routine production traffic. A
  multi-period atomic list generation and historical coverage repair remain
  separate work.
