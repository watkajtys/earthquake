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

The existing 146-path production R2 archive was retrieved read-only and all 22,702,455 bytes matched their manifest sizes and SHA-256 digests. The immediately preceding `f5f4341` frontend graph contains 24 JS/CSS files. Local union staging verified each source and produced 167 unique paths, 28,408,951 bytes, with no URL/content collision. The reviewed staging cap is now 176 paths; its boundary regression accepts 167 and rejects 177. This is a local frozen graph, not an R2 upload. The private asset input and output are under `/private/tmp/earthquake-predecessor-assets-20260923` and `/private/tmp/earthquake-retained-union-20260923`.

With the new manifest, 1,619 tests passed across 128 files (three skips); changed-file ESLint, Vite build, and production packaging dry run passed. Remote preview and production have not been changed for this candidate. Before release, archive and verify the frozen graph in isolated preview R2, run the full smoke against the isolated remote preview, and verify both direct detail routes without browser errors. Production archival and promotion remain separate release steps.
