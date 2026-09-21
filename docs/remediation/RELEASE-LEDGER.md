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

Status: implementation locally verified; remote preview and promotion pending. Final frozen integration passed **1,111 tests / 106 files, four existing skips**. Build and explicit production packaging dry run passed. All touched JavaScript/test files have zero ESLint errors; one existing Fast Refresh export warning remains. Diff whitespace checks passed.

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

Open boundaries:

- F7 remains open: overview cards still reconstruct statistics from a weekly member subset. Authoritative compact cluster summaries and bounded rendering belong to the performance release.
- Cluster duplicate anchors, mixed database timestamps, durable revisions/aliases and historical reconciliation remain package 3. Exact selectors prevent ambiguous new API calls but do not repair data.
- R2 eligibility/publication freshness, large globe/fault assets, sitemap fan-out, broader dependency/lint/test cleanup and old-session asset recovery remain open performance/supporting work.
- Fake-clock lifecycle tests establish polling/cancellation/retry behavior; production receipt time alone is not evidence of source freshness or completeness. Existing event corrections update loaded views immediately; newly observed IDs still enter each resource through its own refresh cadence.
- Next discrete containment: stop legacy cluster-version string growth without rewriting history and replace destructive `INSERT OR REPLACE` with canonical-identity-preserving collision handling. A local SQLite reproduction confirmed a stable-key race can currently replace an existing ID. Then reconcile schema/migration history and restore indexed selectors, with backup/restore gates before structural repair.
- Smallest independent performance follow-up: consume stored cluster scalars directly, bound visible cards, and avoid static-route cluster polling. Payload/CPU reduction requires the later bounded published-page contract; projecting the existing whole KV blob would not establish it.

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
