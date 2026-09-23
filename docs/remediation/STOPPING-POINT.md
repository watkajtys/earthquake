# Remediation stopping point — 2026-09-23 UTC

This is the current handoff for resuming the Earthquakes Live remediation.
[RELEASE-LEDGER.md](RELEASE-LEDGER.md) records release-level evidence and
recovery boundaries. Earlier status paragraphs in that ledger describe their
own stopping points; they do not supersede this checkpoint.

## Safe place to pause

The production D1 migration `0022_durable_usgs_ingestion.sql` and the separate
durable-ingestion activation are complete. The migration was preceded by a
fresh export, two private Time Travel bookmarks, three public-list before-images,
an isolated restore, and an exact migration rehearsal. The 770,141,912-byte SQL
export is at ignored private path
`.reconciliation.local/production-0022-20260923/primarydb-before-0022.sql`,
SHA-256 `a419df8e257566742e66a7f46fa795f4f38290798ad4dbc74a1c789cce9e0d20`.
Do not commit or publish the export or bookmark values.

The last verified application revision on production `main` is
`c1c81c4bef36732b3e8bbce534979208ee635add`; the sole 100% production
Worker version is `a5d02414-2cc5-4add-9394-2e42c7e330f4`. Both public hosts
returned that exact uncached identity. The guarded automatic build passed.
At 22:45:25 UTC, a version-filtered tail captured a real five-minute invocation
with outcome `ok`, zero exceptions, HTTP 200 ingestion, and publication of all
three legacy lists and complete period feeds. Subsequent D1 readback showed
21 of 21 durable runs completed, with zero retries, parked runs or ingestion
issues and no active lease. The daily scheduled job has not yet been observed
on this release. The tail was stopped; there is no session-owned monitoring.

The application release branch is `codex/durable-0022-activation-release` at
the same code SHA. The docs-only branch `codex/durable-0022-release-record`
records the activation and this handoff; its later commits are not deployed
application code. Recheck production state when resuming rather than treating
this snapshot as a live monitor. No production migration or activation step is
pending, and no historical cluster repair or legacy-list replacement was made.

## What is live

- Guarded Workers Builds, exact release identity and binding checks, archive
  retention of 293 verified immutable assets, and the source-revision writer
  guard are in place.
- The sitemap/canonical correction is deployed and the sitemap index was
  accepted by Google Search Console. Its indexing effect is unmeasured; the
  triage found no evidence that Google delisted the site.
- Legacy unauthenticated cluster calculation is rejected cheaply before body
  parsing. The ten-minute cluster writer skips unchanged rows and bounds
  unchanged summary publication. Compact summary cards, stored totals and
  lazy full-detail loading are live. Full individual cluster plots remain
  available; detail rows are paginated, while their stored totals and full
  chart/map membership are preserved.
- Complete day/week/month feed snapshots, rolling-window browser
  reconciliation, the durable ingestion scheduler and its list publication are
  live. The cluster chart axis and bounded diagnostics for failed feed reads
  are also present on the deployed source.

## Remaining work, in recommended order

1. **Public-list and D1 coverage.** At 22:45 UTC, the legacy day/week/month
   lists contained 175 / 1,354 / 5,907 entries, while separately published
   complete feeds contained 252 / 2,138 / 10,686. A gap was already present
   before activation. A subsequent fixed-window, read-only ID audit found
   **20 / 309 / 4,507** day/week/month IDs present in both a complete feed
   and D1 but absent from the legacy list; all legacy IDs were present in D1.
   The feeds also contained **62 / 548 / 761** IDs absent from both D1 and
   legacy arrays. Define the list source, revision and deletion policy before
   a validated rebuild, and investigate the D1 coverage difference. Keep
   replacement in a separate release with fresh R2 before-images and readback.
2. **Scientific cluster identity and historical integrity.** The tested
   deterministic tie-order candidate remains unpromoted because it changes
   three same-membership cluster identities in one reference set. A separate
   read-only proposal found 17 exact-member duplicate pairs among active
   historical rows; equal members alone do not select a canonical URL or
   scientific window. Review algorithm lineage and public URLs, choose an
   alias/transition policy, then rehearse a guarded repair against a fresh
   backup. Mixed timestamps, historical version strings and concurrent
   publication consistency also remain open.
3. **Intermittent week-feed HTTP 503.** A ten-second read timeout has
   intermittently failed release smoke on both old and newer code. The
   deployed diagnostics identify the failed read stage without changing the
   deadline. Capture a bounded recurrence, then fix the measured stage and
   verify the successful feed contract remains intact.
4. **SEO and performance observation.** Check Search Console crawl and index
   outcomes after the sitemap correction; an accepted sitemap is not proof of
   recovered indexing. Measure browser Core Web Vitals, cluster map/chart work,
   request latency and traffic before claiming cost or speed gains. Continue
   safe retention automation, deferred R2 cleanup, dependency/lint/test debt,
   and observe the daily scheduled job when its window arrives.

## Resume the next bounded block

Start with the [private fixed-window ID audit](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/legacy-list-id-audit-20260923T2254Z.json)
for item 1. Its SHA-256 is
`85124c78257979b08a90a407ca00fabe5df8cc9616ac7c16edf2df5eafcba84c`.
It proves a conservative missing-ID set, not a safe automatic deletion rule.
Design a bounded list source/revision policy and rehearse the resulting
producer change against isolated snapshots before any production replacement. Use
[03-data-integrity-and-database.md](03-data-integrity-and-database.md),
[HISTORICAL-CLUSTER-PROPOSALS-2026-09-23.md](HISTORICAL-CLUSTER-PROPOSALS-2026-09-23.md),
and the activation entry in [RELEASE-LEDGER.md](RELEASE-LEDGER.md) for the
later cluster package. Reconfirm remote `main`, deployed version, storage
bindings and current row counts before any new release. The private production
backup is a recovery reference, not a snapshot to restore over post-migration
ingestion. A Worker code rollback does not revert D1, R2, KV or queue writes;
the paused predecessor contains an older writer contract and needs a fresh
compatibility review before reuse.
