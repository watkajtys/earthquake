import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPost } from './backfill-earthquake-details.js';
import { persistEarthquakeDetail, MAX_DETAIL_QUEUE_BYTES } from '../utils/earthquakeDetailPersistence.js';
import { fetchValidatedDetail, UsgsTransportError, USGS_LIMITS } from '../utils/usgs-transport.js';

vi.mock('../utils/usgs-transport.js', async importOriginal => ({
  ...await importOriginal(), fetchValidatedDetail: vi.fn(),
}));
const migrations = readdirSync(resolve('migrations')).filter(name => name.endsWith('.sql')).sort()
  .map(name => readFileSync(resolve('migrations', name), 'utf8'));
const now = Date.UTC(2026, 8, 21);
const hour = 60 * 60 * 1000;
const feature = (id = 'quake1') => ({
  type: 'Feature', id,
  properties: { time: now - 2 * hour, updated: now, mag: 4.5, place: 'Test location', products: { shakemap: [{}], dyfi: [] } },
  geometry: { type: 'Point', coordinates: [-118, 34, 10] },
});

describe('backfill and shared detail persistence against the migrated schema', () => {
  let database;
  let env;
  let context;
  const row = (id = 'quake1') => database.prepare('SELECT * FROM EarthquakeEvents WHERE id = ?').get(id);
  const seed = (id = 'quake1', overrides = {}) => {
    const values = { magnitude: 4.5, event_time: now - 2 * hour, detail_fetch_attempts: 0,
      next_detail_fetch_attempt: null, detail_fetched: 0, source_updated_at_ms: null,
      place: null, latitude: null, longitude: null, depth: null,
      usgs_detail_url: 'https://attacker.invalid/not-used', ...overrides };
    database.prepare(`INSERT INTO EarthquakeEvents
      (id, magnitude, event_time, detail_fetch_attempts, next_detail_fetch_attempt, detail_fetched,
        place, latitude, longitude, depth, usgs_detail_url, source_updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, values.magnitude, values.event_time, values.detail_fetch_attempts, values.next_detail_fetch_attempt,
        values.detail_fetched, values.place, values.latitude, values.longitude, values.depth,
        values.usgs_detail_url, values.source_updated_at_ms);
  };
  const get = (query = 'batch_size=1') => onRequestGet({ ...context, request: new Request(`https://example.com/api/backfill-earthquake-details?${query}`) });
  const post = (body, headers = { 'Content-Type': 'application/json' }) => onRequestPost({
    ...context, request: new Request('https://example.com/api/backfill-earthquake-details?batch_size=100', {
      method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchValidatedDetail.mockImplementation(async id => feature(id));
    database = new DatabaseSync(':memory:');
    migrations.forEach(sql => database.exec(sql));
    env = {
      DB: { prepare: vi.fn(sql => ({ bind: (...values) => ({
        all: async () => ({ success: true, results: database.prepare(sql).all(...values) }),
        first: async () => database.prepare(sql).get(...values),
        run: async () => ({ success: true, meta: database.prepare(sql).run(...values) }),
      }) })) },
      GEOJSON_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
      GEOJSON_BUCKET: { put: vi.fn().mockResolvedValue({ etag: 'test' }) },
    };
    context = { env, ctx: { waitUntil: vi.fn() } };
  });
  afterEach(() => { database.close(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('queues before completion and stores all product and completion metadata together', async () => {
    seed();
    env.GEOJSON_QUEUE.send.mockImplementation(async () => {
      expect(row().detail_fetched).toBe(0);
      expect(row().detail_fetch_time).toBeNull();
    });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(fetchValidatedDetail).toHaveBeenCalledExactlyOnceWith('quake1');
    expect(row()).toMatchObject({ detail_fetched: 1, detail_fetch_time: now, detail_fetch_attempts: 1,
      has_shakemap: 1, has_dyfi: 0, has_enhanced_data: 1, products_json: '["shakemap","dyfi"]',
      next_detail_fetch_attempt: null, last_detail_fetch_attempt: now, latitude: 34, longitude: -118 });
  });

  it('keeps an archive failure pending even on the last upstream attempt and retries successfully', async () => {
    seed('quake1', { detail_fetch_attempts: 2, next_detail_fetch_attempt: now - 1 });
    env.GEOJSON_QUEUE.send.mockRejectedValueOnce(new Error('Queue outage'));
    expect(await (await get()).json()).toMatchObject({ success: false, processed: 0, errors: 1 });
    expect(row()).toMatchObject({ detail_fetched: 0, detail_fetch_time: null, detail_fetch_attempts: 2,
      next_detail_fetch_attempt: now + hour });
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
    expect(await (await get()).json()).toMatchObject({ processed: 0, errors: 0 });
    vi.setSystemTime(now + hour);
    expect(await (await get()).json()).toMatchObject({ success: true, processed: 1 });
    expect(row().detail_fetched).toBe(1);
  });

  it('respects infrastructure retry time with zero upstream attempts', async () => {
    seed();
    env.GEOJSON_QUEUE.send.mockRejectedValueOnce(new Error('Queue outage'));
    await get();
    expect(row().detail_fetch_attempts).toBe(0);
    expect(await (await get()).json()).toMatchObject({ processed: 0 });
    expect(fetchValidatedDetail).toHaveBeenCalledTimes(1);
  });

  it('awaits a durable scheduled retry for a validated upstream failure', async () => {
    seed();
    fetchValidatedDetail.mockRejectedValueOnce(new UsgsTransportError('USGS unavailable', { upstreamStatus: 409 }));
    expect(await (await get()).json()).toMatchObject({ success: false, errors: 1, error_earthquakes: [{ id: 'quake1', status: 409 }] });
    expect(row()).toMatchObject({ detail_fetched: 0, detail_fetch_attempts: 1,
      last_detail_fetch_attempt: now, next_detail_fetch_attempt: now + hour });
    expect(env.GEOJSON_QUEUE.send).not.toHaveBeenCalled();
  });

  it('selects the next pending record when lexical IDs oppose magnitude order', async () => {
    seed('z_high', { magnitude: 6 });
    seed('a_low', { magnitude: 4 });
    const first = await (await get()).json();
    expect(first.last_processed_id).toBe('z_high');
    expect(first.continue_url).not.toContain('continue_from');
    const second = await (await get('batch_size=1&continue_from=z_high')).json();
    expect(second.last_processed_id).toBe('a_low');
    expect(await (await get()).json()).toMatchObject({ success: true, processed: 0, errors: 0 });
  });

  it.each([
    'batch_size=-1', 'batch_size=0', 'batch_size=101', 'batch_size=1.5', 'batch_size=NaN', 'batch_size=2x', 'batch_size=',
    'max_age_days=0', 'max_age_days=366', 'max_age_days=2.5', 'max_age_days=Infinity',
    'min_magnitude=-2.1', 'min_magnitude=10.1', 'min_magnitude=NaN',
  ])('rejects invalid query bounds before any database access: %s', async query => {
    expect((await get(query)).status).toBe(400);
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(fetchValidatedDetail).not.toHaveBeenCalled();
  });

  it('status counts only currently eligible rows with no writes or fake job initiation', async () => {
    seed('eligible');
    seed('nullable_attempts', { detail_fetch_attempts: null });
    seed('small', { magnitude: 2 });
    seed('too_new', { event_time: now - 10 * 60 * 1000 });
    seed('waiting', { next_detail_fetch_attempt: now + hour });
    seed('complete', { detail_fetched: 1 });
    seed('parked', { detail_fetch_attempts: 3 });
    env.USGS_LAST_RESPONSE_KV = { put: vi.fn(), get: vi.fn() };
    const result = await (await post({ operation: 'status' })).json();
    expect(result).toEqual({ success: true, operation: 'status', eligible_count: 2,
      criteria: { batchSize: 10, minMagnitude: 3, maxAgeDays: 365 } });
    expect(env.DB.prepare).toHaveBeenCalledTimes(1);
    expect(env.DB.prepare.mock.calls[0][0]).toMatch(/^SELECT COUNT/);
    expect(env.USGS_LAST_RESPONSE_KV.put).not.toHaveBeenCalled();
    expect(env.GEOJSON_QUEUE.send).not.toHaveBeenCalled();
    expect(fetchValidatedDetail).not.toHaveBeenCalled();
  });

  it('POST run_batch executes the internal validated operation and ignores URL query overrides', async () => {
    seed('quake1', { magnitude: 5 });
    seed('quake2', { magnitude: 4 });
    expect(await (await post({ operation: 'run_batch', batch_size: 1 })).json()).toMatchObject({ processed: 1, errors: 0 });
    expect(fetchValidatedDetail).toHaveBeenCalledTimes(1);
    expect(row('quake2').detail_fetched).toBe(0);
  });

  it.each([
    [{ operation: 'start' }, 400], [{}, 400], [{ operation: 'status', batch_size: '10' }, 400],
    [{ operation: 'status', max_age_days: null }, 400], [{ operation: 'status', min_magnitude: 11 }, 400],
    ['[]', 400], ['not JSON', 400], [JSON.stringify({ operation: 'status', padding: 'x'.repeat(4096) }), 413],
  ])('rejects invalid bounded JSON without touching D1: %j', async (body, status) => {
    expect((await post(body)).status).toBe(status);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('requires JSON content type and returns no-store policy errors', async () => {
    const response = await post({ operation: 'status' }, { 'Content-Type': 'text/plain' });
    expect(response.status).toBe(415);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('treats a failed D1 selection as a failure rather than an empty successful batch', async () => {
    env.DB.prepare.mockReturnValueOnce({ bind: () => ({ all: async () => ({ success: false, results: [] }) }) });
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('stack');
  });

  it('uses the same helper to insert a fallback event with complete no-products metadata', async () => {
    const detail = feature();
    delete detail.properties.products;
    detail.properties.mag = null;
    detail.properties.place = null;
    const result = await persistEarthquakeDetail({ env, detailData: detail });
    expect(result.archiveDisposition).toBe('queued');
    expect(row()).toMatchObject({ detail_fetched: 1, detail_fetch_time: now, products_json: '[]',
      has_shakemap: 0, has_moment_tensor: 0, has_focal_mechanism: 0, has_dyfi: 0,
      has_losspager: 0, has_finite_fault: 0, has_enhanced_data: 0, magnitude: null, place: null,
      source_updated_at_ms: now });
  });

  it('keeps a newer summary intact and schedules a retry when backfill receives stale detail', async () => {
    seed('quake1', { source_updated_at_ms: now + 1000, place: 'Current location' });

    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: false, processed: 0, errors: 1 });
    expect(row()).toMatchObject({ place: 'Current location', source_updated_at_ms: now + 1000,
      detail_fetched: 0, next_detail_fetch_attempt: now + hour });
    expect(env.GEOJSON_QUEUE.send).not.toHaveBeenCalled();
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });

  it('rejects an equal-revision scientific conflict before archiving', async () => {
    seed('quake1', { source_updated_at_ms: now, place: 'Corrected location' });

    await expect(persistEarthquakeDetail({ env, detailData: feature() }))
      .rejects.toMatchObject({ code: 'CONFLICTING_DETAIL_REVISION' });
    expect(row()).toMatchObject({ place: 'Corrected location', source_updated_at_ms: now, detail_fetched: 0 });
    expect(env.GEOJSON_QUEUE.send).not.toHaveBeenCalled();
  });

  it('enriches a matching revision and advances the source revision for a newer detail', async () => {
    seed('quake1', { source_updated_at_ms: now, latitude: 34, longitude: -118, depth: 10,
      place: 'Test location',
      usgs_detail_url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/quake1.geojson' });
    await persistEarthquakeDetail({ env, detailData: feature() });
    expect(row()).toMatchObject({ source_updated_at_ms: now, detail_fetched: 1, has_shakemap: 1 });

    const newer = feature();
    newer.properties.updated = now + 1000;
    newer.properties.place = 'Newer detail location';
    await persistEarthquakeDetail({ env, detailData: newer });
    expect(row()).toMatchObject({ source_updated_at_ms: now + 1000, place: 'Newer detail location', detail_fetched: 1 });
  });

  it('keeps the summary fence when a newer summary arrives after the archive preflight', async () => {
    seed('quake1', { source_updated_at_ms: now - 1000 });
    env.GEOJSON_QUEUE.send.mockImplementationOnce(async () => {
      database.prepare('UPDATE EarthquakeEvents SET source_updated_at_ms = ?, place = ? WHERE id = ?')
        .run(now + 1000, 'Concurrent correction', 'quake1');
    });

    await expect(persistEarthquakeDetail({ env, detailData: feature() }))
      .rejects.toMatchObject({ code: 'STALE_DETAIL_REVISION' });
    expect(row()).toMatchObject({ source_updated_at_ms: now + 1000, place: 'Concurrent correction', detail_fetched: 0 });
    expect(env.GEOJSON_QUEUE.send).toHaveBeenCalledTimes(1);
  });

  it('stores an accepted USGS alias under the requested event ID', async () => {
    seed('old_id');
    const detail = feature('new_id');
    detail.properties.ids = ',old_id,new_id,';
    await persistEarthquakeDetail({ env, detailData: detail, requestedId: 'old_id' });
    expect(row('old_id').detail_fetched).toBe(1);
    expect(row('new_id')).toBeUndefined();
    expect(env.GEOJSON_QUEUE.send).toHaveBeenCalledWith({ id: 'old_id', geojson: detail });
  });

  it('stores a Queue-oversize detail directly in R2 before completion, measuring UTF-8 bytes', async () => {
    seed();
    const detail = feature();
    detail.properties.products.shakemap[0].padding = '🌎'.repeat(MAX_DETAIL_QUEUE_BYTES / 3);
    env.GEOJSON_BUCKET.put.mockImplementation(async () => {
      expect(row().detail_fetched).toBe(0);
      return { etag: 'test' };
    });
    expect((await persistEarthquakeDetail({ env, detailData: detail })).archiveDisposition).toBe('stored');
    expect(env.GEOJSON_QUEUE.send).not.toHaveBeenCalled();
    expect(env.GEOJSON_BUCKET.put).toHaveBeenCalledExactlyOnceWith('quake1.json', JSON.stringify(detail),
      { httpMetadata: { contentType: 'application/json' } });
    expect(row().detail_fetched).toBe(1);
  });

  it('does not complete metadata when the bounded R2 fallback fails', async () => {
    seed();
    delete env.GEOJSON_QUEUE;
    env.GEOJSON_BUCKET.put.mockRejectedValueOnce(new Error('R2 outage'));
    await expect(persistEarthquakeDetail({ env, detailData: feature() })).rejects.toThrow('R2 outage');
    expect(row().detail_fetched).toBe(0);
    expect(env.DB.prepare).toHaveBeenCalledTimes(1);
    expect(env.DB.prepare.mock.calls[0][0]).toMatch(/^SELECT/);
  });

  it('rejects details above the transport storage cap before any archive or D1 mutation', async () => {
    const detail = feature();
    detail.properties.padding = 'x'.repeat(USGS_LIMITS.detailBytes);
    await expect(persistEarthquakeDetail({ env, detailData: detail })).rejects.toThrow('exceeds storage limit');
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(env.GEOJSON_QUEUE.send).not.toHaveBeenCalled();
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });

  it('does not report complete when D1 rejects metadata after archive acceptance', async () => {
    env.DB.prepare.mockImplementationOnce(() => ({ bind: () => ({ first: async () => null }) }));
    env.DB.prepare.mockImplementationOnce(() => ({ bind: () => ({ run: async () => ({ success: false }) }) }));
    await expect(persistEarthquakeDetail({ env, detailData: feature() })).rejects.toThrow('Failed to persist');
    expect(env.GEOJSON_QUEUE.send).toHaveBeenCalledTimes(1);
    expect(row()).toBeUndefined();
  });
});
