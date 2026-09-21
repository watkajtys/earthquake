# Remediation stopping point — 2026-09-21 UTC

This is the current handoff for resuming work. The original numbered briefs describe the broader plan; [RELEASE-LEDGER.md](RELEASE-LEDGER.md) records observed results, limitations and recovery procedures. Historical status paragraphs in that ledger describe their own release, not necessarily the latest state.

## Safe place to pause

The complete period-feed producer and consumer block is finished, committed, pushed and production-verified. There is no pending deployment or partially applied database migration. Temporary verification servers/tails were stopped and agent-created browser tabs closed. Production's normal scheduled jobs continue without this session. No ongoing agent monitoring is configured.

Last verified application revision: `8e488e374f4cb176175b7e0e3441c9a5e59555ed` on production `main`.

Last verified Worker version: `efd09f93-6a07-4c02-b756-b7af8c922171`.

Working branch: `codex/complete-period-feeds`. Release evidence was saved in documentation commit `e81c16f`; subsequent handoff-only commits do not change the deployed application. The tree was clean before this handoff edit. Recheck local/remote state and production identity when resuming; these are recorded observations, not a live monitor.

## Shipped and verified

- **Release controls:** established the repository-to-site relationship, corrected Cloudflare's automatic deploy command, disabled non-production branch Builds, and added guarded tests, resource/configuration readback and exact deployment identity checks.
- **Endpoint and writer foundations:** protected maintenance/mutation routes, restricted and bounded upstream requests, repaired several persistence/checkpoint/retry paths, propagated background failures, and removed unsafe tooltip HTML handling. Broader concurrency and historical integrity work remains below.
- **Frontend correctness:** repaired detail URL resolution, desktop/mobile layouts, refresh/cancellation and monthly retries, correction handling, pagination, keyboard/focus behavior and crawler metadata.
- **Cluster containment and delivery:** stopped destructive identity replacement and version-string growth in the repaired writer path, added a lookup index, used stored card counts, and introduced compact paginated summaries with full members loaded on detail. Small earthquakes remain members; the existing Overview eligibility threshold was not changed.
- **Complete period feeds:** published validated day/week/month USGS snapshots with source-based freshness, conditional requests, bounded fallback and last-good retention. Healthy snapshots avoid the former second full upstream download. Static routes render independently of feed initialization; desktop Learn visibility was also fixed.
- **Compatibility:** archived and verified predecessor assets for these releases so previously opened clients can load their retained chunks. General retention automation remains open.

Latest release evidence: **1,512 tests passed across 124 files, three skips**; build/packaging and preview passed; production passed **97 GET checks and 65 asset checks per host**. Both public identities and fresh feed GET/304/HEAD behavior matched. Desktop/mobile browser flows passed. The final version's real five-minute job at **06:15:15 UTC** published all three feeds successfully with no exceptions. The daily scheduled job remains unobserved. Test exclusions and other validation limits are recorded in the ledger.

## Remaining work, in recommended order

1. **Rolling-window reconciliation edge case.** The browser keeps only the latest complete absence evidence per period. When a newer day's lower boundary advances, discarded evidence can allow a late, older overlapping weekly response to reintroduce an absent event. This is the next small correctness block.
2. **Database integrity and historical repair.** Reconcile schema/migration history, duplicate cluster identities, mixed timestamps and historical version data. Strengthen concurrent-writer coordination, revision fencing, durable retry/outbox behavior and publication consistency. Prepare a fresh backup, restore rehearsal and dry-run repair manifest before historical mutations. Earlier containment and the lookup index do not close this package.
3. **Rendering and delivery performance.** Bound large cluster detail rows, map markers and chart work; optimize globe/fault assets and route loading; remove upstream detail fan-out from sitemap requests. Preserve full-data statistics when reducing visual work.
4. **Operational maintenance.** Clean up abandoned/deferred R2 objects safely, automate predecessor-asset retention, decide legacy payload retirement, address dependency/lint/test debt, and verify the daily job during a later observation window.

Complete browser feeds do not establish historical D1 completeness or canonical scientific cluster identity. No production historical repair was performed. No measured CWV, latency-percentile or billing improvement is claimed.

## Resume the next bounded block

Read `src/contexts/earthquakeRevisionState.js`, its tests, the feed service/provider integration, and [PERIOD-FEEDS.md](PERIOD-FEEDS.md). Reproduce the rolling-boundary failure with a deterministic sequence: complete absence evidence, an advancing window, then a late older overlapping response. Preserve legitimate newer corrections/reappearances and independent period refreshes.

Design bounded absence-proof history with an explicit rule rejecting responses older than retained evidence, or equivalent interval coalescing. Simply capping history and discarding proofs can recreate the bug. Test boundary times, reordered completion, empty authoritative feeds, newer revisions and memory bounds. Keep database repair and rendering optimization out of this change.

Then follow the existing focused release workflow: targeted regressions, full suite, packaging, isolated preview, browser checks and guarded production promotion. Before a frontend release changes asset hashes, archive and verify its immediate predecessor graph. Record exact revisions, runtime evidence and recovery in the ledger.

Do not redeploy merely to publish this handoff. The compatible prior producer version `9da2ca77-d977-452d-af4f-1292ca748f28` is documented for browser recovery; revalidate suitability before using it. Code rollback does not restore database contents and must not undo writer containment or move feed pointers backward.
