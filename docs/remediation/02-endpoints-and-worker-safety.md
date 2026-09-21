# Release 2 — Contain unsafe endpoints and bound Worker execution

This is an implementation work package for a future model. It does not authorize a deployment by itself and does not record completed fixes. Work in `/Users/theair/Projects/earthquake`; inspect the current branch and the release ledger before editing. The audit baseline is commit `aca32df909dc76f23483ab19779ac5fcbafed1b3`, but operational recovery and earlier work may have advanced HEAD.

The outcome is a Worker whose public feed proxy cannot ingest caller-selected data, whose administrative mutations require a server-side credential, whose user-agent-dependent HTML cannot enter a shared cache, and whose spatial calculations terminate safely and handle longitude wraparound. Findings covered are B1, B2, B3, B4, B5 and B7. F10 belongs to release 4; an independently reviewed tooltip containment commit may move forward into this release only after recording the ownership change.

No production exploitation was demonstrated. Evidence is local source analysis and controlled probes. Do not send malicious URLs, forged earthquake data, expensive coordinates, maintenance requests or cache-poisoning requests to the production site.

## 1. Prerequisites and source of truth

1. Release 1 must have verified the Cloudflare build/deploy command, explicit production environment, actual bindings and custom domain. Do not infer deployment safety from a green GitHub build. Confirm that a subsequent push cannot replace the Worker with an asset-only/default-environment deployment.
2. Read the master release plan and ledger, the current deployment runbook, and `.reconciliation.local/audit-2026-09-21/AUDIT.md`, `backend-findings.md`, `DATABASE-AUDIT.md` and `frontend-findings.md`. If local audit artifacts are absent in another checkout, use the cases summarized below and ask the coordinating model for the evidence bundle, without blocking independent source review.
3. Confirm the current Worker entrypoint in `wrangler.toml`. At the audited commit it is `src/worker.js`. Its inline router, earthquake detail handler, cluster handlers and crawler handlers are active. Imported modules under `functions/` can also be active. `functions/[[catchall]].js` and standalone Pages prerender/router copies are not deployed merely because they have tests. Add regressions through the actual exported Worker.
4. Inventory public API callers and monitoring/admin scripts with `rg`. The audited HomePage no longer registers cluster definitions; its comment at approximately line 871 says the registration effect was removed, and no active frontend POST caller was found. Recheck this before securing the legacy route; never put an admin credential into browser JavaScript to preserve a historical registration flow.
5. Make a branch using the repository's normal `codex/` convention. Preserve unrelated working changes. This package requires no schema migration, production data rewrite, dependency upgrade, new Cloudflare product, broad routing refactor or compatibility-date change.

Relevant code ownership:

| Area | Active files/checkpoints |
|---|---|
| Routing, method gates, crawler HTML and detail fallback | `src/worker.js` |
| Public USGS proxy and current ingestion/checkpoint coupling | `functions/routes/api/usgs-proxy.js`, `src/utils/d1Utils.js`, `src/utils/kvUtils.js` |
| Administrative handlers | `functions/api/batch-usgs-fetch.js`, `backfill-earthquake-details.js`, `fix-enhanced-data-flag.js`, `cache-stats.js` |
| Scheduled callers and queue consumer | `src/worker.js` scheduled helpers, `functions/background/process-cluster-definitions.js`, `functions/consumers/geojson-archive.js` |
| Spatial search | `functions/utils/spatialClusterUtils.js`, `src/utils/geoSpatialUtils.js`; compare browser `src/utils/clusterUtils.js` before changing shared semantics |
| Native response cache configuration | `wrangler.toml`; apply response finalization to the exported Worker, including its preview wrapper |
| Tooltip coordination only | `src/components/InteractiveGlobeView.jsx`; F10 implementation owned by release 4 |

## 2. Commit A — Establish observable contracts before extracting ingestion

Add focused tests that import the Worker and provide in-memory D1/KV/R2/queue/cache bindings and intercepted `fetch`. Every potentially mutating test must assert which bindings were called, not merely the HTTP status. Keep failure reproduction and desired regression assertions distinct: the existing audit scripts intentionally assert broken behavior and are not passing repair tests.

Capture these contracts before edits:

- The public frontend uses exact USGS summary URLs for `all_day.geojson`, `all_week.geojson` and `all_month.geojson`. The cron uses `all_hour.geojson`. Preserve the existing `apiUrl` query interface for these URLs in this release, unless all callers are changed in the same reviewed commit.
- The five-minute chain currently expects an object containing `newOrUpdatedFeatures` and `fullGeoJson`, then generates day/week/month R2 lists. Preserve the public GeoJSON response separately from this internal result. Document what the internal feature array means; do not silently switch from full fetched features to only changed features, since downstream timestamp/freshness behavior depends on it.
- The 30-minute backfill calls an imported handler directly. Protecting its HTTP route must not make the scheduled path require an HTTP credential, issue a self-fetch to production, or stop queue publication.
- Every background promise must be awaited or owned by the original execution context's `ctx.waitUntil(...)`. Do not destructure/bind `waitUntil` incorrectly or hide a rejected promise behind an unconditional success response.
- Queue messages remain `{ id, geojson }` during this release. Preserve valid-message acknowledgement and transient R2 failure retry behavior; release 3 owns durable archive/revision changes.

### DB-02 handshake with release 3a

Release 3a owns the first partial-failure checkpoint fix. A 91-feature fixture with the first 90-row D1 batch failing and the final one succeeding currently writes the entire checkpoint and suppresses the next retry. The extraction in this release must not introduce any additional checkpoint advancement, omit the trusted ingestion call, or convert partial failure into a new successful completion signal.

Keep a characterization of that known failure available and link the unresolved DB-02 item in the ledger; do not present it as a passing correctness test or claim this release fixes it. Coordinate a stable internal interface such as `fetchValidatedUsgsFeed(...)` followed by `ingestTrustedUsgsFeed({ env, ctx, feedKey, feed, logger })`; names may follow repository conventions, but the trust boundary must be explicit.

If extraction cannot land safely without fixing checkpoint authority, stop at that commit boundary and pull the minimal all-batches-success guard plus its regression test forward from release 3a. Record that ownership moved. The regression then requires that failed records are not checkpointed and that an identical retry attempts them again. Do not simultaneously implement release 3's durable run ledger, schema repairs or outbox in this containment branch.

## 3. Commit B — Separate public reads from trusted ingestion

Refactor only enough to create three explicit operations:

1. **Validate and fetch a supported USGS resource.** Shared transport/shape checks, bounded response consumption and controlled redirects; no D1/KV checkpoint/statistics/queue writes.
2. **Serve a public feed.** Public cache lookup, validated fetch on miss, safe cache write and GeoJSON response. Assert zero D1 writes, queue sends, checkpoint writes and statistics writes for both hits and misses. A cache write of the public response itself is permitted.
3. **Ingest a trusted feed internally.** Invoked from `scheduled`, or from a separately authorized administrative operation. It receives validated data and a trusted code-level feed identifier; HTTP parameters or headers cannot set its trust level. It retains current downstream contracts until release 3a replaces checkpoint authority.

Remove public control of `isCron`. Return a clear 400 for this unsupported public parameter, or ignore it as a deprecated no-op with identical ordinary cache semantics; choose one behavior, document it and test it. Prefer 400 for a visible migration boundary. Never derive trusted mode from a User-Agent, `X-Execution-ID`, Host, Referer, Origin, query parameter or a self-declared internal header.

### URL and response validation policy

Use one small shared validator/fetch helper so the public proxy, scheduled summary fetch, detail handler, backfill and crawler detail fetches cannot drift into different URL policies.

- Parse with `new URL`; require `https:`, exact hostname `earthquake.usgs.gov`, default HTTPS port, no username/password and no fragment. Reject suffix lookalikes, subdomain tricks, alternate ports and non-HTTP schemes. Normalize only after validating the raw input needed to detect ambiguity.
- Public summary allowlist: `/earthquakes/feed/v1.0/summary/all_hour.geojson`, `all_day.geojson`, `all_week.geojson`, `all_month.geojson`, with no arbitrary query string. Confirm source callers before adding any other feed. A finite feed-name-to-URL map is preferred over a general prefix allowlist.
- Detail requests accept a bounded event ID composed of the characters actually supported by the application's USGS fixtures. Start with `[A-Za-z0-9_-]{1,100}` after confirming legitimate IDs. Construct the detail URL from that ID; do not concatenate arbitrary decoded path text. Reject encoded slashes, backslashes, traversal, separators, controls and extra path segments. If the upstream supports an ID format outside this set, add an explicit tested form instead of permitting arbitrary URLs.
- For existing database `usgs_detail_url` values, reconstruct the canonical USGS detail URL from the validated stored event ID when possible. Otherwise require the same exact allowed origin/path and matching ID before fetching. Existing storage is not automatically trusted: B1 could have written an arbitrary URL. Do not rewrite stored values or assert that poisoning occurred; release 3 owns data inspection/repair.
- Batch imports may use only a server-constructed `/fdsnws/event/1/query` URL with validated date/magnitude/pagination parameters. They must not accept a raw upstream URL or caller-supplied unknown query keys.
- Use `redirect: 'manual'`. Reject unexpected redirects by default; if a documented legitimate redirect is required, follow at most two hops and revalidate the complete destination at every hop. Never validate only the first URL and then allow automatic redirect following.
- Enforce a real stream byte limit, not only Content-Length. Cancel the reader on overflow. Initial engineering ceilings: 16 MiB/30,000 records for a summary feed and 8 MiB for detail JSON; validate these against the largest normal fixtures and record any bounded adjustment before release. Do not buffer unbounded error text or echo upstream bodies into client errors.
- Validate FeatureCollection/features versus detail Feature shape, finite coordinates in geographic range, bounded IDs and strings, numerical timestamps/magnitudes and expected nullable summary fields. Null magnitude can be legitimate USGS data: preserve it for read responses where supported and let the explicit ingestion policy decide storage eligibility. Do not silently drop arbitrary malformed records and then advance a checkpoint as though the feed were complete.
- For detail JSON, verify returned identity against the requested event and documented USGS aliases. Do not archive a returned object under an unrelated caller-selected key. Test legitimate merged/alias IDs if supported by current fixtures.
- Apply an upstream deadline, initially ten seconds per request, and a total redirect/retry budget. Translate timeout to 504, upstream/shape failure to 502, bad client input to 400 and oversized client bodies to 413. Keep upstream failures non-cacheable; no automatic infinite retry.

Use a canonical public cache key based on the validated feed identifier rather than the raw request URL, which may contain irrelevant parameters. Preserve response content type and correct encoding; construct outbound response headers deliberately instead of blindly copying an upstream encoding/length onto a reserialized JSON body. Cache only validated successful read responses. Authenticated administrative responses never share this cache.

The public detail route currently performs a server-owned read-through archival/upsert on a cache miss. B1 containment must validate its ID/upstream data now, but release 3 owns its defective `detail_fetched`/archive semantics. Explicitly retain or remove that side effect only through the release 3 handshake; do not accidentally mark details fetched without flags while claiming all public GETs are pure. The zero-persistence acceptance criterion above applies specifically to the public **feed proxy**. Trusted scheduled backfill must remain able to archive details.

### Critical ingestion coverage gate

Removing public day/week/month ingestion also removes an incidental source of historical USGS rows. The current scheduled feed is only `all_hour`. Before production promotion, demonstrate with local/preview fixtures and read-only freshness evidence that the trusted scheduled path supplies required ordinary ingestion. A cold database or missed-hour recovery must have an authorized bounded import path. Do not broaden cron cadence/feed scope casually as part of containment; if removal would create a data gap, coordinate the trusted catch-up implementation from release 3a before rollout. Never retain arbitrary public writes as the workaround.

## 4. Commit C — Protect administrative mutations and bound parameters

### Concrete authorization design

Use an environment-specific Worker secret named `ADMIN_API_TOKEN` for the first containment implementation. No Access application, service token audience, WAF rule or secret currently exists by assumption. If a verified Access setup is discovered, document it and evaluate a later replacement; do not trust the mere presence of an Access-looking header.

- Only `Authorization: Bearer <token>` is accepted. No query-string, cookie, request-body or browser-stored token; no credential embedded in Vite environment variables or `wrangler.toml`.
- Fail closed when the secret is missing: administrative handlers must remain disabled with a non-cacheable service-unavailable response and zero work. A configured but missing/incorrect token receives a non-cacheable 401. Keep externally visible errors generic.
- Bound the header before processing. Compare fixed-size digests using an available platform-supported constant-time primitive; validate the chosen API under the repository's current compatibility date. Do not invent a cryptographic scheme or use plain secret-string equality. Never log the token, Authorization header, raw request body or secret-derived values.
- Apply authorization centrally in the actual Worker before body parsing, upstream calls or bindings access. Cover custom domain and workers.dev/preview entrypoints equally; DNS/Host checks are not authentication.
- Preview and production tokens are distinct and provisioned through the normal secret-management workflow during implementation, without printing them into transcripts. Tests use synthetic values. Document rotation and removal; production release can intentionally leave the administrative API disabled when no operator requires it.

### Route/method contract

| Route | Target behavior |
|---|---|
| `/api/usgs-proxy` | Public GET/HEAD read-only feed response; reject mutation methods and trusted-mode parameters. A HEAD request must not trigger persistence. |
| `/api/batch-usgs-fetch` | Authenticated POST with bounded JSON parameters. Former GET returns 405 with `Allow: POST`, `Cache-Control: no-store`, and no upstream or database work. |
| `/api/backfill-earthquake-details` | Authenticated POST with explicit operation, such as `run_batch` or `status`, mapped to separate internal functions. Former GET never executes backfill; 405/no-store. Preserve existing start/status behavior explicitly where required; never report a durable job was queued when the old code only writes a status counter. |
| `/api/fix-enhanced-data-flag` | Authenticated POST only; GET 405/no-store. Retain or disable as documented operational maintenance, not a public repair endpoint. |
| `/api/cache-stats` | Read-only GET may remain public if its payload is intentionally public; DELETE requires auth and is no-store. Use explicit protected POST operation instead if consolidating admin methods, but avoid gratuitous route renaming. |
| `/api/cluster-definition` | GET remains read-only; POST requires auth. Validate authoritative membership/strongest event and bounded record size even for authorized input. No browser credential. |
| `/api/calculate-clusters` | Public POST may remain, with the strict input/work bounds below. Results/error responses are no-store. |
| `/api/system-health`, `/api/system-logs`, `/api/task-metrics` | Inspect for mutations and expensive probes. Remove public health-check KV writes; expose intentionally public read status or protect operator-only work. Do not add a frontend auth dependency accidentally. |

Extract internal backfill/import/repair functions from HTTP wrappers so `scheduled` can call them with structured validated arguments. HTTP authentication must not apply to in-process scheduled events, but the same numerical/data bounds do. Keep all production cron definitions and queue bindings unchanged in this release.

### Initial parameter bounds

These are concrete starting limits to validate against known legitimate callers. Any adjustment must remain finite and be documented with fixture evidence, not silently clamped from invalid input.

- Backfill batch size: integer 1–100, default 10. Reject zero, negative values, decimals, NaN-like strings, exponent strings if not part of the declared format, overflow and missing-versus-empty ambiguity. Never let `LIMIT -1` reach D1.
- Backfill age: integer 1–365 days for an ordinary call; magnitude: finite value from -2 to 10. Historical work outside that envelope uses an explicit reviewed import operation, not an unbounded public parameter.
- Dates: strict valid UTC calendar dates, start before end, maximum seven-day interval per batch-import request, explicit upstream record limit and cursor/continuation. Reject impossible dates and all unknown parameters. A requested interval exceeding one batch must return a real continuation or require the operator to split it, never silently truncate.
- Cluster registration: bounded ID/string sizes, unique validated event IDs, strongest ID included, an authoritative D1 membership check, and at most 2,000 members per ordinary registration. If existing legitimate administrative imports require larger records, use a bounded server-derived operation. Never accept arbitrary JSON object members as IDs.
- Cluster calculation: maximum 20,000 features and 8 MiB JSON body initially; project input to the scalar fields the algorithm actually uses. Validate finite latitude/longitude, ID uniqueness, finite magnitude/time where required, finite positive radius at most 500 km, and integer minQuakes between 1 and the configured feature limit. Preserve the documented empty-input result. Reject malformed coordinates and excess work without partially returning silently truncated clusters.
- Enforce request bytes while streaming even when Content-Length is absent or false. Limit string lengths and reject prototype-like/unexpected object shapes where data is copied into dictionaries. Return stable machine-readable error codes without binding/schema/stack details.

Rate limiting is defense in depth after these bounded paths. If a platform rate-limit binding already exists, inventory and test it. Otherwise, do not claim in-memory per-isolate counters provide global protection. Add a small documented rate-limiting follow-up with resource/cost requirements if public calculation still needs protection; do not invent a Cloudflare account configuration inside this release.

## 5. Commit D — Make User-Agent routing safe for shared caches

Apply one tested response-finalization policy to every exit from the exported Worker, including early denies, crawler success/failure and `ASSETS.fetch` responses. A helper applied only to the main happy path is insufficient.

- Initially set `Cache-Control: no-store` on all dynamic HTML that depends on User-Agent: crawler prerenders and the corresponding browser SPA HTML, including the asset binding's index fallback for those URLs. Prefer treating all HTML responses as no-store during containment so a new HTML route cannot recreate the bug.
- Set no-store on User-Agent rejection 403, empty 204, auth errors, administrative responses, malformed-input responses and upstream error responses. Include HEAD/error paths. Do not leave the old public 24-hour/5-minute headers on early returns.
- Preserve caching for invariant versioned static assets and validated public JSON where safe. Do not disable the native immutable asset cache unnecessarily. Ensure a cached asset response cannot be a bot-denial response.
- Do **not** rely on `Vary: User-Agent` alone across all Cloudflare layers. If dynamic HTML caching is reintroduced later, first inventory native Workers Cache, the explicit Cache API, asset cache and any relevant account/zone configuration; test variant behavior in preview. Raw User-Agent has high cache cardinality. A normalized variant requires a trusted gateway/cache design, not a client-controlled header.
- Native Workers Cache runs before the Worker. A cached invariant API response may bypass a User-Agent denial gate; if preserving that gate on every request is a hard requirement, temporarily disable Workers response caching or move the gate to a verified uncached entrypoint. Do not describe a User-Agent filter as a security boundary. Make this choice explicit in the release evidence.
- Preserve `cross_version_cache = false`. A deployment creates fresh Worker response-cache scope, but verify whether any separately configured cache also needs a targeted invalidation. No production cache-poisoning test is permitted.

Reference behavior against the current [Workers Cache documentation](https://developers.cloudflare.com/workers/cache/) and [configuration](https://developers.cloudflare.com/workers/cache/configuration/); do not apply older zone-cache assumptions to the newly enabled Worker response cache.

## 6. Commit E — Bound spatial work and repair poles/date line

Fix the algorithm, not just its request timeout. A synchronous loop does not yield to a timeout. The observed pole loop derives an enormous longitude interval by dividing by cos(latitude), then enumerates empty grid columns. Date-line queries fail because +180 and -180 are treated as distant positions.

Keep the current strongest-first cluster definition and tie-break behavior unless a separately reviewed scientific/product change is intended. This release changes candidate search correctness and boundedness, not the meaning of a cluster.

Implementation checkpoints:

1. Validate/normalize finite latitude and longitude once. Longitude indexing uses a documented periodic interval, preferably `[-180, 180)`, so +180 and -180 map consistently. Reject latitude outside `[-90, 90]`; do not reject the poles merely to hide the bug.
2. Compute a spherical search envelope with a bounded latitude span. For an envelope reaching a pole, search all occupied longitude cells in the intersecting latitude bands; avoid division by a near-zero cosine. For an antimeridian crossing, split into at most two normalized longitude intervals.
3. Clamp grid row/column ranges to actual representable index extents. Never enumerate unbounded or nonexistent coordinate space. Iterating only occupied cells in a bounded band is an acceptable fallback for polar queries; measure its operation count.
4. Use exact spherical distance as the final inclusion predicate and deduplicate candidates from wrapped intervals. No missed or duplicate events at ±180. Retain deterministic output for unchanged ordinary fixtures.
5. Introduce an explicit operation budget in the public calculation path, initially one million candidate/cell visits, with a typed failure rather than a partial answer. Tune only from reproducible representative data. The internal scheduled algorithm also needs a bounded failure mode: preserve the last known-good cluster output if computation is rejected/failed, and emit a failure metric; do not publish an empty successful snapshot because a limit was reached.
6. Compare the backend and browser implementations against the same fixtures. If both share faulty bounding-box helpers, land the minimal shared repair once and have release 4 consume it. Avoid maintaining two incompatible longitude conventions. Coordinate any client-specific structural changes with its owner.

Acceptance cases include the original three-point fixture at longitudes 179.9, -179.9 and -179.8 with latitude 0, radius 50 km and minQuakes 3: exactly one cluster, all three IDs once. Test its mirror and both poles, nearby nonzero polar latitudes, zero-distance duplicates with distinct IDs, exact-radius boundaries, empty/all-invalid sets and ordinary non-wrapping fixtures. A bounded local child process must finish pole cases well within its safety timeout; additionally assert operation counts so a faster test machine cannot conceal an astronomical loop.

## 7. F10 coordination and release boundaries

Release 4 owns all globe-label branches using `properties.place` and the real tooltip dependency. Its fix should produce an HTMLElement populated via `textContent` or otherwise use an explicitly safe text API, with a regression that an inert `<span>` marker displays literally rather than becoming DOM markup. Updating Preact alone does not repair this application HTML sink.

Record F10 as a dependency before weakening/changing the R2 rich-metadata gate in the feed redesign: the currently rejected bootstrap rows are not an intentional security boundary. If the output fix is cherry-picked into release 2, coordinate exact files/tests with release 4 and mark it complete in the master ledger; do not have both models independently patch the same label logic.

This release does not repair canonical crawler slugs (B6), checkpoint/data durability (DB-02 unless explicitly moved), detail metadata/archive state, KV counter CAS (B8), schema/index drift or cluster version growth. Those remain explicit release 3/4 work. Containment must not hide their status.

## 8. Required regression matrix and failure handling

Run focused tests while implementing and the full repository test/build checks once the final candidate is stable. Use the repository's installed tooling; do not combine security containment with dependency-major upgrades.

| Test group | Required assertions |
|---|---|
| Public proxy | Supported feed response shape unchanged; cache hit/miss both have zero persistence; arbitrary host, credentials, alternate scheme/port, unsafe redirect and public isCron rejected before writes. |
| Trusted cron | Five-minute chain calls validated internal ingestion and list generation; 30-minute backfill still runs and queues; ten-minute clusters and daily reconciliation remain callable; no HTTP token needed. |
| Checkpoint boundary | Known DB-02 fixture explicitly tracked; no new advancement behavior; if minimal fix moves forward, identical feed retries the failed 90 rows and never claims full persistence after one success. |
| Admin routes | Missing secret, bad/missing token, wrong method and oversized body produce no binding/fetch side effects; valid synthetic token can call local/preview wrappers; response always no-store. |
| Input/transport | -1/0/101/fractional/NaN batch values, invalid dates, reversed/too-wide ranges, excessive member count, wrong JSON shape, duplicate IDs, misleading Content-Length, overflowing streamed body, timeout, 3xx redirect chain and non-JSON upstream error. |
| Cache safety | Actual Worker responses for normal/crawler/denied/empty variants and both request orders; corresponding HTML is no-store; native assets retain correct MIME and immutable behavior; preview wrapper still adds noindex. |
| Spatial | Pole/date-line fixtures and operation budget, deterministic ordinary results, no silent truncation, scheduled failure preserves prior output, client/backend agreement for shared inputs. |
| Lifecycle | waitUntil promises collected/drained in tests, queue success ack, transient write retry, missing binding returns controlled error, no unhandled rejection or success log on failed mandatory work. |

Do not retry a rejected public request by falling back to the unrestricted original path. Do not silently return an empty feed/cluster as success on upstream validation, storage or operation-budget failures. Distinguish invalid input from unavailable service and preserve last known-good read data only under an explicit stale-data policy with accurate source/freshness metadata.

## 9. Preview, production observation and recovery

### Local and isolated preview

Use the dedicated preview environment from the current runbook; confirm its D1/KV/R2/queue resources differ from production before seeding or invoking any mutation. Secrets are separate. Use synthetic local/preview data for authorized admin and ingestion tests. Preview has no automatic cron; exercise the exported scheduled method in local runtime tests or a narrowly scoped test harness that is absent from production. Do not ship a public `?runCron` testing bypass.

After deployment to preview, run the regular GET smoke script and browser checks for root/overview/feeds, day/week/month summaries, known stored event detail, known cluster and sitemap/static assets. Restrict remote smoke to already seeded/stored details if a GET miss still has archival side effects. Inspect headers on normal and crawler requests and confirm no-store; test both cache ordering variants only on unique preview fixture paths. Test auth/mutation denial and allowed administrative operations in local/isolated preview, never against production. Record exact commit, environment, test counts, bindings and Worker version.

### Production promotion and read-only evidence

Follow the release 1 deployment guard and current authorization process. Use only the explicit production command in the runbook, never a bare default `wrangler deploy`. Capture the immediately preceding known-good Worker version and bindings for recovery; do not hardcode an old audit version as today's rollback target.

After promotion, verify deployment settings/bindings/cron/queue/domain through read-only tools. Use ordinary read-only GETs for the public site, cached feeds, known stored details/clusters, sitemaps and immutable assets; inspect normal response headers and frontend behavior. Do not invoke maintenance GET/POST/DELETE, fake auth, arbitrary proxy URLs, hostile User-Agents, polar computations or corrupt data on production. In a public proxy read, zero-persistence behavior is proved by local integration tests and read-only metrics/log observation, not by inserting canary rows into production.

Observe at least two five-minute ingestion cycles and one scheduled backfill cycle using existing telemetry, within the parent release's follow-up procedure. Compare freshness, errors, list sizes and queue delivery against a captured baseline. Do not merely infer success from cron registration. If waiting is deferred, hand off an explicit observation responsibility; do not declare the observation completed.

### Stop and recovery conditions

- Missing or cross-environment bindings; default-environment build redeploy; auth secret exposed in a bundle/log; public proxy still writes; cron no longer ingests; prior read data erased; recurring fetch validation failures for legitimate USGS responses; queue retries spike; ordinary spatial fixtures change unexpectedly; cacheable UA-dependent HTML remains.
- Before promotion, fix or revert the candidate in preview. After promotion, prefer a targeted roll-forward containment fix. Rollback to the immediately preceding verified version only when necessary for availability, and explicitly record that it can reintroduce B1–B5 risks; preserve already configured endpoint disablement where possible. Do not delete data, rerun old destructive migrations or flush entire storage namespaces.
- If trusted upstream shape changes exceed the validator, preserve existing data, fail the ingest with telemetry and adjust the policy using a captured legitimate fixture. Do not temporarily reopen arbitrary URL access.

## 10. Completion checklist and copyable handoff

- [ ] Active Worker tests prove pure public feed reads and inaccessible internal trust mode.
- [ ] URL/redirect/body/shape limits cover every active upstream detail/summary path, including stored detail URLs.
- [ ] Admin mutations are authenticated, no-store, bounded and never executed by GET; no frontend credential exists.
- [ ] Scheduled ingestion/backfill/queue behavior is preserved and its observation evidence recorded.
- [ ] DB-02 ownership and current status are explicit; no unsupported claim of checkpoint repair.
- [ ] UA-dependent HTML, denies and empty variants are no-store across all exits; any cache-layer assumptions documented and tested.
- [ ] Pole and date-line regressions pass with finite work; ordinary cluster behavior preserved.
- [ ] F10 and shared spatial changes are coordinated with release 4.
- [ ] Focused tests, full test suite, production packaging check, preview smoke and allowed production observation pass.
- [ ] Ledger/runbook list changed route contracts, limits, secret lifecycle, release version, remaining issues and recovery target.

```text
Implement release 2 from docs/remediation/02-endpoints-and-worker-safety.md in the earthquake project. Read the master remediation ledger and current deployment state first. Scope: B1/B2/B3/B4/B5/B7 containment through the actual exported src/worker.js, plus only explicitly coordinated shared changes. Separate validated public feed reads from trusted scheduled ingestion; protect admin mutations with a fail-closed server-only bearer secret; bound URLs, redirects, bodies, parameters and spatial work; initially keep all UA-dependent HTML/denies no-store; repair pole/date-line candidate search without changing cluster semantics. Preserve scheduled/queue contracts. Coordinate DB-02 with release 3a: do not accidentally drop ingestion or claim its known checkpoint failure fixed; pull the minimal guard/test forward only with an ownership-ledger change if required. F10 belongs to release 4 unless its independent containment commit is explicitly moved forward. Add regression tests through the Worker and use isolated preview resources. Do not make schema/data repairs, upgrade dependencies, publish secrets, run mutation/security/stress probes against production or deploy with a default environment. Complete local/preview validation and the documented release gate, then follow the current user authorization and deployment procedure; record exact evidence, remaining work and recovery version. No broad refactor.
```
