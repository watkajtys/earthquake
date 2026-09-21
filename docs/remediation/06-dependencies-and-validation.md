# Supporting package: dependencies and validation

Status: planned. This supports the five primary packages. It must not delay urgent containment or combine unreviewed major upgrades with production recovery.

## Outcome

Make CI detect the audited failure classes and update affected dependencies using a reviewed compatibility matrix. Retain truthful statements about advisory reachability and test coverage.

## 6A. Establish meaningful test coverage alongside each fix

1. Keep existing React tests, but add tests through `src/worker.js`'s exported fetch/scheduled/queue handlers. Exercise routing/authentication and binding behavior, not only helper functions or unused Pages copies.
2. Introduce a separate Worker-runtime test configuration using tooling compatible with the chosen Wrangler/Vitest versions. Verify installed package support and current official documentation before selecting a Workers Vitest integration or Miniflare harness. Do not force a large test-tool upgrade into the first security fix if a compatible isolated runtime harness can validate it.
3. Use isolated local D1/KV/R2/Queue state and deterministic upstream fixtures. Network mocks reject unexpected destinations. Test background promise lifetime and queue retry/ack behavior, not just calls to a mocked helper. Never expose a test-only route on production to invoke trusted scheduled work.
4. Convert the audit's defect demonstrations into corrected-behavior regressions owned by packages 2–5. The scratch probes currently assert the bad behavior; copying them unchanged would preserve the bug.
5. Build databases from both a clean supported migration sequence and a sanitized production-equivalent schema fixture. Assert indexes, trigger count/behavior, column types and critical query plans. Do not import live earthquake data or credentials into fixtures. Package 3 owns the legitimate reconciliation of missing migration history.
6. Review `InteractiveGlobeView.test.jsx` and `NotableQuakeFeature.test.jsx`, explicitly excluded in `vite.config.js`. Repair the harness/mock assumptions and enable them, or replace them with equivalent meaningful coverage and a documented retirement. Do not merely remove the exclusions and accept new skips. WebGL rendering still needs browser validation; DOM mocks cannot prove its correctness.
7. Inventory duplicate handler implementations. For each important route, record the imported production implementation and tests that exercise it. Consolidate to shared implementations or retire dead files only after verifying imports/routing; preserve backward-compatible public paths. Avoid a broad router rewrite during security patches.

Current documentation starting points: [Workers testing](https://developers.cloudflare.com/workers/testing/), [Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/), [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/). Retrieve the applicable version-specific setup during implementation; these links are not a promise that an uninstalled package matches this lockfile.

## 6B. Make lint useful without disguising defects

The scoped audit found 91 errors and eight warnings across 225 source/function/script files, including 49 unused-value errors and 30 undefined names, many explained by missing Node globals. These are not 91 production defects.

1. Separate browser, Worker, Node script and test lint environments. Ignore generated build/JSDoc output and private audit probes where appropriate. Keep real undefined-name checks enabled.
2. Fix the benchmark script's undefined `readFileSync` and exercise a safe local/dry-run path before trusting its measurements. Do not make performance tooling run a production load test by default.
3. Review the proxy's duplicated/unreachable branch, effect dependencies and keyboard accessibility warnings with their owner packages. Don't silence hook warnings with blanket disables; check actual lifecycle behavior and stale closures.
4. Clean touched files first. Introduce a practical CI gate on the agreed source scope, with a documented existing baseline if unrelated cleanup remains. Do not broadly disable rules to make a number zero. Work toward a clean scoped lint run in a separate cleanup change.
5. Make operational labels honest: `system-health` currently performs probe work and app log endpoints may summarize inferred status rather than execution logs. Separate read-only status from active diagnostics, authenticate privileged diagnostics where needed, and label data provenance. Real deployment acceptance comes from platform/runtime evidence and durable job status.

## 6C. Update dependencies in reviewable groups

Audit snapshot: 34 affected dependency entries (4 critical, 19 high, 6 moderate, 5 low). Re-run the audit and inspect the actual installed/locked tree at implementation time. Advisories and versions will have changed; do not install a remembered version as if it were current.

| Group | Installed at audit | Proposed approach | Required validation |
|---|---|---|---|
| React Router | `react-router` / `react-router-dom` 7.6.2 | Compatible v7 update; audit-era floor 7.18.0, verify current advisories | Direct and legacy quake/cluster URLs, history close, feed query parameters, invalid link handling |
| Preact via globe tooltip | 10.26.9 | Prefer compatible parent/transitive update; audit-era patch floor 10.26.10 | Globe initialization, tooltips, no object/HTML injection regression, correct lockfile graph |
| Vite + React plugin | Vite 6.3.5 | Select a currently supported patched compatible combination; saved affected ranges reached 6.4.2 | Production assets, lazy imports, static Worker serving, dev scripts, sourcemaps and build |
| Vitest/UI/coverage | 3.2.4 | Upgrade coordinated package versions; saved newer advisory fix required 4.1.11; verify current requirements | Existing mocks/timers/MSW, separate Worker runtime config, coverage and excluded-test recovery |
| Happy DOM | 17.6.3 | Select patched compatible environment; saved floor 20.8.9 | React 19 events, timers, focus, Escape, fetch/mocks, accessibility tests |

The version floors are audit history, not a guarantee of current security or compatibility. Check maintainer advisories, release notes, Node engines and peer dependencies. The project currently requires Node >=22.13 and CI selects Node 22. Raise runtime requirements only if the reviewed dependency set requires it, updating local/CI/build environments together.

Process for each group:

1. Save a redacted fresh audit and `npm ls` snapshot. Classify direct/transitive, production/build/test runtime, applicable API, exploit prerequisites and proposed update.
2. Choose minimal supported upgrades clearing applicable advisories. Prefer upstream-compatible versions over an unexplained override. If an override is needed, explain which dependency introduces it, test compatibility and record removal criteria.
3. Update package manifests and lockfile reproducibly. Run a clean `npm ci` in the isolated worktree/check environment; inspect all transitive changes. Avoid `npm audit fix --force` as an unreviewed batch operation.
4. Run affected tests, the full suite and deployment packaging. Review bundle size changes and browser flows where a production dependency moved.
5. Re-run the audit. Explain remaining entries by reachability and upstream support rather than promising zero findings or suppressing severity. Commit each coherent group separately and avoid multiple lockfile owners at once.
6. Preview and release through package 1. For test/build-only upgrades verify produced artifacts and CI, even though the package is not shipped in the Worker. Rollback is the prior reviewed manifest/lockfile/artifacts, unless unrelated schema changes make its app code incompatible.

Reachability facts to preserve: this app uses BrowserRouter declarative mode, not React Router framework SSR/server actions. Vite is a development/build server, not the production server. Vitest/Happy DOM run test code and must not be treated as secure sandboxes for untrusted execution. Preact is present in the production globe tree, but the audited JSON-VNode injection prerequisite was not demonstrated. Fixing Preact does not fix F10's separate string-as-HTML tooltip sink.

## 6D. Close operational validation gaps

Use package 3's durable job/retry state to report ingestion failures, outbox backlog, retry exhaustion and queue terminal failures. Assess a dead-letter queue or equivalent retained failure record so exhausted retries do not disappear; document replay/deduplication and bind it separately in preview/production if selected. This belongs with queue reliability, not as an untested dashboard cosmetic change.

Give each scheduled job a bounded, structured result: task type, invocation/run ID, start/finish, source generation/cursor where relevant, attempted/succeeded/failed counts, durations and retry outcome. Redact upstream URLs with sensitive query data and never log credentials/full payloads. Use existing Workers observability first; select sampling/retention with the actual traffic/account rather than inventing cost savings.

Define objective follow-up checks after each release, such as freshness, failed-batch count, outbox age, repeated cluster creation, revision size and missing binding failures. Do not create recurring automations, external notifications or a new monitoring vendor merely because the plan mentions observation. If continuous monitoring is requested later, specify thresholds and keep unchanged states quiet.

## Acceptance

- Every audit regression is tracked to an active handler/component test in its owner package.
- Worker-runtime tests run in CI with isolated state and no production credentials.
- Clean and production-equivalent schema fixtures cover the reconciliation path.
- Excluded test coverage is restored/replaced explicitly; the reported test count explains any remaining skips.
- Scoped lint gates catch genuine undefined names/lifecycle/accessibility problems without generated-file noise.
- Updated dependencies have a reviewed tree/lockfile, current advisory assessment, passing tests/build and relevant preview evidence.
- No new unsolicited exposure of development/test servers, no weakened request/tooltip safeguards, and no hidden dependency major inside a recovery patch.
- Operational reports distinguish inferred status from observed executions; queue terminal failures have a documented recovery path.

## Handoff prompt

> Implement docs/remediation/06-dependencies-and-validation.md as a supporting series following the master remediation plan. Introduce meaningful exported-Worker/runtime and production-equivalent schema coverage alongside the primary fixes. Repair scoped lint and excluded tests without blanket suppression. Refresh dependency advisories and upgrade compatible package groups in separate reviewed changes, preserving accurate reachability claims and coordinating the test toolchain. Validate the resulting app in isolated preview and use the verified deployment path. Record remaining advisories, tests/skips, lockfile decisions and operational evidence rather than claiming a security score from dependency counts alone.
