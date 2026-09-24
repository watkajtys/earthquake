# Current handoff — 2026-09-24 UTC

The recurring missing-record repair is **complete and verified in production**.
Its first automatic run repaired 55 missing records. Independent readback found
zero missing IDs in both that 10,729-event source and a subsequent 10,731-event
source, including all 50 gaps from the initial audit. Verification finished
at 03:57 UTC. Temporary monitoring is stopped; no session-owned monitor remains.

## What is live

- Application revision: `d762a03cb7feeb22a99fdfbcc57818873db481ff`.
- Worker version: `9d2f20f2-44cb-430e-92b0-4eb1a132975e`.
- Deployed at 03:45:11 UTC through [guarded build dc1a53f9](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/dc1a53f9-606c-4062-bf60-115d952f6ce2), which passed at 03:46:12 UTC.
- Both public hosts return the exact revision/version. The expected bindings
  and new five-minute schedule were independently read back.

The hourly ingestion window was missing older events added or revised later.
A separate scheduled job now checks the existing complete 30-day snapshot and
inserts absent IDs. It adds no USGS requests and changes no existing earthquake
rows. The map's complete feeds, hourly writer, and public publisher keep their
existing behavior. No migration, new service binding, or publisher sidecars
were needed. See [MONTH-COVERAGE.md](MONTH-COVERAGE.md) for the bounded algorithm
and read-only progress query.

The operational target is presence within 15 minutes at the current feed size
when publication and storage are healthy. Larger sources resume across bounded
passes; outages extend this window. The observed first production run used
18 batches, 223 ms CPU and 9.126 seconds wall time, completing a source about
2.8 minutes old. Transient failures retry without a permanent six-failure stop.

## Validation

- Guarded production suite: **1,740 tests passed, 3 skipped, 133 files**; build
  and packaging passed. Preview and each public host passed 325 GET checks /
  293 retained assets.
- Fresh production SQL backup and Time Travel receipts were saved before
  activation. The isolated restore passed integrity and foreign-key checks.
  Rehearsal inserted all 50 initial gaps and preserved the full-row hash of all
  **191,101 existing earthquake records**.
- Real Cloudflare probes completed four 30,000-event fixtures, including a
  17,728,238-byte source, in two passes. Existing newer and unknown revisions
  remained unchanged. The temporary Worker, test tables, and secret were removed;
  all R2 objects were retained.
- Failure tests cover atomic rollback, eight successive outages and recovery,
  pointer rollover, checksum failures, overlapping/expired owners, UTF-8 byte
  bounds, and empty sources. Independent review found no remaining blocker.
- Private evidence: `.reconciliation.local/coverage-current/`. The first
  verified production run is `month-coverage:42525af4-683f-43ab-a2d1-cab04abe0635`.
- A separate fresh audit found zero missing IDs in all current day/week/month
  feeds (264 / 2,175 / 10,729 IDs). At 03:57 UTC, a second automatic run finished
  a newer 10,731-event source in 9.187 seconds with zero exceptions. Independent
  receipt/source checks and SELECTs proved zero missing IDs and advancement
  beyond the first verified run. No manual production backfill was used.

## Archive policy

**Preserve all R2 archives.** This includes full feed generations, detail
archives, retained frontend assets, reconciliation receipts, and staged
sidecars/shards. An object becoming unreferenced does not authorize deletion.
Do not introduce cleanup or committed-object expiration rules.

The preceding archive-preservation release, `eb46fe7` / Worker
`bbf6ad59-da33-4adc-93db-19151479fea8`, remains the compatible application base.
Its publisher no longer deletes superseded complete snapshots. The current
repair retains that fix and adds no deletion path. A reviewed forward release
can disable the repair flag and its schedule together without reverting data
or archive retention. Never restore an old database export over ongoing writes
as a code rollback.

## Boundaries and stopping point

This work establishes ongoing current-window **ID coverage**. It does not make
existing scientific revisions current, scan every intermediate historical
snapshot, repair older-than-month history, rebuild legacy public lists, or
rewrite historical clusters. SEO/indexing recovery is not established by this
release. Those remain separate work, not an automatic continuation queue.

The project root is on `codex/month-coverage-repair`. Earlier experimental
branches and worktrees are preserved; their code is not implicitly deployed.
Use this file for current scope, [RELEASE-LEDGER.md](RELEASE-LEDGER.md) for release
evidence, and [USGS-COVERAGE-REPAIR-2026-09-23.md](USGS-COVERAGE-REPAIR-2026-09-23.md)
for the older one-time repair. **Stop here.** The ongoing scheduled repair is
normal application behavior. Start separate follow-up work only on a new request.
