# Release 3 — Data integrity, retries and production database reconciliation

## Purpose and execution boundary

This is an execution work package for another coding model. It is a plan, not evidence that any repair has shipped. Implement it as several reviewable changes under release 3; do not combine the entire package into one unobserved production change.

The outcome is that scientific revisions are persisted correctly, incomplete work remains retryable, cluster identity and revision metadata are trustworthy, production queries use the intended schema, and cached lists/statistics cannot silently become authoritative after a partial failure. This package owns **DB-01 through DB-11 and B8** from the 2026-09-21 audit.

Release 1 must first prevent the default Cloudflare build environment from replacing production bindings. Release 2 separates trusted ingestion/maintenance from public reads and validates upstream requests. Preserve those controls throughout this work. Release 4 consumes exact cluster selectors and aliases; release 5 adopts compact canonical summaries and completes the feed snapshot freshness contract. Release 3 establishes their data foundations without forcing the old frontend onto a new response shape.

The authoring task authorizes planning/documentation only. A future executor must follow its actual implementation/deployment authorization. Ordinary engineering choices below are defaults to validate, not reasons to ask for permission repeatedly. **Historical deduplication, overwriting corrupted legacy values, dropping schema objects, and restoring production data require a reviewed dry-run and a validated recovery path before execution.** Where a supplied authorization does not cover production mutation, complete the local code, migrations, fixture rehearsal and concrete deployment/repair manifest first; then present the remaining action for approval.

## Baseline and fresh verification

The audit examined commit `aca32df909dc76f23483ab19779ac5fcbafed1b3`. Source remained at that commit during the audit. A subsequent automated deployment had lost production bindings; the audit restored the verified code/configuration and passed 37 live smoke checks. **Neither this commit nor the recorded restored Worker version is an instruction to overwrite newer work.** Start by resolving current Git HEAD, dirty files, deployment version, bindings, migration history and the results of releases 1 and 2.

Recorded read-only production observations, useful for comparison rather than immutable expectations:

| Observation | Audit value |
|---|---:|
| Earthquake rows / rows within 30 days | 189,704 / 11,499 |
| Cluster rows / active rows by old 30-day predicate | 45,174 / 3,486 |
| Distinct strongest-event IDs among those active rows | 492 |
| D1 database size | Approximately 777.7 MB |
| Missing-ID cluster lookup | 45,175 rows read; 111.5 ms SQL time |
| Revision string bytes / longest string | 33,743,769 / 327,514 characters |
| Fetched=true with null detail time and products | 898 |
| Integer / text cluster updatedAt values | 10,199 / 34,975 |
| Null cluster createdAt values | 44,585 |
| Sitemap index / page eligibility counts | 12,044 / 659 |

The live database lacked the expected strongestQuakeId and updatedAt indexes even though migration 0005 was recorded as applied. It also had **two** cluster AFTER UPDATE triggers; replaying both into SQLite caused **five row changes for one UPDATE**. Eight migration filenames recorded in production were absent from the checked-in migration directory. Shared strongest-event IDs are a signal for investigation, **not a duplicate predicate**.

If available, inspect these ignored local audit artifacts; another machine/model may not have them:

- [Database audit](/Users/theair/Projects/earthquake/.reconciliation.local/audit-2026-09-21/DATABASE-AUDIT.md)
- [Reproduction program](/Users/theair/Projects/earthquake/.reconciliation.local/audit-2026-09-21/database-probes.mjs) and [results](/Users/theair/Projects/earthquake/.reconciliation.local/audit-2026-09-21/database-probe-results.json)
- [Production schema/index observations](/Users/theair/Projects/earthquake/.reconciliation.local/audit-2026-09-21/production-d1-summary.json), [plans/history/triggers](/Users/theair/Projects/earthquake/.reconciliation.local/audit-2026-09-21/production-d1-plans.json), [impact measurements](/Users/theair/Projects/earthquake/.reconciliation.local/audit-2026-09-21/production-d1-impact.json)

Their absence is not a blocker: the fixtures, invariants and implementation decisions needed to recreate the investigation are specified below. Recheck Cloudflare API/CLI behavior against the installed Wrangler version and official documentation before writing migration, conditional-write or restore commands.

## Active source map and ownership

Line references describe the audited revision and may move after release 2. Follow imports from the current Worker before editing.

| Area | Actual entrypoints and contracts |
|---|---|
| HTTP, scheduled jobs and queue export | [src/worker.js](/Users/theair/Projects/earthquake/src/worker.js:1); detail fallback near 675, registration near 736, scheduled dispatch near 1099, feed ingestion near 1211, automated backfill near 1354 |
| Summary ingest and progress | [usgs-proxy.js](/Users/theair/Projects/earthquake/functions/routes/api/usgs-proxy.js:240), [d1Utils.js](/Users/theair/Projects/earthquake/src/utils/d1Utils.js:1), [kvUtils.js](/Users/theair/Projects/earthquake/src/utils/kvUtils.js:1); release 2 may extract these into a trusted service |
| Detail extraction/backfill | [backfill-earthquake-details.js](/Users/theair/Projects/earthquake/functions/api/backfill-earthquake-details.js:1), [geojson-archive.js](/Users/theair/Projects/earthquake/functions/consumers/geojson-archive.js:1) |
| List replacement | [generate-lists.js](/Users/theair/Projects/earthquake/functions/background/generate-lists.js:1), [get-earthquakes.js](/Users/theair/Projects/earthquake/functions/api/get-earthquakes.js:1) |
| Clustering and stored definitions | [process-cluster-definitions.js](/Users/theair/Projects/earthquake/functions/background/process-cluster-definitions.js:101), [d1ClusterUtils.js](/Users/theair/Projects/earthquake/functions/utils/d1ClusterUtils.js:1) |
| Cluster reads | [cluster-detail-with-quakes.js](/Users/theair/Projects/earthquake/functions/api/cluster-detail-with-quakes.js:28), [get-clusters.js](/Users/theair/Projects/earthquake/functions/api/get-clusters.js:1), the active Worker registration/get/sitemap/crawler handlers |
| Sitemap selection | [index-sitemap.js](/Users/theair/Projects/earthquake/functions/routes/sitemaps/index-sitemap.js:6), [earthquakes-sitemap.js](/Users/theair/Projects/earthquake/functions/routes/sitemaps/earthquakes-sitemap.js:17), [significanceUtils.js](/Users/theair/Projects/earthquake/src/utils/significanceUtils.js:19) |
| Statistics | [kv-stats-updater.js](/Users/theair/Projects/earthquake/functions/utils/kv-stats-updater.js:1), [reconcile-stats.js](/Users/theair/Projects/earthquake/functions/background/reconcile-stats.js:1); also inspect backfill, system-health, task-metrics and system-logs readers |
| Schema and deploy | [migrations](/Users/theair/Projects/earthquake/migrations), [wrangler.toml](/Users/theair/Projects/earthquake/wrangler.toml:1), [DEPLOYMENT.md](/Users/theair/Projects/earthquake/DEPLOYMENT.md:1), [seed-preview.mjs](/Users/theair/Projects/earthquake/scripts/seed-preview.mjs:1) |

Do not implement fixes only in inactive Pages copies such as `functions/[[catchall]].js`, `functions/api/cluster-definition.js`, `functions/background/process-clusters.js`, or the standalone cluster sitemap/prerender handlers. The current Worker uses recovered handlers as well as imports. Update tests to exercise the exported Worker and the extracted shared services actually reached in production.

## Non-negotiable invariants

1. A checkpoint means the identified source revision/snapshot was fully processed under an explicit accepted/rejected policy. Successful partial work never hides failed work.
2. The authoritative event revision never moves backwards, even if two feeds overlap, workers overlap, or an older queue message arrives late. KV is a cache, not a lock or compare-and-swap database.
3. Metadata fetched, detail archived, retry scheduled and job complete are distinct facts. A queue acknowledgement alone is not archive completion.
4. A transient read error is not an empty successful dataset. Keep the previous list/canonical generation when building its replacement fails.
5. Cluster IDs identify persistent entities; revision identifies a changed persisted snapshot; computation generation identifies a complete published set. Strongest-event IDs, slugs and coordinates are lookup attributes, not interchangeable primary keys.
6. Public clients continue receiving the legacy contract until an explicitly versioned consumer cutover. New fields/selectors are additive. Old valid links remain resolvable.
7. All updates are idempotent or explicitly compare-and-swap guarded in D1; external queue/R2/KV operations occur outside SQL transactions and have recoverable intermediate states.
8. Historical corruption is not repaired by deleting everything or treating all shared anchors as equivalent. Keep original evidence and a mapping for every accepted supersession.

## Recommended implementation sequence

### 3a. Stop new data loss with small code changes and regression tests

Land this bounded change before the larger migration work. It owns the DB-02 fix unless the release-2 ledger explicitly moved the minimum guard forward to unblock its extraction.

- In the trusted ingestion service supplied by release 2, return explicit `persistedIds`, `unchangedIds`, `failedIds` and `rejectedIds` (or equivalent typed categories); stop treating attempted operations as all-success evidence. Preserve the current `newOrUpdatedFeatures` / `fullGeoJson` boundary while its callers are migrated.
- As the immediate guard, advance the existing full-feed KV checkpoint **only when every required batch succeeds**. On any transient failure, return a structured incomplete outcome, keep the prior checkpoint, and retain failure details. This guards loss but is not the final durable retry/concurrency design in 3c.
- Fix the event upsert predicate to consider longitude, latitude, depth and trusted detail URL as well as time, magnitude and place. Use NULL-safe comparison, validate finite coordinates/depth/magnitude under release-2 input rules, and make zero/null semantics explicit. Do not silently reject a valid zero magnitude or zero coordinate.
- Extract product-flag calculation and metadata persistence into one internal routine used by both detail fallback and backfill. Do not set the old `detail_fetched` flag while its required metadata is absent. Until 3d supplies durable archive state, preserve retry eligibility when queue submission fails; document this interim state as at-least-once work, not exactly-once completion.
- Fix backfill pagination with the next-pending strategy below. Keep release-2 admin authorization and parameter validation intact.
- Make list bootstrap failures propagate and prevent replacement writes. A genuine missing R2 object (`null`) can bootstrap from a **successful** D1 read; an exception cannot be interpreted as a missing/empty object.
- Add actual-handler regression tests first and run the focused suite. Do not defer these guardrails until historical cleanup is ready.

### 3b. Capture the live schema and introduce a safe compatibility bridge

**Inventory, recovery validation and migration planning**

1. Resolve explicit production/preview D1 bindings from the current environment configuration; assert they differ. Resolve database names/IDs at runtime rather than embedding production identifiers or credentials in this document or repair scripts.
2. Save current `sqlite_master` table/index/trigger SQL, `PRAGMA table_info`, `index_list`/`index_info`, relevant foreign keys, and `d1_migrations` to an ignored dated evidence directory. Record Worker version, Git SHA, resource mapping and UTC timestamp separately.
3. Capture a current D1 Time Travel bookmark where supported, verify its retention window, and make an export sufficient to restore the tables this release can change. Rehearse importing/restoring the export into a **separate isolated database**; verify row counts, schema, selected checksums and foreign keys. A printed bookmark or an untested dump file is not a restore rehearsal. Never test an in-place Time Travel restore on production.
4. Snapshot KV checkpoint/stat/cluster keys and R2 list objects that may be replaced, recording key, ETag, size, timestamp and content hash. D1 Time Travel does not restore KV, R2 or queue state. Preserve a manifest linking these independent snapshots rather than claiming they were one atomic cross-service backup.
5. Create two sanitized schema fixtures: a clean install using repository migrations and a production-equivalent fixture with the missing indexes, both historical cluster triggers and representative mixed types. Include additional live tables/triggers in the schema manifest; do not drop unrelated ActiveFaults/fault-association objects just because current source does not query them.
6. Create **new forward migration files** using unused numbers discovered from both repository and production histories. Do not renumber/rewrite applied migrations, replay migration 0004, or modify `d1_migrations` to conceal drift. If production history and a clean install require different preconditions, implement a validated reconciliation runner/manifest and converge both paths to the same intended schema.

**Chosen schema direction**

Use additive columns/tables first. Exact names can follow repository conventions; keep the following semantics and publish the final schema contract in the PR:

| Entity | Required new state |
|---|---|
| EarthquakeEvents | Authoritative upstream summary revision timestamp; detail revision/metadata completion time; current archive key/revision/hash; explicit retryable metadata state where needed |
| IngestionRuns and IngestionState | Per-feed immutable snapshot reference/hash, cursor, accepted/rejected/failed totals, state; serialized ownership lease with monotonically increasing fence; last completed snapshot identity |
| DetailJobs | Unique event/revision job key, target revision, state, attempts, next attempt, lease/fence, last error category, enqueue bookkeeping; keep large GeoJSON out of D1 rows |
| ClusterDefinitions | Immutable canonical ID, integer `revision`, normalized `updated_at_ms`, nullable `created_at_ms`, lifecycle/current-generation metadata; keep old fields during compatibility |
| ClusterAliases | Unique typed alias → canonical ID with provenance and supersession reason; no chains/cycles |
| Cluster generations/snapshots | A complete generation marker plus immutable `(cluster_id, revision)` snapshots or an equivalent design that cannot publish a partly updated set |
| DataStats | Atomic authoritative counts and a monotonic stats revision; KV is a timestamped derived snapshot |

Prefer new normalized timestamp/revision columns over rebuilding the large live table immediately. Backfill them in bounded batches, keep legacy fields available, and move canonical readers to the new indexed columns only after coverage is verified. API serializers can emit normalized `updatedAt`/`createdAt` aliases without forcing clients to understand old storage types.

- Add the missing lookup indexes first as an independently validated change. The final detail query should use an index beginning with `(strongestQuakeId, updated_at_ms DESC)`; current/sitemap queries need an index that matches their actual lifecycle/generation predicate and order. A temporary legacy `(strongestQuakeId, updatedAt DESC)` index is acceptable for the bridge; retire redundancy only after query-plan evidence.
- Deploy a bridge in which **all active cluster writers explicitly write normalized timestamps**. Inventory registration, cron, utility and any protected maintenance writes; do not assume one writer.
- In a controlled writer-quiescence window, remove the two known timestamp triggers only after checking their exact current definitions and recording before-images. Application SQL should own the timestamp in the same mutation. Unknown additional triggers cause the reconciliation script to stop for inspection, not indiscriminately drop them.
- Fill normalized timestamps using a deterministic converter: finite epoch milliseconds; validated epoch seconds; or strict UTC parsing of the known SQLite/ISO formats. Preserve subsecond precision where present. Invalid/ambiguous values go to an exception manifest; do not substitute the migration time. Unknown historical creation time stays null. New rows must get a real creation time.
- Do not infer the historical revision count from strings such as `1.01111`. Initialize a documented **new revision epoch** at integer 1 for migrated snapshots; retain the original legacy value in the validated repair export. For changed rows increment `revision = revision + 1` atomically in SQL, or use an expected-revision compare-and-swap. Emit a compact legacy version string for compatibility; do not continue concatenating it.
- Perform explicit legacy version compaction only as a separate backed-up, dry-run repair phase. The schema expansion itself should not irreversibly erase diagnostic values.

A code-only rollback must remain possible while additive fields/tables coexist with old fields. Once triggers or writer semantics change, the old audit-era binary may reintroduce corruption; prepare a compatible bridge release as the rollback target, not an arbitrary old commit.

### 3c. Make ingestion progress durable and safe under overlap

Choose **D1 as the progress authority** and immutable R2 source snapshots as replay inputs. Avoid introducing Durable Objects solely to fix the existing KV checkpoint. Revalidate supported D1 batch/conditional statement behavior in the actual Worker runtime.

1. A trusted scheduler/import creates a run for a named feed. Fetch using the release-2 trusted USGS helper, validate the envelope and feature fields, and stage the source response at an immutable R2 key with hash/size/source-generated timestamp. A staging write without a committed run may leave an orphan; it must not advance a checkpoint or be published. Keep the maximum payload and orphan-retention policy explicit.
2. Persist the run's snapshot reference and deterministic feature ordering in D1. A retry reads the same immutable bytes, not a possibly changed upstream hour feed. This prevents failed records from ageing out of the available retry input.
3. Acquire per-feed ownership through a conditional D1 mutation with a new fence token and bounded expiry. Before each commit, verify the current fence. A resumed worker with an expired fence must be unable to advance a cursor or checkpoint after a newer owner completes. Holding a lease only in memory or KV is insufficient.
4. Persist a bounded batch of validated event revisions, create/update due detail jobs for qualifying newer revisions, and advance its run cursor in **one D1 transaction/batch**. Use guarded SQL or an equivalent implementation tested against overlapping invocations; do not hold a transaction open around network calls. Every event update must also compare its upstream revision, because different feed keys can contain the same event.
5. Equal upstream revisions with identical persisted fields are no-ops. An older revision cannot overwrite newer data. Equal timestamps with differing payloads are quarantined/logged for a deterministic policy rather than resolved by last-arrival order. The recommended default is to retain the current authoritative value and enqueue a trusted detail reconciliation. Missing upstream revision is a validation exception for new trusted feed data; migration of existing rows does not fabricate a revision.
6. A transient batch failure leaves the cursor before that batch and records retryable state. Retry with bounded exponential backoff and jitter; the next invocation resumes it. Exhausting a short queue/worker retry budget parks the durable run for operator attention rather than marking it complete. Invalid records may be quarantined with reason/hash and counted separately; the run must expose `completed_with_rejections`, never silently label it a clean success.
7. Only after the run is fully accounted for may D1 mark it complete and advance that feed's authoritative checkpoint. An older run cannot roll back a newer feed-generated watermark. Publish the corresponding KV cache only after D1 commits; KV failure is a cache failure, not loss of progress.
8. Add recovery scheduling for pending runs. Keep catch-up bounds, maximum concurrent runs and per-invocation work budgets explicit. Current platform parameter/query/time limits must be verified; chunking statements does not by itself prove the whole invocation fits its budget.

**Required release-2 handshake:** public proxy traffic has no write authority and cannot set feed keys, checkpoint IDs, snapshots or job state. Cron calls the trusted service directly. If release 2's extracted interface moved, adapt its callers and characterization tests in the same commit; do not restore a caller-controlled `isCron` shortcut.

### 3d. Unify detail metadata, archive jobs and retries

Use a D1 job/outbox record with a unique `(event_id, target_detail_revision)` identity. Queue messages carry a small job identity/version; a sent message is a notification to process durable work, not the sole copy of the work. Keep delivery idempotent because queue messages may be duplicated or reordered.

Recommended state flow:

`pending → leased → fetched/validated → archived → completed`, with retryable failure returning to a scheduled pending state and exhausted/nonretryable work parked with a reason.

- A shared detail service is used by public cache-miss fallback, scheduled backfill and the queue consumer. Public handlers retain release-2 validation/auth boundaries; maintenance code calls the internal service rather than invoking its own protected HTTP route.
- Persist the job before relying on queue delivery. A dispatcher reads due jobs, sends notifications, and records send attempts/next-send time. If send fails, the job remains due. If send succeeds but bookkeeping fails, a duplicate notification is harmless. Do not mark `completed` on send.
- Claim the job with a conditional D1 lease. Retrieve and validate the upstream detail, calculate product flags once, and write its full bytes to an immutable revision/hash R2 key. Do **not** put unbounded USGS product JSON into a D1 outbox row or a queue message.
- After the immutable R2 write succeeds, use one D1 transaction to apply metadata/flags/detail time and current archive pointer **only if the revision is still current**, and complete the claimed job. If D1 fails after R2, the object is harmless reusable staged data and the durable job retries. If R2 fails, the job cannot become complete. Old/out-of-order jobs may finish their immutable object but cannot replace the authoritative newer pointer or metadata.
- Adapt detail reads to resolve the committed pointer. During migration, fall back to legacy `<event-id>.json` objects where no pointer exists, retaining existing API behavior. Avoid a read-then-unconditional-write of a mutable latest-object alias: two consumers can reorder it. If an alias must be maintained, require a verified conditional/fencing design and keep the D1 pointer authoritative.
- Accept already-enqueued legacy `{id, geojson}` messages through a bounded compatibility adapter, applying the same validation/revision checks and persistence service. Keep that adapter until the old queue backlog is demonstrably drained. Do not reintroduce arbitrary detail URLs through legacy jobs.
- Keep `detail_fetched` as a compatibility field with documented meaning, preferably complete validated metadata with a committed archive pointer for newly processed rows. Add distinct state for legacy rows requiring metadata/archive reconciliation; `detail_fetched=true` alone must no longer exclude incomplete records.
- Distinguish upstream 409/not-ready, rate limits, transient transport/server failures, invalid payload, and permanent not-found. Respect `Retry-After` when available; use bounded backoff and a maximum age/attempt policy with visible parked jobs. Preserve the existing 45-minute delay only where justified for first detail availability; do not blindly retry a completed revision forever.
- A consumer must acknowledge only after durable completion or durable recording of the retry/parked outcome. If that recording fails, retry the message. Test compatibility with the configured queue retry budget and add a dead-letter/operator recovery path as needed; queue exhaustion must not erase D1 work.

Repair the recorded incomplete-row shape through this service after code is safe. Inspect existing archived detail first where available; do not assume every one of the historical 898 records has the same cause or refetch everything unnecessarily.

### 3e. Correct backfill progression and list replacement

**DB-10: use next-pending selection.** Because successful records leave the pending set, each subsequent authorized backfill call can select the next eligible batch ordered by `(magnitude DESC, event_time DESC, id ASC)` without `id > lastProcessedId`. Use the durable job state/lease to prevent overlapping callers processing the same claim. Keep batch size finite and within release-2 limits.

- Return explicit processed/retryable/parked counts and a continuation token/URL that retains selection options but does not exclude lexically smaller IDs. Accept the old `continue_from` parameter during a deprecation window without applying its incorrect filter; mark it deprecated in the response or docs. `last_processed_id` is diagnostic, not a sorting cursor.
- If a separate read-only listing needs stable pagination, use an opaque validated composite cursor matching the full sort order and a fixed snapshot/watermark. Do not reuse that cursor as job-completion state.

**DB-11: build from confirmed reads and publish conditionally.** Distinguish R2 missing, R2 exception, invalid JSON, successful empty D1 result and D1 failure. Prepare replacements only after all required inputs validate. On any dependency failure preserve the current object and report a failed run; do not replace a month with an hourly delta.

- Merge by ID with revision checks; retain valid zero fields, reject malformed rows, and apply time-window trimming against one captured run timestamp.
- Prevent concurrent writers losing each other's additions: use the object ETag in a supported R2 conditional write, reread/remerge after a conflict, and bound retries. Treat missing-object creation separately from update. An expired D1 lease without object fencing is not enough if a delayed write can still complete.
- Save versioned/staged list output and a before-image manifest for repair/recovery. Per-period conditional replacement is the minimum guarantee in this release; do not claim day/week/month are atomically published together. Release 5 may adopt one versioned generation manifest for all periods.
- Preserve the old public array response and existing summary freshness guard. Completing rich day/week/month snapshots and feed-level freshness belongs to release 5. This release must not remove the guard to hide stale/partial producer data.

### 3f. Establish durable cluster identity, numeric revisions and exact selectors

This is the foundation for release 5's payload reduction and release 4's URL fixes. Do not rewrite the scientific clustering algorithm here beyond fixes already owned by release 2. Version the algorithm and its time-window policy so identity comparisons do not accidentally bridge incompatible calculations.

**Canonical model**

- Retain existing canonical primary IDs (including valid legacy IDs) when a cluster can be unambiguously continued; use UUIDs for genuinely new canonical identities. Strongest quake, place, coordinates, membership count and slug text can change without creating a new identity.
- Store a normalized sorted unique membership fingerprint and the algorithm/window identity. Identical membership under the same algorithm/window reuses one identity even if place/depth/strongest metadata changes.
- For evolving membership, the recommended starting matcher is deterministic, mutual-best membership overlap between prior-current and new clusters, with a high overlap threshold (initially Jaccard >= 0.8), consistent spatial/time extent, and an explicit tie/ambiguity rejection. This threshold is a **design default to validate on fixtures and a sanitized shadow run**, not a proven domain constant. Record the chosen policy/version and counters for unmatched/ambiguous cases.
- For split/merge or low-confidence transitions, create new canonical identities and record lineage without silently declaring them equivalent. Preserve old IDs/URLs as historical snapshots. Do not alias a true split's old ID to an arbitrary child.
- Use a complete-generation model: stage computed immutable `(cluster_id, revision)` snapshots and a generation-membership set, then publish a committed generation pointer only after every required write succeeds. Current summaries read only that committed generation. A failed run must not remove clusters or expose half the new set. Keep archived definitions available for historical detail.
- Skip snapshot/definition updates when the persisted scientific membership/metadata fingerprint is unchanged. Last-observed/computation time belongs to generation metadata and should not force a scientific revision or update every cluster every ten minutes.
- Preserve an existing valid canonical slug on updates. Add aliases only when equivalence/supersession is established by the chosen lineage policy or a reviewed exact-membership repair. Alias uniqueness, cycle prevention, canonical target existence and provenance are required constraints.

**Historical supersession gate**

Generate a read-only proposal manifest containing old IDs, proposed canonical IDs, algorithm/window, member-set hashes, overlap scores, time/spatial extents and reasons. Separate exact duplicates from evolving snapshots and ambiguous cases. The audit's 3,486/492 counts do not authorize merging those rows. Rehearse the proposal in the isolated clone. Apply only deterministic, validated subsets with before-images; park ambiguity. Prefer marking superseded/current status and adding aliases over deletion. No physical historical-row deletion is required to complete this release.

**Exact read selectors, coordinated with release 4**

- Add `?clusterId=<exact canonical ID>` and `?slug=<exact stored slug or validated alias>` to the detail resolver. Return a deterministic 400 if mutually exclusive selectors are combined.
- Retain `?id=` as the existing compatibility selector: strongest-event lookup first, canonical-ID fallback second. Do not silently reverse its meaning. Among multiple current matches use an explicitly documented deterministic order based on normalized time/revision plus canonical ID; return canonical metadata so new clients can stop relying on the ambiguous selector.
- Browser, crawler and sitemap code should share the same exact-slug/alias resolver. Canonical ID lookup must not manufacture an overview ID or parse a UUID as a strongest-event ID. Historical superseded aliases resolve through the retained mapping; genuine historical distinct clusters stay distinct.
- The resolver should return the same missing/error status semantics across wrappers and preserve the revised 100-ID membership-query chunking. Use a consistent read of the committed generation/snapshot when multiple queries compose a detail response.

### 3g. Publish the canonical summary schema for release 5 without breaking current consumers

Define and fixture-test a versioned contract now; release 5 owns switching the production delivery path and frontend consumption. Use a distinct versioned route/cache key or explicit negotiated schema. The existing `/api/get-clusters` array remains available during overlap.

Recommended response envelope and fields (names may be adjusted only with an updated cross-release contract):

```json
{
  "schemaVersion": 2,
  "generationId": "opaque-generation-id",
  "generatedAtMs": 0,
  "sourceWatermarkMs": 0,
  "view": "overview",
  "totalCount": 1,
  "items": [
    {
      "id": "canonical-cluster-id",
      "clusterId": "canonical-cluster-id",
      "slug": "preserved-canonical-slug",
      "title": "Cluster near Example location",
      "canonicalPath": "/cluster/preserved-canonical-slug",
      "revision": 1,
      "status": "current",
      "algorithmVersion": "documented-algorithm-version",
      "windowDays": 30,
      "quakeCount": 3,
      "strongestQuakeId": "canonical-upstream-event-id",
      "strongestEvent": {
        "id": "canonical-upstream-event-id",
        "magnitude": 5.1,
        "place": "Example location",
        "eventTimeMs": 0,
        "latitude": 34,
        "longitude": -118,
        "depthKm": 10
      },
      "maxMagnitude": 5.1,
      "locationName": "Example location",
      "centroidLat": 34,
      "centroidLon": -118,
      "startTime": 0,
      "endTime": 0,
      "updatedAtMs": 0
    }
  ],
  "nextCursor": null
}
```

This is a schema illustration; zero times and example coordinates are not production values. `id` and `clusterId` must be equal canonical IDs. Envelope timestamps explicitly use milliseconds; legacy `startTime`/`endTime` remain epoch milliseconds for compatibility. The scalar `title` is authoritative. `strongestEvent` is an optional projection-defined compact summary included only where the current cards/globe require those fields; freeze its field names/units with the consumers and never include full detail/products. Count/strongest/ranges are authoritative for the declared window, independent of the client's loaded week/month features. Confirm which display fields release 4/5 still needs (for example meanMagnitude, depth range, significance score) before freezing the projection; add those scalar fields explicitly rather than leaking the full row. Do not include complete earthquakeIds, quakes, product payloads or legacy growing version strings in a summary.

Apply each validated server-side view/filter **before pagination**, including the existing overview M4.5 policy; `totalCount` is the filtered count and cursors bind to generation, view/filter identity and deterministic sort order. Test a lower-magnitude row ahead of qualifying rows at a page boundary so client filtering cannot produce an empty or misleading page. Do not page across mutable generations. Detail responses can include membership/page cursors separately. Cache keys incorporate schema and generation. Decide retention of recent generations from observed client/session duration and storage budget; do not delete old generations until that policy and rollback needs are validated.

### 3h. Align sitemap predicates and use SQL counting

Choose the existing documented significance rule as the recommended policy: retain the current base constraints (valid ID/place and magnitude >= 2.5), then include magnitude >= 4.5 **or** moment-tensor **or** focal-mechanism. Remove the page-only three-product requirement unless the product owner has already specified a different rule. The rule choice is an explicit design default to validate; the invariant is that count and pages share it.

- Centralize one SQL predicate/bind set used by `COUNT(*)` and page selection. Keep a corresponding sitemap-specific pure predicate for tests and verify parity with numeric/boolean/null flags; do not silently change unrelated frontend significance policy.
- Use a deterministic page order `(event_time DESC, id)`; validate page numbers and do not interpolate them into SQL. Preserve old sitemap URLs and page size initially.
- Count in SQL instead of returning all candidates to the Worker. Assert count-to-pages consistency and coverage at 0, 1, exactly one page, and one page plus one rows.
- Queries should use appropriate indexes based on measured plans; do not add every conceivable index. Snapshot/artifact sitemap caching belongs to release 5 if needed. Database failures must produce an observable failure and retain any prior good published artifact; a silent successful empty sitemap is not an acceptable recovery policy.

### 3i. Replace unsupported KV CAS with authoritative D1 statistics (B8)

KV `getWithMetadata` does not supply the `cas` field expected by the old helper and KV put does not implement that compare-and-swap option. Remove the fiction of retrying CAS conflicts.

Recommended design: a small D1 stats table updated atomically with the authoritative event mutation, with KV used only for a derived snapshot. To avoid an application pre-read/update race, use narrowly scoped, tested SQL insert/update/delete delta triggers for counters, or an equivalent conditional transaction with the same proof. Counter triggers affect **only DataStats**, must not recurse into EarthquakeEvents, and must apply old→new boolean deltas rather than add one on every fetch. This is distinct from the obsolete self-updating cluster timestamp triggers removed above.

- Initialize counts from one successful authoritative SQL aggregate while installing the counter maintenance logic under a tested transaction or controlled writer gate. Do not expose a gap where writes occur after the seed count but before maintenance becomes active.
- Define `fetched` against complete validated metadata, not the legacy boolean alone; define every product count against its actual stored flag. Unique insert increments total once; idempotent retry does not increment; true→false scientific flag revision decrements correctly; failed/rolled-back mutations do not alter counts.
- Publish KV snapshots with `statsRevision`, `generatedAtMs` and a bounded freshness lifetime. No read-modify-write increments remain in KV. Multiple publishers may leave a temporarily older cache snapshot, but D1 counts stay correct; readers reject over-age snapshots or expose their as-of time and read D1 when current counts are required.
- Preserve existing monitoring response field names through an adapter. No scheduling/ingestion decisions may rely on cached counts being transactionally current.
- Keep a periodic full SQL reconciliation as an invariant check. If it detects a mismatch, log the exact discrepancy and repair via a guarded snapshot/transaction; do not blindly clobber concurrent newer counters from a stale precomputed result.
- Measure added row writes before rollout. If counter-maintenance overhead is unacceptable, the fallback is an explicitly periodic SQL aggregate snapshot with documented staleness, not a return to non-atomic KV increments. Record that design change and its acceptance criteria.

## Regression fixtures and required evidence

Promote these into durable tests in the repository. Use migrated SQLite for SQL semantics **and** the actual Workers runtime for binding/transaction/queue/R2 behavior; mocks alone cannot establish platform semantics. Network calls use synthetic fixtures, never live upstream mutation endpoints.

| Finding | Minimal reproducible fixture | Required repaired outcome |
|---|---|---|
| DB-01 | Production-equivalent schema missing both indexes with both timestamp triggers; one update; missing strongest ID query | New migrations converge clean/live-like schemas; no duplicate self-update trigger; expected indexed plans; one scientific update does not cause five table-row updates |
| DB-02 | 91 valid features; batch 1 of 90 fails once, final one succeeds; then retry identical source | Failure checkpoint does not advance; retry persists all 91 exactly once; cursor/runs account for every row |
| DB-02 overlap | Two same-feed runs and two different-feed runs share an event; older owner completes late | Expired fence cannot commit progress; older event revision never overwrites newer; old snapshot cannot reset current watermark |
| DB-04 | Same ID/time/mag/place, coordinates `[-118,34,10]` → `[-117.8,34.2,22]` with newer upstream revision | Stored location/depth update; exact duplicate retry is a no-op; stale revision is rejected/no-op |
| DB-05 | R2 miss, trusted detail with moment-tensor/focal-mechanism/shakemap | Shared persistence stores flags/time/revision and archive state; incomplete stage remains repairable |
| DB-09 | Fail queue send; fail R2 write; fail D1 after R2; duplicate and reverse-order messages | Durable job survives each interruption, retries idempotently, and newer archive pointer/flags win |
| DB-10 | Eligible `z-high` M6 and `a-lower` M5, batch size 1 | Following advertised continuation processes both; empty result means no currently eligible work, not a bad ID cursor |
| DB-11 | R2 read throws and D1 bootstrap throws; one new hourly event | Zero replacement writes, previous day/week/month hashes unchanged; a genuine successful empty dataset is handled separately |
| DB-11 overlap | Two generators read the same ETag and add distinct events | One conditional write conflicts and remerges; final snapshot contains both, with newest revisions |
| DB-03 | One cluster processed three times unchanged; then one real change | No string concatenation; unchanged runs retain revision/snapshot; real change increments integer once |
| DB-06 | Three nearby events; change strongest position by 0.2 degrees but retain membership; also add split/merge/tie cases | Same-membership revision retains ID; ambiguity does not auto-merge; complete generation switches only after success |
| DB-07 | Older text timestamp in 2025 and a new epoch-ms row share strongest ID; include seconds/null/invalid formats | Normalized ordering returns new row; invalid timestamps enter exception manifest; unknown creation time stays unknown |
| DB-08 | M5.1 with no products; lower-mag tensor case; non-significant case; pagination boundaries | COUNT and selected pages use exactly the same predicate, with no eligible omissions/duplicate IDs |
| B8 | Two concurrent inserts/metadata completions; replay both; flag reversal; rolled-back batch | Authoritative counts equal SQL aggregate, increments are not lost or doubled; KV lag is labeled/bounded |
| Compatibility | Old?id, exact?clusterId, exact?slug, aliases, unknown IDs, already-enqueued legacy queue message | Old selector meaning retained, canonical metadata consistent, legacy jobs safely consumed, correct 400/404 |

Also test death/restart between every external side effect and its D1 bookkeeping; a retry that succeeds after a lost acknowledgement; invalid per-event data inside a batch; expired job lease; orphan staged R2 object; no-current-cluster generation; and a caller observing the prior generation while the replacement fails. Include synthetic large clusters exceeding 100 member IDs and enough rows to make query-plan regressions visible.

Keep a machine-readable verification manifest with commit/schema version, fixture name, old/new outcome, rows read/written, retries, count/hash assertions and timestamps. Do not assert every improvement from a wall-clock timing threshold on a shared network.

## Safe historical repair procedure

Create a dedicated repair tool with a default **read-only dry-run**. Required inputs are an explicit environment/database identity, repair kind, bounded limit, resumable cursor and expected schema version. Writing requires an explicit apply mode and a previously reviewed manifest/backup identifier. Reject unknown targets and preview/production binding collisions. Do not embed secrets or full production datasets in Git, CI logs, prompts or the resulting documentation.

1. Capture a fresh backup/bookmark and validate the isolated restore rehearsal described above. Record the maximum tolerated data gap and who can authorize an in-place restore under the task's actual authorization.
2. Dry-run timestamp/revision normalization first; report valid/invalid/type counts, projected before/after hashes, counter impact and rows requiring manual policy. Do not fabricate unknown createdAt or recover historical revision counts by string length.
3. Execute small deterministic ID-keyset batches with an expected-old-value/hash or source revision predicate. Check affected-row counts; concurrent changes cause skip/re-evaluation rather than overwriting newer data. Commit each batch's progress and before-image reference atomically with its changes where practical.
4. Reconcile incomplete detail/archive jobs using the shared service. Apply a rate budget and resumable queue, inspect already-archived data before refetching, and stop on unexpected error/counter patterns. Do not bulk reset every fetched flag.
5. Recompute cluster generations in shadow mode. Review identity/supersession proposals against membership and lineage; apply only the deterministic approved policy subset. Retain historical rows, old paths, alias provenance and prior committed generation. Do not physically delete duplicate candidates in this release.
6. Rebuild damaged lists from a confirmed complete authoritative source. D1 currently stores sparse summaries, so a successful D1 bootstrap alone does not prove that a rich feed meets release 5's contract. Preserve the fallback guard and record coverage.
7. Verify counts, normalized-field coverage, flags/archive-pointer invariants, alias targets, generation consistency and exact repaired examples. Persist a redacted completion manifest with unresolved exceptions rather than claiming everything was repaired.

Pause the repair on unexplained row-count changes, missing foreign-key targets, unexpected schema, growing exception rate or a recovery-path failure. Continue unaffected tests/documentation while resolving the specific blocker. Do not escalate a paused repair into a whole-database restore automatically.

## Acceptance checks and release gates

| Gate | Evidence required before advancing |
|---|---|
| Baseline | Current SHA/Worker/bindings captured; releases 1/2 boundaries verified; fresh schema/history comparison; no unexplained production target selection |
| Correctness | Every regression above passes; 91/91 ingestion recovery; zero invalid progress commits under overlap; archive retry durable at every boundary; stats match aggregate |
| Schema | Both clean and production-like fixtures converge; normalized canonical fields covered or explicitly quarantined; intended index/trigger definitions verified from deployed metadata |
| Query efficiency | Missing-ID/exact-ID/current-cluster reads use the intended indexes; EXPLAIN no longer shows the old full-table scan+sort for strongest lookup; measured rows_read for a miss is independent of total cluster-row count, not the old ~45k |
| Revision/identity | Repeated unchanged generations make no scientific row rewrites or revision growth; changed snapshot increments numerically; ambiguous anchors not merged; old valid URLs resolve |
| Payload foundation | Versioned summary fixtures contain canonical ID/slug/count/strongest/ranges and no full member arrays/growing versions; current frontend remains on a compatible contract |
| Failure safety | Dependency read failures preserve object hashes; concurrent R2 writes retain both updates; incomplete generation never becomes current; queue exhaustion leaves visible durable work |
| Data repair | Validated backup/restore rehearsal; reviewed dry-run counts; small canary repair exact-match verification; resumable before-image manifest; unresolved exceptions listed |
| Operational | Preview checks pass with isolated resources; production canary checks pass; at least two relevant scheduler cycles and job retry windows observed without unaccounted failures |

Use audit numbers as comparison points, not hardcoded row-count expectations. Target at least a tenfold reduction from the observed missing-ID rows_read at similar scale, with query-plan correctness as the primary gate; no promise of a particular network latency or monthly cost is made. Query/index creation and historical repair have costs too—measure and record them.

## Preview rollout, production rollout and recovery

**Preview sequence**

1. Establish an isolated preview database/bucket/KV/queue using the existing deployment runbook; avoid production-resource bindings. First run all failure fixtures against local runtime, then a small bounded preview integration set.
2. Seed a sanitized production-like schema/data fixture, including both old triggers/mixed timestamps/missing indexes and representative large memberships. Rehearse the exact migration order, bridge deploy, trigger removal, normalized-field backfill, reader cutover and old/new queue interoperability.
3. Inject failures/overlap, then rerun to demonstrate idempotency. Restore the preview from the validated export and repeat the repair tool's resume path. Preview has no automatic crons in the audited configuration; invoke internal jobs through the controlled test mechanism rather than creating unprotected admin routes.
4. Run appropriate repository tests, the actual Worker runtime suite, build/deploy dry-run and smoke checks. Verify preview source/index/trigger metadata and sample query plans, not just HTTP200.

**Production sequence**

1. Verify release-1 deploy command/environment and release-2 write controls again. Select the current known-good compatible rollback release and record its schema/message requirements.
2. Deploy 3a guardrails independently if not already shipped. Capture recovery artifacts before schema work. Apply additive expansion, then the compatibility bridge. Do not enable readers that require new columns before the expansion is confirmed.
3. Quiesce trusted writers through an explicit, tested maintenance gate while dropping obsolete triggers/initializing counters and performing any operation that cannot safely coexist with old writers. Public reads should remain available. Account for in-flight requests and old queue messages; merely disabling cron schedules does not stop them.
4. Resume writers with new semantics, canary new durable ingestion/detail processing, then execute bounded backfills/repairs. Keep canonical readers behind a rollout gate until coverage and exact sample comparisons pass.
5. Switch exact readers and current-generation publication after validation. Retain old API shapes, legacy queue adapter, previous generation and archived before-images throughout the observation/rollback window.
6. Verify resource bindings/crons/queue after every deploy. Observe at least two feed-ingestion/cluster/backfill cycles relevant to the change, retry cases, rows read/written, pending-job age, checkpoints, alias misses and data freshness. Record remaining deferred repairs before declaring release 3 complete.

**Code rollback is not data restore**

- A code rollback changes the Worker/route behavior. It does not undo a migration, repair update, queue send, R2 overwrite, alias change or KV snapshot. Roll back to the prepared compatible bridge with additive schema still present; disable new job dispatch/read cutover as required. Do not roll back to code that interprets the new state incorrectly or repeats version concatenation.
- Prefer stopping the new writer/repair, restoring the last committed generation/list pointer, and applying a forward fix over undoing all database history. Per-row repairs may be reversed only from before-images with a guard proving no newer legitimate change would be overwritten.
- A D1 Time Travel restore is a destructive **whole-database** operation and loses writes after its selected point. It does not rewind R2/KV/Queues. It requires specific authorization, a declared recovery point/data-loss window, paused/gated writers, captured current state and a cross-service reconciliation/replay plan. Do not include an unguarded production restore command in an automated rollback script.
- After any data restoration, reconcile durable job/run revisions with retained immutable snapshots/objects, prevent old queue messages from overwriting newer data, republish derived caches and verify end-to-end examples before resuming writes. A successful restore command alone is not recovery completion.

## Design decisions to record, not leave implicit

The recommended defaults above allow implementation to proceed. Record measured reasons if changing them:

- D1 fenced progress plus immutable R2 run inputs, rather than KV authority or a new Durable Object.
- Immutable revision archive objects plus D1 current pointer, rather than racing overwrites of `<id>.json`.
- Next-pending backfill execution, rather than the current mismatched ID cursor.
- New normalized timestamp/revision columns and compatible serializers, rather than immediate table rebuild.
- Exact-membership identity reuse, conservative deterministic overlap matching, explicit ambiguous lineage, and no physical historical deletion.
- Significance = current magnitude/tensor/focal-mechanism policy with one shared base/predicate for both sitemap queries.
- D1-atomic stats and bounded derived KV snapshots; exact freshness SLA and write budget established from preview measurements.
- Release 5 owns feed-level freshness publication and summary adoption; release 3 owns failure-safe replacement and contract fixtures.

Before finalizing the schema, have the release-4/5 implementers confirm summary display fields, canonical selector naming and generation/cursor semantics. Resolve those coordination choices in the shared plan/PR, not by independently changing client meanings. Split genuinely risky subchanges into additional PRs within this package rather than expanding a single migration without observation.

## Deliverables and copyable model handoff

Deliver: code and regression tests; forward migrations and schema assertions; sanitized clean/live-like fixtures; default-dry-run repair tooling; summary/detail/job contract fixtures; rollout/rollback manifest; preview evidence; production evidence only if authorized and actually executed; and a findings ledger marking DB-01..DB-11/B8 fixed, partially repaired, deferred or blocked with exact reasons. Report restored/retained rows and unresolved ambiguity separately from prevention fixes.

> Work on release 3 using `docs/remediation/03-data-integrity-and-database.md` as the standalone execution package. Start by reading repository instructions, current Git state, the deployed Worker import graph, release-1 deployment guard and release-2 trusted ingestion interface. The audit baseline was aca32df, but do not overwrite newer work. Reproduce DB-01..DB-11 and B8 with the synthetic fixtures in this document; ignored local audit artifacts may be absent.
>
> Implement small reviewed stages: immediate checkpoint/upsert/retry/list guards; production-equivalent schema capture and additive bridge; D1-fenced durable ingestion; shared detail/archive jobs with idempotent queue handling; normalized cluster timestamps/revisions, canonical identities/aliases and atomic generation publication; matching sitemap predicates and SQL COUNT; authoritative atomic D1 stats. Preserve legacy API/queue compatibility and coordinate the exact `?clusterId`, `?slug`, legacy `?id` and versioned summary contract with releases 4 and 5.
>
> Do not treat KV as a lock/CAS, queue send as archive completion, read failure as empty data, or duplicate strongest-event IDs as proof of duplicate clusters. Use only explicit isolated preview resources for mutation tests. Do not rerun old destructive migrations, fabricate historical revision/creation data, or delete ambiguous cluster history. Default historical repair tooling to dry-run; validate backup/import recovery and before-image manifests before applying any destructive repair. Code rollback is separate from D1/R2/KV/queue recovery.
>
> Complete code, migrations, tests, preview rehearsal and a concrete rollout/recovery manifest under the current task's authorization. Verify the installed Cloudflare APIs/limits before issuing commands. If production mutation is not authorized or a specific backup/schema prerequisite fails, finish unaffected work and report exactly what remains. Do not claim a deployment or data repair happened without tool evidence. End with tested outcomes, files/commits, measured acceptance results and a precise handoff ledger for releases 4 and 5.

## Primary platform references

Use the current official documentation when executing; these links support the planned primitives, not a claim that their exact behavior has been integration-tested in this future implementation.

- [D1 Database and transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 limits and query performance](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Time Travel and in-place restore behavior](https://developers.cloudflare.com/d1/reference/time-travel/)
- [R2 Workers API, including conditional operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- [KV read API](https://developers.cloudflare.com/kv/api/read-key-value-pairs/) and [write/concurrency behavior](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)
