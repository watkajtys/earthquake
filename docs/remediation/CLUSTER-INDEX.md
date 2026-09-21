# One forward cluster lookup index

This procedure applies only `0018_add_cluster_anchor_lookup_index.sql`. It adds
`idx_clusterdefinitions_anchor_updated_id_legacy` on
`(strongestQuakeId, updatedAt DESC, id ASC)`. It changes no application rows,
triggers, IDs, timestamps, versions, or existing indexes. It optimizes the current
resolver's equality lookup and deterministic order; it does **not** repair the
mixed timestamp ordering or establish canonical generations.

Use the installed Wrangler and run from the repository root. Its migrations
implementation compares complete filenames with `d1_migrations.name`, then
applies pending files. The isolated directory below prevents replay of unrelated
history. Never rename this migration or edit historical `d1_migrations` rows.

## Preconditions and evidence

1. Verify the current account, exact database name/ID, Worker revision and D1
   binding. Preview and production must have different database IDs. Capture
   current `sqlite_master`, table/index/trigger metadata and the complete
   `d1_migrations` history in an ignored dated directory.
2. Verify `0018` is unused in both current histories. The September 21 audit
   recorded production history through `0017`, including eight filenames absent
   from this repository; migration `0005` was recorded although its two indexes
   were absent. Fresh readback, not that historical snapshot, controls this step.
   Do not replay `0004` (it drops the table), renumber old files, or invent missing
   historical SQL to conceal the drift.
3. Verify the target index is absent, **or** its `sqlite_master.sql`, owning table,
   nonunique/nonpartial flags and `PRAGMA index_xinfo` match this migration
   exactly in meaning. Key columns must be `strongestQuakeId ASC`, `updatedAt
   DESC`, `id ASC`, all with BINARY collation. `IF NOT EXISTS` alone is not proof:
   an existing differently defined index with this name must stop the procedure.
4. Capture a current production Time Travel bookmark and its retention/recovery
   context before the production operation. Preview must pass the procedure
   first. Budget index-build time and storage; an index build can briefly affect
   database availability. This explicitly scoped additive, reversible operation
   does not require a full data export/restore rehearsal. Any trigger removal,
   table rebuild, data repair or timestamp normalization remains outside scope
   and requires package 3's validated export and isolated restore rehearsal.
5. Run `npx vitest run scripts/cluster-index-migration.test.js`. The tests execute
   actual repository migrations and resolver SQL in SQLite, including a fixture
   with the two audited timestamp triggers and missing lookup indexes. They
   verify unchanged rows/triggers/selections and index plans. They do not claim
   that this cluster-specific fixture reproduces every production table.

## Freeze exactly one migration

Start with preview. Repeat the freeze for production only after preview readback
passes; review the resulting production name/ID against the fresh inventory.
The preparation block is local and does not access Cloudflare.

```sh
export INDEX_ENV=preview
export INDEX_RUN_DIR="$(mktemp -d /tmp/earthquake-index-0018.XXXXXX)"
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { unstable_readConfig } from 'wrangler';

const environment = process.env.INDEX_ENV;
assert(['preview', 'production'].includes(environment));
const directory = process.env.INDEX_RUN_DIR;
assert(directory?.startsWith('/tmp/earthquake-index-0018.'));
const configs = Object.fromEntries(['preview', 'production'].map(env => [env,
  unstable_readConfig({ config: 'wrangler.toml', env }, { hideWarnings: true })]));
const databases = Object.fromEntries(Object.entries(configs).map(([env, config]) => {
  assert.equal(config.d1_databases.length, 1);
  return [env, config.d1_databases[0]];
}));
assert.notEqual(databases.preview.database_id, databases.production.database_id);
const database = databases[environment];
assert.equal(database.binding, 'DB');
assert(database.database_id && database.database_name);
assert.equal(database.migrations_table || 'd1_migrations', 'd1_migrations');
const filename = '0018_add_cluster_anchor_lookup_index.sql';
const sql = await readFile(join('migrations', filename));
await mkdir(join(directory, 'migrations'));
await writeFile(join(directory, 'migrations', filename), sql, { mode: 0o600 });
const frozen = {
  name: 'earthquake-index-only', account_id: configs[environment].account_id,
  env: { [environment]: { d1_databases: [{ binding: 'DB',
    database_name: database.database_name, database_id: database.database_id,
    migrations_dir: 'migrations', migrations_table: 'd1_migrations' }] } },
};
await writeFile(join(directory, 'wrangler.jsonc'), JSON.stringify(frozen, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ environment, accountId: frozen.account_id,
  databaseName: database.database_name, databaseId: database.database_id,
  filename, sha256: createHash('sha256').update(sql).digest('hex'), directory }, null, 2));
NODE
```

Save the printed manifest and frozen files with the ignored release evidence.
Compare the SHA-256 with the reviewed source file and verify that the frozen
directory contains exactly that one SQL file. Preserve the normal account
authentication mechanism; put no credentials in the config or command line.

List pending migrations against the explicitly selected remote environment:

```sh
npx wrangler d1 migrations list DB --remote --env "$INDEX_ENV" --config "$INDEX_RUN_DIR/wrangler.jsonc"
```

Proceed only if exactly `0018_add_cluster_anchor_lookup_index.sql` is pending.
If none is pending, verify the historical row and exact live index definition;
do not assume success from the empty list. If more than one file is pending,
stop and inspect the frozen configuration/directory. Do not substitute the main
repository migration directory or a fresh migration tracking table.

The authorized operator applies the single reviewed file:

```sh
npx wrangler d1 migrations apply DB --remote --env "$INDEX_ENV" --config "$INDEX_RUN_DIR/wrangler.jsonc"
```

Wrangler records the canonical filename in the existing `d1_migrations` table.
The release/deploy script does not apply migrations automatically. Recheck the
SQL checksum after execution and retain the command outcome, source revision,
database identity, bookmark and timestamps.

## Readback and acceptance

Capture exact DDL and key metadata:

```sql
SELECT name, tbl_name, sql FROM sqlite_master
WHERE type = 'index' AND name = 'idx_clusterdefinitions_anchor_updated_id_legacy';
PRAGMA index_list('ClusterDefinitions');
PRAGMA index_xinfo('idx_clusterdefinitions_anchor_updated_id_legacy');
SELECT id, name, applied_at FROM d1_migrations
WHERE name = '0018_add_cluster_anchor_lookup_index.sql';
```

Run `EXPLAIN QUERY PLAN` for the actual `CLUSTER_COLUMNS` projection in
`functions/utils/clusterResolver.js`, with both a known existing anchor and a
nonexistent anchor:

```sql
SELECT id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
  maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
  radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
  version, createdAt, updatedAt
FROM ClusterDefinitions WHERE strongestQuakeId = ?
ORDER BY updatedAt DESC, id ASC LIMIT 1;
```

Expected: `SEARCH ClusterDefinitions USING INDEX
idx_clusterdefinitions_anchor_updated_id_legacy (strongestQuakeId=?)`, with no
table scan and no temporary order-by B-tree. This index is not a covering index
for every projected column; one matching row still supplies the detail fields.
Exact ID and slug reads must retain their existing primary-key/unique indexes.

Compare selected IDs for known anchors, including timestamp ties, against the
preflight. Record D1 `rows_read`, SQL duration and index-build outcome without
equating local SQLite VM instruction counts with D1 metrics. A missing anchor
should no longer read approximately the entire cluster table. Preserve table
and trigger DDL, pre-existing migration history and representative row contents;
ongoing application writes can change counts, so investigate differences rather
than attributing every change to the index build.

The index deliberately retains legacy mixed text/numeric timestamp ordering.
The current application may still select an older textual timestamp over a
newer numeric timestamp. That correctness repair needs the separate normalized
timestamp migration and writer transition.

## Recovery boundary

The compatible Worker can continue using the old selector with this additive
index present. A code rollback does not require removing the index. If an index
rollback is necessary, prepare a separately reviewed forward migration dropping
only this exact index after verifying its definition. Retain the `0018` history
row and document the reversal; do not delete history to force a replay.

Do not use whole-database Time Travel as routine recovery for this index. A
database restore loses later writes and does not restore KV/R2/Queues; it needs
the separately authorized, quiesced, cross-service recovery procedure in package
3. This operation leaves both timestamp triggers and historical data repairs
deferred.

Command syntax and migration filename behavior were checked against installed
Wrangler 4.135.0 help, `config-schema.json`, and its migration implementation.
No remote operation is performed by the tests or the preparation block.
