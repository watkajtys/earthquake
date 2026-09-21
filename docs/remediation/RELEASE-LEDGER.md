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

Status: implemented and locally verified; remote preview and production promotion pending.

- Branch: `codex/remediation-foundations`, based on audited `aca32df909dc76f23483ab19779ac5fcbafed1b3`.
- Package 1: added guarded release script, identity response, version metadata, exact binding/domain/cron/queue readback, source/version race checks and strengthened both-host smoke. On the authenticated Cloudflare dashboard, confirmed the unsafe saved `npx wrangler deploy` command, saved a temporary tested production command, then saved `npm run release:production`. Production branch remains `main`; non-production Builds are disabled. The existing automatic trigger is not yet verified by a real run. No token/secret has been created or expanded.
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

Remaining gates/limits:

- Finish isolated remote preview, promote the exact clean revision through the guarded path, verify both hosts and real background executions, and record the automatic trigger result.
- Inspect actual Builds token access; official default tokens may lack Queues permission. The wrapper fails before upload if required readback access is absent.
- Queue acceptance is not proof of archival completion. Durable outbox, revision fencing, overlapping job coordination, outage catch-up, atomic list publication and authoritative statistics remain later package 3/5 work.
- Existing cluster duplicate anchors and mixed timestamp data remain. Smoke validates canonical lookups exactly and anchor lookups against the returned definition, without asserting those unresolved identities are already unified.
- Database schema reconciliation, backups/restore rehearsal/repair, remaining frontend fixes, payload/render optimization and dependency upgrades remain planned. No finding is marked fully released by local tests alone.

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
