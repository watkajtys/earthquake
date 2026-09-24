# Remediation implementation and release ledger

This file records implementation and verified release evidence. The original plan remains in the linked briefs. Do not put credentials, database exports or full private cloud responses here.

## Starting status — 2026-09-21 UTC

| Package | Status | Evidence / next action |
|---|---|---|
| 1 — Deployments | Planned; historical binding restoration completed | Audit restore version `2b0d2f34-8faf-4dd7-8433-4c7702f47ef9`, 37 GET / 23 asset checks passed. Reverify live state and correct/verify Workers Builds trigger. |
| 2 — Endpoint safety | Planned | Local audit reproductions; no fixes implemented by this handoff |
| 3 — Database integrity | Planned | Read-only live schema/query evidence and local failure probes; no production repair performed |
| 4 — Frontend correctness | Planned | Component/reducer probes and desktop observation; no fixes implemented by this handoff |
| 5 — Performance/delivery | Planned | Payload/build/DOM baselines; no performance changes implemented by this handoff |
| Supporting — Dependencies/validation | Planned | Audit/reachability assessment; no dependency updates implemented by this handoff |

## Foundations implementation — 2026-09-21 UTC

Status: production deployed through the corrected automatic trigger; background observation in progress.

- Branch: `codex/remediation-foundations`, based on audited `aca32df909dc76f23483ab19779ac5fcbafed1b3`.
- Package 1: added guarded release script, identity response, version metadata, exact binding/domain/cron/queue readback, source/version race checks and strengthened both-host smoke. On the authenticated Cloudflare dashboard, confirmed the unsafe saved `npx wrangler deploy` command, saved a temporary tested production command, then saved `npm run release:production`. Production branch remains `main`; non-production Builds are disabled. The existing automatic trigger subsequently deployed the reviewed revision and passed all gates; see the rollout record below. No token/secret has been created or expanded.
- Package 2: public summary proxy has no ingestion dependencies, selects only four official feeds and uses bounded validated transport. Maintenance/cluster mutation routes require a configured server bearer secret and appropriate methods; missing secret disables administration. Request limits, safe HTML/error cache policy, validated event IDs, polar/date-line geometry and bounded spatial work are implemented.
- Minimum package 3A: explicit D1 outcomes and coordinate/depth corrections; complete-persistence checkpoint ordering; safe snapshot reads before writes; archive acceptance before complete detail flags; truthful bounded backfill and retry selection. Failure reporting now propagates from the actual exported scheduled handler and cluster/statistics jobs.
- Independent F10 fix moved forward with coordinator ownership: globe tooltips construct literal text DOM content instead of passing upstream place text as HTML.
- Shared details and maintenance contracts: [ADMIN-OPERATIONS.md](ADMIN-OPERATIONS.md).
- Decision: contain the unsafe trigger first, then validate release controls together with urgent migration-free endpoint/writer fixes. This avoids publishing another unprotected application revision. No production schema migration, repair, historical deletion, dependency upgrade or storage recreation is included.

Observed validation before first promotion:

- Full release suite: **96 files passed, 960 tests passed, 4 skipped**. Existing exclusions `InteractiveGlobeView.test.jsx` and `NotableQuakeFeature.test.jsx` remain. `.reconciliation.local` is explicitly excluded because it contains historical audit reproductions; the corrected tooltip regression is in the normal suite.
- Focused failure tests exercise the actual exported Worker, real SQLite persistence behavior, rejected queue/R2/D1 work, partial 91-event batches, malformed/oversized upstream and request bodies, and scheduled failure propagation.
- All changed source/test files checked with targeted ESLint; integration lint issues in touched files corrected. Repository-wide lint cleanup remains a supporting package.
- Production Vite build and Wrangler packaging dry run passed. Existing large chunk warning remains (globe about 1.71 MB raw and faults about 5.11 MB raw); this is not a performance improvement claim.
- Local full Worker, isolated preview simulation: **47 GET checks / 23 built assets passed**, including no-store HTML/errors, maintenance GET rejection, invalid proxy input, nonempty R2 feeds, exact/anchor cluster lookups and stored detail data.
- Browser local preview rendered synthetic overview and a clicked earthquake detail. Known desktop blank-pane and URL/layout defects remain package 4; complete browser acceptance is not claimed.
- Direct official USGS validation of hour/day/week/month, one full detail and one catalog page passed. Metadata-only evidence remains ignored under `.reconciliation.local/audit-2026-09-21/usgs-validation-samples.json`.
- Fresh production readback at 02:56 UTC retained restored version `2b0d2f34-8faf-4dd7-8433-4c7702f47ef9`, all intended resources, custom domain and queue consumer, and four crons. This is pre-release evidence.

Rollout record:

- Commit: `ea3e36bdc9787bdbe590fa74469a47057e1d7a67`, pushed as a fast-forward to `main` after verifying the remote had not moved.
- Remote isolated preview version: `780186d2-3a36-4833-b583-e1249af821a4`; exact revision tag and all dedicated preview bindings read back. Preview reseeded with four synthetic earthquakes, one cluster and seven R2 objects. **47 GET / 23 asset checks passed.** Browser overview and cluster detail showed the synthetic fixtures.
- Cloudflare [automatic build 67b12a75](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/67b12a75-52ea-46f8-8d57-319ea59531f0) used `npm run release:production`, Node 24.18.0, the expected main SHA and existing Builds credential. Read-only inspection confirmed that credential already includes Queues and D1 access; no access expansion was needed.
- New production Worker version: `497067b8-2004-4d08-a5d4-195b0279b680`, deployed at approximately **03:17:35 UTC**. Previous compatible version: `2b0d2f34-8faf-4dd7-8433-4c7702f47ef9` (contains pre-remediation behavior).
- Automatic gate passed source checks, 960 tests, build/package, configuration/version readback, identity on both public hosts, and **47 GET / 23 asset checks per host**. The release report path printed by Builds ended in `ea3e36bdc9787bdbe590fa74469a47057e1d7a67-1789960581197.json (passed)`. Build finished successfully at **03:17:48 UTC**. The [independent GitHub verification](https://github.com/watkajtys/earthquake/actions/runs/35556936267/job/106202251772) also passed.
- Filtered real invocation evidence for this exact version: the first observed five-minute ingestion/list task finished `outcome: ok`, 31 ms CPU / 3.75 s wall, publishing 211 day / 1,333 week / 6,030 month records. The ten-minute cluster task also finished `outcome: ok`, 405 ms CPU / 50.37 s wall, publishing 3,487 existing cluster definitions. These counts establish successful execution, not completeness or repaired cluster identity.
- No production schema change or historical data repair was performed. New writer behavior is migration-free; code rollback does not revert its storage writes. Use the compatible-version inspection and explicit recovery process in `DEPLOYMENT.md`.

Remaining gates/limits:

- The 30-minute backfill scheduled at 03:30:59 UTC finished `outcome: ok`, processing three earthquakes with zero errors in about 3.87 seconds. The five- and ten-minute jobs also repeated successfully at that interval. The next daily run is 2026-09-22 00:00 UTC and has not been observed in this release session; tail collection was then stopped.
- The actual Builds credential passed all required readback/deployment checks; future missing permissions remain a failed preflight.
- Queue acceptance is not proof of archival completion. Durable outbox, revision fencing, overlapping job coordination, outage catch-up, atomic list publication and authoritative statistics remain later package 3/5 work.
- Existing cluster duplicate anchors and mixed timestamp data remain. Smoke validates canonical lookups exactly and anchor lookups against the returned definition, without asserting those unresolved identities are already unified.
- Database schema reconciliation, backups/restore rehearsal/repair, remaining frontend fixes, payload/render optimization and dependency upgrades remain planned. Endpoint/writer foundation fixes now have release evidence; broader package acceptance remains open as described above.

## Frontend correctness implementation — 2026-09-21 UTC

Status: production published and manually post-verified; immediate automatic identity gate failed, with a release-control follow-up in progress. Final frozen integration passed **1,111 tests / 106 files, four existing skips**. Build and explicit production packaging dry run passed. All touched JavaScript/test files have zero ESLint errors; one existing Fast Refresh export warning remains. Diff whitespace checks passed.

- Scope: F1–F6, F8–F9 and B6. F10 was already released in foundations. Three parallel agents own route/resolver/crawler behavior, refresh/revision lifecycle, and pagination/dialog/coverage behavior; coordinator owns layout and integration.
- Shared earthquake builders now emit unambiguous `/quake/id/<event-id>` routes. Negative/null-magnitude descriptive links, plain IDs and encoded official detail URLs are read compatibly. Previously unrecorded descriptive strings with a hyphen inside their event ID remain inherently ambiguous; no invented historical alias is claimed.
- Cluster readers add explicit `clusterId`, stored `slug` and browser `route` selectors. Legacy `id` keeps strongest-event-first precedence. Browser and deployed Worker crawler share resolution; loading, unavailable and missing clusters terminate with usable controls. No alias schema, database merge, canonical-ID repair or timestamp migration is included.
- Monthly data refreshes every five minutes after opt-in, active clusters every five minutes, and day/week every minute. Requests use cancellation, bounded timeout, single-flight behavior and last-good retention. Complete timestamped USGS windows can establish deletion; legacy R2/D1 arrays cannot. Source generation time stays distinct from successful request time.
- Revised significant events propagate across retained cards and all loaded feed views. Pagination clamps after data shrink; event rows are native buttons. One dialog keyboard owner handles Escape, focus trapping and restoration. Bounded, whitelisted return state preserves Overview → cluster → earthquake → cluster → Overview, including query/hash state, without accepting external return destinations. Regional history distinguishes unavailable coverage from observed zero events and labels actual seven/thirty-day data.
- Overview and Feeds render in the desktop main pane with desktop navigation, including trailing-slash routes. Direct detail routes render independently of pending global feeds. Cluster card links retain stored identity.
- Crawler HTML uses the built asset shell through ASSETS and escapes embedded metadata. Shared read-only archive validation makes crawler and JSON detail resolve the same stored event/alias, with size/time bounds and original R2 bytes/ETag retained for JSON. Prerendered content is inside the React root. Error/loading metadata is noindex. Administrative protection, safe cache behavior, transport validation and deployment controls remain in place.

Observed verification so far:

- Expanded local smoke passed **52 GET / 24 asset checks**, including an actual emitted sitemap cluster URL, canonical API/crawler agreement, stored earthquake crawler pages and built JS/CSS content types. A first expanded run exposed the archive/crawler discrepancy above; the corrected real Worker run passed.
- Browser checks at 390×844, 768×1024 and 1280×900 showed visible Overview/Feeds main content with no horizontal document overflow. Resizing across the desktop breakpoint retained content and swapped navigation. Keyboard event selection opened the intended canonical route; one Escape returned to Feeds and restored its title. Canonical and legacy cluster links and a negative-magnitude quake link resolved; the Learn article rendered.
- Earlier development-only browser navigation hit stale lazy chunk URLs when a concurrent local rebuild replaced assets. Reloading the current build restored those pages; final remote preview checks use a frozen build. Already-open-client asset recovery remains a separately tracked delivery limitation.

Rollout record:

- Source: `8bbda2d7d9bf0f0bced8c28cbd35a174ac4cfe76`, fast-forwarded from `ea3e36b` to main after clean source and remote-head checks.
- Remote preview: version `311e5064-3d86-44e6-acd3-1e545b7c2207`, exact revision/tag and dedicated bindings read back; **52 GET / 24 asset checks passed**. Frozen preview browser verified the globe, mobile Feeds without overflow, and keyboard Overview → cluster → quake → cluster → Overview.
- Production [automatic build 71891346](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/71891346-f253-4d99-a0d9-e92248196adc) used `npm run release:production`, passed 1,111 tests/build/source/configuration/version checks and published version `ba3533fe-fe0e-4b40-ada0-000ee17da354` at approximately **03:54:52 UTC**. It then failed the first public identity check at **03:54:53 UTC**. The job remains a failed job; the exact response/reason was not retained by the deliberately redacted failure report, so propagation is not a proven root cause.
- Fresh readback showed that version at 100% with the intended bindings and tag. At approximately 03:55–03:57 UTC, both public hosts returned the exact expected identity with `no-store`; Node fetch with both default and explicit first-party User-Agent also passed. Separate full post-deployment smokes passed **52 GET / 24 asset checks on each host**. No rollback was performed because these checks established the correct live application.
- Production browser verified desktop Overview content, no duplicate sidebar, real event `/quake/id/us7000tiur`, canonical metadata and one-Escape return to Overview. No production synthetic fixture or schema/data repair was applied. The [independent CI run](https://github.com/watkajtys/earthquake/actions/runs/35559024995) passed.
- Previous compatible post-security version: `497067b8-2004-4d08-a5d4-195b0279b680`. Actual five-, ten- and thirty-minute invocations scheduled at **04:00:59 UTC** on frontend version `ba3533fe-fe0e-4b40-ada0-000ee17da354` all finished `outcome: ok` without exceptions. Backfill processed four events with zero errors; cluster processing handled 170 significant clusters with zero errors and cached 3,490 existing definitions. Counts do not establish repaired identity or completeness. Daily cron remains unobserved; tail collection was stopped after these results.
- Follow-up release controls will add safe diagnostic codes and narrowly bounded grace only for the exactly captured previous revision/version while checking for control-plane races. Authentication failures, malformed responses and foreign identities must still fail immediately.

Open boundaries:

- F7 remains open: overview cards still reconstruct statistics from a weekly member subset. Authoritative compact cluster summaries and bounded rendering belong to the performance release.
- Cluster duplicate anchors, mixed database timestamps, durable revisions/aliases and historical reconciliation remain package 3. Exact selectors prevent ambiguous new API calls but do not repair data.
- R2 eligibility/publication freshness, large globe/fault assets, sitemap fan-out, broader dependency/lint/test cleanup and old-session asset recovery remain open performance/supporting work.
- Fake-clock lifecycle tests establish polling/cancellation/retry behavior; production receipt time alone is not evidence of source freshness or completeness. Existing event corrections update loaded views immediately; newly observed IDs still enter each resource through its own refresh cadence.
- Next discrete containment: stop legacy cluster-version string growth without rewriting history and replace destructive `INSERT OR REPLACE` with canonical-identity-preserving collision handling. A local SQLite reproduction confirmed a stable-key race can currently replace an existing ID. Then reconcile schema/migration history and restore indexed selectors, with backup/restore gates before structural repair.
- Smallest independent performance follow-up: consume stored cluster scalars directly, bound visible cards, and avoid static-route cluster polling. Payload/CPU reduction requires the later bounded published-page contract; projecting the existing whole KV blob would not establish it.

## Release identity follow-up — 2026-09-21 UTC

Status: production deployed and automatic verification passed.

- Changes only release script, its tests and operational documentation. Worker/browser sources and production data schema are identical to the verified frontend release.
- Initial identity checks may retry only a valid no-store production response containing the exact captured previous revision/version. The old version's tag must agree with its revision binding. Grace is bounded by a 90-second deadline, 19 attempts and five-second waits; unknown baseline identity gets no grace.
- Control-plane version is checked before/after attempts. Expected-new-version success cannot mask a concurrent deployment. After-smoke checks stay strict. HTTP403/503, malformed/cacheable responses and unrelated/mixed identities fail immediately.
- First-party User-Agent matches deployment smoke. Reports/logs retain allowlisted failure code, numeric HTTP status and attempt counts without response bodies or arbitrary exception text. The original failed gate's cause remains unknown.
- Validation: **47 release-control tests + 10 smoke tests passed**; syntax/help, targeted lint and diff checks passed. Covered delayed previous identity, deadline exhaustion, permanent/unknown mismatch,403/503, missing cache controls, malformed JSON, baseline tag/binding disagreement and control-plane replacement.
- Source: `33cae393b203839fe184966c1a4d487f281a0d63`. The [automatic Cloudflare build f465c269](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/f465c269-5fc3-4a46-8930-bca35e1470bc) completed successfully through `npm run release:production` at **04:05:09 UTC**. It ran **1,128 passing tests across 106 files, with four skips**, built the application, verified the source/configuration/version and passed **52 GET / 24 built-asset checks on each public host**, including the final strict identity checks.
- Production version: `337f058d-d2fe-470f-a14c-cbfd7c553d36`, published at approximately **04:04:55 UTC**. Independent post-build requests to both public hosts returned HTTP200, `Cache-Control: no-store`, `environment: production`, the exact source revision and this version ID. The [independent GitHub CI run](https://github.com/watkajtys/earthquake/actions/runs/35559579467) also passed.
- Build report reference: `/opt/buildhome/repo/.reconciliation.local/releases/33cae393b203839fe184966c1a4d487f281a0d63-1789963424031.json (passed)`. Local independent readback is stored in the ignored `final-release-verification.json` evidence file. No response requiring propagation grace was independently observed; the original failed gate's cause remains unknown.
- Previous compatible version: `ba3533fe-fe0e-4b40-ada0-000ee17da354`. This follow-up changes no Worker/browser source, so the frozen frontend preview, production browser checks and observed five-/ten-/thirty-minute background runs above remain the applicable application evidence. No additional synthetic production writes, schema changes or historical repairs were performed. The daily background job is still unobserved.
- Local preview server and tail collection were stopped after verification. Remaining database, publication, performance and supporting work is listed above; this release does not close those packages.

## Cluster containment, lookup index and stored cards — 2026-09-21 UTC

Status: production deployed, automatic release passed, browser verified and actual background execution observed. The bounded scope and sequence are in [NEXT-GROUP.md](NEXT-GROUP.md).

- Writer containment replaces destructive `INSERT OR REPLACE` with one stable-key UPSERT returning the stored canonical identity. It preserves existing ID, slug, creation time and legacy version bytes, initializes new rows with version `1` and a creation time, rejects competing unrelated ID/slug collisions, and propagates failed persistence before publishing KV. The active scheduled writer no longer reads the oversized version merely to increment it. Minimal legacy helper callers follow the canonical-return contract and stop concatenating versions.
- Stored-card containment removes membership reconstruction from browser week/month feeds. Overview/sidebar cards use stored scalar metadata and render at most 20 cards per page. Static/Learn/Feeds routes disable cluster polling. A route-toggle regression also fixes a cancelled refresh leaving the cached resource marked busy. This does not reduce the legacy API transfer or repair historical duplicate clusters.
- Deterministic component fixture: 1,200 cards / 9,601 DOM elements before versus 20 cards / 166 elements initially after. This is a component DOM measurement, not real-device latency, Web Vitals or payload savings.
- Fresh production preflight confirmed history through `0017`, both historical timestamp triggers, absent strongest-event lookup indexes and the unique stable-key constraint. A nonexistent-anchor lookup read **45,184 rows / 79.4329 ms**. Recorded cluster totals were 45,183 rows, 33,745,657 legacy-version characters and maximum version length 327,514; these are observations while old scheduled writers were still running.
- Forward migration `0018_add_cluster_anchor_lookup_index.sql`, SHA-256 `b6bb780796a5901feb02a7b9147e6a9c43f6484198699c7d552ecf1af11e481e`, adds only `(strongestQuakeId, updatedAt DESC, id ASC)`. Four SQLite regressions preserve rows, triggers, exact resolver choices and existing mixed-type ordering on clean and production-drift fixtures.
- Applied to dedicated preview first, then `PrimaryDB` using a frozen one-file migration directory and existing `d1_migrations` table. Both pending lists contained only `0018`. Production recorded it at **04:16:57 UTC**. Readback verified the exact index/key directions, unchanged previous schema/trigger definitions and migration history. The actual resolver projection now uses `SEARCH ... USING INDEX` without a table scan or temporary sort; the missing lookup read **zero rows / 0.355 ms**. These are individual query observations, not a latency percentile. Index storage increased the database by approximately 3.5 MB.
- Captured a fresh production Time Travel bookmark before the index operation. The index is additive and leaves application rows/triggers unchanged; no full export or restore rehearsal is claimed. Existing scheduled writers changed row/version totals during the observation interval. No historical migration was replayed, history entry rewritten, data deduplicated or legacy value compacted. Recovery and exact application procedure are in [CLUSTER-INDEX.md](CLUSTER-INDEX.md).
- Evidence is ignored under `.reconciliation.local/remediation-next-group/`: fresh resource identity/configuration, schema/history, recovery bookmark, frozen SQL/config/checksum, application logs and post-index readback. Raw responses and the bookmark stay out of committed documentation.
- Final local integration: **1,177 tests passed across 109 files, four existing skips**; lint passed for all 22 changed JavaScript/test files; diff checks and production build/packaging dry run passed. Writer tests include the actual exported Worker's ten-minute route with real migrated SQLite helper/job behavior, both production timestamp triggers, lost acknowledgements, collisions, repeated preservation of a 20 KB historical version, partial failure retaining KV and failure surfaced through `waitUntil`.
- Two actual local Wrangler ten-minute invocations completed with zero errors, each processing 27 definitions and caching 28 records; IDs, slugs and version values were unchanged across the two cycles. Local storage contained previous USGS test data as well as refreshed synthetic fixtures, separate from production. Pure synthetic isolation/race scenarios are covered in the deterministic Worker/SQLite tests. No production synthetic fixtures were used.

Rollout evidence:

- Branch `codex/cluster-integrity-summaries`, source `e65332d8d69f769792c26d5767fda2bfbb7b2efb`, promoted to main after verifying its previous head was `33cae39`. Workers Builds still used `npm run release:production`, main branch, root `/`, correct repository and disabled non-production branch Builds.
- Frozen remote preview version `f5aa5e68-7562-4f42-9bd9-3fe4cb831533`: revision and isolated resource bindings read back; **52 GET / 24 built-asset checks passed**. Browser verified stored summary totals, canonical cluster detail, one-Escape return, mobile 390×844 and desktop 1280×900 without horizontal overflow, static-route cluster-section removal and return to cached cards. Deterministic route tests establish cancellation/no-polling behavior; browser absence alone is not proof of network inactivity.
- [Automatic Cloudflare build 400230f7](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/400230f7-7669-4800-91e7-2966b02217ce) passed **1,177 tests / 109 files, four skips**, source/build/configuration/version gates and **52 GET / 24 built-asset checks on each public host**. Published production version `6e38d57e-2dfc-4e20-bda0-654338e3dc64` at approximately **04:26:12 UTC**; final release passed at **04:26:31 UTC**. [GitHub CI](https://github.com/watkajtys/earthquake/actions/runs/35560853473) also passed. Independent requests to both hosts returned HTTP200, no-store and the exact revision/version.
- Build report reference: `/opt/buildhome/repo/.reconciliation.local/releases/e65332d8d69f769792c26d5767fda2bfbb7b2efb-1789964697276.json (passed)`. Previous application version was `337f058d-d2fe-470f-a14c-cbfd7c553d36`; its API/schema remain compatible with the index, but rolling back the whole application would reinstate the old cluster-writer defects. Prefer a forward frontend-only reversal retaining writer containment if needed.
- Production browser rendered **20 of 742** eligible cards, paged to 21–40, and had no horizontal overflow at mobile/desktop widths. The retained URL `/cluster/42-quakes-near-44-km-nne-of-ruteng-indonesia-m5.5-82749--8d2-120d6` opened its current definition: both card and detail showed **43 earthquakes, M5.5**. The old count embedded in the stable slug was not rewritten. Escape returned to Overview. No new console errors were observed. Viewport was reset and temporary browser tabs closed.
- Actual five-, ten- and thirty-minute jobs scheduled at **04:30:59 UTC** all completed `outcome: ok` on the new production version without exceptions. The ten-minute job processed **170 definitions, zero errors**, then cached 3,486 records; observed duration was 29,731 ms wall / 359 ms CPU. These are one-run measurements and counts, not evidence of historical completeness/deduplication.
- Five existing active records captured before the run all appeared in its processing logs. Readback proved unchanged ID, slug, stable key, creation value and exact version string, with updated timestamps advancing during this run. This is production evidence that the sampled writer updates no longer concatenate versions. The deterministic tests cover additional large/corrupted/null version values and race/failure cases.
- Local server and production tail session were stopped after verification. Daily cron remains unobserved. The release evidence is saved in the ignored `release-verification.json` and associated readback/tail files. Consumer F7 is fixed for stored summary values; DB-01/DB-03/DB-06 and package 5 remain only partially addressed as described below.

Remaining boundaries: unchanged-write amplification through both timestamp triggers, mixed timestamp ordering, unstable semantic stable-key policy, scientific stale-writer fencing, historical identity/version repair, last-good cache expiry, complete/atomic publication and large legacy payloads. Index-only verification does not close the broader DB-01/schema-reconciliation package.

## Compact stored-summary producer — 2026-09-21 UTC

Status: producer deployed, release gates verified and first production scheduled publication observed. The detailed scope, two-release sequence and recovery procedure are in [COMPACT-SUMMARIES.md](COMPACT-SUMMARIES.md).

- Committed the preceding block's verified release record first as `02f044a`, as requested.
- Adds a scalar-only, threshold-filtered D1 observation publisher to the actual ten-minute Worker job, immutable bounded R2 pages/manifests, one-shot conditional pointer publication, signed generation-bound cursors and the additive `/api/cluster-summaries` route. Legacy array delivery remains unchanged for the producer release.
- The observation contract explicitly identifies stored definitions, uses a null upstream watermark and labels old snapshots stale. Scalar hashes do not establish membership or scientific-generation consistency. This is a delivery improvement, not historical repair or scientific stale-writer fencing.
- Independent review found no backend correctness blocker. Regressions cover competing publishers, initial creation races, partial/lost-acknowledgement failures, unconfirmed reads/writes, bounds, cursor integrity/expiry, missing objects, ordering and actual Worker/SQLite integration. Final frozen full-suite/build results are recorded with rollout below.
- Read-only production scalar preflight: 738 eligible rows, zero validation errors, maximum serialized summary 490 bytes, 9,971 rows read by the single query. This is one observation, not a latency percentile.
- Real local workerd and remote dedicated-preview R2 bindings both confirmed conditional creation succeeds, a competing creation returns null, a matching-ETag replacement succeeds, and a delayed old-ETag replacement returns null without changing the newer object. Temporary probe objects were removed by exact generated key; production storage was not used for these probes.
- Actual local Worker ten-minute invocation advanced the compact publication from sequence 1 to 2. All 10 eligible definitions exactly matched the equivalent legacy records after that run. HEAD testing exposed an initial method mismatch; the route and regression now accept HEAD and strip its body. Non-read methods return 405.
- Local fixture measurement: equivalent 10-record legacy array 10,805 decoded bytes versus compact array 4,436 (58.94% reduction); first envelope 4,733 bytes versus complete 28-record legacy response 29,379 (83.89% reduction). Small fixture memberships/versions explain why projection savings are below the proposed 80% target. Production measurements remain pending. Recompressed fixture Brotli quality 4: 2,643 versus 1,616 bytes; these are not observed network-transfer sizes.
- Remote preview snapshot sequence 1 was published by the actual producer through guarded preview-only bindings. The seed validates production/preview D1, KV and R2 isolation and does not add any public mutation endpoint.
- Evidence is ignored under `.reconciliation.local/compact-summaries/`. No D1 schema change, historical migration replay, deduplication, version rewrite or production synthetic data is part of this release. Expired/orphan R2 object cleanup is explicitly deferred; current/history readability is bounded while stored objects accumulate under the new owned prefix.

Producer rollout:

- Source `c37ca194321f5d0866baec90894cffab84a59c0e`, built from a frozen archive while browser edits remained uncommitted in the main workspace. **1,300 tests across 112 files passed**, four existing skips; changed backend files passed lint, diff checks and production packaging.
- Dedicated preview version `ea97e08b-8195-456e-9c9c-334f88e74602`: identity/revision/resource bindings and disabled schedules verified. Complete compact/legacy fixture equivalence passed; compatibility smoke passed **52 GET / 24 assets**. One-record preview payload measurements are recorded as fixture-only evidence, not a production performance claim.
- Promoted the producer commit to main after confirming previous head `e65332d`, correct repository/root/main branch, `npm run release:production` and disabled non-production branch builds.
- [Cloudflare build cef124da](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/cef124da-83da-4979-9b07-4fa4a553ec88) passed all **1,300 tests / 112 files**, source/configuration/deployment checks, and **52 GET / 24 asset checks on each public host**. Production version `35a384b3-e9d9-4b60-93ad-43ddb4c83cbd` published at **04:56:17 UTC**; gate completed **04:56:34 UTC**. [GitHub CI](https://github.com/watkajtys/earthquake/actions/runs/35562603457) passed.
- Report: `/opt/buildhome/repo/.reconciliation.local/releases/c37ca194321f5d0866baec90894cffab84a59c0e-1789966496894.json (passed)`. Independent readback verified both public identities plus expected domain, queue, crons and bindings. Previous compatible version `6e38d57e-2dfc-4e20-bda0-654338e3dc64` includes writer containment and can be restored without a database change.
- Initial compact GET returned truthful HTTP503 `SUMMARY_UNAVAILABLE` before the first scheduled publication. Legacy browser delivery remained active. Consumer cutover is gated on a real published production snapshot.
- Actual ten-minute job scheduled at **05:00:59 UTC** completed on the producer version with `outcome: ok`, no exceptions, 170 definitions processed and zero persistence errors. It cached 3,483 legacy records and published compact generation `5f143957-382e-4f84-a1b3-b43ac64c0f46`, sequence 1, 738 eligible records in four stored pages. Five- and thirty-minute jobs in the same window also completed successfully on this version; daily cron is still unobserved.
- Complete production GET comparison at **05:01:48 UTC** retrieved all eight 100-item API pages and found exact scalar/hash equivalence for all **738 eligible legacy records**, with no duplicate/missing IDs or ordering differences. Equivalent decoded arrays: **1,662,243 bytes legacy vs 328,514 compact (80.24% reduction)**. All paginated envelopes totaled 331,857 decoded bytes. Initial envelope: **44,924 bytes vs 11,220,331 bytes for the old 3,483-record download (99.60% reduction)**. The equivalent-set figure isolates projection savings; initial-page savings additionally include existing view filtering and pagination. No repaired/dropped records are counted as savings.
- Identical eligible JSON fixtures recompressed at Brotli quality 4: 105,151 vs 67,639 bytes. These are fixture compression measurements, not measured on-wire transfer totals or latency/CWV improvements.

## Compact summary consumer — 2026-09-21 UTC

Status: consumer deployed and verified; previous-build asset compatibility follow-up also completed below.

- First-page loading is bounded to 100 summaries and 512 KiB with a 30-second deadline. Lists render 20 cards, fetch further pages only on demand, preserve stored ordering/counts and show the original stored snapshot time. No failure falls back to the large legacy array.
- Same-generation refresh retains loaded pages even when the server issues a different signed cursor. New generations reset atomically; expired current-generation cursors also restart with a fresh cursor chain. Lower sequences, generation/total mismatch, duplicate IDs, repeated cursors, malformed streams and stale completions are rejected while last-good cards remain visible.
- Independent review caught the renewed-cursor equality defect before release; regressions now cover it and the same-generation expiry retry. Route disable/unmount aborts pending requests and stops polling; navigation and focus remain coherent during loading, failure and shrinking results.
- **1,335 tests across 115 files passed**, with four existing skips. All 17 changed consumer/release JavaScript files passed lint; diff checks and production packaging passed. The release smoke now requires a real, recent compact first page before a consumer release can pass.
- Deterministic 1,200-summary fixture: 29,396-byte first response, 100 loaded records, 20 visible cards and one request through visible page five; page six fetches one continuation. This is fixture evidence, not a measured network transfer or latency claim.
- Local mobile browser at 390×844: stored snapshot label and cards rendered, compact card opened its independent full cluster detail, and Escape returned to the overview. Overview and detail had no horizontal overflow. Remote preview/production browser and rollout evidence follows below.
- User clarification: summary delivery must preserve small earthquakes within clusters. A new actual-Worker regression passes M5, M1.1, M0 and M−0.5 through scheduled clustering, stored membership, compact count and full detail, preserving all four. A production GET probe independently found 43/43 members, including 12 below M4.5 (range M3.9–5.5). Existing overview eligibility is based on each cluster's maximum magnitude, not a member-level magnitude filter. The separate existing definition threshold M3 and overview threshold M4.5 are not changed by this block.

Consumer rollout:

- Source `8265d03436e0836026c46dffc8fbf310b9ace358`. Dedicated preview `ab44f1ee-8e3a-416d-8a01-f83d1d3a54cc` passed identity/binding checks, complete compact/legacy equivalence, and **53 GET / 24 asset checks**. Browser at 1280×900 and 390×844 showed the stored snapshot, full three-member synthetic detail and one-Escape return without horizontal overflow or new console errors.
- [Cloudflare build 560d5725](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/560d5725-d013-432c-a72c-69e5f0d1aebd) passed **1,336 tests / 115 files, four skips**, all release gates and **53 GET / 24 assets on each public host**. Version `4bbe630a-cd19-4f8b-a83d-ebf47838a551` published at **05:09:48 UTC**; gate finished **05:10:08 UTC**. [GitHub CI](https://github.com/watkajtys/earthquake/actions/runs/35563427164) passed.
- Report: `/opt/buildhome/repo/.reconciliation.local/releases/8265d03436e0836026c46dffc8fbf310b9ace358-1789967305761.json (passed)`. Production browser showed 20 of 738 cards and advanced through the first five visible pages; page six invoked continuation loading. Desktop had no horizontal overflow. Final post-follow-up browser evidence is recorded below.
- Live generation-continuity probe: after the next real publication advanced current sequence from 1 to 2, a previously captured cursor returned 100 records from sequence 1 with its original total 738. It did not switch generations or renew the original cursor lifetime.
- Production browser completed continuation to **101–120 of 738, page 6 of 37**, with 20 visible cards. The page-six card opened an independent full detail with 129 members and maximum M5.8, including members below M4.5. One Escape returned to Overview. Desktop 1280×900 and mobile 390×844 had no horizontal overflow; mobile detail width was 358 px. No new console errors were observed. The snapshot refreshed while the detail was open; return showed page one of the current list. Browser observations establish visible behavior; deterministic tests, rather than a browser network trace, establish the precise fetch counts.
- Actual ten-minute jobs at **05:10:59 and 05:20:59 UTC** completed on consumer version `4bbe630a-cd19-4f8b-a83d-ebf47838a551` with `outcome: ok`, zero exceptions, and compact sequences 2 (738 records) and 3 (739 records). Five-minute jobs in both windows also succeeded. The asset follow-up changes no scheduled logic; no later cron on that final version or daily cron is claimed.

## Previous-build asset compatibility follow-up — 2026-09-21 UTC

Status: preview and production deployed; automatic release and independent verification passed.

- A direct GET after the consumer preview deployment reproduced a compatibility gap: previous `/assets/ClusterDetailModalWrapper-C4e9y9Fj.js` returned HTTP200 HTML SPA fallback. The existing bridge only covered the August build. The consumer release remained usable for fresh tabs, but some previously opened tabs could fail a lazy import until reload.
- Adds a small exact URL/checksum/size/MIME map for the complete verified producer asset graph, preserving 24 JS/CSS objects (7,859,600 bytes) under `static-assets/v1/<sha256>` in existing R2. No generated JavaScript bundles are committed. Both preview and production uploads were create-only and every stored byte was read back and SHA-256 checked. No D1, KV, HTML or private data was uploaded.
- The bridge streams only explicitly mapped objects with verified size and metadata, correct MIME, immutable SHA ETags, GET/HEAD/304 handling and no arbitrary R2 key lookup. Missing/mismatched objects return a truthful no-store503. August KV compatibility remains. The strengthened smoke traverses every retained asset and fails on HTTP200 HTML.
- Local full suite: **1,364 tests / 116 files passed**, four skips, followed by a new explicit old-asset-HTML smoke regression passing with all 13 smoke tests. Touched-file lint and diff checks passed. Final release tests include that additional regression.
- This bounded bridge preserves this observed transition. General archival/retention automation remains package 5D work. Before another frontend release changes hashes, extend the retained graph and upload/check its predecessor before promotion; do not assume Cloudflare serves files absent from the new asset manifest. Do not delete the retained graph without an explicit retirement decision.

Rollout:

- Source `2b80dda7a0faa13f956b4e374490d7a0100a8bf5`; dedicated preview version `23287874-6d04-4782-a1f0-52e1cf5f8882` passed exact source/version/binding checks and **73 GET / 44 asset checks**. The formerly broken lazy wrapper returned correct JavaScript, the exact 8,054 source bytes and SHA-256, plus HTTP304 for its matching ETag. Both preview and production archive uploads had already verified all 24 objects before promotion.
- [Cloudflare build 11c96189](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/11c96189-afb7-48cc-9512-40bda031249d) passed **1,365 tests / 116 files, four existing skips**, all release gates and **73 GET / 44 asset checks on each public host**. Production version `271db41d-e2ef-4cac-8804-e9bf5648ac6a` was reported at **05:21:59 UTC**; final gate passed at **05:22:22 UTC**.
- Report: `/opt/buildhome/repo/.reconciliation.local/releases/2b80dda7a0faa13f956b4e374490d7a0100a8bf5-1789968042726.json (passed)`. Previous application version `4bbe630a-cd19-4f8b-a83d-ebf47838a551` is API/data-compatible, but restoring it removes the exact prior-build asset bridge. Prefer retaining the bridge in any forward consumer reversal. No archive objects or summary pointers need to be deleted for code recovery.
- Independent readback matched the exact final source/version, current configuration and resource bindings on both public hosts. Both returned the archived lazy wrapper as correct JavaScript with 8,054 decoded bytes and the expected SHA-256; conditional GET returned HTTP304 and HEAD returned matching metadata without a body. Cloudflare's compressed GET representation used a valid weak ETag, while identity-encoded HEAD used the strong SHA ETag. The [exact-source GitHub CI run](https://github.com/watkajtys/earthquake/actions/runs/35564199406) also passed. Evidence: `production-2b80dda-identity.json`, `production-2b80dda-independent-initial.json` and `production-2b80dda-independent-asset.json` under the ignored evidence directory.

Completion decision:

- This bounded block is complete: previous block committed first; producer before consumer; actual production publications and complete equivalent-record measurement; generation-safe pagination, mixed-magnitude membership, preview/production browser flows, compatibility assets and automatic release verified.
- PERF-1 is fixed for the current browser; legacy `/api/get-clusters` remains available and still has its large compatible payload. F7 is contained by stored scalar cards. Scientific identity/duplicates, historical versions/timestamps and atomic scientific generations remain package 3 work. Full source freshness/completeness (5B), remaining rendering/sitemap/asset work and narrowly scoped R2 cleanup remain open. No schema migration, historical repair or production synthetic write occurred in this block.
- Production tail collection and local servers were stopped; temporary browser tabs were closed and viewport overrides reset. Evidence is retained under the ignored `.reconciliation.local/compact-summaries/` directory. Final documentation is committed on `codex/cluster-integrity-summaries`; the deployed application source remains `2b80dda`.

## Complete period feeds — 2026-09-21 UTC

Status: bounded package 5B producer and consumer deployed and verified, including actual production scheduled publications. Scope and staged sequence: [PERIOD-FEEDS.md](PERIOD-FEEDS.md).

- Adds independent complete day/week/month USGS publications on the existing five-minute schedule, with per-period immutable R2 objects and conditional pointer commits. Legacy hourly ingestion, D1 persistence and list arrays remain compatible. Failed periods preserve last-good objects while healthy periods still publish; scheduled failures remain visible.
- Strict shared validation preserves old events and negative/null magnitudes, requires all alert metadata and real source generation/counts, bounds sizes and distinguishes complete empty data from unavailability. GET serves checksum-verified immutable bytes; HEAD/304 verify existence and metadata, retaining the original source/coverage clocks. Requests use neither D1 nor upstream fetches.
- Normal successful publication retires only the exact superseded previous object after R2's actual pointer-upload timestamp proves a one-minute reader grace. Review caught and fixed the slow-staging race caused by using pre-upload generation time. Current/previous last-good objects survive failures; abandoned stages and deferred cleanup remain a separate follow-up.
- Local targeted evidence: 70 root shared/actual-Worker/scheduled tests; 40 publisher tests plus 85 existing cluster publisher/API tests; 63 operations/asset-bridge tests passed. Changed backend/operations files passed lint and diff checks. Actual isolated local R2 seeding passed native conditional/checksum writes using the real publisher. This seed runs the publisher through native bindings, not the full scheduled Worker runtime.
- Read-only USGS measurement observed 223 day / 1,894 week / 10,676 month records, about 9.10 MB total decoded source JSON. Three explicit feeds preserve independent source clocks/availability; deriving all from month saved 16.58% of this sample but is deferred. No on-wire or latency-percentile claim is made.
- The exact immediately preceding frontend graph is merged with the retained graph: 44 paths / 10,304,659 bytes verified locally, preserving all previous entries. Both archives and the producer release gates passed as recorded below. Consumer changes are intentionally released after a real production publication.
- Frozen producer `f43de54` passed **1,482 tests / 121 files, four skips**, and production packaging. Independent review found and fixed cancellation of late/malformed R2 response bodies; the updated root subset passed 71 tests. The final source below includes that small resource-cleanup fix.
- A real local Workers five-minute invocation independently fetched and published 227 day / 1,896 week / 10,680 month events. API GET/304/HEAD checks passed for all three; decoded envelopes were 162,312 / 1,348,264 / 7,581,813 bytes. Per-period reported wall durations were 721 / 336 / 473 ms in this one local run, not production latency or CPU measurements. Hourly ingestion and legacy list updates also completed in the same invocation using isolated local storage.
- Both remote asset archives now verified all 44 paths / 10,304,659 bytes. Two attempts to re-upload existing immutable objects received R2 500 responses. The uploader now checks existence first, avoiding unnecessary retransmission, while still create-only uploading missing objects and verifying every stored byte. The read-first retry completed in preview and production; no existing object was overwritten.
- Final producer source `a47af43f498925256a399d94fe911ee8337267b2` passed **1,483 tests / 121 files, four skips**. Dedicated preview version `ddbb2419-16dd-4185-830e-d939629e2992` passed exact source/binding/schedule readback, actual publisher seed, complete three-period GET/304/HEAD checks and **76 GET / 44 asset checks**. Preview returned compressed weak ETags; both forms were correctly handled. Promotion to main was triggered after confirming previous head `2b80dda`, correct repository/root/build/deploy commands and disabled non-production branch Builds. Automatic build and actual publication evidence follow below.


Producer production evidence:

- [Cloudflare build 16833b6d](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/16833b6d-90d8-433f-ab5b-f805b887a54e) passed **1,483 tests / 121 files, four skips** and **73 GET / 44 asset checks on each public host**. Production version `9da2ca77-d977-452d-af4f-1292ca748f28` published at **05:56:41 UTC**; the release gate finished **05:57:19 UTC**. Report: `/opt/buildhome/repo/.reconciliation.local/releases/a47af43f498925256a399d94fe911ee8337267b2-1789970082375.json (passed)`. Both exact-source GitHub check runs succeeded. Independent configuration, resource binding, version/tag and both-host identity readback passed.
- The real five-minute job scheduled at **06:00:15 UTC** completed on this producer version with `outcome: ok` and no exceptions. It published sequence 1 for all three periods: **226 / 1,892 / 10,678 events**, with **161,614 / 1,345,440 / 7,580,309 decoded envelope bytes**. Per-period reported wall durations were 523 / 470 / 1,038 ms; these are a single run, not latency percentiles or CPU. Ten- and thirty-minute jobs in the same window also completed successfully; daily remains unobserved.
- At **06:00:58 UTC**, both public hosts independently passed three fresh complete GETs, three conditional GET304s and three unconditional HEAD200s. Original source/coverage metadata, weak/strong ETags, exact HEAD lengths and bodyless HEAD/304 were verified. Before the first cron the new endpoint truthfully returned unavailable; the preceding consumer remained active. This satisfies the production data-readiness gate for consumer promotion.

Consumer implementation:

- Browser uses the complete snapshot endpoint with a ten-second primary budget and thirty-second total primary/single-proxy-fallback budget, bounded streamed JSON and strict shared validation. Matching 304s reuse only a matching cached envelope, preserving original source clocks. Weak/strong ETags are equivalent for revalidation. Source/generation rollback, cold/mismatched/stale 304s and malformed payloads cannot become successful current data.
- Existing refresh ownership, cancellation, independent day/week attempts and opt-in month remain. Per-period source times and stale/fallback labels replace receipt-based claims; retained alerts are qualified. A source-age timer updates stale labels at the actual ten-minute boundary without introducing another request scheduler. Learn/static routes bypass the global feed-loading screen.
- The consumer release gate now always requires all three complete fresh feeds. The old opt-in flag remains a redundant alias with no bypass. Existing legacy endpoint/asset checks remain mandatory.
- Consumer integration passed **1,502 tests / 124 files, three skips**, followed by mandatory-gate changes passing 77 focused release/operations/smoke tests. An obsolete skipped loading-message placeholder in the rewritten legacy D1 fixture tests was removed; three existing skips remain. The real publisher → API → browser fixture covers compressed 200, strong 304 and corrected newer 200 without fallback. Independent review found no consumer blocker. Changed files have no lint errors; the existing provider Fast Refresh export warning remains.
- Initial consumer source `eaddaf30c90f0d6b36e3b3711f13222ffdaf218c` passed **1,504 tests / 124 files, three skips**, production packaging and preview deployment `68bb5d59-7d78-4e6b-9b4e-09e93406d0bd`. Exact identity/bindings, refreshed real-publisher synthetic fixtures, three-period GET/304/HEAD and **96 GET / 64 asset checks** passed. Browser confirmed daily/weekly/monthly totals 3/5/6, negative and unknown magnitudes, and the old nine-day monthly event. Full three-member cluster detail opened at desktop/mobile widths, including a 358 px mobile dialog with no horizontal overflow. Browser review caught the preexisting `lg:hidden` Learn content bug at desktop width; consumer promotion was held for the bounded layout correction.
- Final consumer source `8e488e374f4cb176175b7e0e3441c9a5e59555ed` fixes desktop Learn visibility, removes the obsolete tsunami-article sidebar offset, and gives static routes the full content width. Tests now render the actual Learn, six articles and Monitoring markup while requests remain pending. **1,512 tests / 124 files passed**, three existing skips; changed-file lint, diff checks and packaging passed. Preview `efd61432-fa9b-4e47-ba9b-db6a542ba7a6` passed identity/binding checks, fresh actual-publisher fixtures, three-period GET/304/HEAD and **97 GET / 65 assets**. Desktop Learn and nested article rendered at 1280×900; a cold nested article rendered at 390×844 with no horizontal overflow. Earlier preview verified feed selection and full cluster detail, including one-Escape return. No new console errors were observed. Browser checks establish visible behavior; deterministic tests establish request counts and pending-request behavior.
- Promoted the exact consumer revision to main only after the real production publisher gate and final preview checks, with remote main still matching `a47af43` and a clean working tree. Final production evidence follows below. The rolling-window negative-proof boundary limitation in the plan remains a separate reconciliation follow-up; this release does not claim to repair it.


Consumer production evidence and completion:

- [Cloudflare build de91f781](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/de91f781-dd20-4b6d-ab4f-b571365aeab3) passed **1,512 tests / 124 files, three skips**, all source/configuration/deployment gates and **97 GET / 65 asset checks on each public host**. Production version `efd09f93-6a07-4c02-b756-b7af8c922171` published at **06:12:59 UTC**; final gate passed **06:13:29 UTC**. Report: `/opt/buildhome/repo/.reconciliation.local/releases/8e488e374f4cb176175b7e0e3441c9a5e59555ed-1789971100901.json (passed)`.
- Independent readback at **06:14:25 UTC** verified exact application source `8e488e374f4cb176175b7e0e3441c9a5e59555ed`, version/tag, current domain/queue/crons/bindings, and both public identities. All three exact-source GitHub check runs succeeded. Both hosts passed fresh complete GET/304/HEAD checks for sequence 4: **224 day / 1,892 week / 10,678 month**, with **160,187 / 1,345,432 / 7,580,290 decoded envelope bytes**. Source/coverage metadata, cache policy, ETags and body lengths matched.
- Production desktop browser showed stored-source timestamps and opt-in monthly loading, with 10,677 events in the advancing displayed 30-day window. Mobile Overview opened the retained Ruteng cluster URL: both card and independent detail showed **43 earthquakes / maximum M5.5**, including smaller M4.1/M4.3 members. One Escape returned to Overview. Desktop 1280×900 and mobile 390×844 had no horizontal overflow; the mobile dialog was 358 px wide. Desktop Learn and its nested tsunami article rendered successfully, and mobile Learn navigation worked. No new console errors were observed.
- The final consumer version's real five-minute job at **06:15:15 UTC** completed `outcome: ok` without exceptions. All periods advanced to sequence 5: **223 / 1,891 / 10,677 events** and **159,498 / 1,344,736 / 7,579,598 decoded envelope bytes**; no cleanup was deferred. Reported per-period wall durations were 510 / 582 / 983 ms, again one-run observations. Earlier producer runs through 06:10 UTC also succeeded; daily cron remains unobserved.
- Recovery: compatible preceding production version `9da2ca77-d977-452d-af4f-1292ca748f28` retains the complete publisher/API, writer containment and archived assets while restoring the preceding browser. No D1 migration or synthetic production data was applied. Do not delete feed objects, move pointers backward or revert repaired ingestion to reverse a browser change.
- This bounded block closes PERF-2's incompatible freshness/double-download path for healthy complete snapshots. It also removes feed loading as a prerequisite for static content and fixes the desktop Learn visibility defect caught by preview. General database repair, rolling-window negative-proof history, abandoned/deferred R2 cleanup, legacy payload retirement, rendering/map/chart budgets, general asset archival/optimization and request-path sitemap fan-out remain open. No historical database completeness, scientific cluster reconciliation, CWV/p95 improvement or cost saving is claimed.
- Evidence is saved under ignored `.reconciliation.local/period-feeds/`, with preview identity readbacks under `.reconciliation.local/compact-summaries/`. Final documentation is committed on the working branch after application promotion; the production application revision remains the exact source above.

## Rolling-window browser reconciliation — 2026-09-23 UTC

Status: production deployed and independently verified. The scoped implementation and clock rules are in [ROLLING-RECONCILIATION.md](ROLLING-RECONCILIATION.md). No database schema, stored feed, publisher or production data was changed by this block.

- Reproduced the discarded-boundary failure before the fix: a complete empty day at `T + 30s` disproved an event in its lower strip; the next day at `T + 60s` swept that strip away; a late older week/month at `T` resurrected the event. The corrected reducer retains disjoint complete-window proof intervals, applies absence to the preferred corrected event time, and uses bounded conservative admission floors when old adjacent intervals compact. Presence source clock, scientific revision and absence clock remain separate; equal source clocks favor positive membership in either arrival order. At most 128 segments per period are retained inside the 31-day horizon. In-memory history resets on page reload.
- Focused reconciliation tests passed **33/33**, covering rolling boundaries, late overlap, equality/order, corrections, independent periods, invalid/partial windows, empty feeds, cap pressure and nonrenewal by receipt/304. Independent review found no blocker; a separate uncompressed reference matched **20,000 randomized accepted-snapshot steps** before compaction. The full local suite passed **1,529 tests across 124 files, three existing skips**. Touched-file ESLint, diff checks and production dry-run packaging passed. Tests establish reordered proof behavior; browser checks below establish visible page behavior.
- Before changing frontend hashes, rebuilt the exact predecessor `8e488e3` asset graph and verified its 24 files against live production bytes/MIME. Merged it with the already retained graph and verified **65 immutable paths / 12,817,619 bytes** in each isolated preview and production R2 archive before deploying. The new asset map preserves old-client chunks. No archive objects were deleted.
- Preview source `65abd594a15fbc896b0a8e625ce01531a997908b`, version `e22fe6e9-96c1-4562-8f97-03ad76a317d4`, used dedicated D1/R2/KV/queue and no crons. Its actual publisher seed produced complete synthetic **3/5/6 day/week/month** snapshots. Source/binding/schedule readback, all three fresh GET/304/HEAD checks, predecessor asset checks and **117 GET / 85 built-asset smoke checks** passed. Browser preview at 1280×900 and 390×844 showed stored-source labels, 30-day selection, full three-member cluster detail and Learn content without document overflow or console errors.
- After confirming remote `main` still pointed to `8e488e3`, atomically pushed the exact reviewed candidate to `main` and `codex/complete-period-feeds`. [Cloudflare automatic build 804a3f5a](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/804a3f5a-666e-4e47-aac4-e41fb4e85787) succeeded for this SHA at **02:40:20 UTC**, reran **1,529 tests / 124 files with three skips**, and passed its source/configuration/version gates plus **117 GET / 85 asset checks on each public host**. Both exact-SHA GitHub verification jobs succeeded.
- Production version `36303d5a-624f-4b4a-a997-dd8c2f165fa2` was independently read back at 100% with the correct tag, release binding, domain, queue, crons and storage bindings. Both `earthquakeslive.com` and the Workers subdomain returned that exact uncached identity before and after independent checks. Each served fresh complete day/week/month sequence **537/537/536** (271 / 2,128 / 10,709 events; 192,811 / 1,511,178 / 7,597,405 decoded bytes) with correct GET/304/HEAD headers and lengths. The immediate predecessor chunk matched its **8,059-byte SHA-256** on both hosts and passed conditional/HEAD checks.
- Production browser at 1280×900 and 390×844 showed stored-source labels, Overview, 30-day selection (10,707 events in the advancing displayed window), Learn and cluster detail without document overflow or console errors. One mobile Guánica cluster showed its stored **238 members**, including **186 below M2.5** (minimum M0.7); this samples the full-member detail contract, not historical cluster identity correctness.
- The actual five-minute job scheduled for **02:45:15 UTC** ran on version `36303d5a-624f-4b4a-a997-dd8c2f165fa2` with `outcome: ok`, no exceptions, all three periods published and no deferred cleanup. Subsequent public full-envelope readback matched its generation, sequence, count and size: day **539 / 272 / 193,531 bytes**, week **539 / 2,128 / 1,511,149 bytes**, month **538 / 10,706 / 7,595,229 bytes**. All were fresh and complete. The bounded tail was stopped cleanly; the daily cron remains unobserved.
- Recovery candidate: preceding compatible Worker version `efd09f93-6a07-4c02-b756-b7af8c922171`, which retains the complete producer/API and writer containment while restoring the earlier browser reconciliation behavior. Revalidate identity/configuration before an explicit rollback. Do not delete R2 feed or archived asset objects, move feed pointers backward, or revert writer containment to reverse this frontend-only change.
- Evidence is ignored under `.reconciliation.local/period-feeds/`. No synthetic production data, D1 migration, historical cluster repair, Web Vitals/p95 measurement or cost claim is part of this release. Database integrity/historical repair is the next recommended bounded package; rendering/performance and operational maintenance follow.

## SEO sitemap and cluster-crawl containment — 2026-09-23 UTC

Status: production deployed and sitemap submitted. The scoped implementation and earlier Search Console triage are in [SEO-CLUSTER-TRIAGE-2026-09-23.md](SEO-CLUSTER-TRIAGE-2026-09-23.md). The release changes sitemap generation, crawler URLs, feed canonical metadata, and predecessor-asset retention; production migration `0019` was completed separately, and the new source-revision writer code remains undeployed.

- Released source `69a91d4b6f8d6512f0c5f99e3118835b33f8be75` extends SEO commits `9400123` and `cb440ff` with the current predecessor asset graph. The exact preceding production source `65abd594a15fbc896b0a8e625ce01531a997908b` was rebuilt, and all 24 emitted JS/CSS assets matched live production bytes and MIME. The retained union was verified in both preview and production R2 archives: **85 paths / 15,272,299 bytes**.
- The full local suite passed **1,535 tests across 125 files**, with three existing skips. Dedicated preview version `9450284a-9abd-4b9c-811e-46da5ea0865e` passed **137 GET / 105 asset checks**. [Cloudflare automatic build 1d5efa2d](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/1d5efa2d-d630-4cdb-ac5a-49fe0748099a) succeeded; exact-source GitHub CI [run 35818228321](https://github.com/watkajtys/earthquake/actions/runs/35818228321) and [run 35818228377](https://github.com/watkajtys/earthquake/actions/runs/35818228377) succeeded. Production version `b70c02dd-24e0-4d25-ac1f-114844607862` served source `69a91d4` on both public hosts. The preceding verified Worker version `36303d5a-624f-4b4a-a997-dd8c2f165fa2` remains a recovery candidate after compatibility and current-state readback.
- Live sitemap readback found **three sitemap index entries, 13 static URLs, 500 cluster URLs, and 12,067 URLs on earthquake page 1**. Sampled entity URLs were canonical, unsupported `<lastmod>` values were absent, the first emitted cluster URL resolved, and `robots.txt` pointed to the index. Google Search Console accepted `https://earthquakeslive.com/sitemap-index.xml`; its row reported **Success** with an initial **0 discovered pages**.
- Cloudflare Cron events showed **Success** for the `*/5`, `*/10`, and `*/30` schedules at **04:30:33 UTC** after release. The table does not expose Worker version, so this is postrelease execution evidence without exact-version attribution; the daily job remains unobserved.
- The cluster sitemap remains capped at 500 stored rows. The route no longer fetches USGS details per sitemap entry, but production crawler volume, upstream subrequest reduction, indexing results, and traffic improvement have not been measured. The source-revision writer guard, historical repair, and broader cluster writer and rendering work remain open.

## Cluster detail row pagination and predecessor assets — 2026-09-23 UTC

Status: production deployed and independently verified. Source `504cf1d8940a8c43e668be37d0bf05dab86912f9` shows at most 50 earthquake rows per cluster-detail page, with Previous/Next controls and an immediate reset or clamp when the selected cluster changes. The full set still drives stored totals, map and chart. This bounds the event-list DOM only; map markers, chart points, fault/globe assets and Core Web Vitals remain separate performance work.

- A 1,217-member fixture rendered 50 event buttons instead of 1,217 and covered empty/one/exact-50/51/1,217-member cases, later-page selection and cluster changes. The exact candidate passed **1,580 tests across 125 files, three skips**, changed-file lint, diff checks and production packaging dry run.
- Before promotion, the exact 24-file asset graph from production predecessor `86dfb53` was rebuilt and matched live byte lengths, SHA-256 and MIME. Its 20 missing files were added to the retained map, producing **105 paths / 17,727,025 bytes**. Create-only preview and production R2 archival verified every byte and metadata before the new Worker was deployed. The bounded asset count limit rose from 100 to 128; the 100 MiB total-byte limit remains. No older retained path or object was removed.
- Dedicated preview version `ad559dc9-e426-418d-a0b7-191b7b50b170` served the exact commit with isolated resources, `0020` latest, no pending migration or schedules, and passed **158 GET / 126 asset checks**. The normal preview cluster route rendered and reloaded in Chrome.
- Remote `main` still pointed to `86dfb53` before the exact candidate was pushed atomically to `main` and `codex/cluster-detail-pagination`. [Cloudflare build 95193cc3](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/95193cc3-fef4-48e5-8c1b-e79b8743238f) and [GitHub checks 35824982828](https://github.com/watkajtys/earthquake/actions/runs/35824982828) and [35824982823](https://github.com/watkajtys/earthquake/actions/runs/35824982823) passed. Production Worker version `3aea7783-aa19-4bbd-8384-5a8d60dfd08e` reached 100% at **06:05:05 UTC**. Both public hosts returned the exact uncached revision/version and independently passed **158 GET / 126 asset checks**.
- A direct production Chrome visit to the stored Milford, Utah cluster showed **661 total earthquakes** with rows **1–50 of 661**; Next page changed the range to **51–100 of 661**. The map and chart still included the full underlying cluster. This verifies the visible pagination path, not a measured loading, interaction, billing or Core Web Vitals improvement. No D1 migration or synthetic production data was part of this release.

## Paused durable ingestion and production migration 0022 — 2026-09-23 UTC

Status at this stopping point: the paused Worker was live and additive D1
migration `0022_durable_usgs_ingestion.sql` was applied. Durable ingestion
activation and public list publication were still paused. The subsequent
activation release is recorded below.

- The production Worker at 100% is source `e6ed7248fa0c250bd3fd83c250c71a8bccd07310`, version `79754405-4027-46cb-b004-42e41dedfb77`, with `LIST_PUBLICATION_PAUSED=true` and no durable activation binding. A real five-minute scheduled trace at 19:00:27 UTC showed the paused-list milestone on that exact revision/version. The last possible old-version dispatch was bounded by 19:00:13 UTC; the writer drain was held past 19:16 UTC.
- The fresh pre-0022 SQL export is 770,141,912 bytes, SHA-256 `a419df8e257566742e66a7f46fa795f4f38290798ad4dbc74a1c789cce9e0d20`. The private [backup manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/pre-0022-backup-manifest.json) has SHA-256 `b50562c279126a1cd297f1d45eb451edac5b36f78206df3f56ff99d1af580898` and binds the export, both isolated SQLite files, the rehearsal report, and the post-drain list manifest by byte length and checksum. A fresh Time Travel bookmark was captured before export and another immediately before migration; their values remain in private receipts only.
- The isolated restore and exact SQL-only `0022` rehearsal passed integrity, foreign-key, unchanged-existing-row and additive-schema checks. The rehearsed SQL SHA-256 is `4aa9a6a5b081f6de4c58d1ff26ab5c7b22606ac2fd9eb124428d99252da3062c`. The rehearsal correctly left its local `d1_migrations` ledger at `0021`; production application was verified separately.
- The [post-migration production D1 readback](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/post-0022-live-d1-readback.json), SHA-256 `0146530a514cf69c2ded80a01245d7dcccb5eaa6a3b8752f49e740fa30d88bc0`, showed ledger row `0022` at 20:15:14 UTC, the three new empty ingestion tables and the expected index. Existing event, cluster and detail-job rows remained present. Both public hosts still returned the exact paused Worker identity after migration at 20:17 UTC.
- The post-drain [list before-image manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/list-before-images-post-drain-20260923T2009Z/manifest.json), SHA-256 `602b8c8221821b2e59de9660dfdd91982193959bf6484ad2c6c8b592e0482401`, binds all three public R2 list objects, 2,053,412 bytes total. Their bytes and ETags remained unchanged through the 20:15:44 UTC post-migration readback. No production list restore or synthetic production ingestion was performed.
- Activation requires a final code revision with both flags enabled, the read-only private evidence gate, exact paused-predecessor readback, preview scheduled replay and guarded release checks. The backup and D1 migration do not themselves turn on durable ingestion.

## Durable ingestion activation — 2026-09-23 UTC

Status: production deployed through the guarded automatic build. The first 21
five-minute durable ingestion runs completed, including an exact-version
scheduled trace that verified list and period-feed publication. The production
application revision is `c1c81c4bef36732b3e8bbce534979208ee635add`.

- The original compute session stopped before activation. Recovery verified the
  exact paused predecessor `e6ed724` / `79754405-4027-46cb-b004-42e41dedfb77`,
  its 19:00 UTC paused Cron trace and the 19:16 UTC old-writer drain. The fresh
  770,141,912-byte D1 SQL export has SHA-256
  `a419df8e257566742e66a7f46fa795f4f38290798ad4dbc74a1c789cce9e0d20`.
  Two private Time Travel bookmarks and the post-drain before-images of the
  three list objects were saved before migration. Isolated restore and the exact
  `0022` rehearsal passed integrity, foreign-key, unchanged-row and additive
  schema checks; production then applied only `0022`. The private evidence gate
  passed against the final clean application SHA. Backup/bookmark contents stay
  under ignored `.reconciliation.local/production-0022-20260923/`.
- The activation wrapper requires both production flags, the reviewed receipt
  digests, exact paused predecessor, live read-only D1 migration/schema/empty
  table checks before and immediately before upload, and a final predecessor
  version check. It reruns tests, build, packaging and the predecessor archive
  check before deployment. The selected Workers Builds token already had D1
  access; production Builds uses `npm run release:production` from repository
  root on `main`, and preview-branch Builds are disabled. No access scope was
  changed.
- The paused predecessor's 26 live assets were matched to exact local bytes.
  Twenty-one missing immutable assets, 2,487,089 bytes, were created in each
  isolated preview and production R2 archive. All **293 retained assets totaling
  43,263,373 bytes** passed metadata and SHA-256 readback; the live predecessor
  graph passed its 26-path archive gate. No older archived object was overwritten
  or deleted. The retained asset cap rose to 320; the 100 MiB byte cap remains.
- The final local candidate passed **1,712 tests across 131 files, three
  skips**, changed-file lint, production Vite build and Wrangler dry run.
  Dedicated preview version `dbdba220-44d9-4bbb-9436-87f0f6fc5f97` passed
  **325 GET / 293 asset** smoke checks after refreshing time-sensitive preview
  fixtures. Its actual scheduled handler replay passed paused legacy, unpaused
  without durable, durable still paused, and durable active states; only the
  last wrote three synthetic preview lists, and cleanup was verified. No
  synthetic production data was inserted.
- After confirming remote `main` remained at `e6ed724`, the exact application
  SHA was pushed atomically to `main` and
  `codex/durable-0022-activation-release`. [Cloudflare automatic build
  72f21e36](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/72f21e36-b679-45d0-b7c6-2af9b9d255d6)
  ran the guarded deploy command and reported a passed release at **21:03:13
  UTC**. Its private report was
  `/opt/buildhome/repo/.reconciliation.local/releases/c1c81c4bef36732b3e8bbce534979208ee635add-1790197018935.json`.
  Production version `a5d02414-2cc5-4add-9394-2e42c7e330f4` was deployed at
  **21:00:53 UTC** with 100% traffic. Both public hosts returned its exact
  no-store revision/version identity in independent readback. The active
  version/tag readback had `LIST_PUBLICATION_PAUSED=false`,
  `DURABLE_INGESTION_ENABLED=true` and the exact release revision.
- At **22:40 UTC**, production D1 had one `hour` ingestion state and **20
  completed runs**, with 179 of 179 features processed, zero pending/retry/
  parked runs, no active run, and zero ingestion issues. The latest completed
  source generation was 22:40:09 UTC. Cloudflare's Cron events showed Success
  for five-minute runs at 22:35 and 22:40 UTC and for five-, ten-, and
  thirty-minute runs at 22:30 UTC. Dashboard Cron history alone does not expose
  Worker version; the D1 run ledger establishes that the new durable handler
  executed repeatedly. The daily Cron remains unobserved in this release.
- A version-filtered tail captured the **22:45:25 UTC** `*/5` invocation on
  exact Worker version `a5d02414-2cc5-4add-9394-2e42c7e330f4` with outcome
  `ok`, zero exceptions, 14.189 s wall and 865 ms CPU. Ingestion returned
  HTTP 200, the three legacy R2 lists published **175 / 1,354 / 5,907**
  day/week/month rows, and the three independent complete period feeds
  published **252 / 2,138 / 10,686**. Post-Cron D1 readback showed **21 of 21
  runs completed**, cursors equal to feature counts, zero retries/parked runs,
  zero issues and no active lease. Both public hosts served the exact release
  identity and fresh 200 read paths. The private [read-only comparison](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/independent-live-audit-20260923T2245Z.json)
  found the legacy lists smaller than the complete period feeds. The legacy
  lists already had smaller historical coverage before activation; the cause
  and reconciliation policy remain open and are not attributed to this release.
  The private version-filtered trace is
  `.reconciliation.local/production-0022-20260923/activation-tail.jsonl`,
  SHA-256 `6cbbd1d7364510f1285cece27a357268e44ccc6c285d5e6096390747c07861a2`.
- The next data-integrity item is a separate legacy list coverage repair.
  `generate-lists.js` merges the complete hourly source into existing R2
  arrays and does not rebuild them from the independent complete day/week/month
  feeds. Before migration, the legacy arrays held 199 / 1,364 / 5,916 rows
  while the isolated production backup held 202 / 1,679 / 10,757 D1 rows in
  matching windows. At 22:45:42 UTC, live read-only D1 counts were 195 /
  1,673 / 10,740, versus legacy arrays 175 / 1,354 / 5,907 and complete feeds
  252 / 2,138 / 10,686. Counts alone cannot prove ID-level completeness or
  deletions. A subsequent fixed-window, read-only comparison at 22:53–22:54
  UTC found **20 / 309 / 4,507** day/week/month IDs present in both a complete
  feed and D1 but absent from the legacy array. All legacy IDs were present in
  D1 within those windows. The feeds also contained **62 / 548 / 761** IDs
  absent from D1 and the legacy arrays, so a replacement source and deletion
  policy need explicit design. The private
  [ID audit](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/legacy-list-id-audit-20260923T2254Z.json)
  is mode 0600, SHA-256
  `85124c78257979b08a90a407ca00fabe5df8cc9616ac7c16edf2df5eafcba84c`.
  Prepare a validated, backed-up list rebuild under a separate release; no
  list replacement was part of this activation.
- A read-only comparison against the restored pre-0022 production backup found
  that all **62 / 548 / 761** complete-feed IDs absent from current D1 were
  already absent before migration. No backed-up ID in these current-feed
  cohorts disappeared afterward. In the day cohort, 60 of 62 event occurrence
  times predate the 19:00 UTC writer pause. The migration created only three
  ingestion tables and one index; its rehearsal preserved all 190,243 existing
  event rows. This rules out `0022` deleting the sampled missing IDs, while
  historical source snapshots are unavailable to assign each ingestion miss to
  one cause. The private [causality cross-check](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/feed-only-pre0022-crosscheck-20260923T2258Z.json)
  is mode 0600, SHA-256
  `222b3360b4bb22c49ea55e886b172720ab6e2947ec8ecca45fca2adb5c7dc534`.
  A separate [coverage repair plan](USGS-COVERAGE-REPAIR-2026-09-23.md)
  sequences a fresh backup, revision-fenced D1 backfill, complete-feed list
  production and forward reconciliation. At 23:25:30 UTC, read-only production
  D1 had **29 of 29 completed hourly durable runs**, zero retries/parked runs
  and issues, and no active lease; that proves the current hourly handler is
  completing, not that historical D1 coverage is complete.

## Production D1 pinned-snapshot coverage backfill — 2026-09-24 UTC

The authorized data repair inserted 791 IDs absent from D1, in nine bounded
insert-only batches. This was a data repair, with no `0023` migration, Worker
release, existing-row update or public-list replacement. A fresh production
SQL export and Time Travel bookmark were taken immediately before writes; its
private [backup manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/primarydb-before-backfill-20260924T0131Z.manifest.json)
has SHA-256
`5a1920c123cbc69fef432c118cf09926046677dd462dc48e76e6aaacaf920576`.
An isolated restore passed integrity and foreign-key checks. Each batch had a
fresh live schema/absence preflight and typed full-row post-write readback.
The [pinned-source final audit](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-coverage-apply-20260924T0134Z/final-audit/id-coverage-report.json)
(SHA-256
`640946bfcbd6dac7ed207a5d40b6be8260ca6f46c734eb532a6efbc2c452b373`)
found all 10,704 saved complete USGS snapshot IDs present in D1. At 01:38 UTC,
the [hourly health report](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-coverage-apply-20260924T0134Z/final-audit/hourly-health-report.json)
(SHA-256
`fd27570c16a67fae4c304e41c1870ef5a79fa8e767c74f8cddf5b9e2e5258fbf`)
found 55 completed hourly runs, no active run, zero issues and 191,085 event
rows. The [coverage repair record](USGS-COVERAGE-REPAIR-2026-09-23.md) has
batch details and remaining work: permanent D1 reconciliation and separate
legacy R2 list repair.

Recovery: the paused predecessor is a code recovery candidate only after a
fresh compatibility review. It contains an older writer contract; rolling back
to it after active list publication can regress public arrays. The D1 export,
bookmarks and post-drain list before-images remain private recovery evidence;
a Worker rollback does not revert later D1/R2/KV writes. Do not restore the
pre-activation list objects over live publications without reconciling all
post-backup ingestion.

## Preserve immutable complete-feed archives — 2026-09-24 UTC

Production code `eb46fe7b31f89991d6a739597bf94403d7ff74f6` removes the
complete-feed publisher's deletion of snapshots older than its two-entry
pointer. Immutable writes, source validation, pointer compare-and-swap and
fallback behavior are unchanged. The application now has no R2 deletion call.
All R2 archives must be preserved; this supersedes earlier cleanup proposals.
There was no production data migration or legacy public-list replacement.

The single application commit follows production `c1c81c4` directly. Local
validation passed 1,707 tests across 131 files (3 skipped), frontend build and
production dry-run packaging. All 30 frontend build files matched the prior
production build byte for byte. An independent review found no blocker.
Preview version `84f931a4-2a17-4b9e-9850-94bd5cab56c2` served the exact revision
and passed 325 GET checks / 293 asset checks with refreshed synthetic fixtures
in dedicated preview resources. The read-only predecessor archive gate verified
26 current assets and all 293 retained assets before promotion.

An ordinary push of the exact code SHA to `main` invoked the existing guarded
`npm run release:production` command. The [first build](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/e3af812c-099b-4c5d-90b0-8e7ed59140b4)
stopped before upload because an unchanged ingestion concurrency test timed out.
Its focused rerun passed all seven tests. The [unchanged guarded retry](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/f7503a8e-c800-4941-a0a2-50a2f7695511)
passed at 03:08:20 UTC, including the full suite, deployment configuration,
archive gate and 325 GET / 293 asset checks on each public host. No check or
assertion was disabled. Investigation of the existing test timeout remains
maintenance work; the retry made no source changes.

The new production Worker version is `bbf6ad59-da33-4adc-93db-19151479fea8`.
Both public hosts returned the exact revision and version. Production R2 has
no enabled expiration rule for committed objects; its sole lifecycle rule
aborts incomplete multipart uploads after seven days.

A read-only baseline at 03:07:07–03:07:15 UTC pinned two immutable objects
for each period. At 03:15:55 UTC, all six objects had identical SHA-256 hashes
and lengths after **two advances per period**, and every pinned object was
older than the live previous pointer. Sequences advanced day/week 831→833 and
month 829→831. The final retention report has
`retentionBeyondTwoEntryPointerProven: true`, SHA-256
`52af39d7e48317feacb25b7b210145b2938d95eca3b7a54ce0515c4e4e07baa1`.
The baseline SHA-256 is
`dbd3199a40d40309816b294395d1ae2d2c5456b28822c55e06b80fa174d02fff`.

Version-filtered observation captured successful 03:10 and 03:15 publication
cycles with no exceptions, plus successful ten-minute cluster invocations.
The final independent GET/304/HEAD checks passed for all three fresh complete
feeds on both hosts: 268 day, 2,175 week and 10,730 month events. These are
snapshot observations, not permanent totals. The tail was stopped after
verification; no session-owned monitor remains. `verification-summary.json`
records the exact captured event metadata and evidence checksums.

Evidence lives in ignored `.reconciliation.local/archive-preserve-production/`.
The release does not restore snapshots deleted before this change, prove a
complete inventory of historical archives, or solve recurring D1/public-list
coverage gaps. The permanent scanner and other repair prototypes remain local
and inactive. Current scope and archive policy are in [STOPPING-POINT.md](STOPPING-POINT.md).

Recovery must preserve the no-deletion publisher. The preceding code contains
the old snapshot cleanup, so it is not an archive-preserving rollback target.
If another regression requires recovery, retain this small deletion-removal
patch while choosing a compatible application base. Code rollback does not
restore previously deleted R2 objects or revert database changes.

## Subrelease record template

Copy this section for each focused release. Replace placeholders with observed facts or explicit `not run` / `not applicable`, never assumed success.

### Package/subrelease: TBD

- Status: planned / implemented / local verified / preview verified / production deployed / observed complete / blocked.
- Findings covered and remaining:
- Branch, source commit and PR (if created):
- Shared API/schema/identity contracts introduced or changed:
- Relevant previous package versions/contracts:
- Files and actual deployed entrypoints:
- Design decision or deviation, with reason:

Validation:

- Reproduced failure and corrected-behavior regression:
- Targeted tests and result:
- Full tests, skips/exclusions and lint result:
- Build/packaging result:
- Preview resource identity, seed generation and deployment version:
- Browser paths, viewport/input modes and observed result:
- Failure-injection results:
- Performance fixture, method, before/after and limitations (when relevant):

Data changes (when relevant):

- Fresh production schema fingerprint/migration preflight:
- Backup/bookmark location and UTC time (reference only, no export contents):
- Restore rehearsal target, result and recovery-time observation:
- Migration/repair checksum and explicit target:
- Dry-run candidate counts, quarantine/ambiguous cases and invariants:
- Writer containment/compatibility during repair:
- Applied batch range/checkpoint and changed/rejected counts:
- Post-repair row counts, schema/query plans and scientific-data invariants:
- Recovery actions and reconciliation of post-backup writes:

Release:

- Exact deploy command/trigger and build/check link:
- Previous compatible good Worker version:
- New Worker version, source revision and environment:
- Expected/live resource comparison:
- Bounded production smoke and identity result:
- Actual background execution evidence and observation window:
- Unobserved next scheduled run/follow-up:
- Code recovery procedure:
- Data/KV/R2/queue recovery procedure:
- Current unresolved blocker, evidence and next owner:

Completion decision:

- Acceptance criteria satisfied:
- Acceptance criteria still open:
- Finding IDs closed, with regression/release evidence:
- Next subrelease and dependencies:
