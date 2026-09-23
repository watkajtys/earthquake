# Cluster detail lazy-load check — 2026-09-23 UTC

`HomePage` had an unused direct import of `ClusterDetailModal` while rendering only its lazy `ClusterDetailModalWrapper`. That import pulled Leaflet, cluster map and sequence-chart code into the entry chunk for routes that do not open a cluster. This local candidate removes the unused import; route behavior and data contracts are unchanged.

| Built asset | Deployed `f5f4341` base | Local candidate | Change |
| --- | ---: | ---: | ---: |
| Entry JavaScript, decoded bytes | 563,712 | 346,039 | −217,673 |
| Entry JavaScript, gzip bytes | 177,944 | 109,629 | −68,315 |
| Entry CSS, decoded bytes | 60,018 | 44,982 | −15,036 |
| Entry CSS, gzip bytes | 14,575 | 8,089 | −6,486 |

The candidate creates a 169,897-byte decoded `EarthquakeMap` chunk, a 38,773-byte decoded cluster-detail wrapper chunk, and a 15,037-byte Leaflet CSS chunk loaded for detail views. The built entry no longer contains `cluster-group-icon`, the fault-filter logger, or sequence-chart text. These are build-graph byte comparisons, not measured Core Web Vitals or user transfer savings.

Vite build, changed-file ESLint, `git diff --check`, and 35 focused route/detail tests passed. An isolated local Wrangler preview was seeded with synthetic data; Chrome rendered `/learn`, a direct cluster detail, and a direct earthquake detail. The full local smoke passed all API and route checks through the new entry JS/CSS, then stopped at the first previously retained asset because the local R2 fixture does not contain the production predecessor archive. That local archive gap also caused browser errors for two older reused map-data chunks; it is not evidence of a new chunk-graph failure. Remote preview and production have not been changed for this candidate. Before release, archive and verify the immediately preceding `f5f4341` asset graph, run the full smoke against the isolated remote preview, and verify both direct detail routes without browser errors.
