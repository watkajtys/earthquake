# Cluster writer churn — preview rehearsal, 2026-09-23 UTC

Branch `codex/cluster-writer-churn`, commit `0c2c533`, contains a bounded no-change guard for the ten-minute scheduled cluster job. It sorts member IDs before persistence so D1 row order alone cannot change membership JSON. The existing atomic stable-key upsert skips an UPDATE when its stored scientific/display fields are identical, then confirms the canonical identity and checks for ID/slug collision through the indexed key. This avoids firing the historical update triggers for those no-op rows. The compact summary publisher hashes the sorted scalar projection and skips R2 page/manifest/pointer writes while the unchanged published generation is less than 20 minutes old; it republishes at the freshness boundary.

## Verification

- 154 focused writer/scheduler/publisher tests passed. The complete branch passed 1,545 tests across 125 files with three skips; changed-file ESLint, build, and diff checks passed.
- Dedicated preview Worker version `19c7d360-70aa-4287-aeec-32623e578bc4` passed 117 GET smoke checks and 85 current or archived asset checks. Preview has disabled schedules and isolated synthetic resources.
- Direct remote preview D1 calls wrote the same synthetic cluster twice and confirmed its `updatedAt` and `version` did not change. Direct R2 publisher calls emitted one generation, then returned `unchanged` with the same generation ID and verified projection metadata. The local ignored check script is `.reconciliation.local/cluster-preview-check.mjs`.
- This branch requires no schema migration. The dedicated preview database also has additive migration `0019` from the separate source-revision rehearsal; this writer code does not use that column.

## Remaining boundary

The ten-minute job still reads and computes from D1 each run. Its legacy `active_clusters` KV key is still refreshed every ten minutes to preserve the one-hour TTL; skipping it without a TTL-aware renewal would make the key expire. Concurrent scientific generation publication, historical duplicate identities, mixed timestamp repair, and complete writer leases remain separate integrity work. No production deployment or measured billing, p95, or USGS-request reduction is claimed for this block.
