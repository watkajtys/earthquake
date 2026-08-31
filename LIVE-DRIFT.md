# LIVE-DRIFT.md — unrecoverable live-vs-repo drift (2026-08 reconstitution)

Scope: drift that could NOT be restored from the deployed worker bundle artifacts.

## Frontend (React app) — DRIFTED, not restored

The deployed frontend is served from KV keys listed in
`earthquake-live/asset-manifest.json` (21 entries). Rebuilding the repo frontend
(`npm ci && npm run build`, vite 6.x from package-lock) produces **different
content hashes for every shared chunk** plus **5 chunks that do not exist in the
live manifest at all**:

- Repo-only chunks (absent live): `WhatCausesEarthquakesPage-*`,
  `EarthquakeSafetyPage-*`, `TsunamisPage-*`, `MonitoringPage-*`,
  `gem_active_faults_harmonized-*` (5.1 MB fault dataset chunk).
- Only two chunks match live exactly (both are static data, not code):
  `TectonicPlateBoundaries-D_0ztLpA.js` and `ne_110m_coastline-BmLK7DdU.js`.

Conclusion: the deployed frontend was built from a DIFFERENT (older and/or
separately patched) source tree than this repo's `main`. The repo is AHEAD in
features (extra Learn pages, Monitoring page, fault dataset) but the live
frontend contains at least one behavior the repo does NOT have:

- `registerClusterDefinition` in repo `src/services/clusterApiService.js` treats
  only HTTP **201** as success. Per the live hotfix (PATCH-REPORT.md), the
  deployed frontend treats **200** as "already_registered" and stops retrying —
  i.e. the live client's registration/retry logic differs from the repo's.

Per the recovery constraints, the minified KV-hosted frontend bundles were NOT
reverse-engineered. The repo frontend source is left untouched.

Behavior probes (repo `src/`) — all present, so the repo client is close to,
but not identical with, the deployed client:

- `registerClusterDefinition` — present (`src/services/clusterApiService.js:18`),
  called from HomePage cluster-registration effects (see `src/pages/HomePage*.jsx`).
- `/api/calculate-clusters` client call — present (`clusterApiService.js`).
- `setInterval(..., 1000)` countdowns — present
  (`src/components/TimeSinceLastMajorQuakeBanner.jsx:48`, `NotableQuakeFeature.jsx:90`).

## Worker side — fully restored

All 29 bundle modules + the preamble's STATIC_ASSET_MANIFEST /
handleStaticAssetRequest were restored (see RECONSTITUTION.md). No unrecoverable
worker-side drift remains; residual differences are esbuild/prettier formatting
and keep-names label values only.

## Lost deploy tooling

The tooling that (a) generated `STATIC_ASSET_MANIFEST` from `vite build` output,
(b) uploaded `dist/` assets into the `STATIC_KV` namespace under double-hashed
keys (`<name>.<hash10>.<ext>`), and (c) prepended the manifest + static handler
to the bundled worker before upload, is not in the repo and was not recovered.
The manifest + handler are now inlined in `src/worker.js`, but a fresh frontend
build requires regenerating the manifest and re-uploading KV assets by hand.
