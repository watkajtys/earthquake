# Historical cluster audit — 2026-09-23

This is a read-only triage of the restored production export taken before migration 0020. The SQL backup SHA-256 is `dd3ad2bc83d3233a5898fe72bd8d9f1236007353e4f825dd90e09c4f1b7b483d`. The audit opened only the isolated SQLite restore with `mode=ro`, `immutable=1`, and `PRAGMA query_only=ON`; it issued SELECT statements and made no production or backup changes. The local aggregate evidence is in `.reconciliation.local/production-0020-2026-09-23/historical-cluster-readonly-audit.json`.

The backup contains **45,387** `ClusterDefinitions` rows. At the backup manifest's 2026-09-23 05:04:10 UTC reference time, the existing `endTime >= now − 30 days` predicate selects **3,406** rows. This cutoff is an audit reference, not a permanent active-set definition.

| Observation | Restored backup |
| --- | ---: |
| Exact sorted, unique membership repeat groups across all rows | 1,074 groups containing 9,301 rows |
| Exact membership repeats within the 30-day set | 17 pairs containing 34 rows |
| Active exact pairs with differing stored time extents | 13 |
| Active exact pairs with differing strongest-event anchors | 1 |
| Nonidentical active same-anchor pairs with Jaccard overlap ≥ 0.8 | 15,040 of 46,290 pairs compared |
| `updatedAt` integer / text storage | 10,198 / 35,189 rows |
| Strongest-event groups whose raw `updatedAt DESC` winner is older than the normalized-time winner | 54 overall; 2 within the 30-day set |
| Stored `version` bytes / maximum length / rows longer than 1,000 characters | 33,746,202 / 327,514 / 3,777 |
| Null `createdAt` / null time extents | 44,595 / 589 rows |

The 54 order mismatches are a real read issue: the current strongest-event resolver sorts mixed SQLite types directly. In the 30-day subset, the wrong winner is 1.96–4.43 days older by normalized update time. The cluster sitemap also sorts the mixed column before its 500-row limit, so a newly written numeric timestamp can be excluded behind older text rows. Both paths need normalized ordering; the active writer already stores new numeric millisecond values while historical triggers can write UTC text.

**These are candidates, not deletion or automatic alias counts.** Equal member sets can belong to different time extents or policy generations. A shared strongest event and high Jaccard overlap can describe evolving clusters or real splits. This table has no explicit algorithm/window identity or lineage, and the old `version` string cannot be safely converted into an ordinal revision. Preserve old IDs and slugs while determining any supersession.

The next repair input should be a deterministic, read-only proposal manifest from a fresh backup. Record the export hash, generator and policy versions, reference cutoff, each row ID and before-image hash, slug and stable key, a SHA-256 of sorted unique members, member count, raw and normalized update timestamps, time and spatial extents, strongest-event ID, version length/hash, and algorithm/window identity (explicitly `unknown` where absent). For each proposed pair, include overlap score, consistency checks, ambiguity/tie reason, proposed canonical ID or `null`, and a review status. The generator must emit no UPDATE or DELETE. Rehearse any accepted additive status/alias mapping against a restored clone before a separately reviewed production repair.
