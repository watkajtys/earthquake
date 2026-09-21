# Cluster integrity containment and summary rendering

Execution plan for the group following production revision `33cae393b203839fe184966c1a4d487f281a0d63`. This document states the plan; actual completion and deployment evidence belong in `RELEASE-LEDGER.md`.

## Scope and order

1. **Contain cluster writer damage.** Preserve the existing ID, slug, creation time and legacy version bytes when processing an existing stable key. Stop string-version increments. Replace destructive replacement inserts with collision handling that resolves the already-stored canonical identity and rejects unrelated ID/slug conflicts. Initialize creation time for genuinely new rows. Fail the scheduled publication when persistence fails so an incomplete pass cannot replace the previous cache.
2. **Render stored summaries.** Overview cards must use the stored count, magnitude, time range, identity and location independently of week/month membership available in the browser. Remove membership reconstruction, bound initially rendered cards, and load more on demand. Disable cluster requests on static routes while retaining refresh/retry when the overview needs them. Keep existing API compatibility; this slice makes no claim to reduce the legacy API payload.
3. **Restore the missing lookup index only if fresh evidence permits.** Read production schema, migration history and query plans. Reproduce the current selector on a production-equivalent SQLite fixture. An additive index must preserve row contents, ordering and URL resolution, have an explicit forward migration identity and be tested on isolated preview before production. Do not replay historical migrations or change triggers in this slice.
4. **Validate and release.** Run targeted regressions, full tests and production packaging. Verify two cluster-processing cycles against isolated fixtures, failure retention, existing links, summary totals under changing feeds, bounded card rendering and static-route behavior. Deploy the frozen candidate to dedicated preview, smoke and browser-check it, then publish through the established gated main-branch release. Verify both public hosts and observe the actual ten-minute cluster job.

## Delegation and integration

- Database owner: cluster persistence helper, background cluster writer and related tests.
- Frontend owner: summary consumption, card bounds, route polling and related tests.
- Independent reviewer: schema/index/recovery evidence and writer race review.
- Coordinator: fresh remote preflight, shared contracts, migration decision, integration, preview, production and release ledger.

All agents use the shared checkout. Only the coordinator performs remote mutations, Git promotion or deployment. Review shared boundaries before integration.

## Explicit remaining work

This group does not deduplicate historical clusters, reinterpret corrupted version strings, invent missing historical creation times, alter the stable-key algorithm, remove triggers, establish durable numeric revisions, or change the publication-generation protocol. Historical repair requires a fresh backup, a tested restore path and a reviewed dry-run manifest. Large membership payloads, complete feed snapshots, maps/assets and sitemap generation remain subsequent work.

## Recovery

Writer containment must remain enabled when reverting a frontend regression. A Worker rollback does not restore data. An added index does not require reverting row contents and can remain with the previous compatible application. Record the exact previous/new Worker version and any applied SQL checksum in the release ledger. Preserve original cluster rows and links throughout the group.
