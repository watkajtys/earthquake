// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTrustedUsgsIngestion } from './ingest-usgs-feed.js';
import { handleGenerateLists } from './generate-lists.js';
import { usgsCollection, usgsFeature } from '../test-fixtures/usgs.js';

const migrationFiles = readdirSync(resolve('migrations')).filter(name => name.endsWith('.sql')).sort();
const clock = Date.UTC(2026, 8, 23, 9);
const feed = (ids, generation) => ({
  ...usgsCollection(ids.map(id => usgsFeature(id, { updated: generation - 1000 }))),
  metadata: { generated: generation, count: ids.length, status: 200 },
});

function makeD1(database) {
  let failFinalEventBatch = false;
  let failFirstEventBatch = false;
  const db = {
    prepare: vi.fn(sql => ({
      bind(...values) {
        if (values.length > 100) throw new Error('D1 bind limit exceeded');
        const statement = database.prepare(sql);
        return {
          run: async () => ({ success: true, meta: statement.run(...values) }),
          all: async () => ({ success: true, results: statement.all(...values) }),
        };
      },
    })),
    batch: vi.fn(async operations => {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const operation of operations) {
          if (failFirstEventBatch && operations.length === 181) {
            failFirstEventBatch = false;
            throw new Error('Injected transient D1 failure in first event batch');
          }
          if (failFinalEventBatch && operations.length === 3) {
            failFinalEventBatch = false;
            throw new Error('Injected transient D1 failure in final event batch');
          }
          results.push(await operation.run());
        }
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }),
    failFinalEventBatch() { failFinalEventBatch = true; },
    failFirstEventBatch() { failFirstEventBatch = true; },
  };
  return db;
}

function makeR2() {
  const objects = new Map();
  let sequence = 0;
  return {
    objects,
    put: vi.fn(async (key, value, options) => {
      const current = objects.get(key);
      if (options?.onlyIf?.etagDoesNotMatch === '*' && current) return null;
      if (options?.onlyIf?.etagMatches !== undefined && current?.etag !== options.onlyIf.etagMatches) return null;
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      const stored = { bytes, etag: `etag-${++sequence}` };
      objects.set(key, stored);
      return { etag: stored.etag };
    }),
    get: vi.fn(async key => {
      const stored = objects.get(key);
      if (!stored) return null;
      const { bytes, etag } = stored;
      return { etag, size: bytes.byteLength,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        json: async () => JSON.parse(new TextDecoder().decode(bytes)) };
    }),
  };
}

describe('durable trusted USGS ingestion through the actual handler', () => {
  let database;
  let db;
  let r2;
  let kv;
  let stored;
  let context;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(clock);
    database = new DatabaseSync(':memory:');
    for (const file of migrationFiles) database.exec(readFileSync(resolve('migrations', file), 'utf8'));
    db = makeD1(database);
    r2 = makeR2();
    stored = new Map();
    kv = { get: vi.fn(async key => stored.get(key) ?? null), put: vi.fn(async (key, value) => { stored.set(key, value); }) };
    context = { env: { DB: db, GEOJSON_BUCKET: r2, USGS_LAST_RESPONSE_KV: kv,
      DURABLE_INGESTION_ENABLED: 'true' } };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    database.close();
  });

  const state = () => database.prepare('SELECT * FROM UsgsIngestionState WHERE feed_key = ?').get('hour');
  const runs = () => database.prepare('SELECT * FROM UsgsIngestionRuns ORDER BY created_at_ms, run_id').all();

  it('replays a failed 91-event source before accepting changed upstream data', async () => {
    const firstIds = Array.from({ length: 91 }, (_, i) => `test-${String(i).padStart(3, '0')}`);
    const secondIds = [...firstIds.slice(0, 90), 'test-091'];
    const first = feed(firstIds, clock - 10_000);
    const second = feed(secondIds, clock - 5_000);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json(second)));
    db.failFinalEventBatch();

    const failed = await handleTrustedUsgsIngestion(context);
    expect(failed.status).toBe(503);
    expect(state()).toMatchObject({ completed_run_id: null });
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ cursor: 90, status: 'retry', feature_count: 91 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM EarthquakeEvents').get().count).toBe(90);
    expect(stored.has('usgs_last_response_features')).toBe(false);
    expect(r2.objects.size).toBe(1);

    vi.setSystemTime(clock + 30_000);
    const recovered = await handleTrustedUsgsIngestion(context);
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).fullGeoJson).toEqual(second);
    expect(runs()).toHaveLength(2);
    expect(runs().every(run => run.status === 'completed' && run.cursor === 91)).toBe(true);
    expect(database.prepare('SELECT id FROM EarthquakeEvents WHERE id = ?').get('test-090')).toBeTruthy();
    expect(database.prepare('SELECT id FROM EarthquakeEvents WHERE id = ?').get('test-091')).toBeTruthy();
    expect(state().completed_run_id).toBe(runs().find(run => run.source_generated_at_ms === second.metadata.generated).run_id);
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    expect((await r2.get(runs().find(run => run.source_generated_at_ms === second.metadata.generated).snapshot_key)).size)
      .toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r2.get).toHaveBeenCalledWith(runs()[0].snapshot_key);
  });

  it('serializes two overlapping successful invocations and keeps the later checkpoint', async () => {
    const first = feed(['test-old'], clock - 10_000);
    const second = feed(['test-new'], clock - 5_000);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json(second)));
    let releaseFirst;
    const firstRead = new Promise(resolve => { releaseFirst = resolve; });
    let firstReadStarted;
    const firstReadReached = new Promise(resolve => { firstReadStarted = resolve; });
    const originalGet = r2.get.getMockImplementation();
    r2.get.mockImplementationOnce(async key => {
      firstReadStarted();
      await firstRead;
      return originalGet(key);
    });

    const older = handleTrustedUsgsIngestion(context);
    await firstReadReached;
    const newer = handleTrustedUsgsIngestion(context);
    await vi.advanceTimersByTimeAsync(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    releaseFirst();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await older).status).toBe(200);
    expect((await newer).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    const latest = runs().find(run => run.source_generated_at_ms === second.metadata.generated);
    expect(state()).toMatchObject({ completed_run_id: latest.run_id,
      active_run_id: null, lease_owner: null });
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    expect(database.prepare('SELECT id FROM EarthquakeEvents ORDER BY id').all().map(row => row.id))
      .toEqual(['test-new', 'test-old']);
  });

  it('resolves list input from D1/R2 after a legacy KV write arrives late', async () => {
    const first = feed(['same'], clock - 10_000);
    const second = feed(['same'], clock - 5_000);
    first.features[0].properties.time = clock - 1000;
    second.features[0].properties.time = clock - 1000;
    first.features[0].properties.place = 'Older location';
    second.features[0].properties.place = 'Current location';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json(second))
      .mockResolvedValueOnce(Response.json(second)));
    for (const period of ['day', 'week', 'month']) {
      await r2.put(`list-${period}.json`, '[]', { onlyIf: { etagDoesNotMatch: '*' } });
    }
    const firstResponse = await handleTrustedUsgsIngestion(context);
    expect(firstResponse.status).toBe(200);
    await handleGenerateLists({ env: context.env,
      newFeatures: (await firstResponse.json()).newOrUpdatedFeatures });
    const secondResponse = await handleTrustedUsgsIngestion(context);
    expect(secondResponse.status).toBe(200);
    await handleGenerateLists({ env: context.env,
      newFeatures: (await secondResponse.json()).newOrUpdatedFeatures });
    const latest = runs().find(run => run.source_generated_at_ms === second.metadata.generated);
    expect(state().completed_run_id).toBe(latest.run_id);
    // Simulate an older binary finishing its mutable KV put after the new
    // gated run. The gated handler must never consult this legacy value.
    stored.set('usgs_last_response_features', JSON.stringify(first.features));
    const repeat = await handleTrustedUsgsIngestion(context);
    expect(repeat.status).toBe(200);
    const repeatedInput = (await repeat.json()).newOrUpdatedFeatures;
    expect(repeatedInput[0].properties.place).toBe('Current location');
    await handleGenerateLists({ env: context.env, newFeatures: repeatedInput });
    for (const period of ['day', 'week', 'month']) {
      await expect((await r2.get(`list-${period}.json`)).json()).resolves.toMatchObject([
        { place: 'Current location', properties: { updated: second.features[0].properties.updated } },
      ]);
    }
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('rechecks the D1 pointer when a newer completion arrives during classification', async () => {
    const first = feed(['same'], clock - 10_000);
    const second = feed(['same'], clock - 5_000);
    first.features[0].properties.place = 'Older location';
    second.features[0].properties.place = 'Current location';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json(second))
      .mockResolvedValueOnce(Response.json(first)));
    expect((await handleTrustedUsgsIngestion(context)).status).toBe(200);
    expect((await handleTrustedUsgsIngestion(context)).status).toBe(200);
    const earlier = runs().find(run => run.source_generated_at_ms === first.metadata.generated);
    const latest = runs().find(run => run.source_generated_at_ms === second.metadata.generated);
    // Start from the earlier completed pointer. The event row already carries
    // the newer revision; move the pointer while classification reads it.
    database.prepare(`UPDATE UsgsIngestionState SET completed_run_id = ?,
      completed_source_generated_at_ms = ? WHERE feed_key = ?`)
      .run(earlier.run_id, earlier.source_generated_at_ms, 'hour');
    const originalPrepare = db.prepare.getMockImplementation();
    let pointerMoved = false;
    db.prepare.mockImplementation(sql => {
      const prepared = originalPrepare(sql);
      if (!sql.includes('SELECT id, source_updated_at_ms FROM EarthquakeEvents WHERE id IN')) return prepared;
      return { bind(...values) {
        const bound = prepared.bind(...values);
        return { ...bound, async all() {
          const result = await bound.all();
          if (!pointerMoved) {
            pointerMoved = true;
            database.prepare(`UPDATE UsgsIngestionState SET completed_run_id = ?,
              completed_source_generated_at_ms = ? WHERE feed_key = ?`)
              .run(latest.run_id, latest.source_generated_at_ms, 'hour');
          }
          return result;
        } };
      } };
    });

    const response = await handleTrustedUsgsIngestion(context);
    expect(response.status).toBe(200);
    expect(pointerMoved).toBe(true);
    expect((await response.json()).newOrUpdatedFeatures[0].properties.place).toBe('Current location');
    expect(state().completed_run_id).toBe(latest.run_id);
    expect(r2.get).toHaveBeenCalledWith(earlier.snapshot_key);
    expect(r2.get).toHaveBeenCalledWith(latest.snapshot_key);
  });

  it('resumes a large immutable source over two invocations without publishing a partial checkpoint', async () => {
    const ids = Array.from({ length: 271 }, (_, i) => `large-${String(i).padStart(3, '0')}`);
    const source = feed(ids, clock - 5_000);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(source)));

    const partial = await handleTrustedUsgsIngestion(context);
    expect(partial.status).toBe(503);
    expect((await partial.json()).ingestion.cursor).toBe(270);
    expect(runs()[0]).toMatchObject({ cursor: 270, status: 'pending' });
    expect(stored.has('usgs_last_response_features')).toBe(false);

    const completed = await handleTrustedUsgsIngestion(context);
    expect(completed.status).toBe(200);
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ cursor: 271, status: 'completed' });
    expect(database.prepare('SELECT COUNT(*) AS count FROM EarthquakeEvents').get().count).toBe(271);
    expect(kv.put).not.toHaveBeenCalled();
    expect(r2.objects.size).toBe(1);
  });

  it('returns a completed recovered source when replay uses the whole batch budget', async () => {
    const ids = Array.from({ length: 270 }, (_, i) => `replay-${String(i).padStart(3, '0')}`);
    const source = feed(ids, clock - 5_000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(source)));
    db.failFirstEventBatch();

    expect((await handleTrustedUsgsIngestion(context)).status).toBe(503);
    expect(runs()[0]).toMatchObject({ cursor: 0, status: 'retry' });
    vi.setSystemTime(clock + 30_000);

    const recovered = await handleTrustedUsgsIngestion(context);
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).newOrUpdatedFeatures.map(feature => feature.id)).toEqual(ids);
    expect(runs()[0]).toMatchObject({ cursor: 270, status: 'completed' });
    expect(kv.put).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('quarantines equal-revision conflicts and never publishes that run as a clean list source', async () => {
    const source = feed(['conflict'], clock - 5_000);
    const original = source.features[0];
    database.prepare(`INSERT INTO EarthquakeEvents
      (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url,
       source_updated_at_ms, retrieved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(original.id, original.properties.time, original.geometry.coordinates[1],
        original.geometry.coordinates[0], original.geometry.coordinates[2],
        original.properties.mag, 'Different place', original.properties.detail,
        original.properties.updated, clock);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(source)));

    expect((await handleTrustedUsgsIngestion(context)).status).toBe(503);
    expect(runs()[0]).toMatchObject({ cursor: 1, status: 'completed_with_rejections' });
    expect(database.prepare('SELECT event_id, reason FROM UsgsIngestionIssues').all())
      .toEqual([{ event_id: 'conflict', reason: 'equal_revision_conflict' }]);
    expect(kv.put).not.toHaveBeenCalled();
    expect((await handleTrustedUsgsIngestion(context)).status).toBe(503);
    expect(kv.put).not.toHaveBeenCalled();
  });
});
