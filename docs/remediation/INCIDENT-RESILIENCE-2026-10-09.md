# October 9 traffic and resilience investigation

Current release status: resilience fixes deployed October 9 at 20:55:41 MDT (October 10, 02:55:41 UTC), revision `f1f6c7eed4d45575730964256fa000166a03cfc8`, Worker version `2603234c-a0c9-4d21-a2a6-3f3fef817b95`. The routine release gate passed at 20:57:21 MDT. Earlier rollout-pending statements below describe the historical investigation stages; the final release and broader test audit are recorded at the end.

Investigation conducted October 9 MDT / October 10 UTC, 2026. The measured 48-hour window is October 7, 19:22 through October 9, 19:22 MDT (October 8, 01:22 through October 10, 01:22 UTC).

At the initial investigation, production was running revision `e8734e091a5084ea4dbe3710b7bf8f992dc2ad3d`, Worker version `547be86c-2144-4fd6-b9e4-f3120d9ff040`. Relevant backend files were compared with that revision. Existing unrelated working-tree changes were preserved. The initial investigation made no production configuration, application, or data changes. The subsequently authorized admin-response deployment and read-only follow-up are recorded below.

## Findings and confidence

| Finding | Evidence | Conclusion |
|---|---|---|
| No observed Worker capacity exhaustion | 51,550 invocations; 17 script exceptions; 5 client disconnects; no CPU/memory/resource-limit outcomes. Peak hour: 5,819 invocations with zero exceptions. | Increasing capacity is not the first justified intervention. Hourly totals do not rule out brief spikes. |
| Legacy browser retry amplification | 7,663 of 7,667 estimated HTTP 503s were POSTs to retired cluster operations. Retained bundle replay reproduces periodic retries; live tail shows the same pattern. | Confirmed compatibility and error-classification problem; not 7,663 Worker crashes. Attribution of every historical request to that particular bundle is not proven. |
| Historical earthquake detail compatibility bug | Five affected event IDs return an official USGS 302 to the catalog API; valid catalog data returns 200. Deployed transport rejects every redirect and reproduces public 502 locally. | Confirmed defect. These IDs account for 13 estimated historical 502s, but request-level evidence does not prove the cause of all 276 historical 502s. |
| Thirty-minute complete-feed publication gap | Retained logs show five consecutive all-period publisher failures; consecutive immutable month receipts bracket a 30-minute gap. | Confirmed publication failure. The underlying trigger is unknown because the individual causes were not logged. |
| Public feed reads expose transient storage failures | Four estimated public GET 503s; three R2 internal 500 operations overlap two of their time buckets. Local fault injection reproduces immediate 503 from a single failed read. | Confirmed resilience weakness; storage correlation is not a request-level causal join. |

Adaptive HTTP analytics are estimates, include internal operations, and are not unique visitor counts. Worker outcomes include background invocations and handled HTTP errors can have a successful runtime outcome. Do not calculate a visitor availability percentage by mixing these datasets. The 267 internal Cache API 504 records on `/api/usgs-proxy` are cache misses, not evidence of 267 failed visitor requests ([Cloudflare explanation](https://developers.cloudflare.com/logs/faq/504-origin-status-0/)).

## Legacy client traffic

Estimated HTTP 503 counts were 7,116 POST `/api/cluster-definition`, 547 POST `/api/calculate-clusters`, three GET `/api/earthquake-feeds`, and one GET `/api/cluster-summaries`.

The administrative gate in `src/utils/workerRequestPolicy.js` rejects the POSTs before body parsing, clustering, D1 access, or queue work. Production has no `ADMIN_API_TOKEN` binding, so this gate returns 503. This protects storage and expensive computation but misrepresents expected denial as service unavailability.

The retained `/assets/index-i3oghYXo.js` polls feeds every minute, retries failed calculations, regenerates summary objects, and concurrently registers eligible definitions that have not returned HTTP 201. A local replay of the actual bundle repeats registrations for 401, 410, 429, and 503 alike. The observed live pattern of eight definitions plus one calculation each minute would produce 540 unnecessary POSTs per hour if sustained. Current `/assets/index-CpWnpoTg.js` contains neither retired POST path.

Changing denial to 401/410 improves semantics and alerts but does not stop already-running legacy JavaScript. Preserve early denial. If operationally worthwhile, a narrowly scoped edge rule can reduce Worker executions while preserving trusted access and the second public hostname's protections. Existing old tabs must reload or close to adopt the new client. Preserve immutable legacy assets; do not return fake registration successes or fabricated cluster data.

Future clients should have a version/reload mechanism, terminal-error handling, bounded retry backoff with jitter, an in-flight guard, and hidden-tab polling suspension.

## Detail-page 502 defect

Affected sampled IDs: `us6000sfvh`, `us6000qwm6`, `us6000qkj7`, `us7000qd6d`, and `us7000stvr`. For each, the feed detail URL redirects to the official catalog query for the same event; that target returns valid data. `functions/utils/usgs-transport.js` treats the 302 as `USGS_REDIRECT_REJECTED`, producing the public unavailable/502 result.

Recommended fix: recognize one exact official catalog redirect and construct the destination internally. Require HTTPS, the exact USGS hostname/path, matching event ID, and the expected query parameters; reject credentials, fragments, unexpected ports/parameters, and further redirects. Preserve byte limits and existing feature/alias validation, and share one deadline across both requests. The official [USGS catalog API](https://earthquake.usgs.gov/fdsnws/event/1/) supports event ID queries and GeoJSON output.

The detail handler also combines separate archive and upstream deadlines with a later unbounded D1 revision read. Add an end-to-end budget and pass remaining time/cancellation through the stages. The frontend should abort on navigation, bound waiting, and expose retry. Preserve archive-corruption rejection and revision checks.

Regression coverage should include the actual official redirect shape, accepted aliases, unsafe or mismatched destinations, repeated redirects, 404, oversized/malformed data, body cancellation, and deadline expiry without late persistence.

## Complete-feed publication failure

Retained runtime logs contain all-three-period publication failures on October 9 at 12:20:47, 12:25:53, 12:30:46, 12:35:50, and 12:40:45 MDT. An additional single-period failure is visible October 8 at 21:20:48 MDT. Initially, six publisher exceptions were identified against the 17 exceptions returned by Worker analytics. The later retained-log review below identifies additional categories and eighteen individual exception records; the two datasets' counts should not be treated as identical.

The month feed's consecutive immutable receipts establish the gap:

| Sequence | Snapshot generated UTC | MDT | Month coverage completed UTC |
|---|---|---|---|
| 5327 | October 9, 18:15:39.998 | 12:15:39 | 18:17:50 |
| 5328 | October 9, 18:45:39.915 | 12:45:39 | 18:47:56 |

The month coverage gap followed the publication gap; both adjacent D1 jobs completed normally in about eight seconds. Hourly ingestion continued independently. Existing snapshots remained available, so this was a freshness failure rather than proof that every visitor lost access to data.

For the 12:40 cycle, retained logs show publication failure about 1.34 seconds after task start; hourly task completion and legacy day/week/month list writes followed. The aggregate runtime exception was emitted at the end. A nearby sampled R2 missing-key error was for an unrelated older detail object and is not evidence of a publisher storage outage.

`publishEarthquakeFeeds` catches individual exceptions and places them in `AggregateError.errors`, but its results retain only `period`, `published: false`, and `reason: failed`. The scheduled handler logs only those results. The runtime record contains the aggregate message/stack without the nested causes; the selected failed invocation had no retained trace spans. This prevents a defensible attribution to USGS, validation, or R2.

A local invalid-feature reproduction produces the same three-period aggregate failure while hourly ingestion succeeds. A shared older event with bad metadata or a future update time is therefore a plausible alternative to an infrastructure fault, not an established historical cause. Failed upstream payloads are not retained. Keep completeness validation intact; do not silently drop events to make publication appear healthy.

The D1 job ledger is also not a complete error history: pre-admission failures leave no run row, and successful work clears retry/error fields. Completed rows establish recovery, not uninterrupted health.

## Read resilience and containment

Publication has no explicit application retry or R2 operation deadline; a failed initial pointer read aborts that period. Periods are processed sequentially. The public feed route has a ten-second total deadline, but no read retry or verified previous-snapshot fallback. Local fault injection produced 503 from one transient read and 200 on the next request; a missing current object also returns 503 even when a prior immutable snapshot exists.

The three recorded R2 internal errors were a GetObject 500 on October 8 at 23:05 UTC and a HeadObject 500 plus GetObject 500 on October 9 at 03:08 UTC. These overlap three of the four public GET 503s' 15-minute buckets. Conditional feed requests use HEAD internally; summary requests use GET. Without shared request IDs/object keys, assignment of those operations to individual public responses remains unproven.

The remaining feed 503 is confirmed by a retained structured log at October 8, 10:41:52.491 MDT (16:41:52.491 UTC): GET month feed, `reason: deadline`, `stage: object-read`, total elapsed 10,000 ms, stage elapsed 8,827 ms. The request exhausted its application deadline while reading the month snapshot; no corresponding R2 internal 500 was recorded. This establishes the timeout mechanism, not the underlying reason for storage latency. Request ID: `6096eca3b69a8a1d23e50bf26b5cd71b`.

Feed failure logs retain stage and deadline/read-failed classification but discard the underlying exception. The summary endpoint catches storage/parsing/validation errors as `503 SUMMARY_UNAVAILABLE` without logging their causes and needs a server deadline. Staleness alone does not produce either endpoint's 503: it is exposed through freshness headers or a stale flag.

Working safeguards already include conditional atomic pointer advancement, retained immutable snapshots, fenced/resumable D1 jobs, independent hourly ingestion, a client fallback through Cache API/USGS, and preservation of displayed data on refresh failures.

## Recommended implementation order

1. **Fix detail redirects and preserve diagnostic causes.** Add the bounded USGS catalog fallback and structured publisher/detail error fields: period, stage, code, upstream status, elapsed time, attempt, and release identity. Record each individual publisher failure even when the aggregate is rethrown. Avoid logging credentials, headers, or full payloads.
2. **Bound and retry transient I/O.** Use a small retry budget with jitter for retryable reads and transient upstream errors, within an overall deadline. Do not retry deterministic validation failures. Preserve conditional pointer semantics: never rebase an old publication onto a newer pointer. Full publication retries need fresh source/pointer observations.
3. **Serve a verified last good snapshot when appropriate.** Design explicit maximum-age and stale-state behavior, immutable byte/hash validation, and monotonic client rules. Cache immutable snapshots where useful. Preserve accurate source time and completeness; an old snapshot must not be labeled freshly verified.
4. **Monitor freshness and useful failures.** Alert on per-period last successful publication age, repeated scheduled failures, real public read failures, and durable progress. Separate legacy denials and internal cache misses from availability reporting. No new monitor was scheduled during this investigation.
5. **Reduce legacy amplification and improve client recovery.** Correct denial semantics, consider narrow edge containment based on observed cost, and add future-client expiry/backoff/visibility/cancellation behavior.

Acceptance requires exported Worker tests and local fault injection, followed by isolated preview verification. Include transient R2 recovery, deadline/late-completion behavior, overlapping conditional publishes, stale fallback honesty, and a deterministic validation failure whose safe cause appears in logs. No load test was run; the production observations do not establish a maximum supported load.

## Validation and evidence

The investigation ran 74 transport/detail tests, 80 publisher/coverage/feed tests, and 48 policy/summary tests; all passed. Additional local reproductions exercised the deployed detail handler, actual legacy bundle helpers, storage read failures, pre-admission job failures, and invalid complete-feed metadata. Passing existing tests does not mean these confirmed defects are fixed.

Sanitized local evidence is under `/tmp/earthquake-status-20261010/`, including `rca-503-methods.json`, `rca-r2-errors.json`, `detail-local-worker-repro.json`, `detail-usgs-catalog.json`, `resilience-jobs-findings.json`, and validation output. These temporary files are not a durable shared log archive. The earlier `summary.json` predates dashboard log access and this RCA; this document supersedes its unresolved detail diagnosis and month-job interpretation.

Cloudflare's public Dashboard/API incident began October 9 at 18:52 UTC, after the identified 18:20–18:40 publication failures. Its timing and scope do not establish it as the cause ([incident record](https://www.cloudflarestatus.com/incidents/x8n12150xwf6)).

## Follow-up: why traffic dropped sharply

Direct inspection of Cloudflare's Visitors chart shows a pronounced evening drop on October 8 at approximately 22:30 MDT (October 9, 04:30 UTC). A fresh, client-request-only breakdown isolates it to `/quake/*` pages:

| Metric | October 8, 21:00–22:00 MDT | October 8, 23:00–24:00 MDT |
|---|---:|---:|
| Individual earthquake page requests | 856 | 20 |
| `/api/earthquake-feeds` requests | 247 | 253 |
| Homepage requests | 17 | 28 |

Earthquake-page requests fell 97.7%, while those two core usage indicators did not fall. At five-minute resolution, quake-page requests were 89, 82, 63, 68, 51, and 42 from 22:00 through 22:25, then 2 at 22:30 and 1 at 22:35. Every quake-page request in that cutoff hour returned HTTP 200. Hourly unique IPs fell from 938 to 485 to 110 across 21:00, 22:00, and 23:00; unique IPs are not verified people.

The pre-drop quake-page requests use a conspicuously even mix of desktop Chrome 99–136 user-agent strings across many individual earthquake URLs, with very little corresponding asset or browser-beacon traffic. These observations strongly support a bulk automated crawler ending its run. They do not identify the operator or prove why it stopped. There is no matching large failure or block surge, and the next day's feed-publication incident happened later. Do not describe the chart as proof of human audience loss or an outage.

A separate morning request spike is directly attributable to probe traffic declaring `curl/8.7.1`: 4,919 requests during 04:30–04:40 MDT to paths including `.git/config`, `.boto`, and encoded `.env` variants. Total requests fell from 6,063 in the 04:00 hour to 991 in the 05:00 hour, while hourly unique IPs increased from 110 to 120. This is distinct from the evening archive crawl. A 200 response to a probe path does not by itself establish that a sensitive file was served.

Follow-up evidence: `traffic-drop-peak.json`, `traffic-drop-evening-paths.json`, `traffic-drop-quake-pages.json`, and `traffic-drop-end.json` in the local evidence directory. The unfiltered pre-drop path query reached its 1,000-row limit; the quoted `/quake/*` totals come from a separate complete filtered query. Cloudflare's Visitors chart itself lists probe paths among pageviews, so its visit/pageview totals should not be presented as verified human engagement.

## Follow-up: remaining logs and post-deployment health

Two GPT-6.1 Sol subagents independently reviewed HTTP/runtime evidence and current D1 job progress; the primary investigator inspected retained exception and invocation records in the authenticated dashboard. This follow-up made no production changes. The admin-response fix was previously deployed at October 10, 01:56:59 UTC (October 9, 19:56:59 MDT), revision `4ee2165910fe7228b9444684ba2449b8a9707458`, Worker version `06b2014a-a1ef-48a7-be5e-58360df71a96` at 100% traffic.

### Additional scheduled failures

The retained-log query `exists(exception.name)` over the original 48-hour window, after loading the remaining data, displayed eighteen individual exception records: nine automated backfill exceptions, six already identified publisher exceptions, two cluster persistence exceptions, and one month-coverage D1 exception. These are retained records, not an estimated request count. The earlier Worker analytics query returned seventeen; its aggregate count and the dashboard's aggregate error counter are not interchangeable with individual log rows.

Both cluster failures have a confirmed underlying `D1_ERROR: Network connection lost.`:

| Underlying error UTC | MDT | Affected stable key | Result |
|---|---|---|---|
| October 8, 11:51:27.556 | October 8, 05:51:27.556 | `v1_chignik-alaska_82823_56.2--156.5` | Aggregate exception at 11:51:49.254 UTC; previous published snapshot retained |
| October 9, 03:02:06.820 | October 8, 21:02:06.820 | `v1_anza-ca_82820_33.5--116.5` | Aggregate exception at 03:02:08.100 UTC; previous published snapshot retained |

The second cluster invocation is `3410f9dd33e96d1dd45b43039e1dc33c`. The existing publication barrier prevents KV/snapshot publication after a failed definition write; successful earlier D1 writes remain. This is evidence that the snapshot safeguard worked, not that the whole batch was transactional. No application-level bounded transient D1 retry exists in this path.

A separate month-coverage invocation (`cc0177ad5c39a6204d33d6a7eb199ca6`) threw `D1_ERROR: Network connection lost.` at October 8, 19:53:00.675 UTC / 13:53:00.675 MDT, with stack frames `persist` and `reconcileMonthCoverage`, on cron `2-59/5 * * * *`. These three failures establish specific D1 connection interruptions, not a broad D1 outage or the cause of the later publisher gap.

Backfill exception timestamps in MDT were October 8 at 16:31:02.313, 17:01:44.234, 18:01:43.393, 18:30:56.941, 22:30:41.801, and 23:00:47.698; October 9 at 13:30:41.037, 15:01:40.567, and 18:00:54.734. Their generic aggregate messages do not establish a common underlying cause.

The last backfill invocation (`ccb887110a7563d83e042a576c4f183d`) proves partial success was classified as a whole-cron exception: six details were stored and one event, `nn00925554`, failed its USGS fetch. The structured result says `USGS detail fetch failed; retry scheduled.`, status 409, processed 6, errors 1, elapsed 17.936 seconds. The 409 is the application's conflict/retry response; it is not evidence that USGS returned 409. The transport log retained a stack but no error code.

The reporting defect is concrete: `backfill-earthquake-details.js` sets `success:false` for any individual error but usually leaves top-level `error` unset; its failures are in `error_earthquakes`. The scheduled wrapper reads only `result.error`, then logs `Unknown error` and throws `Automated backfill failed`. Fatal `policyError` responses instead contain `message`, which it also ignores. Preserve stage/code/status, event ID, processed count and retry disposition, distinguish partial success, and retain failure signaling where appropriate. Do not erase successful work or treat every failed batch as a complete outage.

### Detail errors and probes

A complete external 5xx query returned 252 path/method/status groups, below its 500 limit. Of 276 estimated historical detail 502s, 199 declared Googlebot, 74 Bingbot, two ShapBot, and one a browser user agent. These are claimed identities, not verified bots. The concentration suggests a search-indexing concern, but it does not prove the cause of the earlier traffic cliff. Only thirteen historical requests map to the five directly reproduced redirect cases; 263 remain unclassified by cause.

One further detail 502 occurred in the October 10, 01:57 UTC minute for `us6000rhs0`, with a declared Bingbot user agent. Direct USGS verification at 02:04:36 UTC returned the legitimate catalog redirect followed by HTTP 200 and a valid M4.8 event south of Fiji. This is a sixth confirmed event affected by the redirect policy, outside the original historical window. Because the observation is minute-granular and close to deployment, it does not identify the executing Worker version; the same unchanged transport defect remains in the deployed code.

No asset 5xx or external HTTP 500/504 appeared in the complete historical query. The previously known three feed GET 503s and one summary GET 503 remain. Two recent smoke-agent admin 503s were intentional release checks; recent unauthorized client requests returned the corrected 401 classification. The old client's retry loop continues.

A bounded live tail from October 10, 02:03:50.836–02:04:36.137 UTC (October 9, 20:03:50.836–20:04:36.137 MDT) captured 45 invocations: 42 PHP/WordPress probe requests returned 403, two feed requests returned 304, and one quake-page request returned 200. All had runtime outcome `ok`, with no exceptions, warning/error logs, or 5xx. A separate adaptive edge query sampled HTTP redirects and denials during the same scanning burst; those counts have a different scope and must not be added to the tail counts.

### Current recovery evidence and priorities

Post-release Worker analytics through 02:04:02.809 UTC show 488 successful invocations, zero runtime errors and 58 subrequests. Successful runtime outcomes can still include handled HTTP 502/503 responses. This short window establishes no new unhandled exception in the sample, not a long-term availability guarantee.

Read-only D1 queries captured at 02:05:40.751 UTC show hour ingestion completed at 02:00:42 and 02:05:39 UTC (7/7 each), month ingestion completed at 01:57:50 and 02:02:49 UTC (10,594/10,594 each), and three detail jobs updated since release, latest completion 02:00:47 UTC. There were zero pending/retry/parked ingestion runs and zero pending/leased/parked detail jobs. Twenty-two older hour runs have `completed_with_rejections`, last updated October 5; none are new after release. Every SELECT reported zero rows written. Successful rows clear earlier error fields, so this does not prove uninterrupted processing.

Next implementation priorities remain: (1) safely support legitimate USGS catalog redirects, (2) preserve publisher/backfill diagnostic causes and partial-success outcomes, (3) add bounded retries for classified transient D1/read failures while retaining idempotency, canonical identity and publication barriers, and (4) add freshness-based alerting. The publisher gap's underlying trigger remains unknown.

Sanitized follow-up evidence files use `followup-api-*`, `followup-runtime-*`, and `followup-background-*` under `/tmp/earthquake-status-20261010/`; durable copies are in `.reconciliation.local/log-followup-20261009/`. This document records the retained browser evidence, query window, timestamps and invocation IDs without request credentials or visitor identifiers.

## Authorized implementation plan

The October 9 follow-up request authorized planning and implementing fixes with Sol subagents. Work is isolated on `codex/resilience-fixes`, based on the deployed admin-response revision, in the attached managed worktree. This implementation does not combine unrelated frontend or regional-navigation work.

| Priority | Workstream and owner | Acceptance criteria | Status |
|---|---|---|---|
| P1 | Valid USGS catalog redirects — Sol API agent | Exactly one same-event official catalog redirect; preserve one deadline, byte limits, ID/alias validation and archive integrity; reject unsafe or repeated redirects | Implemented; 107 focused tests and six direct USGS reproductions pass |
| P1 | Publisher/backfill causes — Sol runtime agent | Stable safe codes and stages, actual partial-success counts, retry disposition and release identity; preserve original failure signaling and atomic publication | Implemented; validation-specific codes, partial results and sanitization reviewed and tested |
| P1 | Transient D1 writes — primary agent | At most three attempts for known network/reset failures; fixed cluster identity/payload; recognize committed coverage cursor after a lost response; retain fencing and durable retry state | Implemented; 58 focused tests pass; independent Sol review complete |
| P1 | Public R2 reads and summary deadline — Sol API agent | Retry only recognized transient reads within a ten-second request budget; cancel late/stalled bodies; retain checksum/metadata/cursor checks and accurate freshness | Implemented; 111 focused tests pass; independent Sol review complete |
| Release gate | Combined integration and review — primary agent and Sol cross-review | Combined test suite, scoped lint, production build/package dry run, inspect final diff; record validation and residual risks | Local checks passed; preview and production rollout pending |

Retries never abandon a D1 write and start a concurrent replacement: D1 operations are not cancellable through the binding. The two-second D1 retry budget limits extra attempts and backoff, not the duration of an in-flight operation. Month reconciliation reports an unknown inserted count as null after a committed response was lost, alongside confirmed inserts and recovered-batch count.

Follow-on design work: a verified previous-snapshot fallback with explicit maximum age, freshness-based alerts, and future-client terminal-error/backoff behavior. These remain separate from the immediate fixes because serving an old generation changes client freshness and pagination semantics, and the already-running legacy bundle will not adopt new retry behavior until reloaded. Existing probe denials need no emergency change; observed CPU/resource outcomes do not justify a capacity increase.

Rollout: finish local validation, verify the isolated preview with fixture-backed fault tests, use the existing release wrapper and retained-asset archive checks for production, and verify detail responses, admin denial semantics, scheduled progress and real public read errors. Retain previous immutable snapshots and the prior Worker version for rollback. Freshness and useful error rates, rather than total log-line counts or unauthorized POSTs, are the release-health criteria.

### Final local validation

All four immediate workstreams are implemented and independently reviewed. Combined validation on the production-based branch passed: 148 test files, 1,941 tests, three skipped; lint over every changed JavaScript file; frontend production build; and pinned Wrangler production packaging dry run. The build retains its existing large-chunk warning. No migration, resource binding, scheduled trigger, secret, or archive-retention configuration changed. No new production or preview deployment was made for these fixes.

Implementation commits: `d1085b0` (USGS redirects), `46f80d9` (D1 recovery), `7755830` (safe diagnostics), `95d6337` (public R2 read recovery). Validation artifacts are saved in `.reconciliation.local/resilience-fixes-20261009/`. The initial publisher outage trigger is still unproven; the new codes make future validation, source-fetch, pointer-read and storage-write failures distinguishable.

The D1 retry policy follows the [Cloudflare D1 retry guidance](https://developers.cloudflare.com/d1/best-practices/retry-queries/). The R2 retry classifier recognizes the documented Workers API internal-error and unavailable codes, while terminal authentication, missing-object and integrity failures remain terminal ([R2 error codes](https://developers.cloudflare.com/r2/api/error-codes/)). R2 bindings do not accept an abort signal: the application bounds response time and retry issuance, then cancels a returned body if the binding resolves late.

## Expanded investigation and remediation

The subsequent request to investigate and fix every finding expanded the work beyond the first four workstreams. All changes below are local on the production-based `codex/resilience-fixes` branch. Production remains on the previously recorded admin-response release; no production or remote preview deployment was made during this follow-up.

### Closing the unclassified detail and backfill evidence

At October 10, 02:25:05–02:26:06 UTC, a bounded, two-request-concurrency read-only USGS check covered all 243 previously unclassified detail paths. Of these, 242 paths representing 262 estimated historical requests now return a legitimate official catalog redirect followed by a validated matching or aliased event. Combined with the five previously reproduced paths (13 requests), 247 paths representing 275 of the 276 historical detail 502s currently reproduce the redirect compatibility defect. This is stronger coverage of the suspected mechanism; it is not proof that every historical request failed for the same reason.

The remaining path, `us7000s9fi`, redirects to a catalog response with HTTP 409 and an explicit deleted-event message. The [USGS catalog documentation](https://earthquake.usgs.gov/fdsnws/event/1/#includedeleted) documents this conflict response for deleted events when they are not requested explicitly.

A fresh retained-log query over the original window, `contains($metadata.message, "[backfill]") AND $metadata.level = "error"`, completed after Load More with nine individual records and no incomplete-results warning:

| Event ID | Underlying failure timestamps, MDT | Count |
|---|---|---:|
| `nn00925484` | Oct 8, 16:30:59.367; 18:01:33.318; 22:30:36.874 | 3 |
| `nn00925488` | Oct 8, 17:01:29.259; 18:30:39.425; 23:00:37.815 | 3 |
| `nn00925542` | Oct 9, 13:30:38.117; 15:01:29.896 | 2 |
| `nn00925554` | Oct 9, 18:00:46.762 | 1 |

All records identify the detail transport stack. The inspected raw record for `nn00925542`, request `83e47085b32b16089e838fa90aad7b07`, was not truncated but contained no serialized error code or upstream status. Exact compiled-line attribution was not established. Direct USGS checks subsequently found all four IDs returning HTTP 409 with the explicit deleted-event response directly from the official feed-detail endpoint. This strongly supports deletion as the common retry trigger, while the missing historical response information limits per-request attribution.

The transport now recognizes only a bounded plaintext response containing the specific USGS deletion statement from the fixed official detail endpoint or its validated catalog hop. It returns application HTTP 410 and `USGS_EVENT_DELETED`, retaining upstream status 409 separately. Other conflict bodies remain errors. Backfill ends legacy attempts or parks a durable job for this terminal condition; it preserves archived bytes and allows a future corrected source revision to follow the existing revision rules.

### Disposition of every finding

| Finding | Implemented response | Remaining limit |
|---|---|---|
| Historical detail 502s | Validated single catalog hop; precise deleted-event classification; one bounded retry for transient detail fetch errors; safe stage/code/status logs | Current provider behavior cannot reconstruct every historical response |
| Detail requests could outlive staged deadlines | One ten-second server deadline across archive/D1/upstream/revision reads; late bodies cancelled and late results prevented from starting persistence; browser navigation cancellation, fifteen-second limit and explicit retry | An already-issued binding operation cannot be forcibly cancelled |
| Three confirmed D1 connection interruptions | Previously implemented idempotent retry, same cluster identity, fenced coverage cursor and lost-acknowledgement recovery | Persistent service failure still fails and retains durable recovery state |
| Three public feed and one summary 503 | Bounded read retries plus verified retained-generation fallback; six seconds reserved for the primary generation inside the original ten-second request budget | A missing/unreadable pointer or storage failure affecting both generations still returns 503 |
| Six publisher exceptions and the thirty-minute publication gap | Thirty-second per-period budget, bounded R2/source operations, classified retries, exact conditional-write fence, acknowledgement read-back, and per-period freshness diagnostics | The original trigger remains unknown because the failed payloads and individual causes were not retained; deterministic invalid input remains rejected |
| Nine backfill exceptions | Four deleted-event reproductions investigated; terminal handling, partial-success counts and individual recovery dispositions implemented | Original upstream status was omitted by the deployed logger |
| Legacy admin 503 amplification | Earlier 401 classification remains deployed; new-client polling now pauses hidden/offline work, backs off repeated failures and stops automatic terminal-error retries | Already-running immutable legacy JavaScript continues until its tab reloads or closes |
| Traffic cliffs and scanner activity | Request-path, status and user-agent evidence identifies ended automated bursts; no coincident service-failure or capacity spike found | Operator identity and why a crawler stopped are not established; no capacity increase is justified by these observations |
| Five client-disconnected outcomes | Explicit cancellation and late-result containment now cover detail loading and current polling | These outcomes alone do not establish server failure or its historical cause |

Feed fallback accepts only the validated pointer's previous generation, checks metadata, exact byte length and SHA-256, and caps both source and observation age at thirty minutes, including a check after reading. It marks the response stale/degraded without changing source clocks. Conditional fallback responses also verify bytes. The browser tries fresh USGS data first and can retain the verified degraded snapshot if that fails; source time and snapshot sequence cannot roll back relative to displayed data.

Summary fallback is limited to a first-page request and a committed retained generation whose source observation and publication are within two hours. Manifest and page identity, bounds and hashes still apply. Signed continuation requests remain pinned to their original generation, offset and issue time and cannot switch generations after a failed page. Retained responses are explicitly stale.

Publisher retries preserve the original comparison ETag. They never rebase an older observation onto a newer pointer, never start a pointer write after a timed-out immutable write, and validate immutable size/hash/content type after a lost acknowledgement. A superseded publication reports unknown freshness rather than attributing the older comparison base's age to the winner.

The existing scheduled publisher now emits `feed-publication-freshness` with actual observed age, threshold, release and fresh/stale/unknown/superseded state. `node scripts/check-period-feeds.mjs <origin> --monitor` checks all periods, reports fresh/stale/degraded/unavailable, and exits nonzero for unhealthy results. This implements detection; no external notification destination or recurring automation was configured.

### Verification and deployment state

The combined implementation was reviewed by both Sol agents and the primary agent. Review found and corrected fallback 304 body-length metadata, retry state leaking across replacement loaders, missing content-type validation after an acknowledged-lost immutable write, and a pre-existing malformed archive revision being treated as an archive miss.

The final combined local suite passed 2,021 tests with three existing skips across 151 files. Scoped lint, the frontend build, and pinned Wrangler production packaging passed. The existing large-chunk build warning remains. These counts describe executed checks, not production-health evidence.

The built Worker ran with local-only preview D1/R2/KV bindings and synthetic fixtures. Its initial smoke run exposed missing retained assets in the local fixture setup; seeding the existing 314 verified retained assets corrected that setup. The complete smoke then passed 366 GET checks across 334 asset paths. Separate real local R2-binding probes staged a missing current feed object and missing current summary manifest, verified retained-generation responses, confirmed the freshness monitor rejected degraded state, and restored the exact original pointers with conditional writes. No production data or archive was changed.

A read-only production check at approximately 02:35 UTC found all three complete feeds fresh, with source ages approximately 267–282 seconds. That demonstrates the existing production deployment was publishing at that observation time; it does not verify these undeployed changes.

Evidence is in `.reconciliation.local/resilience-complete-20261009/` (full tests, lint/build/package logs, local preview smoke/binding probes, production freshness check and all-nine retained backfill records) and `.reconciliation.local/resilience-detail/` (current USGS classifications and deletion reproductions). Rollout remains pending and must preserve the current production asset graph through the existing release process.

### Test usefulness audit, prompted by the user's concern

The audit assessed the deployed baseline `4ee2165`; it did not infer quality from the number of passing tests. The conclusion is mixed: meaningful data-integrity coverage coexists with weak external-contract and production-failure coverage. No defensible percentage of the whole suite has been classified as low value.

Concrete gaps:

- `functions/utils/usgs-transport.test.js` covered direct detail 200s, aliases and 404s with synthetic responses. Its redirect security case correctly rejected an attacker redirect for a summary request; it did **not** assert that legitimate detail redirects should fail. The real official catalog redirect and deleted-event plaintext 409 contracts were missing.
- The archive-miss integration case in `src/worker.entityRoutes.test.js` deleted `env.DB` before returning a mocked upstream 200. That bypassed the real post-upstream revision-read dependency and could not reveal an end-to-end timeout gap.
- `src/worker.scheduled.test.js` mocked the background handlers and accepted any rejection for partial backfill failure. Losing the individual cause and six successful results behind an unhelpful aggregate error did not fail that test.
- Publisher tests checked aggregate rejection/results without requiring useful individual causes. They exercised source timeouts but omitted stalled R2 pointer/body/head/write operations.
- The backfill 409 fixture lacked the provider's deleted-event response body and expected a retry. The fixture did not represent the external contract observed in this incident.
- Generic failure-propagation assertions in the mocked scheduled suite overlap with actual-Worker publisher failure coverage. This is a candidate for consolidation, not evidence that every test at two layers is redundant.

Examples worth retaining include competing-writer CAS fencing, immutable-generation retention, rejection of corrupt archived data without overwrite, recovery across newer source revisions, and preventing an expired client response from replacing accepted data. These protect specific user-visible integrity guarantees, even though they cannot establish availability or provider compatibility.

A controlled comparison, already running when the user clarified that they did not want more tests, executed the same 17 selected incident regression cases against the deployed baseline and the fixed implementation. All 17 failed behaviorally on the baseline and passed on the fixed code; no application files were changed in the baseline and no network access was needed. This establishes sensitivity of those selected regressions to these defects. It does **not** validate the other roughly two thousand tests or establish general suite quality. The temporary baseline checkout was removed; results are recorded in `regression-proof-summary.json` and the two raw result files.

The user explicitly clarified that test usefulness was the question, not a request to increase the test count. Extra audit-only fixture/test-writing work was stopped. The implemented incident regressions remain; further suite cleanup, consolidation or a broader quality audit has not been performed or claimed.

### Broader test-quality review and consolidation — October 9 MDT

The broader review mapped all 153 tracked test files at `f1f6c7e`: 58 backend/Worker/script files, 78 files under components/hooks/pages/utils, and 17 service/context/shared/legacy-asset files. Two Sol agents and the primary agent inspected representative assertions in every category and investigated the incident-facing paths. This is a scoped qualitative audit, not exhaustive mutation testing or a defensible percentage of useful tests. The normal run includes 151 files; two explicitly excluded component files contain 16 literal test cases and provide no release assurance.

The verdict is mixed, with concrete low-value tests rather than merely hypothetical concerns:

| Finding | Why the prior green result was weak | Decision |
| --- | --- | --- |
| `src/tests/contexts/EarthquakeDataContext.selectors.test.jsx` | Its local provider copied all four selectors and the expectations repeated their predicates. The real provider was imported but unused. Production filtering or memoization could break without failing the case. | Remove the fabricated-provider test. This exposes an existing gap: the four real provider threshold outputs lack explicit assertions elsewhere in `src/tests`; no new test was added. |
| `functions/api/get-clusters.integration.test.js` | All three cases called the same handler with mocked KV as the existing unit suite. The integration label did not add a real binding or boundary. | Merge the unique key/header/body assertions into `get-clusters.test.js` and remove three duplicate cases. |
| `EarthquakeDetailModalComponent.common.test.jsx` | One success smoke only checked that mocked detail/SEO children were called; real route/data/SEO suites already checked the meaningful contracts. | Remove that one smoke; preserve malformed-route and noindex behavior. |
| `QuickFact.test.jsx` | Child call count and React's second invocation argument coupled the test to rendering mechanics. | Preserve the magnitude topic, accessible button and navigation; remove that coupling. |
| `kv-stats-updater.test.js` | The fake KV returned `cas` tokens and simulated CAS conflicts, mirroring an unsupported production assumption. | Adapt the existing four cases to value/metadata and generic write errors; retain arithmetic and retry/exhaustion assertions. Explicitly claim no concurrency protection. |
| `usgsApiService.test.js` | A case titled “network errors (fetch rejects)” returned HTTP 503; fetch did not reject. | Correct the title/fixture comments to describe an HTTP 503. This does not supply missing network-rejection coverage. |

Cloudflare's documented [KV read shape](https://developers.cloudflare.com/kv/api/read-key-value-pairs/) is value plus metadata, and its [write options](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) provide no compare-and-swap operation. The production `kv-stats-updater.js` still assumes that unsupported operation. Durable ingestion bypasses the legacy updater, but backfill invokes it after successful archive/D1 persistence and labels the counters approximate. Concurrent updates can lose derived statistics; this is a separate P2 runtime issue, not evidence of lost earthquakes or an established cause of the incident. Correcting the tests does not fix that source issue. Exact counters should come from authoritative D1 reconciliation rather than a claimed KV lock.

Other gaps retained explicitly:

- `vite.config.js` excludes `InteractiveGlobeView.test.jsx` and `NotableQuakeFeature.test.jsx`. Their historical exclusion reason is undocumented beyond a “problematic” comment. The current harness contains ESM/mock inconsistencies and undelivered ResizeObserver callbacks; the Notable no-URL case never supplies a no-URL event. They were neither silently reenabled nor counted as verified.
- `reconcile-stats.test.js` supplies the aggregate result and only checks SQL contains `SELECT`. It checks result handling/publication, not actual aggregate correctness. Its malformed-result and no-publication assertions remain useful.
- The copied selector case and mislabeled network case revealed existing coverage gaps. Removing or relabeling them does not create new assurance.
- Hard-coded microtask-flush counts in some provider tests may be timing-sensitive. No current failure was established, so those tests were retained.

Useful coverage retained includes actual SQLite rollback, stored bytes, lease fencing and lost-ack recovery; competing R2 publication/immutable retention; publisher-to-API-to-browser feed integration; corrupt archive rejection; cursor/source-time validation; real provider loading/recovery; pagination focus/retry; late-response cancellation; real geospatial math; and release asset-graph integrity. Large validation tables often represent different invalid inputs and were not collapsed merely to reduce a count.

Two proposed duplicates were rejected after closer review: HomePage's loaded `/feeds` suppression differs from its pending-content route matrix, and the mocked scheduled publisher case uniquely verifies exact error identity through `waitUntil`. Those distinct assertions remain. No new test cases were added for the quality review. The narrow cleanup removes five cases and two files; it makes the suite's claims more honest without establishing that the remainder is uniformly strong.

Operational conclusion: treat a green suite as evidence for its named contracts. Release identity, actual binding checks, known upstream response checks and observed publication freshness are separate evidence. The incident escaped because important external contracts and end-to-end failure paths were missing; adding more mock-render assertions would not have caught them.

### Resilience production release — October 9, 20:55 MDT

The user explicitly authorized deployment and the broader test-quality review. The production-based revision `f1f6c7eed4d45575730964256fa000166a03cfc8` was deployed with the existing `npm run release:production -- --revision <SHA>` gate. New Worker version `2603234c-a0c9-4d21-a2a6-3f3fef817b95` replaced `06b2014a-a1ef-48a7-be5e-58360df71a96` at 100% traffic. The deploy gate completed at 2026-10-10 02:55:41.099 UTC; all 22 release checks passed at 02:57:21.282 UTC. Both public hosts returned the exact revision and version before and after smoke. No schema, resource, secret, or schedule changes were made.

Isolated remote preview version `08bf1e44-cb06-40d0-8ab2-8a288f111fac` used dedicated preview resources, refreshed synthetic fixtures and no automatic crons. Preview passed 366 GET checks across 334 asset paths, all three fresh-feed checks, six admin-denial checks, live upstream detail/deleted-event checks, and browser rendering of a synthetic detail and the deleted-event terminal state. An ad hoc probe initially expected an internal error code in the public JSON; the route intentionally exposes a generic error body with HTTP 410. Correcting that probe to the documented public shape required no application change.

The release gate reran the full application suite, build and production package, verified all 314 retained asset objects and the exact 26-asset predecessor graph, and ran 366 GET checks / 334 asset paths on each public host. The known affected event `us6000sfvh` returned 200 on both hosts, and `us7000s9fi` returned 410. Six separate auth checks per host preserved anonymous/malformed 401 and unconfigured-admin 503 behavior. Those four expected production 503 probes used `EarthquakesLive-Smoke/1.0` and are not availability failures.

The first five-minute cron on the new version was dispatched at 02:55:40.703 UTC and completed successfully. Its three new freshness records were fresh, with source ages approximately 50, 32 and 16 seconds. The month-coverage cron at 02:57:48.908 UTC completed all 10,593 source events in 18 batches, inserting zero missing rows. The 03:00:48.299 UTC half-hour backfill completed two items with zero errors, and the simultaneous five-minute publisher again committed all three periods as fresh. The ten-minute clustering invocation at 03:00:48.393 UTC finished in 50.656 seconds, processing 173 significant clusters with zero errors. These are actual version-correlated scheduled observations, not inferred health-endpoint results. The bounded tail observed 605 new-version invocations through 03:01:46 UTC, all with successful runtime outcomes and zero exception records; it is a short observation window, not complete traffic accounting. Final public feed source ages were approximately 97, 70 and 50 seconds, all fresh.

The subsequent test-only cleanup passed 149 files / 2,016 tests, with the same three skipped cases, and scoped ESLint. No new test cases were added. Runtime source remains byte-for-byte identical to the deployed revision; the audit/cleanup itself requires no additional Worker deployment. The audit exposed the separate approximate KV-counter issue described above, two excluded suites, and unverified selector/network/SQL coverage. The original publisher-gap trigger remains unknown because historical individual causes were discarded. No claim of complete production reliability follows from these passing checks.

Private evidence: `.reconciliation.local/resilience-release-20261009/` contains the release JSON/log, predecessor verification, preview identity/seed/smoke/browser evidence, both-host contract/auth checks, freshness checks and version-correlated scheduled observations. `.reconciliation.local/test-quality-20261009/` contains audit notes, reviewed consolidation patches, and cleanup validation. The exact compatible code predecessor is the prior admin-response version; rollback must preserve current bindings, D1 schema and every R2 archive. There was no archive deletion or production data repair.

### Test-suite health audit with Sol subagents — October 9 MDT

The suite contains valuable integrity checks alongside demonstrably weak tests and broken, excluded harnesses. Its passing count overstates protection if treated as a general release-health signal. This audit does not support discarding the suite or assigning a percentage of it as useless.

Two Sol agents and the primary agent inventoried all **151 tracked test files at `e550c323a623dcf96e549e331300507d1243fdf3`**: 50 backend/Worker/shared files, 78 component/hook/page/utility files, and 23 script/service/context/asset files. Every file received an assertion and fixture review; suspicious cases received deeper inspection and selected controlled probes. This is not exhaustive branch analysis or a suite-wide mutation score. The target is the production code plus the committed test cleanup, not the unrelated, uncommitted region/SEO work in the main checkout.

The complete suite passed once in CI mode with shuffled order, seed `20261009`: **149 included files, 2,016 passed cases, three skipped cases, zero failures**. A previous ordinary run also passed. One shuffled run cannot establish absence of intermittent failures. All tracked test files were also linted: one unused-variable error in `src/utils/kvUtils.test.js:8`, no warnings. GitHub CI runs Node 22; these audit executions used the installed Node 24.14.0 and Vitest 3.2.4, not a fresh GitHub runner.

Controlled probes changed existing source or enabled existing cases only in disposable/local configurations. No test cases were added and no tracked application, test or runner configuration was changed.

| Probe | Observed result | What it establishes |
| --- | --- | --- |
| Replace all statistics SQL aggregates with literal zero | All 7 existing statistics cases still pass | The supplied mock aggregate hides incorrect SQL. |
| Force the legacy earthquake endpoint to read `list-day.json` for every valid period | All 3 existing endpoint cases still pass | Valid week/month object selection is unverified. |
| Apply both preceding defects together | All 50 backend/Worker/shared files, 940 cases, still pass | Other tests in that audited scope do not rescue these gaps. Each mutation was also verified independently. |
| Remove the feed publisher's conditional pointer-write guard | Four existing publisher cases fail; 47 pass | These tests detect real lost-update and competing-writer integrity regressions. |
| Add `.only` to one existing QuickFact case in an isolated copy | With `CI` absent, exit 0 and one of two cases skipped; with `CI=true`, exit 1 | Local execution permits focused tests; CI rejects them. No `.only` is present in the audited tracked tree. |
| Enable the two normally excluded component suites | All 16 cases fail on an undefined context `.Provider` | Obsolete imports prevent these cases from reaching component behavior. |
| Enable the three existing skipped banner cases | All three fail at their approximately 2.5-second deadlines; two static cases pass | The skipped behavior remains unverified. The result alone does not establish a component defect. |

The deliberately broken implementations are diagnostic probes, not findings that current production returns zero statistics or the wrong feed period. Saved patches and logs remain; both disposable source copies were removed.

Repair priorities, using existing cases where possible:

1. **P2 — Make local release checks reject focused tests.** `scripts/release-production.mjs:299` runs `npm test`, and `runCommand` at line 353 inherits the caller's environment. `vite.config.js` does not forbid `.only` explicitly. Enforce rejection in shared test configuration or the release invocation so local releases get the same protection as CI. The probe demonstrates omitted cases in the affected file, not that every other file is skipped.
2. **P2 — Replace mocked answers at important data boundaries.** `functions/background/reconcile-stats.test.js:19` supplies the aggregate and checks only that the query contains `SELECT`; exercise that existing happy case against migrated SQLite rows. `functions/api/get-earthquakes.test.js:18` only requests a day and does not verify the storage key; make its happy case cover distinct day/week/month data and selection. Preserve the separate useful error and malformed-result assertions.
3. **P2 — Resolve silently unavailable coverage.** `vite.config.js:21` excludes InteractiveGlobeView and NotableQuakeFeature. Their imports no longer provide `EarthquakeDataContext`; failures occur at test lines 49 and 25, respectively. Repair the harness or explicitly retire it after mapping valuable behavior elsewhere. `TimeSinceLastMajorQuakeBanner.test.jsx:78`, `:151` and `:213` remain skipped. Fake timers combined with `waitFor` polling are a plausible harness cause; its SkeletonText mock also targets a different path from the component. Diagnose the harness before attributing these failures to production.
4. **P2 — Make existing reducer assertions check their stated result.** `EarthquakeDataContext.reducer.test.jsx:139` claims sorted globe output but sorts both ID lists before comparing, erasing ordering, and its small fixture never reaches the 900-event cap. Lines 166 and 216 mostly check analytics shapes and lengths. Owned utility/chart tests do not independently establish the reducer's ordering, cap, sample selection or nonempty aggregate values. Other actual reducer transitions remain useful; this is not a claim that the whole file is fabricated.
5. **P3 — Repair misleading or broken test harnesses and consolidate proven duplicates.** ErrorBoundary's “state contains” case at line 72 repeats logging assertions instead of checking its claimed state. Timeline's React context fallback at line 54 recurses into its own spy; scatter/distribution fallbacks at lines 68/67 read `useContext` from an unawaited import promise. These branches are currently unexercised, not demonstrated production failures. Use a real provider or a correctly scoped hook boundary. Direct assignments to `global.fetch` in `fetchUtils.test.js:10` and the element geometry prototype in `SequenceChart.test.jsx:231` are not undone by `restoreAllMocks`; default file isolation limits cross-file effects. No shuffled failure was reproduced.

Additional low-priority cleanup is recorded per file: a sitemap case prefilters away the malformed rows it claims to exclude; spatial compatibility permits an empty result; a legacy prerender test accepts two conflicting routing outcomes; a format-number null case duplicates an existing assertion; and `clusterApiService.test.js:116` labels an HTTP 503 as a network rejection. Timing benchmarks, locale-dependent strings, redundant negative-text assertions and exact React invocation arguments should not be treated as application reliability evidence. These warrant selective correction or consolidation, not wholesale deletion of distinct boundary cases.

Coverage worth preserving includes actual SQLite migrations/transactions/rollback, durable replay and revision fencing, publication concurrency and immutable bytes, publisher-to-API-to-browser integration, bounded transport and cancellation, real provider recovery, dialog focus and pagination, and predecessor asset/release identity checks. The killed publisher mutation gives direct evidence of sensitivity in one of these areas. Mocked Leaflet/WebGL tests protect adapter wiring, not real rendering or performance; legacy Pages tests must not be presented as deployed Worker evidence.

The previously identified unsupported KV compare-and-swap assumption remains a separate production follow-up for approximate counters. This audit did not repair it, change production, or create more tests. It establishes concrete work to improve existing assertions and release discipline rather than chasing a higher count or an arbitrary coverage threshold.

Audit evidence is under `.reconciliation.local/test-health-20261009/`: `combined-inventory.csv` lists exactly 151 distinct tracked test files; `inventory.json`, `owned-file-review.csv`, and `root-inventory.json` retain review decisions and scope limitations. `reproduce.md` and `root-reproduce.md` describe probes; saved mutation patches, individual and combined logs, excluded/banner results, shuffled results and lint output support the findings. The report is the only tracked file changed by this audit.

### Test-health remediation completed — October 9 MDT

The requested remediation is implemented in the production-based worktree. Two Sol agents handled backend and frontend repairs and reviewed each other's work; the primary agent repaired runner, provider, reducer and service coverage and reviewed the combined changes. No new test files were created. Five confirmed duplicate cases were removed, the existing feed-selection happy case now covers three periods, and the 16 excluded plus three skipped cases are enabled. The final normal suite contains 151 files and 2,032 cases, all executed.

| Audit finding | Implemented repair |
| --- | --- |
| Local release permits focused tests | Shared Vitest configuration sets `allowOnly: false`. With `CI` absent, an isolated existing `.only` case now exits nonzero. Both file exclusions were removed. |
| Mock aggregate hides incorrect SQL | The existing statistics success case applies the actual migrations to SQLite, inserts fetched/unfetched rows with different scientific product flags, executes the production query, and verifies the exact published totals. |
| Legacy reads can select the wrong period | The existing R2 case now checks distinct day/week/month payloads and exact storage keys. |
| Excluded globe and notable-event harnesses | Fixed actual context imports, ESM mocking, measured dimensions, observed resizing, plotted-event selection and a genuine missing-URL event. Both suites run normally. |
| Three skipped banner cases | Corrected skeleton mock path, fake-timer lifecycle, synchronous rendering assertions and interval advancement; all skips removed. |
| Reducer assertions erase ordering or check only shapes | Explicit expected IDs, calendar counts and magnitude bins replace copied calculation helpers; dense fixtures exercise the 900-event globe cap and 300/500/700 sample limits while retaining priority events. |
| Removed fake provider left real selector coverage unverified | The existing real-provider API-contract case now checks both magnitude boundaries, null magnitudes and distinct weekly/monthly results, without copying selector logic. |
| Broken context spies and leaking mocks | Removed global React context spies in favor of existing real providers; fetch/prototype/environment changes now restore correctly. |
| Duplicates and misleading fixtures | Removed duplicate ErrorBoundary/format-number/helper cases, supplied malformed sitemap rows to the handler, pinned legacy prerender behavior and upstream fixtures, and replaced the service's invalid/mislabeled network mocks with actual MSW transport rejection. |
| Timing, locale and invocation brittleness | Seeded random spatial fixtures, checked memberships/work budgets instead of host speed, used a controlled profiler clock, fixed ActivityList time, pinned locale only at the native formatter boundary, removed React's second-argument checks and redundant negative-phrase assertions, and replaced fixed microtask counts with async zero-time timer advancement. |

Restoring globe coverage exposed one actual component defect: the default `activeClusters = []` created a new dependency on each render and its points effect continually scheduled another update when callers omitted that prop. A module-level empty array now supplies a stable default. The existing seven globe cases continue to omit the prop and complete. This is the only application runtime change; it is not established as the cause of the earlier production incident. WebGL remains mocked, so these cases verify the component's data, layout and event behavior rather than actual GPU rendering.

The first Node 22 shuffled run exposed a further asynchronous map-test defect: tectonic and fault layers shared a singleton test query. The test now identifies each layer, waits for both and verifies their data/style contracts. This was an order/timing-dependent test issue, not evidence of a Node-specific application defect.

Verification of the final changes:

- Full CI-mode shuffled run on Node 22.13.0, seed `20261011`: **151 files, 2,032 passed, zero skipped, zero failed**.
- Full CI-mode shuffled run on Node 24.14.0, seed `20261010`: **151 files, 2,032 passed, zero skipped, zero failed**.
- All 151 tracked test files, the Vitest configuration and the changed runtime component pass ESLint with zero errors or warnings. Diff whitespace checks pass.
- Frontend build and pinned Wrangler production dry-run packaging pass. The existing large-chunk build warning remains.
- Independent diagnostic mutations now fail for all-zero statistics SQL, always-day selection, reversed globe ordering, a 901-event globe cap, and zeroed weekly daily counts. The existing publisher tests also reject a removed concurrency guard. These are selected behavioral sensitivity checks, not a suite-wide mutation score.
- A temporary `.only` modification to an existing case is rejected locally with `CI` unset. Temporary probe source trees have been removed; patches and result logs remain.

The changes are saved on `codex/resilience-fixes`; production was not redeployed during this test-health task. The unrelated main-checkout region/SEO changes were preserved. The separately documented approximate KV-counter concurrency issue remains outside this test-health remediation.

Evidence remains in `.reconciliation.local/test-health-20261009/`, including `fixed-node22-final-results.json`, `fixed-node24-final-results.json`, `fixed-final-lint.json`, build/package logs, `fixed-focus-results.json`, `fixed-probes.md`, and the reducer mutation patches/results. The initial failed Node 22 result is retained alongside the final passing result. The audit inventory describes the pre-repair findings; this section records their resolution.
