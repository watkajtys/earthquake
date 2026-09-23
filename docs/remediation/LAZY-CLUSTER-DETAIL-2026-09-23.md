# Cluster detail lazy-load check — 2026-09-23 UTC

`HomePage` had an unused direct import of `ClusterDetailModal` while rendering only its lazy `ClusterDetailModalWrapper`. That import pulled Leaflet, cluster map and sequence-chart code into the entry chunk for routes that do not open a cluster. This local candidate removes the unused import; route behavior and data contracts are unchanged.

| Built asset | Deployed `f5f4341` base | Local candidate | Change |
| --- | ---: | ---: | ---: |
| Entry JavaScript, decoded bytes | 563,712 | 346,039 | −217,673 |
| Entry JavaScript, gzip bytes | 177,944 | 109,629 | −68,315 |
| Entry CSS, decoded bytes | 60,018 | 44,982 | −15,036 |
| Entry CSS, gzip bytes | 14,575 | 8,089 | −6,486 |

The candidate creates a 169,897-byte decoded `EarthquakeMap` chunk, a 38,773-byte decoded cluster-detail wrapper chunk, and a 15,037-byte Leaflet CSS chunk loaded for detail views. The built entry no longer contains `cluster-group-icon`, the fault-filter logger, or sequence-chart text. These are build-graph byte comparisons, not measured Core Web Vitals or user transfer savings.

An isolated local Wrangler preview was seeded with synthetic data; Chrome rendered `/learn`, a direct cluster detail, and a direct earthquake detail. The full local smoke passed all API and route checks through the new entry JS/CSS, then stopped at the first previously retained asset because the local R2 fixture does not contain the production predecessor archive. That local archive gap also caused browser errors for two older reused map-data chunks; it is not evidence of a new chunk-graph failure.

The existing 146-path production R2 archive was retrieved read-only and all 22,702,455 bytes matched their manifest sizes and SHA-256 digests. The immediately preceding `f5f4341` frontend graph contains 24 JS/CSS files; all 24 also matched the live production public URLs byte for byte (6,025,481 bytes total) while the uncached source/version identity stayed `f5f4341` / `27d7a570-359a-49c1-897c-09ca0079612a`. Local union staging verified each source and produced 167 unique paths, 28,408,951 bytes, with no URL/content collision. The reviewed staging cap is now 176 paths; its boundary regression accepts 167 and rejects 177. The private asset input and output are under `/private/tmp/earthquake-predecessor-assets-20260923` and `/private/tmp/earthquake-retained-union-20260923`.

With the new manifest, 1,619 tests passed across 128 files (three skips); changed-file ESLint, `git diff --check`, Vite build, and production packaging dry run passed. The frozen 167-path graph was create-only archived and read back from the **isolated preview R2 bucket**. Exact code commit `f381899fd1fb56c8753c24342d8ebb6d9520c53b` was deployed to dedicated preview Worker version `4a2b7756-c2ed-4509-885e-cc846f82a789`; `/api/release-identity` returned that commit and version with `status: ok`. The preview has separate D1/KV/R2/Queue bindings and no cron. Its synthetic feed fixture was refreshed after an initial smoke stopped at the feed freshness gate. The final exact-version smoke passed **222 GET checks and 190 built assets**. Chrome rendered `/learn`, direct synthetic cluster detail with map and chart, and direct earthquake detail with map; the browser error log was empty.

Production has not changed for this candidate. Before production promotion, archive and verify the exact new paths in production R2, then use the guarded main-branch release and verify both public hosts. This build comparison does not measure Core Web Vitals or guarantee the same transfer savings for every route; opening detail views downloads their new lazy chunks on demand.
