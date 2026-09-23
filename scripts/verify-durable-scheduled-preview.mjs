#!/usr/bin/env node
// Opt-in actual scheduled-handler replay with dedicated remote preview D1/R2.
// The synthetic period-feed publisher uses an in-memory R2 partition so its
// independent output cannot replace the preview site's complete feed pointers.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPlatformProxy, unstable_readConfig as readConfig } from 'wrangler';
import worker from '../src/worker.js';
import { FEED_PERIODS, FEED_PREFIX, feedPointerKey, validateCompleteUsgsFeed } from '../shared/earthquakeFeedContract.js';
import { USGS_SUMMARY_URLS, validateUsgsSummary } from '../functions/utils/usgs-transport.js';

const PREVIEW = 'earthquake-reconcile-preview';
const PREVIEW_DB = 'b027cfcd-bee0-4d5e-adf5-9505c3a8626d';
const WINDOWS = ['day', 'week', 'month'];
const SNAPSHOT_PREFIX = 'trusted-usgs-ingestion/v1/hour/';
const LEGACY_CHECKPOINT = 'usgs_last_response_features';
const args = process.argv.slice(2);
assert(args.length === 1 && ['--preflight', '--remote'].includes(args[0]),
  'Use --preflight for preview-only reads or --remote for the guarded synthetic replay');
const replay = args[0] === '--remote';

const preview = readConfig({ config: resolve('wrangler.toml'), env: 'preview' }, { hideWarnings: true });
const production = readConfig({ config: resolve('wrangler.toml'), env: 'production' }, { hideWarnings: true });
const previewDb = preview.d1_databases?.find(item => item.binding === 'DB');
const previewR2 = preview.r2_buckets?.find(item => item.binding === 'GEOJSON_BUCKET');
assert.equal(preview.name, PREVIEW);
assert.equal(previewDb?.database_id, PREVIEW_DB);
assert.equal(previewDb?.database_name, PREVIEW);
assert.equal(previewR2?.bucket_name, PREVIEW);
assert.notEqual(previewDb.database_id, production.d1_databases?.find(item => item.binding === 'DB')?.database_id);
assert.notEqual(previewR2.bucket_name, production.r2_buckets?.find(item => item.binding === 'GEOJSON_BUCKET')?.bucket_name);
assert.equal(preview.triggers?.crons?.length || 0, 0);
assert.equal(preview.routes?.length || 0, 0);
assert.equal(preview.vars?.DURABLE_INGESTION_ENABLED, undefined);
assert.equal(preview.vars?.LIST_PUBLICATION_PAUSED, undefined);

const temp = await mkdtemp(join(tmpdir(), 'earthquake-scheduled-preview-'));
const configPath = join(temp, 'wrangler.json');
await writeFile(configPath, JSON.stringify({
  account_id: preview.account_id,
  compatibility_date: preview.compatibility_date,
  env: { preview: { name: PREVIEW,
    d1_databases: [{ binding: 'DB', database_name: PREVIEW, database_id: PREVIEW_DB, remote: true }],
    r2_buckets: [{ binding: 'GEOJSON_BUCKET', bucket_name: PREVIEW, remote: true }],
  } },
}));

function memoryBucket() {
  const objects = new Map();
  let sequence = 0;
  const object = item => ({ etag: item.etag, size: item.bytes.byteLength,
    uploaded: item.uploaded, httpMetadata: item.httpMetadata, customMetadata: item.customMetadata,
    body: new Response(item.bytes).body,
    arrayBuffer: async () => item.bytes.buffer.slice(item.bytes.byteOffset, item.bytes.byteOffset + item.bytes.byteLength),
    json: async () => JSON.parse(new TextDecoder().decode(item.bytes)),
  });
  return {
    objects,
    async get(key) { return objects.has(key) ? object(objects.get(key)) : null; },
    async head(key) { return objects.has(key) ? object(objects.get(key)) : null; },
    async put(key, value, options = {}) {
      const current = objects.get(key);
      if (options.onlyIf?.etagDoesNotMatch === '*' && current) return null;
      if (options.onlyIf?.etagMatches !== undefined && current?.etag !== options.onlyIf.etagMatches) return null;
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      const item = { bytes, etag: `synthetic-${++sequence}`, uploaded: new Date(),
        httpMetadata: options.httpMetadata, customMetadata: options.customMetadata };
      objects.set(key, item);
      return object(item);
    },
    async delete(key) { objects.delete(key); },
  };
}

async function rows(db, sql, ...values) {
  const result = await db.prepare(sql).bind(...values).all();
  assert.equal(result?.success, true);
  assert(Array.isArray(result.results));
  return result.results;
}
async function mutation(db, sql, ...values) {
  const result = await db.prepare(sql).bind(...values).run();
  assert.equal(result?.success, true);
  return result.meta.changes;
}

const platform = await getPlatformProxy({ configPath, environment: 'preview', remoteBindings: true, persist: false });
const db = platform.env.DB;
const remoteBucket = platform.env.GEOJSON_BUCKET;
let originalFetch;
let originalIngestion;
let began = false;
let eventId;
const originals = new Map();
const listWrites = new Map();
const stagedSnapshots = new Set();
const memoryFeeds = memoryBucket();
const kv = new Map();
let kvWrites = 0;
let checkpointWrites = 0;
const outcome = { mode: args[0], worker: PREVIEW, migration: null, phases: [] };
let replayError;

try {
  const migration = await rows(db, 'SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1');
  assert.equal(migration[0]?.name, '0022_durable_usgs_ingestion.sql');
  outcome.migration = migration[0].name;
  for (const table of ['UsgsIngestionState', 'UsgsIngestionRuns', 'UsgsIngestionIssues']) {
    assert.equal((await rows(db, `SELECT COUNT(*) AS count FROM ${table}`))[0].count, 0,
      `Preview ${table} must be empty before replay`);
  }
  for (const period of WINDOWS) {
    const key = `list-${period}.json`;
    const item = await remoteBucket.get(key);
    assert(item?.etag && item.size > 0 && item.httpMetadata?.contentType === 'application/json',
      `Preview ${key} must exist with JSON metadata`);
    const bytes = new Uint8Array(await item.arrayBuffer());
    assert.equal(bytes.byteLength, item.size);
    assert(Array.isArray(JSON.parse(new TextDecoder().decode(bytes))));
    originals.set(key, { bytes, etag: item.etag, httpMetadata: item.httpMetadata,
      customMetadata: item.customMetadata });
  }
  eventId = `previewdurable${Date.now()}${crypto.getRandomValues(new Uint16Array(1))[0]}`;
  assert.equal((await rows(db, 'SELECT COUNT(*) AS count FROM EarthquakeEvents WHERE id = ?', eventId))[0].count, 0);
  outcome.eventId = eventId;
  if (!replay) {
    console.log(JSON.stringify({ ...outcome, lists: originals.size, stateRows: 0 }));
  } else {
    const start = Date.now();
    const feature = (updated, place) => ({ type: 'Feature', id: eventId,
      properties: { mag: 3.4, place, time: start - 60_000, updated,
        detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${eventId}.geojson`,
        alert: null, felt: 0, tsunami: 0, sig: 340 },
      geometry: { type: 'Point', coordinates: [-118, 35, 8] } });
    const source = (generation, place) => ({ type: 'FeatureCollection',
      metadata: { generated: generation, count: 1, status: 200 },
      features: [feature(generation - 1, place)] });
    const hourly = [source(start - 3000, 'SYNTHETIC PREVIEW legacy'),
      source(start - 2000, 'SYNTHETIC PREVIEW fenced'),
      source(start - 1000, 'SYNTHETIC PREVIEW active')];
    const periods = Object.fromEntries(FEED_PERIODS.map(period =>
      [period, source(start - 500, `SYNTHETIC PREVIEW ${period}`)]));
    for (const item of [...hourly, ...Object.values(periods)]) validateUsgsSummary(item);
    for (const period of FEED_PERIODS) validateCompleteUsgsFeed(periods[period], period);
    const fetchCalls = [];
    let phaseSource = hourly[0];
    originalFetch = globalThis.fetch;
    globalThis.fetch = input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const period = Object.entries(USGS_SUMMARY_URLS).find(([, value]) => value === url.href)?.[0];
      if (url.origin === 'https://earthquake.usgs.gov') {
        assert(period, `Unexpected USGS request: ${url.pathname}`);
        fetchCalls.push(period);
        return Promise.resolve(Response.json(period === 'hour' ? phaseSource : periods[period]));
      }
      throw new Error(`Unexpected network request during synthetic replay: ${url.origin}`);
    };
    const bucket = {
      async get(key, ...options) { return key.startsWith(FEED_PREFIX)
        ? memoryFeeds.get(key) : remoteBucket.get(key, ...options); },
      async head(key, ...options) { return key.startsWith(FEED_PREFIX)
        ? memoryFeeds.head(key) : remoteBucket.head(key, ...options); },
      async put(key, value, options) {
        if (key.startsWith(FEED_PREFIX)) return memoryFeeds.put(key, value, options);
        assert(key.startsWith(SNAPSHOT_PREFIX) || originals.has(key),
          `Unexpected preview R2 write: ${key}`);
        if (key.startsWith(SNAPSHOT_PREFIX)) stagedSnapshots.add(key);
        if (originals.has(key)) {
          // A changed baseline must never be remerged and then overwritten by
          // the test's final restore. R2's CAS closes the read/write race.
          assert.equal(options?.onlyIf?.etagMatches, originals.get(key).etag,
            `${key}: preview list baseline changed before synthetic publication`);
        }
        const result = await remoteBucket.put(key, value, options);
        if (result && originals.has(key)) listWrites.set(key, result.etag);
        return result;
      },
      async delete(key) {
        assert(key.startsWith(FEED_PREFIX), `Unexpected preview R2 delete: ${key}`);
        return memoryFeeds.delete(key);
      },
    };
    const baseEnv = { DB: db, GEOJSON_BUCKET: bucket,
      USGS_LAST_RESPONSE_KV: { async get(key) { return kv.get(key) ?? null; },
        async getWithMetadata(key, type) {
          const value = kv.get(key);
          return { value: type === 'json' && value ? JSON.parse(value) : value ?? null, cas: null };
        },
        async put(key, value) {
          kvWrites++;
          if (key === LEGACY_CHECKPOINT) checkpointWrites++;
          kv.set(key, value);
        } },
      DEPLOYMENT_ENVIRONMENT: 'production' };
    const responses = [];
    originalIngestion = worker.fetchLatestUsgsData;
    worker.fetchLatestUsgsData = async function (...callArgs) {
      const result = await originalIngestion.apply(this, callArgs);
      responses.push({ status: result.status, body: await result.clone().json() });
      return result;
    };
    async function scheduled(name, flags, feed) {
      phaseSource = feed;
      const beforeListWrites = listWrites.size;
      const beforeKvWrites = kvWrites;
      const beforeCheckpointWrites = checkpointWrites;
      const beforeFetches = fetchCalls.length;
      const beforeResponses = responses.length;
      const tasks = [];
      const env = { ...baseEnv, ...flags };
      await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() }, env,
        { waitUntil(promise) { tasks.push(Promise.resolve(promise)); } });
      for (let index = 0; index < tasks.length; index++) await tasks[index];
      assert.equal(responses.length, beforeResponses + 1);
      assert.equal(responses.at(-1).status, 200, `${name}: ingestion failed`);
      assert.deepEqual(fetchCalls.slice(beforeFetches).sort(), ['day', 'hour', 'month', 'week']);
      assert(WINDOWS.every(period => memoryFeeds.objects.has(feedPointerKey(period))),
        `${name}: independent complete period feeds did not publish`);
      const state = await rows(db, "SELECT * FROM UsgsIngestionState WHERE feed_key = 'hour'");
      const runs = await rows(db, "SELECT * FROM UsgsIngestionRuns WHERE feed_key = 'hour' ORDER BY created_at_ms, run_id");
      outcome.phases.push({ name, status: responses.at(-1).status,
        stateRows: state.length, runCount: runs.length,
        completedRunId: state[0]?.completed_run_id || null,
        listObjectsWritten: listWrites.size - beforeListWrites,
        kvWrites: kvWrites - beforeKvWrites,
        checkpointWrites: checkpointWrites - beforeCheckpointWrites });
      return { state, runs };
    }

    began = true;
    await scheduled('paused-legacy', { LIST_PUBLICATION_PAUSED: 'true' }, hourly[0]);
    assert.equal(listWrites.size, 0);
    assert.equal(outcome.phases.at(-1).stateRows, 0);
    await scheduled('unpaused-without-durable', { LIST_PUBLICATION_PAUSED: 'false' }, hourly[0]);
    assert.equal(listWrites.size, 0);
    assert.equal(outcome.phases.at(-1).stateRows, 0);
    const legacyCheckpointWrites = checkpointWrites;
    assert(legacyCheckpointWrites >= 2);
    await scheduled('durable-still-paused', { LIST_PUBLICATION_PAUSED: 'true',
      DURABLE_INGESTION_ENABLED: 'true' }, hourly[1]);
    assert.equal(listWrites.size, 0);
    assert.equal(checkpointWrites, legacyCheckpointWrites);
    assert.equal(outcome.phases.at(-1).runCount, 1);
    assert(outcome.phases.at(-1).completedRunId);
    for (const [key, original] of originals) {
      const current = await remoteBucket.head(key);
      assert.equal(current?.etag, original.etag,
        `${key}: preview list changed before active replay`);
    }
    const final = await scheduled('durable-active', { LIST_PUBLICATION_PAUSED: 'false',
      DURABLE_INGESTION_ENABLED: 'true' }, hourly[2]);
    assert.equal(checkpointWrites, legacyCheckpointWrites);
    assert.equal(final.runs.length, 2);
    assert(final.runs.every(run => run.status === 'completed' && run.cursor === 1 && run.feature_count === 1));
    assert.equal(final.state[0].active_run_id, null);
    assert.equal(final.state[0].lease_owner, null);
    assert.equal(final.state[0].completed_run_id, final.runs.find(run => run.source_generated_at_ms === hourly[2].metadata.generated)?.run_id);
    assert.equal(listWrites.size, 3);
    for (const period of WINDOWS) {
      const item = await remoteBucket.get(`list-${period}.json`);
      const row = (await item.json()).find(candidate => candidate.id === eventId);
      assert.equal(row?.properties?.updated, hourly[2].features[0].properties.updated,
        `${period}: active list did not keep the latest source revision`);
    }
    assert.equal((await rows(db, 'SELECT source_updated_at_ms FROM EarthquakeEvents WHERE id = ?', eventId))[0]?.source_updated_at_ms,
      hourly[2].features[0].properties.updated);
    outcome.listWrites = listWrites.size;
    outcome.snapshotWrites = stagedSnapshots.size;
    outcome.periodFeedPointers = FEED_PERIODS.filter(period => memoryFeeds.objects.has(feedPointerKey(period))).length;
  }
} catch (error) {
  replayError = error;
} finally {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (originalIngestion) worker.fetchLatestUsgsData = originalIngestion;
  const cleanupErrors = [];
  const attempt = async (label, action) => {
    try { return await action(); }
    catch (error) { cleanupErrors.push(new Error(`${label}: ${error.message}`, { cause: error })); return null; }
  };
  if (began) {
    outcome.listCleanup = {};
    for (const [key, original] of originals) {
      await attempt(`clean ${key}`, async () => {
        for (let retry = 0; retry < 3; retry++) {
          const current = await remoteBucket.get(key);
          assert(current?.etag, `${key}: missing during cleanup`);
          if (current.etag === original.etag) {
            assert.deepEqual(new Uint8Array(await current.arrayBuffer()), original.bytes);
            outcome.listCleanup[key] = 'unchanged';
            return;
          }
          if (current.etag === listWrites.get(key)) {
            const restored = await remoteBucket.put(key, original.bytes, {
              onlyIf: { etagMatches: current.etag }, httpMetadata: original.httpMetadata,
              customMetadata: original.customMetadata });
            if (!restored) continue;
            const after = await remoteBucket.get(key);
            assert.deepEqual(new Uint8Array(await after.arrayBuffer()), original.bytes);
            outcome.listCleanup[key] = 'restored';
            return;
          }
          // Another writer changed this key, or a successful PUT lost its
          // acknowledgement. Preserve its rows and remove only our unique ID.
          const currentRows = await current.json();
          assert(Array.isArray(currentRows), `${key}: changed object is not a list`);
          const withoutFixture = currentRows.filter(row => row?.id !== eventId);
          if (withoutFixture.length === currentRows.length) {
            outcome.listCleanup[key] = 'external-change-preserved';
            return;
          }
          const removed = await remoteBucket.put(key, JSON.stringify(withoutFixture), {
            onlyIf: { etagMatches: current.etag }, httpMetadata: current.httpMetadata,
            customMetadata: current.customMetadata });
          if (!removed) continue;
          outcome.listCleanup[key] = 'fixture-removed-external-change-preserved';
          return;
        }
        throw new Error('three conditional cleanup attempts lost a race');
      });
    }
    let runs = [];
    await attempt('read synthetic runs', async () => {
      runs = await rows(db, "SELECT run_id, snapshot_key FROM UsgsIngestionRuns WHERE feed_key = 'hour'");
      assert(runs.every(run => stagedSnapshots.has(run.snapshot_key)),
        'Preview hour state includes a run outside this synthetic replay');
    });
    const ownedRunIds = new Set(runs.filter(run => stagedSnapshots.has(run.snapshot_key))
      .map(run => run.run_id));
    for (const runId of ownedRunIds) {
      await attempt(`delete issues for ${runId}`, () => mutation(db,
        'DELETE FROM UsgsIngestionIssues WHERE run_id = ?', runId));
      await attempt(`delete run ${runId}`, () => mutation(db,
        'DELETE FROM UsgsIngestionRuns WHERE run_id = ?', runId));
    }
    await attempt('delete synthetic state', async () => {
      const state = await rows(db, "SELECT active_run_id, completed_run_id FROM UsgsIngestionState WHERE feed_key = 'hour'");
      assert(state.every(row => [row.active_run_id, row.completed_run_id]
        .every(id => !id || ownedRunIds.has(id))),
      'State has a foreign run pointer; preserving it');
      await mutation(db, "DELETE FROM UsgsIngestionState WHERE feed_key = 'hour'");
    });
    await attempt('delete synthetic event', () => mutation(db,
      'DELETE FROM EarthquakeEvents WHERE id = ?', eventId));
    for (const key of stagedSnapshots) {
      await attempt(`delete ${key}`, () => remoteBucket.delete(key));
    }
    for (const table of ['UsgsIngestionState', 'UsgsIngestionRuns', 'UsgsIngestionIssues']) {
      await attempt(`verify ${table} empty`, async () => assert.equal(
        (await rows(db, `SELECT COUNT(*) AS count FROM ${table}`))[0].count, 0));
    }
    await attempt('verify synthetic event absent', async () => assert.equal(
      (await rows(db, 'SELECT COUNT(*) AS count FROM EarthquakeEvents WHERE id = ?', eventId))[0].count, 0));
    for (const key of stagedSnapshots) {
      await attempt(`verify ${key} absent`, async () => assert.equal(await remoteBucket.head(key), null));
    }
    for (const key of originals.keys()) {
      await attempt(`verify ${key} has no synthetic event`, async () => {
        const current = await remoteBucket.get(key);
        assert(current?.etag, `${key}: missing after cleanup`);
        assert(!Array.from(await current.json()).some(row => row?.id === eventId));
      });
    }
    outcome.cleanup = cleanupErrors.length ? 'incomplete' : 'verified';
  }
  await attempt('dispose preview bindings', () => platform.dispose());
  await attempt('remove temporary config', () => rm(temp, { recursive: true, force: true }));
  if (cleanupErrors.length) {
    console.error(JSON.stringify({ outcome, cleanupErrors: cleanupErrors.map(error => error.message) }));
    throw new AggregateError(replayError ? [replayError, ...cleanupErrors] : cleanupErrors,
      'Preview replay cleanup was incomplete');
  }
}
if (replayError) throw replayError;
if (replay) console.log(JSON.stringify(outcome));
