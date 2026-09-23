# Durable trusted USGS ingestion foundation — 2026-09-23 UTC

Status: **local candidate only; rollout gate off.** The original foundation
started at deployed `f5f4341`; the current integration branch rebases its
commits on deployed `5f51d0b`. It adds no public mutation route and changes no
production or historical row. `handleTrustedUsgsIngestion` takes the durable
path only when the server environment sets `DURABLE_INGESTION_ENABLED=true`
after migration 0022. The deployed writer remains the default.

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

## Dedicated preview verification

The preview-only rehearsal used Worker `earthquake-reconcile-preview`, D1
`b027cfcd-bee0-4d5e-adf5-9505c3a8626d`, and its same-named R2 bucket. It
replaced the already verified lazy-detail preview version
`4a2b7756-c2ed-4509-885e-cc846f82a789` after coordination. Preview has no
scheduled cron and no `DURABLE_INGESTION_ENABLED` variable or secret; this
rehearsal did **not** turn on durable ingestion.

Before the remote migration, `d1 export --env preview --remote` saved a
13,270-byte SQL backup at
`/private/tmp/earthquake-preview-0022-20260923T0849Z/pre-0022.sql` (mode 0600
inside a mode-0700 directory), SHA-256
`1e1af89155d500b1e9a246888b1be642c85b85e7422971926eb1eae9c0abdad7`.
Its isolated SQLite restore passed integrity and foreign-key checks, retained
four synthetic earthquake rows and two synthetic cluster rows, and ended at
0021. Applying the exact 0022 file to a copy of that restore retained those
counts and created three empty ingestion tables.

Only 0022 was pending remotely. It was applied to the dedicated preview D1 at
2026-09-23 08:50:38 UTC; readback found no pending migrations, the same four
earthquake and two cluster rows, zero detail jobs, three empty ingestion
tables, and no obsolete KV publication column. Remote `foreign_key_check`
returned no rows. The D1 API denied remote `integrity_check` with
`SQLITE_AUTH`; the exported restore passed that check locally.

The clean code tip `56d35c3694482e2e58c2bc4b0bd5d143cfa08fcc` was deployed
only to that preview Worker as version
`d4a2dd27-a756-45a2-b5ac-be6b962684a2` (script ETag
`8aeccbb9ffabb2de735b63aec8f30a1eeebb24a2339913da1e25648682d0caf1`).
Version readback showed the dedicated D1/R2/KV/queue bindings and no rollout
flag; deployment readback showed this version at 100%. An initial GET smoke
found stale synthetic period snapshots, so the existing guarded preview seed
refreshed only synthetic fixtures and verified R2 conditional create and stale
ETag rejection. The GET-only smoke then passed **199 requests / 167 built
assets**, including fresh day/week/month feeds and stored quake/cluster routes.

`scripts/verify-durable-preview.mjs --remote` uses a frozen temporary config
with only the dedicated preview D1/R2 bindings. Against remote D1, a failing
two-statement batch rolled back the first insert; concurrent conditional lease
claims had exactly one winner. Against remote R2, overlapping calls to the
actual list handler lost a conditional write, reread, and retained the newer
event revision in day, week, and month. The script restored the original
synthetic list arrays and deleted its temporary D1 lease row; final readback
found all three ingestion tables empty. Final GET smoke again passed **199
requests / 167 built assets**. No Git remote or production resource changed.

## Release limits and remaining work

- The integrated production config sets `LIST_PUBLICATION_PAUSED=true` and
  leaves durable ingestion disabled. Its release wrapper refuses an unpaused
  config and verifies the pause binding in the uploaded version. The scheduled
  five-minute task still ingests hourly data and publishes the independent
  complete period feeds; `list-day/week/month.json` stop refreshing while
  paused. A missing environment/pause binding also stops list writes. The
  paused Cron logs its revision, version ID and scheduled time for drain
  evidence. This integration has only local validation until preview is free.
- Before any later unpause, read back the exact paused version at 100%, observe
  a five-minute paused execution for that version, and establish that no old
  unconditional list invocation can remain. Cloudflare bounds a Cron
  invocation to 15 minutes; the waiting period begins after the last possible
  old-version dispatch, not merely after upload. The current release wrapper
  deliberately rejects activation; a separate reviewed gate must encode and
  verify this evidence together with migration 0022 before switching both
  `LIST_PUBLICATION_PAUSED=false` and `DURABLE_INGESTION_ENABLED=true`.
- Archive and verify the complete deployed predecessor asset graph before
  uploading the paused release. The production release wrapper now invokes
  the GET-only predecessor archive verifier before its upload. It cannot
  create missing archive objects on the release path.
- The rollout flag must stay off until actual scheduled Worker replay under
  the gate is exercised in isolated preview and a production backup/recovery
  point is captured. The preview proof above validates remote D1/R2
  transaction and conditional primitives with synthetic fixtures; it does not
  invoke the gated USGS handler. Do not apply this candidate against production
  merely because its code is packaged.
- An older Worker binary still has unconditional R2 list writes and mutable KV
  writes. The paused release drains those invocations while keeping all four
  production crons configured; a new CAS writer cannot fence an old writer
  that ignores CAS. The gated path ignores a late legacy KV value,
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
