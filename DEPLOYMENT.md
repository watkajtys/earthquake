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

## Production release

After local checks and preview review, deploy the same reviewed checkout:

```bash
npx wrangler deployments list --env production
npm run deploy:production
npm run smoke -- https://earthquakeslive.com
npx wrangler deployments list --env production
```

Record the commit, deployment/version ID, commands, results, and browser observations in the release report. `npm run deploy` aliases `deploy:production`. The repository's GitHub workflow validates changes; it does not publish them automatically. Production smoke uses existing feeds and does not seed synthetic data or invoke administrative write endpoints.

## Rollback

The captured pre-reconciliation baseline is Worker version **`5eae3e4d-d96c-42c4-9f05-6e7e4c1d458a`**, deployed **August 31, 2026 at 18:33:28 UTC**. For this migration, restore it with:

```bash
npx wrangler rollback 5eae3e4d-d96c-42c4-9f05-6e7e4c1d458a --env production --message "Rollback deployment reconciliation"
npx wrangler deployments list --env production
```

Verify the homepage, its original JS/CSS assets, earthquake feeds, and normal browser interactions after rollback. The new smoke script expects the reconciled API contract, so it is not a pass/fail gate for the August version. For later releases, first identify the appropriate known-good version rather than always returning to this migration baseline.

A Worker rollback does not restore D1/KV/R2 contents. Keep the old bound resources available; deleted resources can prevent rollback. See [Cloudflare's rollback documentation](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

The local, Git-ignored snapshot directory `.reconciliation.local/2026-09-21/` contains the captured Worker multipart bundle, settings, deployments, routes/resources, and legacy asset inventory/content. These files are recovery evidence on this machine, not a backup of production D1/KV/R2 data. Keep the snapshot available while validating this migration.
