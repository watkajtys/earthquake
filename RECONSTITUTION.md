# RECONSTITUTION.md — repo restored from live deployment (2026-08)

Branch: `live-recovery-2026-08`. Ground truth: the deployed worker bundle
(`earthquake-live/worker-patched.js`, 29 module slices + `_preamble.js`,
prettier-formatted with minified identifiers). Companion docs:
`earthquake-live/PATCH-REPORT.md` (hotfix details), `LIVE-DRIFT.md` (what could
not be recovered).

## What was restored

25 repo source files were overwritten with restored live code, plus
`src/worker.js` which additionally gained the inlined `STATIC_ASSET_MANIFEST` +
`handleStaticAssetRequest` (previously prepended at deploy time by lost tooling):

- `functions/api/`: backfill-earthquake-details, batch-usgs-fetch, cache-stats,
  cluster-detail-with-quakes, fix-enhanced-data-flag, get-clusters,
  get-earthquakes, system-health, system-logs, task-metrics
- `functions/background/`: generate-lists, process-cluster-definitions, reconcile-stats
- `functions/consumers/geojson-archive.js`
- `functions/routes/api/usgs-proxy.js`
- `functions/routes/sitemaps/`: earthquakes-sitemap, index-sitemap
- `functions/utils/`: d1ClusterUtils, kv-stats-updater, mathUtils,
  spatialClusterUtils, xml-utils
- `src/utils/`: d1Utils, kvUtils, scheduledTaskLogger
- `src/worker.js`

Restoration method: each live module is an esbuild bundle slice. The esbuild
scaffolding (`__name()` keep-names wrappers, `__esm`/`__export` lazy-init
blocks, sourcemap comment) was stripped mechanically; ESM import/export
statements were re-added to match the bundle's cross-module references;
esbuild-lowered dynamic imports in `src/worker.js` were rewritten back to
`await import(...)`. **Minified local identifiers are kept verbatim**
(`onRequestGet2`…`onRequestGet10`, `jsonResponse2/3`, `worker_default`, …) so
the bundle reproduces exactly; exported names match the repo's original
contracts (`export { onRequestGet3 as onRequestGet }` etc.).

Three files were verified semantically identical to live and NOT overwritten
(they are shared with the frontend, which needs exports the worker bundle
tree-shakes away): `src/constants/appConstants.js`,
`src/utils/significanceUtils.js`, `src/utils/geoSpatialUtils.js`.

Notable pre-hotfix drift folded in by this restoration (live was ahead of repo):

- `functions/api/get-clusters.js` / `get-earthquakes.js`: `Cache-Control`
  (`s-maxage` + `stale-while-revalidate`) on KV-hit responses.
- `functions/background/generate-lists.js`: dead `createScheduledTaskLogger`
  import removed.
- `src/worker.js`: static-asset fallthrough is KV-based
  (`handleStaticAssetRequest`, `env.STATIC_KV`), not `env.ASSETS.fetch` as the
  old repo code assumed.

Repo-only exports that vanished from the live bundle are indistinguishable from
esbuild tree-shaking; they were dropped with their files per "live is truth":
`cache-stats.onGetTopKeys`, `cluster-detail-with-quakes.onRequest`,
`mathUtils.setDistanceCalculationProfiler`,
`spatialClusterUtils.benchmarkClusteringComparison`,
`d1Utils.enrichNewEarthquakesWithDetails`. Side effect: some `*.test.js` files
and `functions/utils/clusterBenchmark.js` (already broken — imports a
nonexistent module) may no longer resolve. Tests were not touched.

## What the hotfix contains (concepts)

See `earthquake-live/PATCH-REPORT.md`. In short:

1. **D1 upsert cost fix** in `src/utils/d1Utils.js` —
   `upsertEarthquakeFeaturesToD1` only rewrites a row when
   `event_time`/`magnitude`/`place` actually changed (`WHERE excluded.x IS NOT
   table.x`), eliminating ~2.8M/day billed row-writes from the 5-minute cron.
2. **Same pattern** in `src/worker.js` `handleEarthquakeDetailRequest`'s
   fallback upsert (`WHERE EarthquakeEvents.detail_fetched IS NOT TRUE`).
3. **New routes** in `src/worker.js`: `POST/GET /api/cluster-definition`
   (idempotent registration into `ClusterDefinitions`; 200 = already
   registered, 201 = new) and `POST /api/calculate-clusters` (server-side
   `findActiveClustersOptimized`). These stop the frontend's retry storm caused
   by the API paths falling through to the HTML static handler.

## wrangler.toml reconciliation

Aligned with live: `name = "earthquake"`, `compatibility_date = "2024-06-05"`,
`nodejs_compat`, crons `*/5 */30 */10 0 0` (already present). Changes made:

- Added `STATIC_KV` KV binding (**placeholder IDs — real namespace ID unknown,
  fill in from the dashboard before any deploy**), top-level and in
  `[env.production]` (env arrays replace top-level ones in wrangler).
- Disabled the `[assets]` (Workers Static Assets) section: the live worker does
  not use it; statics are served from `STATIC_KV` by code in `src/worker.js`.
- Added the `geojson-queue` consumer to `[env.production]` (env-level `queues`
  replaces the top-level config; production was missing the consumer).
- Custom domain `earthquakeslive.com`: attached out-of-band at zone level;
  left commented (`# custom_domains = [...]`) with a note, not active.

## Build verification

Command (equivalent to wrangler's bundling; wrangler itself was not run per
constraints):

```
npx esbuild src/worker.js --bundle --format=esm --keep-names --external:node:crypto
```

Result vs `earthquake-live/worker-patched.js`, compared per module section
after whitespace stripping:

- **Module set and order: identical** (all 29 modules + preamble helpers).
- `functions/utils/xml-utils.js` and `src/constants/appConstants.js`:
  token-identical.
- All other modules: identical except (a) prettier trailing commas / paren
  reflow in the live file, (b) keep-names label values (`__name(fn, "…")`
  strings carry the restored local names, e.g. `"onRequestGet3"` instead of
  `"onRequestGet"` — runtime-inert), (c) esbuild-version printing differences
  (`description: description` vs shorthand, redundant parens), (d)
  `STATIC_ASSET_MANIFEST` + `handleStaticAssetRequest` sit in the preamble in
  the live bundle (deploy-time prepend) vs the `src/worker.js` module section
  in the rebuild.
- The live bundle keeps `HEADER_TIME_UPDATE_INTERVAL_MS` in the appConstants
  section although no live module references it — evidence the originally
  deployed worker source imported it (repo `main` did not). The rebuild
  tree-shakes it. Inert.

Not reproducible byte-close without the lost deploy tooling (manifest
regeneration + prepend step); the delta above is the full, precise list.

## Remaining uncertainties

- **Frontend drift is real and unrecoverable** — see `LIVE-DRIFT.md`. Repo
  frontend ≠ deployed frontend (extra pages, different hashes, older
  cluster-registration semantics in repo).
- `STATIC_KV` namespace ID unknown (placeholder in wrangler.toml).
- The KV asset-upload/manifest tooling is lost; a frontend rebuild currently
  cannot be deployed without recreating it.
- Whether wrangler's exact esbuild flags match the verified command above was
  not tested (no wrangler commands were run, per constraints).
