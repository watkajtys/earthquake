# Complete period feed snapshots

Status: implementation in progress on `codex/complete-period-feeds`. Package 5B; previous block is committed and production-verified at application source `2b80dda`, with final ledger commit `1b8a49a`.

## Contract and scope

Add `/api/earthquake-feeds?period=day|week|month`, retaining the legacy arrays and hourly ingestion/list writer for existing clients. Each period is a complete validated official USGS all-event summary, including legitimate negative/null magnitudes and alert/felt/tsunami/significance fields. Missing fields are not manufactured. Empty complete feeds are valid; missing or corrupt publications are unavailable, not empty.

The version 1 envelope carries period, source, UUID delivery generation, increasing per-period sequence, publication time, source observation time, upstream generation time, coverage bounds, complete flag, count and full GeoJSON features. Times use UTC epoch milliseconds. Ten-minute freshness depends on upstream generation and observation; republishing stale source data cannot renew it. A one-minute clock/boundary allowance is explicit. The original USGS source clock drives correction and absence evidence in the browser.

A five-minute trusted scheduled publisher runs independently from D1 hourly ingestion. Read the period's R2 pointer and ETag before fetching its source, validate every feature and metadata, stage an immutable bounded object, then commit the pointer with one conditional write using the original ETag. Reject source-time rollback; unchanged upstream generation does not manufacture new freshness. A lost CAS never rebases observed data. Periods fail independently, and all failures surface through the scheduled lifetime. No public mutation route is added.

The R2 `earthquake-feeds/v1/` prefix owns its objects. Pointers retain current and previous descriptors. After a confirmed publication, retire only the old pointer's previous object, and only once its successor pointer's **R2 upload timestamp** proves it has been committed for at least one minute (beyond the API's ten-second read deadline). The pre-upload generation timestamp alone cannot prove this grace when storage is slow. Missing/future upload metadata defers cleanup. A failed CAS or uncertain write acknowledgement never authorizes retirement. Cleanup errors are reported separately from publication success. API reads never query D1 or fetch USGS. GET validates bounded stored bytes against the committed SHA-256; HEAD and conditional 304 verify object size/checksum metadata/existence without reading the whole body. Cache revalidation preserves source/coverage headers; stale status remains explicit and cannot be reset by a 304. The frontend takes one internal request for a healthy snapshot, otherwise one allowlisted USGS proxy fallback within the original 30-second request budget. Last-good data remains visible with its original source time and truthful stale labels. Static content must render while feed requests are pending.

## Source choice and observed baseline

One read-only three-feed sample on 2026-09-21 UTC observed day/week/month counts 223/1,894/10,676 and decoded JSON sizes 159,641/1,348,768/7,589,594 bytes. All required fields were present. Negative magnitudes appeared in 79 weekly and 455 monthly features. Source generation clocks differed by 45–49 seconds. Filtering the month matched the smaller feeds in this sample; that is not proof of equivalence for independently changing upstream publications.

Use the three explicit period feeds for this first release, retaining each period's own authoritative clock and isolating a month failure from day/week. Deriving smaller periods from month would reduce this sample's source bytes by 16.58% and calls from three to one but couples their availability and requires a documented derived-window contract. The publisher processes periods sequentially to bound peak memory. Source transport remains bounded to 16 MiB/30,000 features and ten seconds per upstream request; envelopes are bounded to 17 MiB. These are decoded-byte and one-run observations, not transferred-byte or latency percentile claims.

## Validation and release sequence

1. Regression fixtures cover old events in a fresh month, null/negative magnitudes, corrections/removals/empty results, missing alert fields, stale/future clocks, mismatched counts, duplicates, bounded streams, failed writes, source rollback and stale/competing publishers.
2. Exercise the actual Worker GET/HEAD/304 and five-minute scheduled entrypoint, independent ingestion/publication failures and per-period failure isolation. Existing lifecycle/route/revision tests remain required.
3. Seed isolated preview through the actual publisher and verify its real R2 conditional semantics. Freeze and release producer support first; observe a real production five-minute publication and check all three complete snapshots before consumer promotion.
4. Validate one healthy request, one fallback, shared deadlines, conditional responses, cancellation, monthly retries, independent periods, source/freshness labels and static pages. Preserve the immediate predecessor frontend asset graph alongside the already retained graph before changing browser hashes.
5. Run full tests, changed-file lint, build/packaging, preview and both-host production gates; record exact source/version, measured checks and observed scheduled runs in the release ledger. Commit final evidence.

## Recovery and boundaries

Code rollback can restore the compatible prior consumer without deleting publications or reverting writer containment. Failed source/storage work retains the prior committed pointer; never manually move a pointer backward. No schema migration, historical repair or synthetic production fixture is part of this block. Published full feeds improve browser coverage; they do not backfill the historical D1 database or establish scientifically canonical clusters.

Normal successful five-minute publication keeps two full objects per period, retiring the exact superseded predecessor after its read grace. Without retirement this sample would add approximately 2.62 GB/day of decoded objects. Abandoned stages, rapid publications within the grace interval and failed deletions can still leave orphan objects; their narrowly scoped cleanup remains a follow-up. Do not install a whole-bucket lifecycle rule or delete a current last-good snapshot because its source has gone stale.

One preexisting reconciliation edge remains separate: the browser retains only the latest negative-coverage proof per period. After a rolling window's lower boundary advances, a late older overlapping-period response can reintroduce an event in the discarded boundary strip. Fixing this requires bounded proof history plus an explicit admissibility floor (or equivalent interval coalescing); silent history truncation would not solve it. This release preserves the source-clock and existing correction/removal tests, but does not claim complete historical reconciliation across that boundary case.

Relevant platform behavior: [R2 conditional writes](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/), and [USGS GeoJSON summary format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).
