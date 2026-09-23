#!/usr/bin/env node
// Opt-in, dedicated-preview proof of D1 transactional fencing and R2 list CAS.
// It does not enable the durable ingestion rollout gate or call live USGS.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPlatformProxy, unstable_readConfig as readConfig } from 'wrangler';
import { handleGenerateLists } from '../functions/background/generate-lists.js';

assert.deepEqual(process.argv.slice(2), ['--remote'], 'Use --remote for the dedicated preview proof');

const sourceConfigPath = resolve('wrangler.toml');
const preview = readConfig({ config: sourceConfigPath, env: 'preview' }, { hideWarnings: true });
const production = readConfig({ config: sourceConfigPath, env: 'production' }, { hideWarnings: true });
const previewDb = preview.d1_databases?.find(binding => binding.binding === 'DB');
const previewBucket = preview.r2_buckets?.find(binding => binding.binding === 'GEOJSON_BUCKET');
assert.equal(preview.name, 'earthquake-reconcile-preview');
assert.equal(previewDb?.database_name, preview.name);
assert.equal(previewBucket?.bucket_name, preview.name);
assert.notEqual(previewDb.database_id, production.d1_databases?.find(binding => binding.binding === 'DB')?.database_id);
assert.notEqual(previewBucket.bucket_name, production.r2_buckets?.find(binding => binding.binding === 'GEOJSON_BUCKET')?.bucket_name);
assert.equal(preview.vars?.DURABLE_INGESTION_ENABLED, undefined);
assert.equal(preview.triggers?.crons?.length || 0, 0);
assert.equal(preview.routes?.length || 0, 0);

// remoteBindings alone does not retarget a local D1 binding. Freeze the
// validated resource identities in a temporary remote-only proxy config.
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'earthquake-durable-preview-'));
const configPath = join(temporaryDirectory, 'wrangler.json');
await writeFile(configPath, JSON.stringify({
  account_id: preview.account_id,
  compatibility_date: preview.compatibility_date,
  env: { preview: {
    name: preview.name,
    d1_databases: [{ binding: 'DB', database_name: previewDb.database_name,
      database_id: previewDb.database_id, remote: true }],
    r2_buckets: [{ binding: 'GEOJSON_BUCKET', bucket_name: previewBucket.bucket_name,
      remote: true }],
  } },
}));
const platform = await getPlatformProxy({ configPath, environment: 'preview', remoteBindings: true, persist: false });
const db = platform.env.DB;
const bucket = platform.env.GEOJSON_BUCKET;
const listKeys = ['list-day.json', 'list-week.json', 'list-month.json'];
let monthInserted = false;
let releaseOld = () => {};
let listsTouched = false;
let olderWrite;
const originals = new Map();

try {
  const count = async () => (await db.prepare(
    "SELECT COUNT(*) AS count FROM UsgsIngestionState WHERE feed_key = 'month'",
  ).first()).count;
  assert.equal(await count(), 0, 'Preview ingestion state must start empty');

  await assert.rejects(db.batch([
    db.prepare('INSERT INTO UsgsIngestionState (feed_key) VALUES (?)').bind('month'),
    db.prepare('INSERT INTO UsgsIngestionState (feed_key) VALUES (?)').bind('month'),
  ]), 'A duplicate second statement must fail the D1 batch');
  assert.equal(await count(), 0, 'Failed D1 batch must roll back its first insert');

  const inserted = await db.prepare('INSERT INTO UsgsIngestionState (feed_key) VALUES (?)').bind('month').run();
  assert.equal(inserted.meta.changes, 1);
  monthInserted = true;
  const now = Date.now();
  const claimSql = `UPDATE UsgsIngestionState SET fence = fence + 1, lease_owner = ?, lease_until_ms = ?
    WHERE feed_key = 'month' AND (lease_owner IS NULL OR lease_until_ms <= ?)`;
  const claims = await Promise.all([
    db.prepare(claimSql).bind('preview-claim-a', now + 60_000, now).run(),
    db.prepare(claimSql).bind('preview-claim-b', now + 60_000, now).run(),
  ]);
  assert.deepEqual(claims.map(result => result.meta.changes).sort(), [0, 1]);
  const state = await db.prepare("SELECT fence, lease_owner FROM UsgsIngestionState WHERE feed_key = 'month'").first();
  assert.equal(state.fence, 1);
  assert(['preview-claim-a', 'preview-claim-b'].includes(state.lease_owner));
  console.log('Preview D1 batch rollback and one-winner fenced claim passed.');

  for (const key of listKeys) {
    const object = await bucket.get(key);
    assert(object?.etag, `Missing preview list ${key}`);
    const rows = await object.json();
    assert(Array.isArray(rows) && rows.length > 0, `Preview list ${key} must contain synthetic rows`);
    originals.set(key, { rows, httpMetadata: object.httpMetadata });
  }
  const sourceObject = await bucket.get('previewquake001.json');
  assert(sourceObject, 'Synthetic preview source is missing');
  const source = await sourceObject.json();
  assert.equal(source.id, 'previewquake001');
  const older = structuredClone(source);
  older.properties.updated += 1;
  older.properties.place = 'SYNTHETIC PREVIEW older correction';
  const newer = structuredClone(source);
  newer.properties.updated += 2;
  newer.properties.place = 'SYNTHETIC PREVIEW newer correction';

  let oldReached;
  const oldAtPut = new Promise(resolve => { oldReached = resolve; });
  const oldPaused = new Promise(resolve => { releaseOld = resolve; });
  let held = false;
  let casLosses = 0;
  const delayedBucket = {
    get: bucket.get.bind(bucket),
    async put(key, value, options) {
      if (key === 'list-day.json' && !held) {
        held = true;
        oldReached();
        await oldPaused;
      }
      const result = await bucket.put(key, value, options);
      if (result === null) casLosses++;
      return result;
    },
  };
  listsTouched = true;
  olderWrite = handleGenerateLists({ env: { DB: db, GEOJSON_BUCKET: delayedBucket }, newFeatures: [older] });
  await Promise.race([oldAtPut, olderWrite.then(() => {
    throw new Error('Older list writer completed before the controlled overlap');
  })]);
  await handleGenerateLists({ env: platform.env, newFeatures: [newer] });
  releaseOld();
  await olderWrite;
  assert(casLosses > 0, 'Delayed list writer must lose an R2 conditional write');
  for (const key of listKeys) {
    const object = await bucket.get(key);
    const row = (await object.json()).find(item => item.id === source.id);
    assert.equal(row?.properties?.updated, newer.properties.updated, `${key} must retain the newer revision`);
    assert.equal(row?.place, newer.properties.place, `${key} must retain the newer science`);
  }
  console.log('Preview R2 list CAS/remerge retained the newer event in day/week/month.');
} finally {
  releaseOld();
  if (olderWrite) await olderWrite.catch(() => {});
  try {
    for (const [key, original] of listsTouched ? originals : []) {
      const current = await bucket.get(key);
      if (current?.etag) {
        const restored = await bucket.put(key, JSON.stringify(original.rows), {
          onlyIf: { etagMatches: current.etag },
          httpMetadata: original.httpMetadata,
        });
        assert(restored, `Preview list ${key} changed during cleanup`);
        assert.deepEqual(await (await bucket.get(key)).json(), original.rows,
          `Preview list ${key} did not restore its original rows`);
      }
    }
    if (monthInserted) {
      const deleted = await db.prepare("DELETE FROM UsgsIngestionState WHERE feed_key = 'month'").run();
      assert.equal(deleted.meta.changes, 1);
      assert.equal((await db.prepare(
        "SELECT COUNT(*) AS count FROM UsgsIngestionState WHERE feed_key = 'month'",
      ).first()).count, 0);
    }
  } finally {
    try { await platform.dispose(); } finally { await rm(temporaryDirectory, { recursive: true, force: true }); }
  }
}
