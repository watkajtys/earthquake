# Cluster summary freshness, 2026-09-23

## Incident and scope

Production summary generations were observed at 08:00:55, 08:30:54, and
09:00:56 UTC (sequences 299–301). The ten-minute cluster cron re-read the D1
projection, but skipped an unchanged publication while the generation was less
than 20 minutes old. The API used the same 20-minute age as its stale threshold.
Small scheduling differences therefore let the next generation slip to about
30 minutes and made the API truthfully return `stale: true` for roughly ten
minutes. This also failed the production release smoke at 09:00 UTC before
sequence 301 refreshed.

This branch starts at deployed code commit `f381899fd1fb56c8753c24342d8ebb6d9520c53b`.
It has no database migration, remote R2 writes, preview deployment, or
production deployment.

## Local change

- Every successful unchanged D1 projection renews a small R2 observation
  marker under the current generation ID. The marker records the source read
  completion time and the projection hash. Its prior ETag is read before D1;
  create-only or matching-ETag `put` prevents an older same-generation run from
  overwriting a newer observation. An older marker cannot make a newer
  generation look fresh because the API only reads the current generation's
  marker and checks its ID and hash against pointer metadata.
- Immutable pages, manifests, and the existing pointer JSON keep their exact
  schema. Unchanged runs no longer rewrite them. A full generation is still
  published every 60 minutes or whenever projected scalars change. The full
  publication keeps its existing pointer ETag fence.
- The API uses the latest verified observation for `stale`, keeps the JSON
  envelope unchanged, and sends `X-Summary-Observed-At`. The new browser bundle
  uses that header to age the visible data and shows the latest check time
  separately from the immutable snapshot publication time. Missing markers or old pointers
  fall back to the original source observation. Invalid markers fail closed.
  Retained historical generations do not borrow the current marker.

The marker body includes the millisecond, so successive observations have
different bytes even if R2 derives ETags from content. A failed or lost marker
write does not manufacture a newer observation; a later run reads storage
again. If a delayed marker write lands after a new generation commits, it is
isolated under the old generation key and cannot affect the current API result.

## Verification

- Migrated SQLite and in-memory R2 tests cover a jittered 30-minute unchanged
  sequence, unchanged marker CAS loss, an old marker racing a new pointer,
  backwards clocks, malformed markers, API freshness and cursor continuity,
  and client aging from the response header.
- Full test suite: 128 files passed, 1,628 tests passed, 3 skipped.
- Production Vite build, changed-file ESLint, `git diff --check`, and Wrangler
  4.135.0 production `deploy --dry-run` passed. Dry-run only packaged code.
- Independent read-only review found no release-blocking issue in the marker
  compare-and-swap, pointer rotation, API history handling, or client header
  validation.

## Rollout limits

The API makes one extra bounded R2 read for a current pointer with trusted
projection metadata, and the cron writes one marker per successful unchanged
observation. A missed or failed cron still leaves `stale: true` after 20
minutes, as it should. Browser bundles already open before this release still
compute their local stale label from immutable `generatedAtMs`; they can show
the stale label after minute 20 until reloaded or the hourly generation rotates.
The JSON API stays valid for those bundles. As with any new browser asset, the
next release must retain and verify its predecessor asset graph before
promotion.
