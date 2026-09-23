# Detail archive release 0021

## Contract

- Migration `0021_revisioned_detail_archive.sql` adds nullable pointer/provenance columns to `EarthquakeEvents` and a durable `EarthquakeDetailJobs` table. Existing rows and old Worker SQL remain valid. A preexisting `detail_fetched=1` row with no pointer is still a legacy row, not proof of a committed revisioned archive.
- A validated detail with a safe integer `properties.updated` may establish a first source revision for a legacy row. Missing or malformed revisions are rejected; no revision is inferred from the event time or the Queue receipt.
- New public-miss and backfill operations record a job before storing the detail under `details/v1/<event-id>/<source-revision>/<sha256>.json`. The content-addressed put uses R2 `onlyIf`; if an object exists, its bytes must match. A Queue notification is unnecessary for new writes because the D1 job survives interruptions and scheduled recovery scans due jobs.
- D1 publishes the archive pointer, product flags, metadata revision, and `detail_fetched=1` in the same transactional `batch()` that completes the leased job. Its SQL compares the source revision, scientific fields, committed pointer revision, and lease token. An older or expired worker may stage an orphan object but cannot move the pointer or flags backward.
- Newer summary revisions clear the pointer, completion marker, and product flags and schedule a fresh detail fetch. The 0021 trigger supersedes older pending, leased, or parked jobs when the source revision advances. Both JSON and crawler reads prefer the committed pointer. During migration, a legacy `<event-id>.json` object is accepted only if its validated revision is at least as new as the D1 summary; stale legacy objects are treated as misses. The crawler renders D1 summary on a miss. The JSON route may fetch current USGS detail, but rejects a response older than or scientifically conflicting with the D1 revision.
- The Queue consumer accepts already-enqueued `{id, geojson}` messages through the same service. Stale deliveries are acknowledged; transient failures retry. Invalid legacy messages with no usable revision are logged and acknowledged. The D1 job recovers valid detail work after Queue retries are exhausted.
- Backfill claims a due job before any recovery fetch. Its protected `status` operation exposes pending, leased, and parked counts. Six failed job attempts park a revision for operator review.

## Release and recovery

1. Freeze and hash this migration and the exact Worker commit. Export production D1, restore the export in isolation, check integrity, foreign keys, row counts, and latest migration, then rehearse 0021 on the clone. Keep the export and Time Travel bookmark before applying to production.
2. Apply 0021 before promoting the matching Worker version. The additive schema accepts the preceding Worker during this interval. Do not run a newer Worker against schema 0020.
3. Use the dedicated preview D1/R2/Queue bindings with no cron schedules. Rehearse legacy Queue delivery in both orders, R2 failure, staged R2 plus failed D1 commit, and crawler/JSON reads. Use synthetic IDs and remove them after validation.
4. Observe backfill job counts and errors after promotion. The previous Worker can still write the legacy mutable key and set `detail_fetched` without a pointer, so it is not a safe long-term rollback once new jobs/pointers exist. Prefer a forward repair; if an emergency rollback is necessary, pause/drain Queue delivery, preserve the additive schema, and explicitly reconcile new jobs and pointers before resuming.

The release does not backfill every historical legacy archive. Existing pointerless rows continue through the guarded legacy read path; historical reconciliation is a separate bounded operation.
