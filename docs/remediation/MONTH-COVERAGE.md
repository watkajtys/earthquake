# Recurring missing-record repair

The database's scheduled writer ingests the USGS one-hour feed. An event added
or revised after its occurrence has left that window can appear in the complete
day/week/month feeds without ever reaching D1. The main map uses those complete
feeds already; missing D1 rows instead affect cluster inputs, detail enrichment,
sitemaps, and crawler detail pages.

The 2026-09-24 03:26 UTC read-only audit found 13 day, 24 week, and 50 month IDs
missing from D1. These sets were nested. All 50 events were older than one hour.

## Bounded repair

`reconcile-month-coverage.js` checks the existing complete 30-day snapshot every
five minutes, on a separate `2-59/5 * * * *` schedule. It makes no USGS request.
The production flag is `MONTH_COVERAGE_ENABLED=true`; preview has no automatic
schedule. The existing hourly writer and public feed publisher stay independent.

- Insert absent IDs with their validated source summary and revision. On an
  existing ID, do nothing: preserve every column, including NULL revisions,
  newer corrections, enrichment, and detail archive pointers.
- Pin an immutable source descriptor in a small R2 receipt under
  `month-coverage/v1/`. Retain every receipt and source object. The existing
  migration `0022` ledger's previously unused `month` slot records progress;
  incompatible prior use fails visibly. No migration or new binding is needed.
- Verify the complete snapshot's size, SHA-256, metadata, and all features before
  writing. A receipt allows the full 17 MiB envelope contract despite the older
  ledger's 16 MiB snapshot column limit. The receipt is the ledger snapshot.
- Commit inserts and cursor advancement in one fenced D1 transaction. Bound
  each JSON1 batch to 600 features and 256 KiB, with at most 32 batches per pass.
  Finish the pinned source before admitting a later live pointer.
- Retry transient failures with a delay capped at five minutes. There is no
  six-failure permanent stop. Corrupt or unavailable pinned sources remain
  explicit failures; they are never silently skipped or declared complete.

At the audited 10,730-record size, the isolated restored-database rehearsal
finished in one pass (18 batches). The operational target is presence within
15 minutes of appearing in a healthy published month feed at this volume.
Larger sources can require multiple passes; outages extend the window. A new
arrival during a partial scan may wait for both that scan and the next one.
Scheduled logs report the source time/age, cursor/count, batches and insert count.

Completion means all IDs in the **pinned source** have been considered by
insert-only transactions. It does not mean every existing scientific revision
matches USGS. The rollout must also verify zero missing IDs by an independent
SELECT audit, then observe subsequent source generations being reconciled.

## Verification and operations

The SQLite-backed tests cover full-row preservation, transaction rollback,
eight successive failures followed by recovery, pointer rollover, checksum
rejection, lease contention/takeover, 30,000 features, UTF-8 payload bounds, and
empty sources. A fresh production export restored cleanly before activation.
Rehearsal inserted all 50 absent IDs and preserved the full hash of all 191,101
preexisting earthquake rows. Actual Cloudflare Worker probes with isolated
preview tables and R2 sources completed 30,000-feature ASCII, Unicode, and dense
optional-property snapshots (up to 17.73 MB) in two invocations: 19,200 then
30,000 IDs, 104 then 62 D1 statements. The first invocation took about six
seconds; existing newer and NULL-revision rows were preserved. These are bounded
fixture measurements, not a guarantee for every input shape or service outage.
Production rollout evidence belongs in the current handoff and release ledger.

Read-only progress inspection:

```sql
SELECT s.feed_key, s.completed_source_generated_at_ms,
       r.run_id, r.status, r.cursor, r.feature_count, r.attempts,
       r.next_attempt_at_ms, r.last_error, r.created_at_ms, r.updated_at_ms
FROM UsgsIngestionState s
LEFT JOIN UsgsIngestionRuns r ON r.run_id = s.active_run_id
WHERE s.feed_key = 'month';
```

If progress fails, inspect the error and retained receipt/source before changing
state. Disabling future scans requires a reviewed release removing the flag
and its schedule together; keep the source, receipts, ledger and inserted rows.
Never restore an old database export over the active database as a code rollback.

This repair covers ongoing current-window ID gaps. It does not scan every
historical intermediate generation, restore events older than 30 days, repair
existing stale revisions, rebuild legacy public lists, or rewrite historical
clusters. Those remain separate work.
