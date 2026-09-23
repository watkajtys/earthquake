# Deployment runbook

This runbook describes the reconciled repository as of September 21, 2026. It is a procedure, not a record that a release or its checks have completed.

## Runtime and resources

Use Node.js **22.13.0 or later**, install with `npm ci`, and use the project's pinned **Wrangler 4.135.0** through npm scripts or `npx wrangler`. `wrangler.toml` runs `npm run build` before Wrangler development and deployment. Native Workers Static Assets deploy `dist/` with the Worker through `ASSETS`; requests run through the Worker before the SPA fallback.

| Resource | Preview | Production |
| --- | --- | --- |
| Worker | `earthquake-reconcile-preview` | `earthquake` |
| URL | [Preview](https://earthquake-reconcile-preview.matty-f7e.workers.dev) | [earthquakeslive.com](https://earthquakeslive.com) |
| D1 | `earthquake-reconcile-preview` | `PrimaryDB` |
| `CLUSTER_KV` namespace | `earthquake-reconcile-preview-clusters` | Existing production namespace |
| `USGS_LAST_RESPONSE_KV` namespace | `earthquake-reconcile-preview-usgs` | Existing production namespace |
| R2 | `earthquake-reconcile-preview` | `geojson-bucket` |
| Queue | `earthquake-reconcile-preview` | `geojson-queue` |
| Cron triggers | None | Every 5, 10, and 30 minutes; daily at 00:00 UTC |

Exact resource IDs are in `wrangler.toml`. Production retains the original `STATIC_KV` binding and old asset contents for already-open clients and rollback. `src/legacyStaticAssets.js` serves only the known August hashed JS/CSS URLs from that namespace; new HTML and new assets use `ASSETS`. Do not delete the legacy namespace or its contents during this transition.

This release uses the existing production data schema and does not apply production migrations. Preview seeding applies repository migrations only to the dedicated preview database, or its local simulation. The seed script refuses production targets and checks remote resource names before writing.

The durable-ingestion integration is staged with `LIST_PUBLICATION_PAUSED=true`
and no `DURABLE_INGESTION_ENABLED` binding. The production release wrapper
checks both conditions in the reviewed config and uploaded version. During the
paused stage, the five-minute cron continues hourly D1 ingestion and complete
period-feed publication; the three legacy list arrays retain their last
published values. The pause is intentional while old unconditional list
invocations drain. Missing or malformed activation bindings stop production
list writes.

The frontend accepts R2 summaries only when every record includes complete alert, tsunami, felt-report, and significance metadata refreshed within ten minutes. Sparse or older caches retain the existing USGS fallback. The hourly ingestion scope is unchanged; retaining richer new records does not guarantee a complete fresh snapshot for every period. This prevents cached summaries from silently removing alert information.

## Local development and checks

```bash
npm ci
npm run seed:preview
npm test
npm run check:deploy
npm run dev
```

`seed:preview` defaults to `--local`, persists in `.wrangler/state`, and upserts four synthetic earthquakes and one cluster with times relative to the run. It also writes `active_clusters` to KV, three period feeds, and four full earthquake details to R2. Re-run it when fixture timestamps become old. `npm run dev` runs `wrangler dev --env preview --local`; `npm run preview` is the same local full application.

With the development server running, use another terminal:

```bash
npm run smoke -- http://localhost:8787 --preview
```

The smoke script uses GET requests to check HTML routes, built and lazy-loaded assets, R2 feeds, cluster APIs, sitemaps, and JSON errors for unknown APIs. `--preview` also requires synthetic fixture data and exercises quake/cluster detail routes. It does not render WebGL or prove browser interaction: check globe rendering, earthquake and cluster clicks, period changes, direct-link reloads, and mobile layout in a browser.

`npm run check:deploy` builds and performs a production packaging dry run without uploading. `npm run dev:ui` starts Vite alone and has no API proxy. Record actual test failures or exclusions in the release report; these commands do not imply the complete historical suite is passing.

## Remote preview

Authenticate Wrangler for the configured account, then seed and deploy the isolated preview:

```bash
npm run seed:preview -- --remote
npm run deploy:preview
npm run smoke -- https://earthquake-reconcile-preview.matty-f7e.workers.dev --preview
```

Review the preview in a browser using the same flows as local. Preview has no cron ingestion, so refreshing fixture times is an explicit seed operation. `npm run deploy:staging` is a compatibility alias for `deploy:preview`; it does not target production storage.

Seed immediately before browser testing: after ten minutes the fixture metadata expires and the frontend intentionally falls back to live USGS summaries. Preview responses carry `X-Robots-Tag: noindex, nofollow`.

## Production release and automatic Builds

GitHub Actions (`.github/workflows/main.yml`) runs repository checks; it does not deploy. **Cloudflare Workers Builds is an independent push-triggered publisher** and must run its own gates for the exact revision. Inspect its connected repository, Worker, production branch, root directory, build/deploy commands, branch builds, watched paths and environment overrides before pushing a branch. Do not assume a successful GitHub check gates Cloudflare.

The routine release command is:

```bash
npm run release:production -- --revision <full-reviewed-commit-sha>
```

`npm run deploy` also invokes this gate. In Workers Builds, set the production deploy command to `npm run release:production`; `WORKERS_CI_COMMIT_SHA` supplies the expected SHA. GitHub CI can supply `GITHUB_SHA`. Local releases must pass `--revision`. Conflicting CI SHAs, a dirty checkout (including untracked source), an unexpected account/Worker, or missing readback access fail before upload. The npm entrypoint selects `--env production`; the script rejects missing or other environments and arbitrary Worker-name overrides.

Authenticate through Wrangler OAuth or a scoped `CLOUDFLARE_API_TOKEN`. The same identity needs permission to deploy and to read Worker deployments, version/settings/bindings, schedules, subdomain, custom domains and Queue consumers. The wrapper uses the pinned Wrangler's official `auth token --json` command to refresh/retrieve credentials privately; token stdout is captured in memory and its debug log discarded. Missing permissions are a failed preflight, never a skipped successful check. Do not put tokens in shell arguments, source, evidence files or release reports.

The wrapper performs these gates:

1. Read the current single 100% deployment and compare existing production bindings, resource IDs, domain, crons and Queue consumer settings with Wrangler's schema-normalized config.
2. Run `npm test`, explicitly build the frontend, and dry-run the production package. Wrangler's existing custom build hook also runs Vite during packaging and deployment. These repeated builds are intentional for this first release control; removing them requires proof the same tested asset manifest is published.
3. Recheck the clean revision and unchanged current deployment, then run pinned local Wrangler with explicit production environment, full revision tag and release identity variable.
4. Capture the new version from Wrangler's machine-readable output, read back its bindings/revision and live configuration, and check release identity plus the bounded GET smoke on **both public hosts**. Recheck identity and live version after each smoke so a concurrent replacement fails the release.

For the paused durable-integration release, read back the version at 100% and
confirm a five-minute scheduled log milestone, "List publication paused during
writer transition," with the same revision and version ID. Keep the exact
time of that observation. Do not activate the revisioned writer until every
old unconditional writer is finished; [Cloudflare bounds Cron invocations to
15 minutes](https://developers.cloudflare.com/workers/platform/limits/), so
the drain interval must start after the last possible old-version dispatch.
The current wrapper blocks unpausing and blocks the durable flag; activation
requires a separately reviewed release gate and actual-handler preview proof.
Immediately before any later production 0022 migration, take a **fresh** D1
export and Time Travel bookmark, verify their checksums, restore the export in
isolation, rehearse the exact migration, then apply it only after those checks
pass. The previous preview and local rehearsals are evidence, not that fresh
backup. A rollback after activation must select a writer compatible with the
new list protocol; rolling back to the old unconditional writer can regress
public arrays.

The read-only activation receipt gate is
`node scripts/verify-durable-activation-evidence.mjs --evidence .reconciliation.local/production-0022-20260923/evidence.json --candidate-revision <full activation commit SHA>`.
It binds the paused Worker trace and drain interval, fresh D1 export and Time
Travel bookmark, isolated restore/0022 SQL rehearsal report, applied migration
checksum, and post-drain byte-verified list before-images to one candidate.
It leaves production configuration paused. The release operator must also read
back the actual production 0022 ledger/schema and current Worker version before
activation; private receipts alone cannot establish current Cloudflare state.
When running this candidate in a separate worktree, pass
`--repository-root /Users/theair/Projects/earthquake` so receipt paths resolve
under the original repository's private reconciliation directory.

The no-store `/api/release-identity` response reports revision, environment and the platform version ID. Missing required bindings return an error; identity does not write probes. The initial identity check may wait up to 90 seconds for the exactly captured previous revision/version to disappear. Each attempt rechecks the active control-plane version. Authentication errors, malformed/cacheable responses, unknown revisions, and competing deployments fail immediately; post-smoke identity checks have no old-version grace. Requests identify themselves with the same first-party User-Agent as the smoke script.

Smoke follows a real emitted cluster sitemap URL, checks browser/crawler canonical agreement and validates built assets and archived quake details. These checks do not establish feed freshness/completeness beyond the existing contract. Package 5 adds that contract; current release evidence and remaining limitations are in `docs/remediation/RELEASE-LEDGER.md`.

A redacted JSON result is written to `.reconciliation.local/releases/<revision>-<timestamp>.json` (override with `--report <path>`). It records UTC timestamps, revision, Worker/environment, previous/new version and each check, including identity attempt counts and allowlisted failure codes/HTTP status when available. It never records response bodies or arbitrary error messages. Save that report with actual preview/browser evidence and the automatic build run in `docs/remediation/RELEASE-LEDGER.md`; do not commit raw cloud API responses. A failed post-upload gate exits nonzero but **does not undo publication**. Upload failures can also occur after publication; read back the live state before deciding recovery.

Before first publishing this wrapper, contain the existing automatic trigger or save/read back the temporary command `npm test && npm run deploy:production` with explicit frontend build. Once the wrapper is on the intended branch, switch the existing trigger to `npm run release:production`, read back the setting, and execute one controlled automatic build. Keep feature-branch production Builds disabled; use the dedicated preview Worker for isolated resources. An uploaded preview version attached to the production Worker is not a data sandbox. Dashboard state and a real automatic run are external validation gates, not established by this file.

`npm run deploy:production` remains an explicit emergency primitive (`wrangler deploy --env production`) and bypasses the wrapper. Use it only after equivalent manual tests/build/packaging and a reviewed recovery decision; pass `--tag <sha> --var RELEASE_REVISION:<sha> --var DEPLOYMENT_ENVIRONMENT:production` so identity is meaningful. Manually verify configuration, both hosts and current version afterward. This escape hatch can repair configuration drift that the routine wrapper deliberately refuses to publish over.

After release, observe actual scheduled executions at the next 5/10/30-minute intervals. Record the next daily job separately. An inferred health/log endpoint is not execution evidence. Local tests, a dry run or a manual deployment do not close OPS-1; the existing automatic trigger must deploy the reviewed SHA and pass these checks.

## Rollback

1. Contain a competing or incorrect automatic trigger before recovery. Read the current deployment and determine whether another operator has replaced the failed release. Never automatically roll back over a newer release.
2. Consult the release ledger and inspect recent versions/configuration to select the most recent **compatible, verified good** version. The wrapper's `previousVersion` is a candidate, not proof that it is healthy or compatible. Check retained bindings and current schema/data requirements.
3. Restore that explicitly selected version, then read back configuration and run the smoke appropriate to that version on both public hosts:

```bash
npx wrangler deployments list --env production
npx wrangler versions view <selected-version-id> --env production --json
npx wrangler rollback <selected-version-id> --env production --message "Restore reviewed compatible release"
npx wrangler deployments list --env production
```

Historical versions `5eae3e4d-d96c-42c4-9f05-6e7e4c1d458a` (August baseline) and `2b0d2f34-8faf-4dd7-8433-4c7702f47ef9` (September binding restoration) are audit references, not default rollback targets. Older releases may not implement the release identity or reconciled API contract; use the documented compatible checks and verify original assets and browser flows.

A Worker rollback does not restore D1/KV/R2 contents. Keep the old bound resources available; deleted resources can prevent rollback. See [Cloudflare's rollback documentation](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

The local, Git-ignored snapshot directory `.reconciliation.local/2026-09-21/` contains the captured Worker multipart bundle, settings, deployments, routes/resources, and legacy asset inventory/content. These files are recovery evidence on this machine, not a backup of production D1/KV/R2 data. Keep the snapshot available while validating this migration.
