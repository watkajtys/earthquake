# 1. Reliable deployments

Status: planned. Primary finding: OPS-1. Read `README.md` in this directory first. This package changes release controls, not application data.

## Outcome

Every production deployment selects the production environment, passes the required checks before publication, and verifies the deployed revision, bindings and public API afterward. A GitHub push must not silently replace a healthy Worker with an asset-only Worker. Preview work must use isolated resources.

## Evidence and starting points

The audited source was `aca32df909dc76f23483ab19779ac5fcbafed1b3`. A correct manual release was followed by a successful Cloudflare Workers Builds check that deployed version `7a891a19-5ef1-4874-bee6-ba6d1581076b` with only `ASSETS`; D1/KV/R2/queue bindings disappeared. The deployed service tag matched the root `earthquake-local` configuration. An omitted production environment is the leading explanation; the exact saved build command was not accessible during the audit.

The audit restored production using `npm run deploy:production`, producing version `2b0d2f34-8faf-4dd7-8433-4c7702f47ef9`; 37 GET checks covering 23 assets passed. These are historical facts, not a claim about the live deployment when you start.

Inspect these files:

- `wrangler.toml`: root config is `earthquake-local`; production and preview resources are explicitly separated.
- `package.json`: existing `deploy:production`, `deploy:preview`, `check:deploy`, `smoke` and `seed:preview` scripts.
- `.github/workflows/main.yml`: verifies tests and production packaging, but does not deploy or gate the independent Workers Builds job.
- `scripts/smoke-deployment.mjs`: useful baseline, but HTTP 200 and array shape do not establish freshness or correct revision.
- `scripts/seed-preview.mjs`, `src/legacyStaticAssets.js`, `DEPLOYMENT.md`.
- If available, audit `github-release-checks.json`, `broken-version-metadata.json`, `restored-cloudflare-state.json` and restoration logs.

Cloudflare documents separate build/deploy commands and a separate non-production branch command. Configure the environment explicitly in each relevant command. Inspect root directory, branch filters and connected Worker together, rather than editing only one field. [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [environment setup](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/).

## Implementation sequence

### 1A. Re-establish the live baseline and correct the existing trigger

1. Record local HEAD, branch, worktree status and remote refs. Preserve other contributors' work. Create a `codex/` branch for code changes; do not push a branch into an uninspected production trigger.
2. Read current production deployment/version, binding names and resource identities, custom domain, queue consumer and cron schedules. Compare with `env.production` in `wrangler.toml`. Do the same for preview. Do not recreate resources merely because one login cannot list them.
3. Inspect the existing production Workers Builds trigger: repository, production branch, root directory, build command, deploy command, non-production behavior, watched paths and environment overrides. Save a redacted before/after record. Do not create a duplicate trigger.
4. The audit's Wrangler OAuth could deploy Workers but received 403 from Builds settings; the dashboard was signed out. Reuse an authenticated dashboard session if available. If access is still missing, complete the local scripts/tests and report the specific remaining settings action. Authentication is a blocker for this dashboard change, not for all development. Never infer access from an old tool result or print tokens.
5. Set the existing production deploy command to the already present `npm run deploy:production` to correct its target environment, but recognize that this primitive does not run tests. Before publishing the wrapper in 1B, temporarily pause/contain automatic production promotion and inspect branch behavior; publish the reviewed wrapper, configure the trigger to invoke it, then re-enable a controlled run. Alternatively, first configure and verify a temporary command using existing scripts that runs tests/build before the explicit production deploy. There must be no bootstrap interval in which a push can deploy unchecked code. Explicitly build the frontend in Workers Builds; verify the actual build logs and asset manifest rather than assuming the Wrangler custom build hook ran.
6. Inspect non-production branch handling. Recommended arrangement: production deployment only from the intended protected production branch; dedicated preview Worker for feature work. A version preview attached to the production Worker is not a database sandbox. Do not seed or run write tests against it. Preserve existing branch-build intent where safe, but do not let feature branches publish over production or execute synthetic work with production bindings.
7. Verify settings with a read-back. Do not claim OPS-1 closed until a real build through that trigger produces the expected environment and passes its post-deploy checks.

Do not fix the root config by copying production bindings into it: that would make accidental default/local invocations more dangerous. Do not change compatibility date or Wrangler version as part of this repair.

### 1B. Add one verifiable production release path

Recommended implementation: a checked-in release script, invoked by a new npm script such as `release:production`, that calls project-local commands with argument arrays and propagates failures. Names in this section are proposals, not commands that exist yet.

The script should:

1. Require the intended environment and establish the expected source revision. Avoid accepting an arbitrary Worker name as a production override.
2. Run the required tests and frontend build before uploading. Workers Builds and GitHub Actions are independent; a deployment must not race ahead of the only test gate. Either the release script runs the gates itself, or it demonstrably waits for required checks for the exact revision. Prefer the former initially.
3. Deploy with explicit `--env production` using the pinned local Wrangler. Keep local development and preview scripts separate. Resolve any duplicate Vite build intentionally after reading actual pipeline behavior; do not optimize it by skipping required assets.
4. Capture the newly deployed version and revision, then run bounded verification. Exit nonzero if verification fails. A failed check after upload does not undo the deployment: emit a clear recovery instruction and the previous compatible version.
5. Produce a machine-readable, redacted release result: source revision, Worker, environment, previous/new version, check results and UTC timestamps. Do not include credentials, full cloud responses, earthquake records or user request bodies.
6. Detect concurrent/replaced deployments. If the live version no longer matches the one just deployed, report the race instead of attributing another version's smoke result to this release. Do not blindly rollback over another operator's newer release.

Publish the wrapper only after the trigger is contained or the temporary test/build/deploy gate is verified. Once the wrapper exists on the branch the trigger can build, update/read back the trigger command and run that exact reviewed revision through it. Keep `deploy:production` as an explicit emergency primitive, documented as requiring the same manual checks. Avoid recursive npm aliases.

Add a minimal read-only, `no-store` release identity response or header using a build revision or supported version metadata binding. It must not write health probes to KV, leak binding IDs/secrets, or report a fabricated success when required bindings are absent. Use bounded real read checks for the data path; binding presence alone is insufficient. If platform metadata inspection needs a permission absent from the pipeline, record that check as incomplete rather than succeeding silently; resolve the least-privilege access needed for the release gate.

### 1C. Strengthen verification and prevent regressions

Extend existing checks rather than replacing their coverage:

| Surface | Required check |
|---|---|
| Identity | Expected source revision and Worker version are serving; environment is production |
| Configuration | D1, both functional KV namespaces, retained legacy static KV, R2, queue producer/consumer, custom domain and four intended crons match the reviewed config |
| Main routes | `/`, `/overview`, `/feeds`, Learn, direct quake/cluster URL return the correct application shell or crawler document |
| Assets | Referenced entry, CSS and lazy chunks exist; wrong API paths still return JSON 404, not SPA HTML |
| Feeds | Day/week/month return the contracted shape/source; freshness and complete metadata are checked once package 5 publishes the new contract |
| Clusters | Summary list and a bounded existing cluster detail resolve; do not accept an empty KV miss as proof of a populated pipeline |
| Error/caching | After package 2 ships, its non-cacheable denies and protected admin boundaries become required regression gates |
| Preview | Correct isolated resources, no production cron, noindex header, synthetic fixtures confined to preview |

Package 1's first release verifies deployment/resource behavior against the existing contract; record known B6 crawler resolution and F9 layout defects without making their later repairs a circular prerequisite. Add their corrected-behavior gates when package 4 ships.

Use GET only for production release smoke, with explicit timeouts and a finite request count. Audit existing handlers first: a method named GET or a `/system-health` route is not necessarily side-effect free in this project. Use known stored detail IDs, and exclude active diagnostics, maintenance and the still-mutating proxy before package 2 lands. Exercise successful mutations only in isolated fixtures.

Add tests for the release script's control flow using stubbed subprocess/API results: wrong/missing environment, test failure before deploy, upload failure, missing binding, HTTP-200 wrong shape, wrong revision, replaced deployment and smoke failure. Never call real deployment commands from unit tests. Validate environment extraction against the installed Wrangler schema or a real TOML parser; avoid brittle grep-based parsing.

Update `DEPLOYMENT.md` to name both GitHub CI and Cloudflare Workers Builds. Its current statement that the GitHub workflow does not publish is accurate but incomplete about push-triggered releases. Replace the old default rollback example with a procedure to select the latest compatible good version. Keep the legacy asset bridge until a separate retirement decision.

## Acceptance and rollout

- Correct trigger settings are saved and read back; any unavailable setting is explicitly listed as open.
- A real trigger run for the reviewed revision builds, tests, deploys to production and passes identity/configuration/API checks. A manual deploy alone does not close this package.
- Simulated missing-binding and API-failure results fail the deployment verification job.
- Feature-branch work cannot inadvertently publish production or seed its resources.
- Preview smoke passes before the first code release; production smoke and configuration checks pass afterward.
- Observe the next applicable 5/10/30-minute scheduled runs through real execution evidence. Do not use the application's inferred log endpoint as proof. Record the next daily-run follow-up separately rather than claiming it ran during a short release session. Do not create a recurring automation unless requested.

First publish only the deployment controls, then proceed to endpoint fixes. Do not combine this with data migrations. Store the evidence in the release ledger described in the master README.

## Recovery

If this trigger deploys the wrong environment again, contain the bad trigger before restoring the known-good configuration; otherwise recovery may immediately be overwritten. Re-read live version/config first and restore the most recent compatible reviewed Worker. Re-run the release checks. Keep evidence of both the failed and recovery deployment.

A Worker rollback does not rewind D1, R2, KV or queue effects. Schema/data changes in later packages need their own recovery plan, and a code rollback must remain compatible with their schema. [Cloudflare rollback limitations](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## Handoff prompt

> Implement package 1 in docs/remediation/01-reliable-deployments.md, following docs/remediation/README.md. Start with fresh read-only verification of source, production and the existing Workers Builds trigger. Correct the explicit production environment, add pre-deploy and post-deploy gates, and update the release runbook. Use the existing isolated preview. Preserve legacy assets and all production resources. Do not change application data or replay migrations. If Builds authentication is unavailable, finish local implementation and tests and identify the exact remaining external action. Report the commit, trigger/settings evidence, preview/production checks, version IDs, recovery procedure and unresolved work; do not mark the trigger verified based only on a manual deployment.
