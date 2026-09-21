# Administrative operations: foundation release

This describes the current implementation in [`src/worker.js`](../../src/worker.js), not a claim that it has been deployed or that a live secret has been configured. Check the [release ledger](RELEASE-LEDGER.md) for rollout evidence. The Worker is the active entrypoint; legacy Pages handlers and their exported function names do not define the public HTTP contract.

## Authentication and common behavior

Administrative HTTP operations require `env.ADMIN_API_TOKEN` to be a string of **at least 32 characters**. There is no default token in repository configuration. If the binding is absent or shorter, protected operations return **503** before body parsing or database work. A missing, malformed, or incorrect credential returns **401** with `WWW-Authenticate: Bearer`.

Send the credential only as `Authorization: Bearer <ADMIN_TOKEN>`. The scheme is case-sensitive in the current implementation; the token must contain no whitespace, and the complete header must be at most 4,096 characters. Cookies, query parameters, JSON fields, execution IDs, and `isCron` do not grant authorization. This is an application bearer-token gate; it does not assume that Cloudflare Access is configured. The same Worker policy applies on the custom domain and its `workers.dev` host. Provisioning or rotating an environment-specific secret is a separate operator action; this document neither sets a secret nor establishes its current live state.

Requests need a nonempty `User-Agent`; the existing scraping filter can return 403 before routing. Administrative responses, authorization failures, all other errors, and dynamic HTML are finalized with `Cache-Control: no-store`. Requests carrying `Authorization` also receive `no-store` responses.

Where a JSON body is required, use `Content-Type: application/json` (an optional charset is accepted). The body must be one JSON object. Readers enforce streamed byte counts, not just `Content-Length`, with a **30-second body-read deadline**. Invalid JSON or parameters return 400, unsupported content type 415, oversized bodies 413, and body timeout 408. This deadline is not a whole-operation runtime guarantee.

## Administrative HTTP contracts

| Method and path | Input and limits | Result and scope |
|---|---|---|
| `POST /api/batch-usgs-fetch` | JSON ≤ **4,096 bytes**. Required `startDate`, `endDate`: real `YYYY-MM-DD` dates, positive interval ≤ **7 days**. Optional integer `offset`: **1–20,000**, default **1**. Unknown JSON keys and all query parameters are rejected. | Fetches and upserts one USGS catalog page of at most **1,000** events. No magnitude filter. Dates are passed to USGS as UTC midnight boundaries; USGS includes events at either boundary. See continuation rules below. |
| `POST /api/backfill-earthquake-details` | JSON ≤ **4,096 bytes**. Required `operation`: `status` or `run_batch`. Optional integer `batch_size`: **1–100**, default **10**; numeric `min_magnitude`: **−2–10**, default **3**; integer `max_age_days`: **1–365**, default **365**. JSON numbers must be numbers, not strings. | `status` counts eligible rows without fetching details. `run_batch` processes up to `batch_size` eligible events; inspect both `success` and `errors`, even on HTTP 200. Extra JSON fields are currently ignored, not interpreted as options. |
| `POST /api/fix-enhanced-data-flag` | No body or query parameters are consumed. | A single database repair sets `has_enhanced_data` true for fetched rows whose existing individual product flags establish enhanced data. Returns before/after statistics and changed-row count. It does not fetch missing product information, repair every detail flag, or paginate the update. |
| `POST /api/cluster-definition` | JSON ≤ **262,144 bytes**. `clusterId` (or fallback `id`): **1–200** ASCII letters, digits, `_`, or `-`. `earthquakeIds`: **1–2,000 unique IDs**, each **1–100** characters with that same alphabet. `strongestQuakeId` must be a member. All members must already exist in D1. | Registers the definition. Returns **201** with `registered` or `already_registered`; an existing ID is not updated. Other supplied metadata is not persisted by this registration handler. GET lookup remains public. |
| `DELETE /api/cache-stats` | No body or query parameters are consumed. | Deletes `ClusterCache` rows matching the existing SQL expiry predicate, `createdAt <= datetime('now', '-1 hour')`, in one statement. This does not clear R2 objects or the edge Cache API. GET statistics remain public. |

The first three paths reject HTTP GET and other methods with **405**, `Allow: POST`, before invoking their handlers. The cache deletion operation intentionally remains DELETE.

For catalog imports, `complete: true` means **this page's D1 persistence completed**, not that the whole time interval was imported. On 503 or `complete: false`, retry the same dates and offset; some rows may already have succeeded. Advance only when `complete: true` and `hasMore: true`, using `nextOffset`. A full 1,000-event page conservatively sets `hasMore`, so an additional empty page can be necessary. If `rangeMustBeSplit: true`, split the date interval and restart its pages; there is no automatic job or checkpoint for this HTTP operation. Adjacent date ranges can overlap at midnight, and upserts handle repeated IDs.

Backfill eligibility requires `detail_fetched = FALSE`, fewer than three recorded upstream attempts, the requested minimum magnitude and maximum event age, and either a due retry or an initial event at least **45 minutes** old. Rows are selected by magnitude descending, event time descending, then ID ascending. Upstream failures schedule retries after **1, 4, and 12 hours** and increment attempts; rows reaching three attempts are no longer eligible for automatic selection. Persistence/archive failures after a successful fetch schedule a one-hour retry without consuming another upstream attempt. The returned `continue_url` is advisory for internal code; public GET is disabled. Repeat the authenticated `run_batch` POST to select the next eligible rows. `last_processed_id` is informational, not a cursor.

## Public USGS reads and trusted scheduled work

`GET` or `HEAD /api/usgs-proxy` accepts exactly one `apiUrl` query parameter containing one of these URLs:

```text
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson
```

Credentials, nondefault ports, URL query strings/fragments, other destinations, duplicate `apiUrl` parameters, and extra proxy parameters are rejected. **Any `isCron` parameter returns 400**, including `isCron=false`. The proxy performs no D1 ingestion, KV checkpoint/statistic operations, or queue sends. Its only write is the optional edge cache fill, under a canonical versioned key. Successful feeds default to `s-maxage=600`; integer `WORKER_CACHE_DURATION_SECONDS` values from **1–3,600** override it. Cache failures fall back to the upstream read. HEAD returns no body but may fetch/cache the feed on a miss.

The shared USGS transport uses HTTPS to the exact official host, rejects redirects, and allows **10 seconds** for upstream headers and body combined. Summary responses are limited to **16 MiB** and **30,000 unique events**; detail responses to **8 MiB**. Both validate event IDs, finite coordinates and millisecond timestamps, and scientific field shapes; explicit null magnitude/place are accepted. Catalog pages validate USGS's catalog-style detail links and normalize them to canonical feed detail URLs. Upstream/shape/size failures return 502, deadlines 504, and a missing official event detail preserves 404.

The production configuration defines these scheduled calls; preview defines **no automatic crons**:

| Schedule | Internal operation |
|---|---|
| Every 5 minutes | `handleTrustedUsgsIngestion({ env, executionContext, logger, feedKey: 'hour' })`, followed by frontend-list generation on success. |
| Every 30 minutes | Direct internal backfill call with `batch_size=10`, `min_magnitude=0`, `max_age_days=1`. |
| Every 10 minutes | Cluster-definition processing. |
| Daily at 00:00 UTC | Statistics reconciliation. |

These internal calls use Worker bindings directly and do not require or transmit the HTTP bearer token. The internal backfill function retains an `onRequestGet` export for scheduling compatibility; it is not an accessible unauthenticated GET route. Trusted hourly ingestion preserves `{ newOrUpdatedFeatures, fullGeoJson, ingestion }`; despite its historical name, `newOrUpdatedFeatures` contains the entire validated fetched hour for list generation. It advances the hourly KV checkpoint only after a complete D1 outcome and awaits the checkpoint write. Incomplete persistence returns 503 and does not publish that checkpoint.

The pure-read guarantee above is specific to the summary proxy. Public event-detail cache misses can still fetch validated USGS details, archive them, and update corresponding metadata. Do not treat every public GET as a side-effect-free production verification probe.

## Request examples

These are templates for an already configured isolated preview. Substitute the host and credential locally; do not put a real token in a URL, committed file, browser application, or shared transcript. No remote request is required merely to validate this document.

```http
POST /api/backfill-earthquake-details HTTP/1.1
Host: <ISOLATED_PREVIEW_HOST>
User-Agent: EarthquakesLive-Admin/1.0
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{"operation":"status","batch_size":10,"min_magnitude":0,"max_age_days":1}
```

For a bounded write, change `operation` to `run_batch`. For a catalog page, use the same headers with:

```http
POST /api/batch-usgs-fetch HTTP/1.1
Host: <ISOLATED_PREVIEW_HOST>
User-Agent: EarthquakesLive-Admin/1.0
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{"startDate":"2026-09-01","endDate":"2026-09-02","offset":1}
```

A cluster registration body is `{"clusterId":"example-cluster","earthquakeIds":["EXISTING_EVENT_ID"],"strongestQuakeId":"EXISTING_EVENT_ID"}`; the placeholder event must actually exist in the chosen environment. Flag repair uses the protected POST without a JSON body. Cache cleanup uses the protected DELETE without a body. Neither operation is a health check.

## Remaining durability limits

- Hourly scheduling does not recover an outage longer than its source window or every older event correction. Public day/week/month reads no longer provide incidental ingestion. Bounded catalog catch-up requires explicit operator execution and page tracking; upstream offset pagination is not an immutable snapshot.
- The complete-write checkpoint guard prevents newly checkpointing partial batches. It does not repair previously incorrect checkpoints, provide locking for overlapping jobs, or fence older upstream revisions. There is no durable per-run retry ledger yet.
- Archive acceptance precedes detail completion: smaller payloads are queued, while larger ones can be written directly to R2. Queue acceptance is not confirmation of a successful consumer write; Queue/R2 and D1 are not one transaction. An archive write followed by D1 failure can be replayed. Completed details do not yet have a full upstream-revision refresh policy.
- KV statistics remain approximate and can lose concurrent increments; the existing updater's CAS assumption is not a reliable concurrency mechanism. Cache statistics and expiry predicates retain legacy timestamp behavior, and cleanup's returned deleted count should not be treated as an authoritative reconciliation result.
- Flag repair and cache cleanup have no application-level row batching or dry-run mode. Authentication limits callers; it does not make these database operations a complete recovery workflow.

Durable jobs/outbox delivery, revision fencing, authoritative statistics, controlled data repairs, and refresh policies belong to the subsequent [database remediation package](03-data-integrity-and-database.md). They are not guarantees of this foundation release.
