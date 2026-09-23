# SEO successor for paused durable ingestion — 2026-09-23 UTC

Status: **local integration only; production ingestion gate off.** The isolated
`codex/durable-0022-seo-integration` branch starts at SEO candidate
`8925122674c54d0ff285baa8306d2809e9f89fc8`, which descends from the
axis/feed candidate `c282b99465b476d63047e871dbc011acf67e8843`. It
integrates the additive 0022 D1 schema, immutable R2 source snapshots,
fenced run progress, per-revision R2 list publication, and the paused
production list writer. The SEO detail metadata and crawler behavior remain
from the SEO candidate. The separate c282-based durable worktree is intact.

The SEO branch already contained the same predecessor archive verifier and
252-path manifest as the c282-based durable branch, so those commits were not
cherry-picked a second time. One smoke-test conflict was resolved using the
actual retained manifest size rather than a fixed count. No production
Worker, D1, R2, Git remote, backup, or migration was changed for this
integration. The dedicated preview remained in use for SEO browser checks and
was not touched by this branch.

## Exact predecessor graph

An isolated build of exact SEO commit `8925122` using the pinned lockfile
produced 26 JS/CSS assets totaling 6,026,614 bytes. Its six paths already in
the inherited 252-path manifest matched by SHA-256 and byte length. The other
20 files add 2,441,227 bytes. The staged successor graph is **272 paths and
40,776,284 bytes**. All 252 inherited local objects were rechecked against
their manifest checksums. The existing 280-file and 100 MiB caps accommodate
the graph, leaving eight file slots. The exact per-path comparison is in
`/private/tmp/earthquake-seo-8925122-asset-rebuild-20260923/asset-graph-comparison.json`.

This is a candidate predecessor graph until `8925122` is actually deployed.
Before a later production upload, read back the sole deployed version,
revision, HTML and import graph. If they differ, restage from the actual live
bytes. Create-only archive any newly required objects, then let the
production wrapper verify all mapped R2 objects by metadata and checksum
before uploading a Worker. The 272-path union is local; it has not been
uploaded to production R2.

## Local verification

- The migration bytes match the c282-based integration; SHA-256 is
  `4aa9a6a5b081f6de4c58d1ff26ab5c7b22606ac2fd9eb124428d99252da3062c`.
- Focused actual-handler, list overlap, scheduled, period-feed and release
  tests passed: 124/124 across six files.
- The 272-path staged union passed independent SHA-256/length readback;
  staging/archive tests passed 24/24 and deployment smoke tests 18/18.
- The full suite passed **1,694 tests, three skipped, across 130 files**.
  `npm run build` and `npm run check:deploy` passed; Wrangler's production
  dry run showed `LIST_PUBLICATION_PAUSED=true` and no durable activation
  binding. Lint on every changed JavaScript file passed. Repository-wide lint
  still reports 40 errors in unchanged files.
- The c282-based dedicated preview previously ran the flagged synthetic
  scheduled handler against preview D1/R2 and cleaned all fixtures. That
  evidence validates the shared durable code path, not an SEO-based preview
  deployment or a live Cloudflare Cron dispatch.

## Safe production order if the SEO candidate deploys first

1. If `8925122` is the deployed predecessor, verify it is the sole 100%
   production version and its live asset graph matches this 272-path
   candidate. A different deployed revision requires restaging from its
   actual live graph. Archive the 20 new paths using
   create-only writes and verify exact metadata and checksums. The production
   wrapper's GET-only predecessor archive gate must pass before upload.
2. Deploy this integration with `LIST_PUBLICATION_PAUSED=true` and no
   `DURABLE_INGESTION_ENABLED` binding. It may deploy before 0022: trusted
   hourly ingestion remains on the legacy D1/KV path, complete period-feed
   publication continues, and the three public list arrays retain their last
   published contents during the pause.
3. Read back the paused version at 100%, its exact revision and pause binding,
   and a five-minute scheduled milestone from that version. Determine the
   last possible old-version Cron dispatch and drain beyond Cloudflare's
   15-minute invocation wall-time bound from that point. Upload time alone is
   not the drain start. Leave lists paused if dispatch completion cannot be
   established.
4. **Immediately before any production 0022 schema change**, take a fresh
   full D1 export and Time Travel bookmark. Verify checksums, restore the
   export in isolation, check integrity, foreign keys, row counts and
   migration history, and rehearse this exact 0022 file on the restore. Apply
   0022 to production only after those checks pass, then read back migration
   history, existing counts and the three empty new tables.
5. A separately reviewed activation release must prove both old-writer drain
   and schema readback before setting `LIST_PUBLICATION_PAUSED=false` and
   `DURABLE_INGESTION_ENABLED=true`. Observe at least two scheduled cycles.
   The current release wrapper intentionally rejects activation. A rollback
   after activation must use a paused, compatible writer; an older
   unconditional list writer can regress public arrays. The three list keys
   are individually conditional writes, not one atomic transaction.

The fresh backup, bookmark, isolated restore, production migration and
activation remain future operations owned by the release operator.
