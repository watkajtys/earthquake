# LIVE-DRIFT.md — historical live-vs-repo drift (2026-08 reconstitution)

> **Current status (2026-09-21):** This records the August recovery, not the current deployment procedure. The reconciled checkout builds and deploys the frontend through native Workers Static Assets (`ASSETS`), retains old hashed assets in production `STATIC_KV`, and accepts R2 or D1 earthquake feeds. See [DEPLOYMENT.md](DEPLOYMENT.md) for current configuration, checks, preview, and rollback. Deployment and validation results are recorded separately.

Historical scope: drift that could NOT be restored from the deployed worker bundle artifacts during the August recovery.

## Frontend (React app) — DRIFTED, not restored

The August deployed frontend was served from KV keys listed in
`earthquake-live/asset-manifest.json` (21 entries). Rebuilding the repo frontend
(`npm ci && npm run build`, vite 6.x from package-lock) produced **different
content hashes for every shared chunk** plus **5 chunks that do not exist in the
live manifest at all**:

- Repo-only chunks (absent live): `WhatCausesEarthquakesPage-*`,
  `EarthquakeSafetyPage-*`, `TsunamisPage-*`, `MonitoringPage-*`,
  `gem_active_faults_harmonized-*` (5.1 MB fault dataset chunk).
- Only two chunks match live exactly (both are static data, not code):
  `TectonicPlateBoundaries-D_0ztLpA.js` and `ne_110m_coastline-BmLK7DdU.js`.

Conclusion at recovery: the deployed frontend was built from a DIFFERENT (older and/or
separately patched) source tree than the repo's `main`. The repo was AHEAD in
features (extra Learn pages, Monitoring page, fault dataset), while the live
frontend contained at least one behavior absent from the repo service:

- `registerClusterDefinition` in repo `src/services/clusterApiService.js` treated
  only HTTP **201** as success. Per the live hotfix (PATCH-REPORT.md), the
  deployed frontend treated **200** as "already_registered" and stopped retrying —
  i.e. the live client's registration/retry logic differed from the repo's.

Per the recovery constraints, the minified KV-hosted frontend bundles were NOT
reverse-engineered. The repo frontend source was left untouched during that recovery.

### Correction to the original behavior probes

The original note claimed HomePage called `registerClusterDefinition` and that
the service called `/api/calculate-clusters`. Source review on September 21
found no active application caller of registration: HomePage obtains summaries
through `fetchActiveClusters()`, which calls `GET /api/get-clusters`. References
to client calculation in service comments were stale. Countdown components
remain part of the client. The retained registration service still recognizes
only 201 and has no active application caller. The September reconciliation
fixes the active feed contract so healthy `X-Data-Source: R2` responses are
consumed instead of unnecessarily falling back to USGS.

## Worker side — recovery result

All 29 bundle modules + the preamble's STATIC_ASSET_MANIFEST /
handleStaticAssetRequest were restored (see RECONSTITUTION.md). No unrecoverable
worker-side drift was identified at recovery; residual differences were esbuild/prettier formatting
and keep-names label values only.

## Lost deploy tooling at recovery

The tooling that (a) generated `STATIC_ASSET_MANIFEST` from `vite build` output,
(b) uploaded `dist/` assets into the `STATIC_KV` namespace under double-hashed
keys (`<name>.<hash10>.<ext>`), and (c) prepended the manifest + static handler
to the bundled worker before upload, is not in the repo and was not recovered.
The recovery inlined the manifest + handler in `src/worker.js`; at that point a
fresh frontend build required regenerating the manifest and uploading KV assets
by hand. The September reconciliation replaces that workflow with native
Workers Static Assets. Recreating the lost KV publication tooling is no longer
required. The original frontend source has not been recovered; the checked-in
source is the basis for new builds and must be validated as described in the runbook.
