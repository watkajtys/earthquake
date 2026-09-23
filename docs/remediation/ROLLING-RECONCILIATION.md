# Rolling-window event reconciliation

Implementation is complete and focused verification passes. This note does not assert production promotion; [RELEASE-LEDGER.md](RELEASE-LEDGER.md) is the authoritative release record. The preceding complete-feed delivery release is documented in [PERIOD-FEEDS.md](PERIOD-FEEDS.md).

## Problem and implementation boundary

An empty complete day feed generated at `T + 30 seconds` disproves an event whose time is `T − 1 day + 45 seconds`. A day feed at `T + 60 seconds` no longer covers that event. Previously, replacing the first coverage proof with the second allowed a late week or month generated at `T` to introduce the event again.

[`earthquakeRevisionState.js`](../../src/contexts/earthquakeRevisionState.js) now retains disjoint coverage intervals per period. A newer interval supersedes overlapping evidence while retaining older tails outside its bounds. Day, week and month remain independent resources; a day proof does not remove unrelated older history. Only complete canonical windows whose source generation, coverage `asOfMs`, end and exact 1/7/30-day width agree establish negative evidence. Bounds are half-open: `[startTimeMs, endTimeMs)`. Empty complete feeds establish evidence; partial, missing or invalid coverage does not.

This change is confined to reconciliation state and its regression tests. Feed delivery, producer publication, database schema and API contracts are unchanged. Existing service/reducer rejection of an older source generation for the **same period** still precedes reconciliation, even if that rejected response carries a newer feature revision.

## Clock, revision and tombstone rules

Three clocks have different meanings:

| Symbol | Meaning |
| --- | --- |
| `S` | Latest trusted source generation that positively contains this event ID. It is identity evidence, independent of which scientific fields win. Missing source generation does not create fresh presence. |
| `R` | Accepted feature `properties.updated` scientific revision. A larger revision wins; an older or missing revision cannot overwrite newer scientific fields. |
| `N` | Newest retained exact absence-proof clock covering the preferred feature's event time. |

Every incoming member updates its positive observation before complete coverage is checked. Delete only when `N > S` and `N >= R`. Thus source presence at `S == N` wins in either response order; a revision at `R == N` with `S < N` remains absent. Reappearance is permitted by `S >= N` or `R > N`, subject to any applicable admission floor. Receipt time, source-observation time and a 304 do not renew `S` or `R`.

Select the preferred scientific feature **before** checking its event time against coverage. A higher revision moving the event outside the disproving interval can restore it without exceeding that interval's clock. Moving into a disproved interval requires the corresponding evidence check. `deletedAtMs` is not an unconditional ID-wide ban: tombstones retain the last feature and a scoped exact `absenceCoverage`.

`S` deliberately remains identity-level evidence. A newer source containing an ID may confirm its existence while older scientific fields in that response lose to an already accepted revision, including a corrected event time. This policy is tested in both arrival orders. With no scientific revision on either feature, source generation orders field selection; receipt time is only a final field-selection tie-breaker and never presence evidence.

## Bounded history and admission floors

Retain coverage within a 31-day horizon based on receipt and accepted complete-source clocks. The latter prevents clock lag from growing disconnected retained ranges without bound. Each period stores at most **128 segments**, or 384 across the three resources. Segments contain bounds and clocks, not a copy of every member ID. Event-ledger retention remains 31 days with the existing last/previous-major exceptions; the segment cap is not a cap on the number of earthquakes.

When a period exceeds the cap, merge its oldest adjacent pair using the larger clock and mark it as a floor. Never bridge an uncovered gap. Canonical window widths limit the number of disconnected components within the retained horizon, so adjacent pairs remain available above the cap. Apply new exact evidence to known events before compacting it.

A floor `F` gates unknown, deleted or newly relocated observations: admit only with `S >= F` or `R > F`. It does not retroactively delete an unchanged accepted live event. Floor rejection retains scoped `admissionCoverage`; it is not labelled an exact deletion. Correcting an event out of that interval triggers a new coverage check.

Compaction intentionally loses some historical precision. A candidate with evidence newer than the original narrow proof but older than the merged maximum may be deferred until a sufficiently new source confirmation or scientific revision arrives. This conservative rule prevents discarded history from silently restoring disproved events. The cap is count-based; it does not promise an exact number of minutes of uncompressed evidence under arbitrarily dense responses.

## Verification

All **33 tests** in [`EarthquakeDataContext.revisions.test.jsx`](../../src/tests/contexts/EarthquakeDataContext.revisions.test.jsx) passed, alongside targeted ESLint and diff checks. Independent review found no blocker. Reproduce the focused checks from the repository root:

```sh
npm test -- src/tests/contexts/EarthquakeDataContext.revisions.test.jsx
npx eslint src/contexts/earthquakeRevisionState.js src/tests/contexts/EarthquakeDataContext.revisions.test.jsx
```

Fixtures cover the swept-out boundary with late weekly/monthly responses, both equality orders, corrections into/out of proof and floor ranges, scientific equality/newer revisions, identity-level source confirmation, empty/partial feeds, independent periods, cap pressure, unchanged live members, fresh absence at the cap, receipt/304 non-renewal, half-open bounds, disjoint gaps, invalid coverage, source-clock lag, expiration and retained major events. Existing cross-view correction, lifecycle and source-rollback tests remain included. Full-suite, build, browser and deployment checks belong to the release record; focused checks alone do not establish production readiness.

## Recovery boundaries

Reconciliation state is in browser memory. Reloading or mounting a new provider rebuilds it from fetched feeds and does not carry historical proof intervals across sessions. This is not a durable deletion journal or a historical database repair.

If browser behavior regresses, roll back to the verified compatible frontend and its retained asset graph using the release procedure. That also restores the earlier reconciliation limitations. No R2 pointer rollback, feed deletion, D1 repair or producer rollback is required by this change. Do not remove proof intervals or floor checks alone to force an event to appear: doing so reopens stale-response resurrection. A fresh qualifying source or revision provides the normal recovery path for a conservatively deferred candidate.
