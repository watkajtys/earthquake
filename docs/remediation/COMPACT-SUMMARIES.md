# Compact stored cluster summaries

Status: bounded stored-summary delivery block complete in production, including the previous-build asset compatibility follow-up. Previous block's production evidence was committed first as `02f044a`; producer, consumer and compatibility source commits are `c37ca19`, `8265d03` and `2b80dda`. Exact verification and rollout are in [RELEASE-LEDGER.md](RELEASE-LEDGER.md). This closes the large cluster-list transfer defect (PERF-1) for the current consumer; package 5A's scientifically canonical generation/identity work still depends on package 3.

## Scope and sequence

1. Add a trusted scheduled publisher and additive `GET /api/cluster-summaries` endpoint. Preserve `/api/get-clusters`, its existing array contract and old browser consumers.
2. Verify publication failures, competing publishers, cursor isolation and bounded page reads against deterministic fixtures and actual R2 bindings. Exercise the real Worker route and ten-minute scheduled entrypoint.
3. Commit and deploy the producer/API to isolated preview, then production through the existing release gate. Observe a real production cron publication and check the complete eligible record set before enabling the consumer.
4. Switch the browser to the first 100 summaries, loading more only when the user advances beyond loaded cards. Keep 20 cards per visible page and fetch members only when opening details. Validate refresh, route cancellation, pagination failure/retry and mobile/desktop behavior.
5. Commit and release the consumer after the producer is verified. Record payload measurements, exact revisions/versions and remaining limitations.

## Observation contract

This bridge projects **stored D1 definitions**, preserving their stored IDs and slugs. It does not repair semantic cluster identity, historical duplicates, mixed timestamp triggers, numeric scientific revisions, or overlapping scientific D1 writers. A single SELECT observes stored scalar rows after the current job's required persistence succeeds; other jobs may have partly updated those rows. It is not an atomic scientifically complete clustering generation.

The version 2 envelope identifies an immutable delivery generation, increasing publication sequence, source observation and generation timestamps in UTC epoch milliseconds, `source: "stored-cluster-definitions"`, and `sourceWatermarkMs: null`. Publication time does not mean the entire USGS window was checked. `stale` indicates a stored snapshot older than 20 minutes, independent of upstream freshness.

Items contain only ID, slug, title, location, full stored member count, maximum magnitude, start/end times, strongest event ID and a SHA-256 `summaryRevision` of those scalar fields. That digest does not establish membership or hydrated-event snapshot equivalence. Detail views already load their own current definition and members; they do not merge a summary's counts into a newly fetched membership list.

Apply the existing overview threshold M >= 4.5 before pagination. Sort by end time descending, magnitude descending, count descending, then ID in deterministic code-point order; null time/count sorts last. No membership list, growing legacy version, or full event geometry enters summary delivery. Reject an oversized or malformed generation rather than silently dropping eligible records. Maximum eligible records: 20,000, enforced with one extra row as an overflow sentinel.

This threshold chooses clusters by their maximum magnitude; it does not filter members. The scheduled clustering source query still includes stored events of all magnitudes in its 30-day window, and detail requests retain small and negative-magnitude members. Existing definition eligibility (at least three events and a maximum of at least M3) and overview eligibility (maximum at least M4.5) remain distinct from membership.

## Publication and reads

The existing R2 bucket owns the new `cluster-summaries/v2/` prefix. Read `current.json` and its ETag **before** the scalar SELECT. Stage immutable pages (200 stored items each, at most 512 KiB) and a bounded validated manifest under a unique generation ID. Publish the pointer last, once, with the originally observed ETag; bootstrap uses `etagDoesNotMatch: "*"`. A conditional `null` result is a conflict. Discard that candidate; never reread the pointer and rebase stale rows.

This prevents a candidate based on an obsolete pointer from replacing a publication committed since its initial read. Two candidates sharing one base are first-successful-CAS wins; the newer observation can lose and wait until a later cron. It does not fence D1 scientific writes. Unique generation IDs and increasing safe-integer sequences prevent a pointer body from cycling back to an old content ETag.

Only the pointer's current and up to 11 committed prior generations (12 total) authorize reads. An uncommitted staged manifest is never publicly readable. Cursor claims bind generation, offset, page size, view, order and original issue time, authenticated using a random per-generation manifest secret. Cursor lifetime is two hours; continuation never renews it. An old current last-good snapshot remains pageable and visibly stale. Retired generations expire two hours after generation time or earlier when they leave the bounded history; a stale current generation can therefore expire immediately when replaced.

Requests default to 100 items and accept a maximum of 200. A request reads a small pointer, one manifest and at most two immutable stored pages. It never reads D1 or the legacy KV blob. Page hashes, lengths, counts and metadata must agree. Responses are `no-store` initially, avoiding cached first-page rollback while publication changes.

- No complete publication: HTTP 503, not an empty successful array.
- Genuine published empty observation: HTTP 200 with count zero.
- Expired/unretained cursor generation: HTTP 410 `GENERATION_EXPIRED`; restart page one atomically.
- Invalid/tampered cursor: HTTP 400.
- Missing or corrupt object in a retained generation: HTTP 503; do not silently mix generations.

R2 binding conditional writes and strong consistency are documented in the [Workers R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) and [consistency reference](https://developers.cloudflare.com/r2/reference/consistency/). Verify the conditional-return behavior with the actual isolated preview binding, in addition to fake storage tests.

## Consumer lifecycle

The first request loads one 100-item page. The first five visible pages use those records; advancing further loads one continuation page. Keep current cards on failures with a retry action. Five-minute first-page refresh keeps loaded pages for the same generation, or atomically replaces them and resets pagination for a newer generation. Never append mismatched generations, totals, duplicate IDs or repeated cursors; reject a lower publication sequence.

Route disable/unmount aborts pending work and stops polling. A failed refresh retains last-good cards and their original timestamp. Expiry refreshes page one before replacing the old view. No fallback downloads the 11 MB legacy response. Static routes remain free of cluster requests.

## Validation and recovery

Cover delayed publishers, first-create races, pointer read errors, page/manifest write errors, lost acknowledgements, rejected stale CAS, real empty observations, qualifying records after ineligible rows, deterministic ties, malformed/oversized records, cursor tampering/expiry, missing/corrupt pages, and continuation during publication changes. Run targeted tests, full tests, changed-file lint and production packaging. Use isolated preview fixtures only; ordinary production checks are bounded GETs plus observation of real scheduled work.

Measure complete equivalent eligible records before/after separately from the first-page reduction. Report decoded and compressed bytes separately when measured. No invented latency percentiles or Web Vitals claims.

No D1 migration, historical repair or production synthetic write is part of this block. Producer rollback leaves the additive objects unused; consumer rollback returns to the compatible legacy endpoint while retaining writer containment. A failed compact publication preserves the prior pointer and the old API. Do not manually move a pointer backwards: publish a freshly validated observation with a new sequence instead.

Automatic object deletion is deferred from the first release. This avoids deleting a last-good generation during an outage or racing a staged publication. Public readability is bounded, but stored orphan/expired objects accumulate under the new prefix. Follow-up must measure growth and implement narrowly scoped, age-based cleanup with current/history protection and a minimum staging grace; do not apply a whole-bucket lifecycle rule.

The cutover also exposed missing lazy chunks for already-open prior-build tabs. The exact previous asset graph is retained in `src/previousReleaseAssets.js`; public bytes are archived under content-hash keys in existing R2 using `scripts/archive-previous-assets.mjs <preview|production> <verified-dist-assets-directory>`. The uploader checks configured account/bucket and every source/stored checksum; the Worker exposes only mapped URLs. Smoke checks all retained paths and MIME types. Keep this graph until explicit retirement. Future frontend releases must preserve their immediate predecessor before promotion; general archival automation remains a separate package 5D follow-up.
