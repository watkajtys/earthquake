# Current handoff — 2026-09-24 UTC

The archive-preservation release is complete and verified. This is the
stopping point. The larger data-repair prototypes remain outside this release.

## This release

The released code is `eb46fe7b31f89991d6a739597bf94403d7ff74f6`, based directly on
the previously deployed application `c1c81c4bef36732b3e8bbce534979208ee635add`.
It removes the complete-feed publisher's deletion of superseded snapshots.
Feed publication and current/previous pointer updates retain their existing
behavior. It makes no database migration or public-list replacement.

Release status: **Complete — production and retention verified at 03:16 UTC**.

- Production application revision: `eb46fe7b31f89991d6a739597bf94403d7ff74f6`.
- Production Worker version: `bbf6ad59-da33-4adc-93db-19151479fea8`.
- Guarded automatic build: [f7503a8e](https://dash.cloudflare.com/f7e27d63f4766d7fb6a0f5b4789e2cdb/workers/services/view/earthquake/production/builds/f7503a8e-c800-4941-a0a2-50a2f7695511).
- Validation: 1,707 tests passed (3 skipped), build and packaging passed;
  preview and both production hosts passed 325 GET checks / 293 assets each.
  Both public hosts returned the exact released revision and Worker version.
- Retention proof: six day/week/month snapshots captured at 03:07 UTC retained
  identical SHA-256 hashes and byte lengths after two publication advances,
  beyond both pointer entries. The final readback completed at 03:15:55 UTC.
- Fresh GET, conditional GET (304) and HEAD checks passed for all three periods
  on both hosts. Observed scheduled invocations completed without exceptions.
- The bucket has no committed-object expiration rule. Temporary monitoring is
  stopped; no session-owned monitoring remains.
- Private evidence: `.reconciliation.local/archive-preserve-production/`.
  The first automatic build stopped before upload on an existing concurrency
  test timeout. A focused rerun passed, and the unchanged full guarded retry
  completed successfully at 03:08:20 UTC. No checks were bypassed.

The checks sample retained snapshots; they do not prove a complete historical
archive inventory or restore snapshots deleted before this release.

## Archive policy

The user explicitly requires **all R2 archives to be preserved**. This includes
complete feed generations, earthquake detail archives, retained frontend
assets, and any staged sidecars or shards. Older pointers becoming unreferenced
does not authorize deleting their objects. Do not introduce archive cleanup or
object-expiration rules as part of later reconciliation work. This policy
supersedes earlier handoffs that proposed deferred R2 cleanup.

## What was already shipped

- SEO sitemap/canonical corrections and protections against excessive cluster
  calculations are deployed. Google accepted the sitemap; an indexing recovery
  has not been established.
- Complete day/week/month feed snapshots and the browser's complete-feed
  handling are live. Compact cluster summaries and paginated detail rows are
  also live.
- The durable writer for the one-hour USGS feed and migration `0022` are deployed.
  Successful ingestion runs do not prove complete day/week/month database coverage.
- The approved one-time backfill inserted **791 missing earthquake records**.
  Its final audit covered all 10,704 IDs in the pinned source snapshots. A later
  source generation exposed new gaps, so that repair did not solve recurrence.

## What remains separate

The permanent day/week/month comparison with D1 and the replacement of older
public lists remain **undeployed**. They need a separately agreed scope and
success criterion; neither is included in this archive-preservation release.
Historical cluster repairs, intermittent feed failures, and SEO/performance
measurement are also follow-up work, not reasons to extend this task.

**Stop here.** Begin a new work block only on a fresh user request. A sensible
next proposal is to
prevent missing earthquake records from recurring within an agreed refresh
window, with any public-list replacement scoped explicitly.

## Where to resume

The project root contains the released application and this current
handoff on `codex/archive-release-handoff` (documentation-only changes after
the deployed code). The former root branch `codex/cluster-writer-churn` is
preserved; it is an older checkpoint, not the current production source. The archive candidate originated in
`.reconciliation.local/worktrees/archive-preserve-production` on
`codex/archive-preserve-production`. Other private checkouts contain unfinished
experiments; their presence does not mean their code is live.

Use this handoff for current scope, [RELEASE-LEDGER.md](RELEASE-LEDGER.md) for
release evidence, and [USGS-COVERAGE-REPAIR-2026-09-23.md](USGS-COVERAGE-REPAIR-2026-09-23.md)
for the completed one-time repair. Earlier timestamped observations are
historical. Recheck live identity before any later release.
