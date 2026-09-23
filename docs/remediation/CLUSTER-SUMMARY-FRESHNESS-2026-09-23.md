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

This release starts at plotting code commit
`9864b597d01c38d6e9800c8419e03f8488797fdc`. The summary fix was
cherry-picked from `025e54760cf7e9da60350be196afdfd834a34359` without
conflicts. Code `5f51d0bad7913639573747ac131b417e6fead501` was deployed
after isolated preview and create-only predecessor archival. There was no
database migration.

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
- The final local candidate passed 1,629 tests in 127 files (3 skipped),
  production Vite build, changed-file ESLint, `git diff --check`, and Wrangler
  4.135.0 production `deploy --dry-run`. The dry run only packaged code.
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
The JSON API stays valid for those bundles. The plotting release's 26-file
browser build adds 21 unique paths to its retained 190-path graph. This
candidate stages all 211 prior paths (33,410,503 bytes) in a frozen local
union at `/private/tmp/earthquake-summary-after-plots-union-20260923`; its
manifest is embedded in `src/previousReleaseAssets.js`. The reviewed file
limit was raised from 200 to 240. Before any summary promotion, archive the
21 new files to production R2 with create-only writes and byte-verify all 211
retained paths. The current summary build adds 20 further unique paths, making
231 paths checked during deployment smoke. The production archive verified
all 211 retained paths and the guarded production gate passed. The exact
build, Worker version, and verification limits are in `RELEASE-LEDGER.md`.
