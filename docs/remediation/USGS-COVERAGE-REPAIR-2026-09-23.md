# USGS coverage repair — 2026-09-23 UTC

Status: the approved insert-only production D1 backfill completed on
2026-09-24 UTC and passed batch readback and pinned-source ID audit. Public-list
replacement and permanent day/week/month D1 reconciliation remain pending.
No new schema migration or Worker deployment was part of the backfill.

## What happened

Migration `0022_durable_usgs_ingestion.sql` only created three ingestion
progress tables and one index. Its isolated rehearsal preserved all 190,243
pre-migration `EarthquakeEvents` rows, passed integrity and foreign-key checks,
and the post-migration production readback showed the original tables intact.
The current hourly durable ingestion ledger had 29 of 29 completed runs through
23:25:30 UTC, zero retry/parked/rejected runs, zero issues and no active lease.
These facts do not prove that D1 contains every event in the full USGS windows.

The [fixed-window ID audit](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/legacy-list-id-audit-20260923T2254Z.json)
compared saved complete day/week/month feed generations, current D1, and the
legacy R2 arrays. It found **20 / 309 / 4,507** day/week/month IDs in both the
complete feed and D1 but absent from the corresponding legacy list. It also
found **62 / 548 / 761** feed IDs absent from D1 and the legacy list. Every
legacy list ID in the compared windows was present in D1. These are different
gaps and require separate repairs. In the saved month snapshot, 27 of the 761
feed-only events had magnitude at least 4.5 (maximum 5.0); the gap is not
confined to tiny earthquakes. The private [magnitude impact summary](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/feed-only-magnitude-impact-20260923T2254Z.json)
is mode 0600, SHA-256
`671d817d441986612bb4985bcc0786e5922c615076c1ec871c95d398222e776f`.

The [pre-0022 cross-check](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/feed-only-pre0022-crosscheck-20260923T2258Z.json)
looked up each current feed-only ID in the read-only restored production backup.
All 62 / 548 / 761 IDs were already absent before `0022`, and no backup ID in
those current-feed cohorts disappeared from current D1. In the day cohort,
60 of 62 event occurrence times precede the 19:00 UTC writer pause; 41 of 62
have source `updated` times before the conservative 20:09 UTC pre-export cutoff.
This rules out `0022` deleting those rows and shows substantial coverage loss
before activation. Historical USGS feed responses were not retained, so the
exact first appearance of each ID and the cause of every individual miss remain
unproven. The cross-check is read-only, mode 0600, SHA-256
`222b3360b4bb22c49ea55e886b172720ab6e2947ec8ecca45fca2adb5c7dc534`.

A second, fresh production SQL export was taken around 23:49 UTC, mode 0600,
770,250,206 bytes, SHA-256
`ad0f38763f58b985ffa8571a2bccac0b57374df91a17e8f005077c48c51a9fd3`.
The [private backup manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/primarydb-before-coverage-20260923T2348Z.manifest.json)
records its Time Travel bookmark and a verified isolated restore with 190,280
`EarthquakeEvents` rows, 33 completed ingestion runs, zero issues, successful
SQLite integrity and zero foreign-key violations. The [fresh pinned feed
manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-feed-coverage-source-manifest-20260923T2350Z.json)
identifies complete public day/week/month snapshots observed around 23:51 UTC.
Against that restore, the [private insert-only plan](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-feed-coverage-plan-livebaseline-20260923T2350Z.json)
identified 780 absent IDs in nine batches of at most 90; it held 55 existing
rows with newer source science, classified 115 as unchanged, and parked 9,751
existing rows with unknown trusted revisions. The [disposable rehearsal](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-feed-coverage-rehearsal-livebaseline-20260923T2350Z.json)
inserted all 780 on a copy (190,280 to 191,060 rows), preserved full hashes of
all 9,921 existing selected rows, and passed integrity and foreign-key checks.
These immutable artifacts are a reviewable baseline, not authority to write a
database that has continued ingesting since the export. Production writes: zero.

The offline SQL preflight at local commit `b1e7766ad41bfabc688679d9800bc5eefa8fdee7`
recomputed the SHA-pinned plan and source bytes, then generated nine bounded,
insert-only batches. Its [private typed bundle](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-coverage-sql-preflight-typed/manifest.json)
has manifest SHA-256
`3d7129389a79797243696af52284009ca855607502bd4f5182bd04e53840e85b`.
The exact SQL rehearsal again inserted 780 IDs on a disposable copy, retained
all 9,921 selected existing full rows, and passed integrity and foreign-key
checks. A separate typed readback verifier passed a 90-row Wrangler-style JSON
fixture; 13 focused tests passed. The bundle has no live apply command. A new
production export and Time Travel bookmark, live schema and before-image
comparison, and exact write authorization remain blocking gates. The 23:50
source/baseline must not be applied unchanged after live ingestion advances.

The separate read-only comparator at local tip `a3b0bc9` accepts only D1's
reserved `_cf_KV` table and CRLF versus LF export line endings while comparing
every application schema object. A saved production SELECT-only schema response
matched the pinned restore after those narrow normalizations; changing the
`EarthquakeEvents.id` type in a fixture failed. It generated 9 candidate,
111 existing-row, and one schema query for this plan, with private byte-pinned
query manifest SHA-256
`4e974444ce0f3bf6b02a7dad9ad989df2c478816fd11014672c8a3a248b4c899`.
Nineteen focused tests passed. The comparator has no Cloudflare client or
apply path. It has not queried the full live candidate/held set, so no live
backfill preflight or write approval is claimed.

After the computer restart, a production SELECT-only check observed 38 completed
hourly runs through 2026-09-24 00:10:30 UTC, zero incomplete runs, zero
`UsgsIngestionIssues`, and no active run. Wrangler marked these reads
`changed_db: false` and `rows_written: 0`. Healthy hourly execution is not
evidence of complete day/week/month coverage.

The active scheduled writer consumes `all_hour.geojson`. An event with an older
occurrence time can appear or change in a complete day/week/month snapshot
without being included in the next one-hour source. The legacy list writer
merges that same hourly source into its existing arrays and trims by age; it
cannot recover older missing IDs. The complete period feeds are independently
validated and published, but their success does not currently reconcile D1 or
the legacy arrays. The ten-minute cluster job reads recent `EarthquakeEvents`
from D1, so D1 coverage can affect stored cluster membership even when the
browser's individual plotting correctly renders every stored member. This
design explains how gaps can persist; the historical
source evidence does not establish it as the sole cause of every missing ID.

## Repair order and contracts

1. **Keep the current Worker and data in place.** A Worker rollback would
   reinstate an older writer contract. Restoring the pre-0022 export over live
   production would discard later ingestion. Neither action repairs the gaps.
2. **Backfill D1 without deleting history.** Immediately before a production
   data repair, take a fresh SQL export and Time Travel bookmark plus a fresh
   read-only D1 baseline, verify their integrity, and rehearse the exact repair
   on an isolated restore. Freeze one validated complete source generation per
   period, its content hash and coverage bounds. The first executable repair
   inserts only IDs still absent from D1, with conflict-safe inserts; existing
   rows are held for a separate revision-aware review because a summary update
   can invalidate richer detail metadata. Prepare a dry-run manifest with
   candidate IDs, expected prior rows, source revisions, counts, ambiguities
   and checksums. Apply bounded idempotent batches only after the rehearsal
   passes. Verify every intended row and report any changed, skipped,
   conflicted or failed ID. Do not delete D1-only history to make its count
   match a current feed.
3. **Prevent new D1 coverage gaps.** Add bounded reconciliation of the complete
   day/week/month sources alongside the hourly ingestion. Reuse the validated
   source and per-ID revision fences. Record progress so a partial sweep resumes
   rather than checkpointing as complete; cap per-invocation D1 queries and
   writes. Choose the schedule from preview timings and Cloudflare limits, then
   verify live completion, retry and lag metrics. A successful hourly run alone
   must not claim a complete month archive.
4. **Repair legacy public lists from complete periods.** Read and validate all
   three required complete feeds before replacing any public list; a failed
   month preflight must leave day and week untouched. The complete per-period
   source defines current-window membership. Preserve the existing array and
   rich row shape. A missing D1 row does not prevent a validated source feature
   from appearing in the public list; D1 repair is a separate durable step.
   For an existing ID, retain the newer trusted scientific revision; flag an
   equal-revision conflict. A complete newer source can remove a missing ID
   from its covered window only when its generation is not older than the row's
   trusted revision. Keep uncertain rows until fresh proof or age expiry. A
   stale, partial, missing or invalid source must retain the last good list.
   `summary_updated_at` is an observation timestamp, not a source revision.
5. **Switch writers without an overlap.** Stage and preview the new list
   producer, deploy a paused publication state, observe the exact paused Worker
   version, and wait beyond the prior scheduled invocation lifetime before
   the first production replacement. Cloudflare's documented Cron wall limit
   is [15 minutes](https://developers.cloudflare.com/workers/platform/limits/);
   the prior-version drain must exceed that bound. Freeze fresh before-images
   of all three live R2 lists, with byte hashes and ETags. Publish each period
   with an R2 conditional write and monotonic source-generation metadata; a lost compare
   and swap must reread and either retry or yield to a newer generation. A feed
   pointer compare-and-swap loser must not publish a list from its discarded
   source. The three list keys are not one atomic transaction. Verify exact ID
   sets, row revisions, cache headers and both public hosts after the guarded
   release.

## Preview and production gates

- Reproduce the missing-ID sets against fixed snapshots. Exercise same-ID
  older/newer/equal revisions, delayed generations, changed occurrence times,
  unknown revisions, complete empty sources, upstream deletion, cutoff edges,
  R2 compare-and-swap losses, and partial D1 failures in the actual Worker path.
- Confirm preview uses separate D1/R2/KV/queue bindings with no automatic
  schedules. Seed synthetic sources only there. Run the existing full suite,
  packaging, exact-code preview smoke and a scheduled replay with failure
  injection. Measure month payload memory, CPU, wall time and D1 query counts.
- Before a production write, verify the exact application revision, the fresh
  backup/restore rehearsal and the three current R2 before-images. Keep the
  compatible asset graph archived. Use the guarded `main` release path and
  observe version-filtered scheduled results. Recompare a fixed complete feed
  generation with D1 and the legacy list; report residual differences instead
  of declaring success from row counts alone.

The data source and deletion rule in this document are an engineering proposal
for the next focused release. They need deterministic preview evidence before
production publication. Source observations and raw repair manifests stay in
ignored private evidence, never in Git.

## Inactive implementation candidates

- Local `codex/legacy-list-complete-feeds` at `20e88315fefeb416231076c7aa2d6f99fadebb2a`
  changes legacy list input to the validated complete period snapshots with
  conditional R2 publication. The full suite passed 1,728 tests. Its scheduled
  preview replay kept all three lists unchanged with the flag absent, then
  published three complete lists with a synthetic enabled flag and verified
  cleanup. `COMPLETE_LIST_PUBLICATION_ENABLED` is absent from production.
  Production activation still needs Worker-isolate memory evidence, a paused
  predecessor drain, fresh R2 before-images, and an exact off-to-on release
  gate. Local `codex/legacy-list-activation-gate` at `e6987bf` implements a
  fail-closed gate with unfilled reviewed pins; it passed 1,738 tests and is
  intentionally unable to activate until the exact paused version and private
  receipts exist.
- Local `codex/periodic-d1-coverage` at `281d3c221452f6e62272fbf821e6caef351a8999`
  contains an insert-only, cursor-resumable D1 scanner with no extra USGS
  requests. The full suite passed 1,741 tests. Its 8 MiB/12,000-feature
  source cap is below the publisher's valid 17 MiB/30,000-feature contract,
  so the candidate cannot be activated. It needs bounded immutable shards,
  realistic Worker-isolate and D1 stress, and a separate Cron/flag release
  gate. `PERIOD_D1_COVERAGE_ENABLED` and its Cron are absent from production.
  Local `codex/periodic-d1-shards` at `da010b4` replaces the cap with
  checksummed, bounded immutable sidecars behind another absent-by-default
  flag and passed 1,748 tests. Independent review found that its insert-only
  rule can retain older science after a long pinned run; revision-aware
  convergence is required before activation. Bounded sidecar cleanup and an
  actual Worker-isolate stress rehearsal remain separate blockers.

## Follow-up after the computer restart — 2026-09-24 UTC

A second fresh, read-only production export at about 00:51 UTC is saved in
private ignored evidence. Its [manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/primarydb-before-coverage-20260924T0051Z.manifest.json)
pins 770,291,615 SQL bytes, SHA-256
`69f891d1704d99a74bf1cdf51fb433beafb353ad9ed67390230e1a5781483040`,
and Time Travel bookmark
`0001ac28-00000000-000050f0-da68347b9c1272540b1d7afd3c91f93a`.
Its isolated 716,800,000-byte restore held 190,286 earthquake rows and 45
completed ingestion runs, zero issues, passed SQLite integrity and had zero
foreign-key violations. The first export request received a Cloudflare
authentication error; a read-only retry succeeded. No production row was
changed.

Three newly saved public complete feed envelopes held 264 day, 2,166 week,
and 10,704 month features. The [private source manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-feed-coverage-source-manifest-20260924T0052Z.json)
is SHA-256
`13fee0d8fa4060a84626efd7784613e3b521d943bbb38f73d17c8ee135e56db9`.
The [new plan](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-feed-coverage-plan-livebaseline-20260924T0052Z.json)
is SHA-256
`43a311a05b26536bc6799d860a024bdc04b3843f6e6dcb5e92c6de807311e819`:
791 absent unique IDs in nine batches, 61 newer existing rows held, 115
unchanged, and 9,737 existing ambiguous/conflicting rows parked. Twenty-eight
absent IDs were M≥4.5, maximum M5.0. The exact insert-only SQL rehearsal
inserted all 791 on a disposable copy and preserved all 9,913 existing selected
rows; its [private bundle](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-coverage-sql-preflight-20260924T0052Z/manifest.json)
has manifest SHA-256
`ebe5f4228b0702a8fb8aae9b4e8a6c5bc805c50cbf31ab69ed17afddaf0f739f`.

One hundred twenty-one sequential, SELECT-only production D1 queries checked
the live schema, all nine candidate batches, and 111 held-row groups. Every
candidate remained absent and every existing ID remained present. One existing
row advanced its source revision after export; the strict full-row comparator
correctly failed. A local explicit `--allow-held-drift` mode records that
concurrent change without permitting an existing candidate, a missing held ID,
or schema drift. Its [private report](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-coverage-live-preflight-allow-drift-20260924T0052Z.json)
is SHA-256
`7f58875ae8b6b56f06c989515b3c2a974329769254500383c14c654e71dd529b`:
791 absent candidates, 9,913 held IDs present, 9,912 exact held full rows,
one changed held full row, zero production writes. Nineteen focused planner,
SQL, and comparator tests pass. Local comparator commit `9f26eb5` passed
independent review. A separate [private drift inspection](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-held-drift-review-20260924T0052Z.json)
is SHA-256
`0bf0ec64bd22c5f69a8b9c8ed02c1ab49140b45553f49fdc15e1a67349650b76`;
it shows one existing row's source revision advanced with only retrieval and
next-detail scheduling timestamps changing. An independent reviewer inspected
all 791 generated statements and confirmed guarded insert-only SQL plus typed
readback files; no updates, deletes, or DDL occur in the bundle. This live
readback was time-specific; each batch required an immediate fresh absence
check and typed post-write readback. The subsequent application is recorded
below.

The inactive list activation gate at local `d87b918` has a reviewed 32-minute
same-deployment drain observation and correct optional R2 pagination handling.
It still fails closed pending raw replay and Worker-isolate stress evidence.
Local isolate stress found the list code's 12 MiB single-source and 24 MiB
combined-source caps reject valid 17 MiB/30,000-feature feed envelopes, before
any R2 list write. Local `codex/complete-list-isolate-stress` at `45b3c52`
records the raw [stress receipt](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/complete-list-isolate-raw-final.json)
with SHA-256
`0f52e4e72437277dcc33008706348320edefb4f749d8af7125cc2854ddd15079`.
Its independent verifier confirms 25,000 features per period succeeded, while
contract-valid 30,000-feature cases failed the caps with zero public-list
writes. A separate raw scheduled preview receipt (SHA-256
`040a32954e88e772a2ce28d5f05c36397182ede04bd5e9d6045fec5a0a227cfe`)
verified five isolated phases, zero writes with the flag off, three with it on,
and cleanup. The cap blocker remains; local workerd process RSS is not proof
of the deployed isolate's heap. It cannot be activated at those caps.

The inactive D1 scanner at local `fffc9a5` handles a newer pointer after an
older pinned run and permits a publisher-fresh R2 pointer to be scanned after
the read-time 10-minute TTL. Independent review identified a remaining
historical completeness gap: its single current pointer can skip an
intermediate generation while a long run is active. It also needs a source-age
alert and real Worker-isolate timing. A durable acknowledged retirement delta
journal or an explicit latest-window-only contract plus historical tail audit
is needed before claiming historical completeness. A separate inactive sidecar
GC prototype at local `67bc0a5` passed affected tests but independent review
found D1 audit-row pruning before final R2 checks and an unbounded R2 page
loop. Follow-up local `22ad042` removes automated D1 audit-row deletion, caps
list calls/pages, and rechecks references and the fence before R2 deletion.
Independent review found no remaining P1 in that candidate; 20 focused tests
passed. GC still cannot activate until it protects the transition journal's
reachable nodes and shards and passes isolated preview stress. All associated
flags and Cron remain off in production.

A simple increase of the legacy-list source caps was tested only in local
workerd. With three contract-maximum feeds, post-invocation isolate heap plus
backing storage was 174,646,776 bytes; changing only the output to a
`FixedLengthStream` still used 154,637,322 bytes. Both exceed
[Cloudflare's 128 MB per-isolate limit](https://developers.cloudflare.com/workers/platform/limits/),
and synchronous peaks may be higher. The unsafe trial code was reverted. Local
`codex/complete-list-contract-capacity` at `5af8af8` records the measurements
and a bounded R2 shard staging design that still needs implementation and
stress. No production list release is approved by these measurements.

An inactive retirement-journal prototype at local `8c0a9fa` binds immutable,
hash-checked delta nodes and shards to a winning period-feed pointer CAS and
tracks D1 cursor/ack progress. Its 1,764-test suite, build, and targeted lint
passed. It addresses intermediate-generation loss in the one-deep scanner;
no public pointer contract or D1 schema changed in production. Its new `0023`
migration is local only. Before activation it needs independent correctness
and capacity review, journal-aware GC, a fresh backup and restore rehearsal for
`0023`, worst-case 17 MiB/30,000-feature and backlog stress, and a controlled
rollback/epoch reset. A bounded backlog overflow intentionally fails closed
and can halt publication, so release cadence must be proven before this is
considered a production repair. Independent reviewers found no silent-loss
path within successful new-writer publications and atomic D1 batches, but
identified blocking rollout and capacity defects: old Worker versions reject
the new pointer field; day/week contract-maximum 30,000-feature runs can take
about 42 hours at their proposed cadence while 256 journal nodes fill in about
21 hours; journal nodes/shards are absent from GC; and the local `0023` active
row `CHECK` accepts NULL sequence/count fields under SQLite's three-valued
logic. Those findings require code changes and a new review before migration
or activation.

## Approved D1 backfill completed — 2026-09-24 UTC

Immediately before the production repair, a new mode-0600 SQL export and Time
Travel bookmark were captured. The [private backup manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/primarydb-before-backfill-20260924T0131Z.manifest.json)
has SHA-256
`5a1920c123cbc69fef432c118cf09926046677dd462dc48e76e6aaacaf920576`.
The 770,310,339-byte [SQL export](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/primarydb-before-backfill-20260924T0131Z.sql)
has SHA-256
`19b145dc7eafe3b028e0a27d7aba9106d9b8b67ac9608c8d4704a6a359ddd742`;
the pre-export bookmark is retained only in the private manifest.
The isolated restore held 190,294 earthquake rows and 54 ingestion runs,
passed SQLite integrity, and had zero foreign-key violations or ingestion
issues. The export and restore stay in ignored private evidence.

The approved pinned plan contained 791 unique IDs absent from D1. All nine
bounded SQL batches (eight of 90 IDs and one of 71) ran against production.
Each batch had a fresh live schema and candidate-absence preflight immediately
before its insert-only write, then an immediate typed full-row readback. All
nine batch records reached `verified`; the [private application evidence](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-coverage-apply-20260924T0134Z/)
retains the SQL, preflight and readback digests. Existing IDs were excluded
from the repair; this was not an update or deletion of existing science.

At 01:37:44 UTC, the [final pinned-snapshot ID audit](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-coverage-apply-20260924T0134Z/final-audit/id-coverage-report.json)
(SHA-256
`640946bfcbd6dac7ed207a5d40b6be8260ca6f46c734eb532a6efbc2c452b373`)
found all 10,704 IDs from the saved complete USGS source snapshots in live
D1, including all 791 approved candidates; none were missing. At 01:38:07
UTC, the [read-only ingestion health check](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-coverage-apply-20260924T0134Z/final-audit/hourly-health-report.json)
(SHA-256
`fd27570c16a67fae4c304e41c1870ef5a79fa8e767c74f8cddf5b9e2e5258fbf`)
found 55 completed hourly runs, no active run, zero issues and 191,085 total
earthquake rows. This closes the pinned-snapshot D1 insert repair. New source
generations still need recurring reconciliation; the legacy R2 day/week/month
lists still need a separately guarded rebuild. Neither is claimed complete by
this one-time backfill.

## Fresh-source audit after the backfill — 2026-09-24 01:40 UTC

A new read-only comparison used later complete feed generations containing
271 day, 2,183 week and 10,715 month features. Its [private coverage report](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-current-feed-audit-20260924T0140Z/coverage-audit.json)
has SHA-256
`5acac8c29c0fe576a66380a479801031a6261ab871f518b31ea5383758d88db6`.
Of 10,715 unique current source IDs, 10,699 were present in D1 and 16 were
absent on exact-ID readback: 6 day, 16 week and 16 month. Their occurrence
ages were 1.54–134.45 hours; ten were older than 24 hours. Their maximum
magnitude was 3.74 and none was M≥4.5. These 16 IDs were outside the approved
791-ID plan and were not written. They show that healthy hourly ingestion and
the completed pinned-snapshot repair do not prevent fresh coverage drift.

The [private timing and health addendum](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/d1-current-feed-audit-20260924T0140Z/hourly-timing-addendum.json)
has SHA-256
`d91f3c0528fac422e38487addd272b4e51a6e6fb655c4f9011e78bdc1d8e9fb1`:
56 of 56 hourly runs completed through 01:40:31 UTC, with zero issues and no
active run. The feed and D1 reads were sequential; scheduled ingestion can
change the live result after the audit. This audit checks ID presence, not
full-row science, legacy R2 lists, cluster artifacts or indexing.

## Read-only additive legacy-list rehearsal — 2026-09-24 UTC

Fresh private, mode-0600 production R2 before-images were captured for all
three list objects, with ETags checked before and after each byte read. The
[before-image manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/list-additive-preflight-20260924T0148Z/r2-before-images-manifest.json)
has SHA-256
`bebba9c3d58f3cfe04ef3744b3423d6033a3257e02b7427e0ab93ca99b82a0d8`.
Fresh, validated complete feed responses were pinned in a separate
[source manifest](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/list-additive-preflight-20260924T0148Z/feed-source-manifest.json),
SHA-256
`845d0ed0064051b67f4a747bd9ce16d7ac88441982d622653b643d4bc3222297`.

The [offline additive-only report](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/list-additive-preflight-20260924T0148Z/additive-dryrun-report.json),
SHA-256
`dc0be1e68d80b8bcef8fc5717c00432d2eff322e6dbef0e9d0a8c138650b47ce`,
projects day **183→275** (+92), week **1,365→2,255** (+890), and month
**5,901→11,202** (+5,301) rows. It adds eligible IDs missing from each list
while preserving every existing row and making no deletion. Existing IDs for
which the feed had a newer revision were held (76 day, 267 week, 267 month);
rows with no trusted existing revision were also held (0, 728, 4,843).
Another 5, 69 and
488 list-only rows inside the respective covered windows were retained for a
separate absence policy. No equal-revision conflict appeared in this capture.
The proposed private JSON bodies are 220,349, 1,301,339 and 5,547,887 bytes.

This rehearsal wrote nothing to R2 or D1 and is not a publication receipt.
Before any list write, replay the expanded lists through the actual scheduled
Worker in an isolated preview and measure memory and browser/API behavior.
Then take new live list byte/ETag before-images and fresh complete-source
generation pins, rederive the candidate, use conditional R2 writes, and verify
all three readbacks. The current hourly writer uses ETag compare-and-swap and
revision guards but does not reconcile complete period coverage; additive
inserts do not finish the permanent list repair.

### Deployed-writer replay addendum

The exact deployed `c1c81c4` hourly list writer was independently reviewed
and replayed against the private additive-list candidates. The isolated
[Node replay receipt](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/list-additive-preflight-20260924T0148Z/deployed-writer-replay-c1c81c4-20260924T0152Z.json)
has SHA-256
`8b15c27dcfe4c9a7f17e24e29cfe79000bc4124d435699da9f6c3e40085ac4da`.
The local [workerd replay receipt](/Users/theair/Projects/earthquake/.reconciliation.local/production-0022-20260923/list-additive-preflight-20260924T0148Z/deployed-writer-workerd-replay-c1c81c4-20260924T0203Z.json)
has SHA-256
`24889256416859d8957ee1531e189660c043c8c903b37c7bc8df517cdba881bf`.
Workerd returned HTTP 200, and both replays retained every nonexpired
candidate ID; the expected rows aging past each rolling cutoff were excluded.
These are isolated writer checks with zero production writes. Neither receipt
measures per-isolate heap or exercises the combined five-minute Cron workload
alongside complete-feed publication. The expanded-list preview memory gate,
fresh source and R2 pins, conditional-write check, and post-write readback
remain required. No R2 publication is ready from these receipts.
