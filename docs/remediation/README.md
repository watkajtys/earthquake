# Earthquakes Live remediation handoff

Prepared 2026-09-21 UTC from the comprehensive audit of commit `aca32df909dc76f23483ab19779ac5fcbafed1b3`. This is an implementation plan for another model. The briefs preserve the original plan. Implementation has started; current status and evidence are recorded in [RELEASE-LEDGER.md](RELEASE-LEDGER.md). Do not treat a planned acceptance criterion as an observed result.

## Read this first

The correct project is `watkajtys/earthquake`, deployed as Cloudflare Worker `earthquake` for [earthquakeslive.com](https://earthquakeslive.com). The local checkout used for the audit is `/Users/theair/Projects/earthquake`. Production and preview resource identities are in `wrangler.toml`; re-read them before any remote operation.

The audited application is a React/Vite SPA with a handwritten Cloudflare Worker router, scheduled jobs, Queue processing, D1, KV and R2. The deployed entrypoint is `src/worker.js`. Files under `functions/` are used only where that entrypoint imports/calls them; similarly named Pages handlers may be inactive. Passing a test for an inactive handler is not evidence the production route is fixed.

The audit found reproducible access-control, ingestion/retry, schema, frontend and performance defects. It also caught a release incident: an independent Cloudflare Workers Builds deployment replaced a correct manual deployment with an asset-only Worker. Production was restored to version `2b0d2f34-8faf-4dd7-8433-4c7702f47ef9`; its 37 GET checks / 23 assets passed. Recurrence prevention was still open because the Builds settings API returned 403 and the dashboard required sign-in. Verify current state: do not treat this historical version as necessarily current or suitable for every future rollback.

At handoff preparation, application source and dependency versions remained unchanged from the audit. These plan documents are the only new files. The last verified ordinary test baseline was 764 passed / 4 skipped, with two component files explicitly excluded in `vite.config.js`. That is a baseline, not proof the audited bugs are absent.

## Execution packages

| Order | Brief | Deliverable | Completion gate |
|---|---|---|---|
| 1 | [Reliable deployments](01-reliable-deployments.md) | Correct existing Workers Builds configuration; one gated release path; deployment identity, binding and API checks | A real automatic trigger deploys the intended revision with correct resources and passes verification |
| 2 | [Endpoints and Worker safety](02-endpoints-and-worker-safety.md) | Public reads separated from trusted writes, authenticated maintenance, bounded inputs, safe cache variants and spatial calculation | Actual exported Worker rejects unauthorized/invalid work before side effects while scheduled/queue work still succeeds |
| 3 | [Data integrity and database](03-data-integrity-and-database.md) | Retry-safe writers; additive schema reconciliation; stable cluster identity/revision; validated repairs | Failure-injection tests pass, restore rehearsal succeeds, schema/query/repair invariants verified |
| 4 | [Frontend correctness](04-frontend-correctness.md) | Stable URL resolution, usable layouts/lists/modals, fresh data state, safe labels and crawler metadata | Targeted regressions and browser flows pass on desktop/mobile/direct links |
| 5 | [Performance and delivery](05-performance-and-data-delivery.md) | Compact summaries, complete feed snapshots, bounded rendering, lazy assets and stored-data sitemaps | Scientific correctness preserved; measured payload/request/render budgets satisfied |
| Supporting | [Dependencies and validation](06-dependencies-and-validation.md) | Reachability-aware dependency updates, real Worker tests, meaningful lint and schema gates | Reviewed lockfile/toolchain changes with all relevant application/build/runtime checks passing |

The five packages are priorities, not five mandatory giant PRs. Package 3 and package 5 deliberately split into smaller releases. Promote each independently reviewable change when its dependencies and checks are satisfied. Do not wait for all performance or dependency work to fix the P1 defects.

## Dependencies and parallel work

1. **Before publishing branches:** inspect the Cloudflare branch triggers. Until package 1 closes the known unsafe deploy path, develop locally or in isolated preview; do not assume a branch push is read-only.
2. **Before production application release:** package 1 must establish a safe release path. If dashboard access remains unavailable, finish local fixes and preview validation while the exact external settings action remains open. A manually verified release may be possible within the user's authorization if the bad automatic trigger is contained; document that it does not close automatic deployment verification.
3. **Before data cleanup:** deploy and verify package 3's writer/retry fixes and additive compatibility schema. Repair data only after a fresh backup/restore rehearsal and dry-run plan. Old writers must not recreate the corruption during repair.
4. **Before summary cutover:** package 3 establishes durable cluster identity/revision; package 4 resolves exact IDs/slugs/aliases; package 5 publishes a versioned canonical summary before changing the consumer. Loading a weekly subset must not change canonical counts or IDs.
5. **Before feed cutover:** package 3 prevents destructive failed-bootstrap replacement, package 2 restricts upstream access, package 4 fixes refresh/retry state, then package 5 completes the producer/consumer freshness contract.
6. **Throughout:** promote audit regressions into the normal tests in the package that fixes them. Runtime test infrastructure may be introduced early; a coordinated major test-tool upgrade remains a separate reviewable change.

Useful independent work while deployment access is pending: local security/input tests; ingestion failure tests; additive migration design against a sanitized schema fixture; URL/modal/layout fixes; bundle/DOM measurement; dependency reachability review. Do not simulate production mutation tests on the real database.

When delegating, give one model a bounded file/module owner and an agreed contract. `src/worker.js`, `HomePage.jsx`, the data provider, cluster writers and tests will be touched by multiple packages: land shared changes sequentially or work in separate branches and integrate deliberately. Do not run competing schema repairs, publishers or deployments. Root/coordinator owns integration and release evidence.

## Shared design decisions

| Boundary | Required contract |
|---|---|
| Public vs trusted work | Browser requests cannot select ingestion mode, database contents, arbitrary upstream destinations or administrative jobs. Scheduled/queue handlers call trusted functions directly. |
| Persistence and retries | Report completion only after required durable work succeeds. Retry failures idempotently; account for overlapping jobs and older upstream revisions. A queue send and a D1 update are not one transaction. |
| Cluster identity | Identity survives small coordinate/title/anchor changes; memberships and metadata have a numeric revision. Preserve historical aliases. Shared strongest-event IDs do not alone establish duplicates. |
| Time | Explicit units and UTC semantics at storage/API boundaries. Event occurrence, upstream revision, row update and snapshot generation are distinct fields. |
| Summary vs membership | Existing cards and enabled map consumers use authoritative summary fields; this plan does not add a new cluster globe overlay. Details load members on demand. Weekly/monthly client subsets never replace canonical counts, strongest event or IDs. |
| Feed freshness | Freshness means successful verification of the whole source window, with complete alert/felt/tsunami/significance fields. It is not each event's age or the time stale data was rewritten. |
| Compatibility | Prefer additive routes/schema/aliases and producer-first rollout. Retain legacy response readers and assets while older clients/rollback require them. |
| Cache | Never share user-agent-dependent or unauthorized responses without a verified cache policy. Static asset, HTML, data-generation and error caching are separate decisions. |
| Recovery | Code rollback does not restore data. Each schema/repair/publisher change has an explicit compatible-code and data-recovery procedure. |

The briefs give recommended designs, not a requirement to add every suggested new table, endpoint or library. Choose the smallest implementation that satisfies the contracts and evidence. Record a short decision note when deviating, with tests proving the same invariant. Unknown product policy—such as broad historical retention or ambiguous cluster merge/split semantics—requires a concrete proposal; do not silently delete records to simplify it.

## Working procedure for every package

1. Read the brief and current code. Compare the working tree/HEAD with the audited revision. Check for already-completed fixes and preserve uncommitted user work. Establish a `codex/` branch if needed; do not create an unrelated app or repository.
2. Reproduce the relevant failure locally with deterministic fixtures. Existing audit probes assert the old defect; turn them into regression tests that assert the corrected behavior, rather than copying their expected failure unchanged.
3. Implement the smallest coherent subrelease. Keep unrelated formatting, compatibility-date changes, dependency majors and broad framework rewrites out of it.
4. Test the active execution path and affected state transitions. Run targeted tests during development, then required project checks once the subrelease is ready. Expand testing when a failure or new change warrants it.
5. Build and validate the dedicated preview, including appropriate failure scenarios and browser behavior. Preview has no automatic crons: exercise scheduled/queue work explicitly in its isolated runtime. Seed synthetic fixtures only there or locally.
6. Before production, record the exact revision, compatible prior version, resource/migration target, rollout steps and recovery. Use existing user authorization; do not repeatedly ask for already-approved routine actions. Missing authentication and destructive data repairs without a validated recovery plan are concrete blockers to address, not permission to guess.
7. Release through package 1's verified path. Run bounded, side-effect-free production smoke, confirm identity/configuration, then collect relevant background-run evidence. Do not use mutation probes to prove a public vulnerability on production.
8. Update the release ledger with actual results. Clearly distinguish code implemented, tested locally, preview verified, production released, and background behavior observed. Never mark a package complete merely because code exists or one endpoint returned 200.

## Baseline commands and environments

Use the existing lockfile, Node >=22.13.0 and project-local Wrangler 4.135.0 unless a reviewed maintenance package updates them. Current scripts:

```bash
npm ci
npm test
npm run check:deploy
npm run seed:preview
npm run dev
```

With the local Worker running, `npm run smoke -- http://localhost:8787 --preview` checks the seeded application. Remote isolated preview commands are documented in `DEPLOYMENT.md`; inspect resource names and the seed script guard before using `--remote`. Audit-era fixture metadata expires after ten minutes, so reseed immediately before those browser checks until package 5 updates the fixture contract.

Production is [earthquakeslive.com](https://earthquakeslive.com), with a second public Worker host at [earthquake.matty-f7e.workers.dev](https://earthquake.matty-f7e.workers.dev). Application access controls must protect both. Dedicated preview is [earthquake-reconcile-preview.matty-f7e.workers.dev](https://earthquake-reconcile-preview.matty-f7e.workers.dev).

Do not run `wrangler d1 migrations apply` against production merely because migrations pass on a fresh local database. Eight recorded production migrations were missing from the repository and triggers/indexes had drifted. Package 3 must reconcile the actual live schema with new forward migrations and an explicit plan for migration history. Existing local deployment snapshots are not backups of production D1/KV/R2 data.

## Complete finding coverage

| Audit ID | Problem | Owner / coordination |
|---|---|---|
| OPS-1 | Automatic deploy loses bindings | 1 |
| B1 | Arbitrary upstream proxy persists caller data | 2; 3 preserves checkpoint semantics |
| B2 | Shared cache mixes user-agent variants | 2; 5 preserves policy during asset work |
| B3 | Unauthenticated maintenance/cluster writes | 2 |
| B4 | Polar input causes unbounded computation | 2 |
| B5 | Negative batch size removes SQL limit | 2; 3 cursor/worker tests |
| B6 | Crawler cannot resolve generated cluster slug | 4; 3 alias/identity foundation |
| B7 | Antimeridian neighbors missed | 2 |
| B8 | Unsupported KV CAS loses counter updates | 3 |
| DB-01 | Missing indexes and conflicting triggers | 3 |
| DB-02 | Partial failed ingestion checkpointed as complete | 3 first subrelease; pull minimum fix into 2 only if extraction requires it |
| DB-03 | Revision concatenation and unchanged writes | 3 |
| DB-04 | Coordinate/depth-only corrections dropped | 3 |
| DB-05 | Incomplete detail marked fetched | 3 |
| DB-06 | Unstable cluster identity creates extra active records | 3; 5 summaries |
| DB-07 | Mixed timestamp types choose incorrect latest row | 3 |
| DB-08 | Sitemap count/page predicates disagree | 3; 5 removes upstream work |
| DB-09 | Queue-send failure strands completed detail | 3 |
| DB-10 | Cursor disagrees with backfill sort | 3 |
| DB-11 | Failed bootstrap destroys history in R2 snapshots | 3; 5 complete producer |
| F1 | Negative/null magnitude URL parsing | 4 |
| F2 | Pagination empty after shorter result set | 4 |
| F3 | Legacy cluster URL loading never completes | 4 |
| F4 | Escape closes/navigates twice | 4 |
| F5 | Month never refreshes; first-failure retry disappears | 4; 5 request service |
| F6 | Cluster list never refreshes/retries | 4; 5 summary service |
| F7 | Weekly intersections corrupt canonical card identity/count | 5, following 3/4 contracts |
| F8 | Downward magnitude revision leaves stale major event | 4; 3 persisted correction |
| F9 | Blank desktop overview/feed pane | 4 |
| F10 | Tooltip interprets place text as HTML | 4; independent fix can move into 2 by explicit ownership transfer |
| PERF-1 | Complete membership graph downloaded on mount | 5A |
| PERF-2 | Incompatible freshness gate and serial fallbacks | 5B |
| PERF-3 | Unbounded detail rows/markers | 5C |
| PERF-4 | Eager dependencies, global fault data, weak asset caching | 5D |
| PERF-5 | Sequential upstream work in cold sitemap | 5E |
| QA/dependencies | Excluded tests, inactive handler coverage, lint/config issues, affected package versions | 6 plus regression tests in each owner package |
| Other observations | Keyboard access, coverage/error metadata, unbuilt crawler script | 4 |
| Other observations | Null createdAt and missing migration history | 3; do not invent historical creation times |
| Operational follow-up | Queue retry exhaustion/DLQ and misleading health/log endpoints | 3 queue recovery; 1/6 truthful monitoring |

## Evidence availability and limitations

The comprehensive audit and reproductions are local, ignored files under `.reconciliation.local/audit-2026-09-21/`. Read `AUDIT.md` and the backend/database/frontend/dependency appendices there if available. The briefs summarize the essential findings and fixtures so another checkout can proceed without those private artifacts. Do not commit raw cloud settings, credentials or database exports to make a handoff portable. If evidence is absent, reproduce locally and re-inspect bounded live metadata instead of inventing it.

No production exploit attempt was performed. F10 is a confirmed HTML sink with conditional security impact, not a demonstrated remote stored-XSS chain. Shared cache impact is a verified risk, not a recorded poisoning incident. Dependency advisory counts are graph entries, not independent reachable exploits. No account-wide WAF/Access review, real-device performance trace, Core Web Vitals, load test or billing estimate was completed. Keep those distinctions in downstream reports.

## Progress and release ledger

Use [RELEASE-LEDGER.md](RELEASE-LEDGER.md) during implementation. For each subrelease record:

- Findings and contract versions changed; commit/PR and active source entrypoints.
- Tests actually run, results and explicit exclusions; preview/browser evidence.
- Schema preflight, backup/restore rehearsal and repair counts if relevant.
- Production trigger/build/version, expected binding check and bounded smoke results.
- Background observations, remaining uncertainty, compatible recovery version and data recovery procedure.
- Next dependency/owner and unfinished findings. Keep historical baseline separate from fresh measurements.

## Copyable coordinator prompt

> Implement the Earthquakes Live remediation plan in docs/remediation/README.md and its six linked briefs. Start by verifying the current repository and live deployment against the audit baseline. Carry out the five primary packages in dependency order, splitting them into focused releases; treat dependency/tooling updates as a separate supporting package. Fix the Cloudflare automatic deployment path before publishing into it. Use existing user authorization and the isolated preview, preserve production resources and old clients, and never replay historical migrations blindly. Fix writers before data repairs; produce validated backups, a restore rehearsal and dry-run counts before production repair. Delegate independent bounded work where useful, but coordinate shared files/contracts and deployments. Test the actual exported Worker and browser state transitions, report measured performance without invented scores, and update docs/remediation/RELEASE-LEDGER.md after each verified subrelease. If authentication or a genuinely unresolved data policy blocks one operation, complete independent authorized work and report the exact blocker. Do not mark a finding fixed until its acceptance criteria and applicable rollout checks are satisfied.
