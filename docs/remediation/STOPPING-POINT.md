# Remediation stopping point — 2026-09-23 UTC

This is the current handoff for resuming work. The original numbered briefs describe the broader plan; [RELEASE-LEDGER.md](RELEASE-LEDGER.md) records observed results, limitations and recovery procedures. Historical status paragraphs in that ledger describe their own release, not necessarily the latest state.

## Safe place to pause

The rolling-window browser reconciliation block is finished, committed, pushed and production-verified. The complete period-feed producer/consumer block remains in place. There is no pending deployment or partially applied database migration. Temporary browser tabs were closed, the viewport was reset, and the bounded production tail was stopped. Production's normal scheduled jobs continue without this session. No ongoing agent monitoring is configured.

Last verified application revision: `65abd594a15fbc896b0a8e625ce01531a997908b` on production `main`.

Last verified Worker version: `36303d5a-624f-4b4a-a997-dd8c2f165fa2`.

Working branch: `codex/complete-period-feeds`. The application commit is identical on this branch and production `main`; the later documentation-only commit records release evidence and does not change the deployed application. Recheck local/remote state and production identity when resuming; these are recorded observations, not a live monitor.

## Shipped and verified

- **Release controls:** established the repository-to-site relationship, corrected Cloudflare's automatic deploy command, disabled non-production branch Builds, and added guarded tests, resource/configuration readback and exact deployment identity checks.
- **Endpoint and writer foundations:** protected maintenance/mutation routes, restricted and bounded upstream requests, repaired several persistence/checkpoint/retry paths, propagated background failures, and removed unsafe tooltip HTML handling. Broader concurrency and historical integrity work remains below.
- **Frontend correctness:** repaired detail URL resolution, desktop/mobile layouts, refresh/cancellation and monthly retries, correction handling, pagination, keyboard/focus behavior and crawler metadata.
- **Cluster containment and delivery:** stopped destructive identity replacement and version-string growth in the repaired writer path, added a lookup index, used stored card counts, and introduced compact paginated summaries with full members loaded on detail. Small earthquakes remain members; the existing Overview eligibility threshold was not changed.
- **Complete period feeds:** published validated day/week/month USGS snapshots with source-based freshness, conditional requests, bounded fallback and last-good retention. Healthy snapshots avoid the former second full upstream download. Static routes render independently of feed initialization; desktop Learn visibility was also fixed.
- **Rolling-window reconciliation:** retained bounded complete-window absence proof across advancing day/week/month lower boundaries. Late older overlapping responses no longer resurrect an event from a discarded strip. Source identity, scientific revisions, corrected event times and equal-clock presence are handled separately; compacted history uses conservative admission floors.
- **Compatibility:** archived and verified predecessor assets for these releases so previously opened clients can load their retained chunks. General retention automation remains open.

Latest release evidence: **1,529 tests passed across 124 files, three skips**; build/packaging, isolated preview, and automatic production gate passed. Production passed **117 GET / 85 asset checks per host**. Independent readback matched both public identities, bindings and fresh feed GET/304/HEAD behavior. Desktop/mobile browser flows passed; one sampled 238-member cluster included 186 events below M2.5. The exact proof-order behavior is covered by deterministic tests and an independent 20,000-step reference, not observable from an ordinary live page. The final version's real **02:45:15 UTC** five-minute job published all three fresh complete periods with no exceptions. The daily scheduled job remains unobserved. Test exclusions and other validation limits are recorded in the ledger.

## Remaining work, in recommended order

1. **Database integrity and historical repair.** Reconcile schema/migration history, duplicate cluster identities, mixed timestamps and historical version data. Strengthen concurrent-writer coordination, revision fencing, durable retry/outbox behavior and publication consistency. Prepare a fresh backup, restore rehearsal and dry-run repair manifest before historical mutations. Earlier containment and the lookup index do not close this package.
2. **Rendering and delivery performance.** Bound large cluster detail rows, map markers and chart work; optimize globe/fault assets and route loading; remove upstream detail fan-out from sitemap requests. Preserve full-data statistics when reducing visual work.
3. **Operational maintenance.** Clean up abandoned/deferred R2 objects safely, automate predecessor-asset retention, decide legacy payload retirement, address dependency/lint/test debt, and verify the daily job during a later observation window.

Complete browser feeds do not establish historical D1 completeness or canonical scientific cluster identity. No production historical repair was performed. No measured CWV, latency-percentile or billing improvement is claimed.

## Resume the next bounded block

Read [03-data-integrity-and-database.md](03-data-integrity-and-database.md), [CLUSTER-INDEX.md](CLUSTER-INDEX.md), and the latest release section of [RELEASE-LEDGER.md](RELEASE-LEDGER.md). Reconfirm the deployed revision, settings, D1 schema/migration history and current row counts before choosing the first small database change. The historical audit values are a baseline for comparison, not current truth.

Start with a bounded, reviewable code or additive-schema step that prevents new integrity loss. Keep historical deduplication and rewrites separate. For any historical mutation, prepare a fresh production backup or Time Travel bookmark, an isolated restore rehearsal, a dry-run candidate/ambiguity manifest, exact migration or repair checksums, and a recovery path before applying it. Shared strongest-event IDs alone are not a duplicate predicate. Preserve the current public feed and cluster contracts while improving writers and readers.

Follow the focused release workflow: targeted failure reproduction and regressions, full suite, packaging, isolated preview, browser/API checks where relevant, guarded production promotion and final evidence in the ledger. Do not redeploy merely to publish this handoff. The preceding compatible browser Worker version is `efd09f93-6a07-4c02-b756-b7af8c922171`; revalidate identity/configuration before considering a rollback. Code rollback does not restore database contents and must not undo writer containment or move feed pointers backward.
