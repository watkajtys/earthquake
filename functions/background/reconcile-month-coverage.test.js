// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcileMonthCoverage, coverageBatch, COVERAGE_BATCH_FEATURES,
  COVERAGE_BATCH_BYTES, COVERAGE_MAX_BATCHES } from './reconcile-month-coverage.js';
import { publishEarthquakeFeed } from './publish-earthquake-feeds.js';
import { createMemorySummaryBucket } from '../utils/clusterSummarySnapshot.test-support.js';
import { feedPointerKey } from '../../shared/earthquakeFeedContract.js';

const migrationFiles = readdirSync(resolve('migrations')).filter(name => name.endsWith('.sql')).sort();
const BASE_TIME = Date.UTC(2026, 8, 24, 12);
const DAY = 86_400_000;
const generation = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const feature = (id, properties = {}) => ({ type: 'Feature', id,
  properties: { time: BASE_TIME - 10 * DAY, updated: BASE_TIME - 1000, mag: 1.2, place: 'Older event',
    alert: null, felt: null, tsunami: 0, sig: 0, ...properties },
  geometry: { type: 'Point', coordinates: [-150, 60, 8] },
});
const features = count => Array.from({ length: count }, (_, index) => feature(`event-${String(index).padStart(5, '0')}`));
function deferred() {
  let resolvePromise;
  const promise = new Promise(done => { resolvePromise = done; });
  return { promise, resolve: resolvePromise };
}
function storageFailure() { return Object.assign(new Error('Injected storage outage'), { code: 'TEST_STORAGE_OUTAGE' }); }
const eventBatch = operations => operations[0]?.sql.startsWith('INSERT INTO EarthquakeEvents');

// Execute the module's actual SQL on migrated SQLite. Hooks surround the real
// transaction and individual statements so failures can prove rollback, rather
// than merely returning a mocked unsuccessful result.
function makeD1(database) {
  const db = { hooks: {}, batches: [],
    prepare(sql) {
      return { bind(...values) {
        if (values.length > 100) throw new Error('D1 parameter limit exceeded');
        const statement = database.prepare(sql);
        return { sql, values,
          run: async () => ({ success: true, meta: statement.run(...values) }),
          all: async () => ({ success: true, results: statement.all(...values) }),
          first: async () => statement.get(...values) ?? null,
          execute: () => ({ success: true, meta: statement.run(...values) }),
        };
      } };
    },
    async batch(operations) {
      db.batches.push(operations);
      await db.hooks.beforeBatch?.(operations);
      database.exec('BEGIN');
      try {
        const results = [];
        for (const [index, operation] of operations.entries()) {
          results.push(operation.execute());
          db.hooks.afterStatement?.(operations, index);
        }
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

describe('complete month ID reconciliation against migrated SQLite', () => {
  let database;
  let db;
  let bucket;
  let env;
  let now;
  let nextGeneration;

  beforeEach(() => {
    now = BASE_TIME;
    // Crypto and native streams complete on real asynchronous turns. Only the
    // source/lease clock is controlled, avoiding fake-timer polling deadlocks.
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Reconciliation must not fetch USGS'); }));
    database = new DatabaseSync(':memory:');
    for (const file of migrationFiles) database.exec(readFileSync(resolve('migrations', file), 'utf8'));
    database.exec('PRAGMA foreign_keys = ON');
    db = makeD1(database);
    bucket = createMemorySummaryBucket();
    bucket.hooks.afterGet = (_key, object) => object && {
      ...object, arrayBuffer: () => new Response(object.body).arrayBuffer(),
    };
    env = { DB: db, GEOJSON_BUCKET: bucket };
    nextGeneration = 1;
  });
  afterEach(() => { database.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function publish(sourceFeatures, sourceTime = now) {
    await publishEarthquakeFeed(env, 'month', { now: () => now,
      fetchFeed: async () => ({ type: 'FeatureCollection',
        metadata: { generated: sourceTime, status: 200, count: sourceFeatures.length }, features: sourceFeatures }),
      randomUUID: () => generation(nextGeneration++),
    });
    return bucket.readJson(feedPointerKey('month')).current;
  }
  const state = () => database.prepare("SELECT * FROM UsgsIngestionState WHERE feed_key = 'month'").get();
  const runs = () => database.prepare("SELECT * FROM UsgsIngestionRuns WHERE feed_key = 'month' ORDER BY created_at_ms, run_id").all();
  const eventRows = () => database.prepare('SELECT * FROM EarthquakeEvents ORDER BY id').all();
  const eventCount = () => database.prepare('SELECT COUNT(*) AS n FROM EarthquakeEvents').get().n;
  const retryWhenDue = () => { now = runs().find(run => run.status === 'retry').next_attempt_at_ms; };

  it('inserts missed older IDs with their actual scientific summaries and keeps all archive bytes', async () => {
    const input = [feature('old-negative', { mag: -0.4, time: BASE_TIME - 25 * DAY }),
      feature('old-null', { mag: null, place: null, time: BASE_TIME - 2 * DAY })];
    const source = await publish(input);
    const archivedBytes = bucket.objects.get(source.objectKey).bytes.slice();
    const result = await reconcileMonthCoverage(env);
    expect(result).toMatchObject({ status: 'completed', inserted: 2, cursor: 2, featureCount: 2, batches: 1 });
    expect(eventRows()).toMatchObject([
      { id: 'old-negative', event_time: input[0].properties.time, magnitude: -0.4,
        latitude: 60, longitude: -150, depth: 8, source_updated_at_ms: BASE_TIME - 1000 },
      { id: 'old-null', event_time: input[1].properties.time, magnitude: null, place: null },
    ]);
    expect(state()).toMatchObject({ active_run_id: null, completed_run_id: result.runId, lease_owner: null });
    expect(runs()).toMatchObject([{ cursor: 2, feature_count: 2, status: 'completed' }]);
    expect(bucket.objects.get(source.objectKey).bytes).toEqual(archivedBytes);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'unchanged' });
    expect(runs()).toHaveLength(1);
    expect(eventCount()).toBe(2);
  });

  it('leaves every existing row byte-for-byte unchanged, including older, newer, equal and NULL revisions', async () => {
    const revisions = [BASE_TIME - 20_000, BASE_TIME - 500, BASE_TIME - 1000, null];
    for (const [index, revision] of revisions.entries()) {
      database.prepare(`INSERT INTO EarthquakeEvents
        (id, event_time, latitude, longitude, depth, magnitude, place, source_updated_at_ms,
         detail_fetched, detail_fetch_time, detail_fetch_attempts, next_detail_fetch_attempt,
         has_moment_tensor, has_shakemap, has_enhanced_data, products_json,
         detail_archive_key, detail_archive_revision_ms, detail_metadata_revision_ms)
        VALUES (?, ?, 12, 34, 56, 5.8, 'Keep existing science', ?, 1, ?, 2, ?, 1, 1, 1, ?, ?, ?, ?)`)
        .run(`existing-${index}`, BASE_TIME - DAY, revision, BASE_TIME - 100, BASE_TIME + 60_000,
          JSON.stringify({ preserved: index }), `details/v1/existing-${index}/keep.json`,
          BASE_TIME - 100, BASE_TIME - 100);
    }
    database.prepare("INSERT INTO UsgsIngestionState(feed_key, fence) VALUES ('hour', 42)").run();
    const before = JSON.stringify(eventRows());
    const hourBefore = JSON.stringify(database.prepare("SELECT * FROM UsgsIngestionState WHERE feed_key = 'hour'").get());
    await publish(revisions.map((_, index) => feature(`existing-${index}`)));
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed', inserted: 0, cursor: 4 });
    expect(JSON.stringify(eventRows())).toBe(before);
    expect(JSON.stringify(database.prepare("SELECT * FROM UsgsIngestionState WHERE feed_key = 'hour'").get())).toBe(hourBefore);
  });

  it('rolls back event inserts and cursor together when a later batch fails, then resumes the pinned tail', async () => {
    await publish(features(601));
    let dataBatches = 0;
    db.hooks.beforeBatch = operations => { if (eventBatch(operations)) dataBatches++; };
    db.hooks.afterStatement = (operations, index) => {
      if (eventBatch(operations) && dataBatches === 2 && index === 0) throw storageFailure();
    };
    await expect(reconcileMonthCoverage(env)).rejects.toThrow('Injected storage outage');
    expect(eventCount()).toBe(600);
    expect(runs()).toMatchObject([{ cursor: 600, status: 'retry', attempts: 1 }]);
    expect(state()).toMatchObject({ completed_run_id: null, lease_owner: null });
    const savedRows = JSON.stringify(eventRows());
    const runId = runs()[0].run_id;
    expect(await reconcileMonthCoverage(env)).toEqual({ status: 'retry-wait', runId });
    expect(JSON.stringify(eventRows())).toBe(savedRows);
    delete db.hooks.afterStatement;
    retryWhenDue();
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed', runId, inserted: 1, cursor: 601, batches: 1 });
    expect(eventCount()).toBe(601);
    expect(runs()).toMatchObject([{ status: 'completed', cursor: 601, attempts: 0 }]);
    expect(JSON.stringify(eventRows().slice(0, 600))).toBe(savedRows);
  });

  it('recovers after eight successive outages without permanently parking the run', async () => {
    await publish([feature('eventual')]);
    db.hooks.beforeBatch = operations => { if (eventBatch(operations)) throw storageFailure(); };
    let runId;
    for (let attempt = 1; attempt <= 8; attempt++) {
      await expect(reconcileMonthCoverage(env)).rejects.toThrow('Injected storage outage');
      runId ??= runs()[0].run_id;
      expect(runs()).toMatchObject([{ run_id: runId, status: 'retry', cursor: 0, attempts: attempt }]);
      expect(runs()[0].next_attempt_at_ms - now).toBeLessThanOrEqual(300_000);
      expect(eventCount()).toBe(0);
      retryWhenDue();
    }
    delete db.hooks.beforeBatch;
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed', runId, inserted: 1 });
    expect(runs()).toMatchObject([{ status: 'completed', attempts: 0, cursor: 1 }]);
  });

  it('finishes the old pinned source after live pointer rollover, then admits the newer source next invocation', async () => {
    const first = await publish(features(601));
    let dataBatches = 0;
    db.hooks.beforeBatch = operations => {
      if (eventBatch(operations) && ++dataBatches === 2) throw storageFailure();
    };
    await expect(reconcileMonthCoverage(env)).rejects.toThrow('Injected storage outage');
    const oldRun = runs()[0].run_id;
    now += 300_000;
    const second = await publish([feature('only-in-new-source', { updated: now - 1000 })]);
    const pointerReads = bucket.calls.filter(call => call.method === 'get' && call.key === feedPointerKey('month')).length;
    delete db.hooks.beforeBatch;
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed', runId: oldRun,
      sourceGeneratedAtMs: first.upstreamGeneratedAtMs, inserted: 1, cursor: 601 });
    expect(bucket.calls.filter(call => call.method === 'get' && call.key === feedPointerKey('month'))).toHaveLength(pointerReads);
    expect(database.prepare("SELECT id FROM EarthquakeEvents WHERE id = 'only-in-new-source'").get()).toBeUndefined();
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed',
      sourceGeneratedAtMs: second.upstreamGeneratedAtMs, inserted: 1, cursor: 1 });
    expect(eventCount()).toBe(602);
    expect(runs().every(run => run.status === 'completed')).toBe(true);
    expect(bucket.objects.has(first.objectKey)).toBe(true);
    expect(bucket.objects.has(second.objectKey)).toBe(true);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('rejects a corrupted complete snapshot before admitting a run or inserting an event', async () => {
    const source = await publish([feature('corrupt')]);
    bucket.objects.get(source.objectKey).bytes[0] ^= 1;
    await expect(reconcileMonthCoverage(env)).rejects.toMatchObject({ code: 'COVERAGE_SOURCE_CHECKSUM_FAILED' });
    expect(eventCount()).toBe(0);
    expect(runs()).toEqual([]);
    expect(state()).toMatchObject({ active_run_id: null, completed_run_id: null, lease_owner: null });
  });

  it.each(['receipt', 'source'])('keeps the pinned cursor when its %s is corrupted and resumes after restoration', async kind => {
    const source = await publish(features(601));
    let dataBatches = 0;
    db.hooks.beforeBatch = operations => {
      if (eventBatch(operations) && ++dataBatches === 2) throw storageFailure();
    };
    await expect(reconcileMonthCoverage(env)).rejects.toThrow('Injected storage outage');
    delete db.hooks.beforeBatch;
    const key = kind === 'source' ? source.objectKey : runs()[0].snapshot_key;
    const originalBytes = bucket.objects.get(key).bytes.slice();
    bucket.objects.get(key).bytes[0] ^= 1;
    retryWhenDue();
    await expect(reconcileMonthCoverage(env)).rejects.toMatchObject({ code: 'COVERAGE_SOURCE_CHECKSUM_FAILED' });
    expect(eventCount()).toBe(600);
    expect(runs()).toMatchObject([{ cursor: 600, status: 'retry', attempts: 2 }]);
    expect(state().completed_run_id).toBeNull();
    bucket.objects.get(key).bytes = originalBytes;
    retryWhenDue();
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed', inserted: 1, cursor: 601 });
  });

  it('returns busy for an overlapping invocation without reading source or changing the owner', async () => {
    const source = await publish([feature('single-owner')]);
    const reached = deferred();
    const released = deferred();
    bucket.hooks.beforeGet = async key => {
      if (key === source.objectKey) { reached.resolve(); await released.promise; }
    };
    const first = reconcileMonthCoverage(env);
    await reached.promise;
    const owner = state();
    const reads = bucket.calls.filter(call => call.method === 'get').length;
    expect(await reconcileMonthCoverage(env)).toEqual({ status: 'busy' });
    expect(state()).toEqual(owner);
    expect(bucket.calls.filter(call => call.method === 'get')).toHaveLength(reads);
    released.resolve();
    expect(await first).toMatchObject({ status: 'completed', inserted: 1 });
  });

  it('does not admit a source after the reading owner has expired', async () => {
    const source = await publish([feature('expired')]);
    bucket.hooks.beforeGet = key => { if (key === source.objectKey) now += 120_001; };
    await expect(reconcileMonthCoverage(env)).rejects.toMatchObject({ code: 'COVERAGE_LEASE_LOST' });
    expect(eventCount()).toBe(0);
    expect(runs()).toHaveLength(0);
    expect(state()).toMatchObject({ active_run_id: null, completed_run_id: null, lease_owner: null });
    expect(bucket.objects.has(source.objectKey)).toBe(true);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('fences a delayed old batch after another owner takes over the expired lease', async () => {
    await publish([feature('takeover')]);
    const reached = deferred();
    const released = deferred();
    let held = false;
    db.hooks.beforeBatch = async operations => {
      if (eventBatch(operations) && !held) {
        held = true;
        reached.resolve();
        await released.promise;
      }
    };
    const stale = reconcileMonthCoverage(env).catch(error => error);
    await reached.promise;
    const firstFence = state().fence;
    now += 120_001;
    const winner = await reconcileMonthCoverage(env);
    expect(winner).toMatchObject({ status: 'completed', inserted: 1, cursor: 1 });
    expect(state().fence).toBe(firstFence + 1);
    const afterWinner = JSON.stringify({ state: state(), runs: runs(), events: eventRows() });
    released.resolve();
    expect(await stale).toMatchObject({ code: 'COVERAGE_CURSOR_FENCED' });
    expect(JSON.stringify({ state: state(), runs: runs(), events: eventRows() })).toBe(afterWinner);
    expect(eventCount()).toBe(1);
  });

  it('bounds an invocation to 32 batches and resumes all 30,000 supported source IDs', async () => {
    await publish(features(30_000));
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'continuing', inserted: 19_200,
      cursor: 19_200, featureCount: 30_000, batches: COVERAGE_MAX_BATCHES });
    expect(eventCount()).toBe(19_200);
    expect(state().completed_run_id).toBeNull();
    const firstBatches = db.batches.filter(eventBatch);
    expect(firstBatches).toHaveLength(32);
    for (const batch of firstBatches) {
      const serialized = batch[0].values[2];
      expect(JSON.parse(serialized)).toHaveLength(COVERAGE_BATCH_FEATURES);
      expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(COVERAGE_BATCH_BYTES);
    }
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed', inserted: 10_800,
      cursor: 30_000, featureCount: 30_000, batches: 18 });
    expect(eventCount()).toBe(30_000);
    expect(runs()).toMatchObject([{ status: 'completed', cursor: 30_000 }]);
  }, 15_000);

  it('bounds UTF-8 batch bytes without skipping or splitting large valid place strings', async () => {
    const input = features(601).map(item => ({ ...item,
      properties: { ...item.properties, place: '地'.repeat(2000) },
    }));
    const first = coverageBatch(input, 0);
    expect(first.count).toBeGreaterThan(0);
    expect(first.count).toBeLessThan(600);
    expect(Buffer.byteLength(first.json)).toBeLessThanOrEqual(COVERAGE_BATCH_BYTES);
    await publish(input);
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed', inserted: 601, cursor: 601 });
    const batches = db.batches.filter(eventBatch);
    expect(batches.length).toBeGreaterThan(2);
    expect(batches.flatMap(batch => JSON.parse(batch[0].values[2]).map(row => row[0])))
      .toEqual(input.map(item => item.id));
    for (const batch of batches) {
      expect(Buffer.byteLength(batch[0].values[2])).toBeLessThanOrEqual(COVERAGE_BATCH_BYTES);
      expect(JSON.parse(batch[0].values[2]).length).toBeLessThanOrEqual(COVERAGE_BATCH_FEATURES);
    }
    expect(database.prepare('SELECT COUNT(*) AS n FROM EarthquakeEvents WHERE place = ?').get('地'.repeat(2000)).n).toBe(601);
  });

  it('completes a genuine empty source without deleting stored history or creating event batches', async () => {
    await publish([feature('stored-history')]);
    await reconcileMonthCoverage(env);
    const before = JSON.stringify(eventRows());
    const previousSource = bucket.readJson(feedPointerKey('month')).current;
    now += 300_000;
    await publish([]);
    db.batches.length = 0;
    expect(await reconcileMonthCoverage(env)).toMatchObject({ status: 'completed', inserted: 0, cursor: 0, featureCount: 0, batches: 0 });
    expect(db.batches.filter(eventBatch)).toHaveLength(0);
    expect(JSON.stringify(eventRows())).toBe(before);
    expect(runs()).toHaveLength(2);
    expect(runs().every(run => run.status === 'completed')).toBe(true);
    expect(bucket.objects.has(previousSource.objectKey)).toBe(true);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });
});
