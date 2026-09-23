// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTrustedUsgsIngestion } from './ingest-usgs-feed.js';
import { usgsCollection, usgsFeature } from '../test-fixtures/usgs.js';

let stored;
let context;
let db;
let kv;
const checkpoint = 'usgs_last_response_features';

beforeEach(() => {
  stored = new Map();
  db = {
    prepare: vi.fn(() => ({ bind: vi.fn(function () { return this; }), all: vi.fn().mockResolvedValue({ results: [] }) })),
    batch: vi.fn(async (statements) => statements.map(() => ({ success: true, meta: { changes: 1 } }))),
  };
  kv = {
    get: vi.fn(async (key) => stored.get(key) ?? null),
    put: vi.fn(async (key, value) => { stored.set(key, value); }),
    getWithMetadata: vi.fn().mockResolvedValue({ value: { total_earthquakes: 0 }, metadata: null }),
  };
  context = { env: { DB: db, USGS_LAST_RESPONSE_KV: kv }, executionContext: { waitUntil: vi.fn() } };
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(usgsCollection())));
  vi.stubGlobal('caches', { default: { match: vi.fn(), put: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe('trusted scheduled USGS ingestion', () => {
  it('persists an hourly feed, awaits its checkpoint, and preserves the list-generator payload', async () => {
    const response = await handleTrustedUsgsIngestion(context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ newOrUpdatedFeatures: usgsCollection().features, fullGeoJson: usgsCollection(), ingestion: { complete: true } });
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stored.get(checkpoint))).toEqual(usgsCollection().features);
    expect(caches.default.match).not.toHaveBeenCalled();
    expect(caches.default.put).not.toHaveBeenCalled();
  });

  it('returns all hourly features to list generation even when no D1 writes are needed', async () => {
    const feature = usgsCollection().features[0];
    stored.set(checkpoint, JSON.stringify([feature]));
    db.prepare.mockImplementation(() => ({
      bind: vi.fn(function () { return this; }),
      all: vi.fn().mockResolvedValue({ success: true, results: [{ id: feature.id, source_updated_at_ms: feature.properties.updated }] }),
    }));
    const response = await handleTrustedUsgsIngestion(context);
    expect(response.status).toBe(200);
    expect((await response.json()).newOrUpdatedFeatures).toEqual(usgsCollection().features);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('sends an unchanged checkpoint feature through the guard when its migrated D1 row lacks a revision', async () => {
    const feature = usgsCollection().features[0];
    stored.set(checkpoint, JSON.stringify([feature]));
    db.prepare.mockImplementation(sql => ({
      bind: vi.fn(function () { return this; }),
      all: vi.fn().mockResolvedValue({
        success: true,
        results: sql.includes('source_updated_at_ms')
          ? [{ id: feature.id, source_updated_at_ms: null }]
          : [{ id: feature.id }],
      }),
    }));

    const response = await handleTrustedUsgsIngestion(context);

    expect(response.status).toBe(200);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id, source_updated_at_ms'));
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT(id) DO UPDATE'));
    expect(JSON.parse(stored.get(checkpoint))).toEqual([feature]);
  });

  it('does not checkpoint when the migrated revision lookup fails', async () => {
    const feature = usgsCollection().features[0];
    stored.set(checkpoint, JSON.stringify([feature]));
    db.prepare.mockImplementation(() => ({
      bind: vi.fn(function () { return this; }),
      all: vi.fn().mockResolvedValue({ success: false, results: [] }),
    }));

    expect((await handleTrustedUsgsIngestion(context)).status).toBe(503);
    expect(db.batch).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('keeps the newer per-feed feature while an older overlap is superseded in D1', async () => {
    const saved = usgsCollection([usgsFeature('us-test-1', { updated: 1750000002000 })]);
    stored.set(checkpoint, JSON.stringify(saved.features));
    db.batch.mockResolvedValueOnce([{ success: true, meta: { changes: 0 } }]);
    db.prepare.mockImplementation(sql => ({
      bind: vi.fn(function () { return this; }),
      all: vi.fn().mockResolvedValue({ success: true, results: sql.includes('source_updated_at_ms') ? [{
        id: 'us-test-1', event_time: 1750000000000, latitude: 37.5, longitude: -121.5,
        depth: 8, magnitude: 2.4, place: 'Test location',
        usgs_detail_url: saved.features[0].properties.detail,
        source_updated_at_ms: 1750000002000,
      }] : [{ id: 'us-test-1' }] }),
    }));
    const response = await handleTrustedUsgsIngestion(context);

    expect(response.status).toBe(200);
    expect((await response.json()).ingestion.supersededIds).toEqual(['us-test-1']);
    expect(JSON.parse(stored.get(checkpoint))).toEqual(saved.features);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(checkpoint, JSON.stringify(saved.features));
  });

  it('checks an equal-clock field conflict before advancing the checkpoint', async () => {
    const saved = usgsCollection();
    stored.set(checkpoint, JSON.stringify(saved.features));
    fetch.mockResolvedValue(Response.json(usgsCollection([
      usgsFeature('us-test-1', { place: 'Different place at the same revision' }),
    ])));
    db.batch.mockResolvedValueOnce([{ success: true, meta: { changes: 0 } }]);
    db.prepare.mockImplementation(sql => ({
      bind: vi.fn(function () { return this; }),
      all: vi.fn().mockResolvedValue({ success: true, results: sql.includes('source_updated_at_ms') ? [{
        id: 'us-test-1', event_time: 1750000000000, latitude: 37.5, longitude: -121.5,
        depth: 8, magnitude: 2.4, place: 'Test location',
        usgs_detail_url: saved.features[0].properties.detail,
        source_updated_at_ms: 1750000001000,
      }] : [{ id: 'us-test-1' }] }),
    }));

    const response = await handleTrustedUsgsIngestion(context);
    expect(response.status).toBe(503);
    expect((await response.json()).ingestion.rejectedIds).toEqual(['us-test-1']);
    expect(JSON.parse(stored.get(checkpoint))).toEqual(saved.features);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('does not checkpoint partial success and retries the failed90 rows on the next identical91-feature feed', async () => {
    const payload = usgsCollection(Array.from({ length: 91 }, (_, index) => usgsFeature(`test-${index}`)));
    fetch.mockImplementation(async () => Response.json(payload));
    db.batch.mockRejectedValueOnce(new Error('Transient first batch failure'));
    const failed = await handleTrustedUsgsIngestion(context);
    expect(failed.status).toBe(503);
    expect((await failed.json()).ingestion).toMatchObject({ successCount: 1, errorCount: 90, complete: false });
    expect(stored.has(checkpoint)).toBe(false);
    expect(kv.getWithMetadata).not.toHaveBeenCalled();
    const retried = await handleTrustedUsgsIngestion(context);
    expect(retried.status).toBe(200);
    expect(db.batch).toHaveBeenCalledTimes(4);
    expect(JSON.parse(stored.get(checkpoint))).toHaveLength(91);
  });

  it('does not mark a checkpoint failure as a successful run', async () => {
    kv.put.mockRejectedValue(new Error('KV unavailable'));
    const response = await handleTrustedUsgsIngestion(context);
    expect(response.status).toBe(503);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(kv.getWithMetadata).not.toHaveBeenCalled();
  });

  it('rejects malformed upstream data before any persistent side effect', async () => {
    fetch.mockResolvedValue(Response.json(usgsCollection([usgsFeature('bad/id')])));
    expect((await handleTrustedUsgsIngestion(context)).status).toBe(502);
    expect(db.batch).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('uses a different checkpoint for an explicitly trusted catch-up feed', async () => {
    expect((await handleTrustedUsgsIngestion({ ...context, feedKey: 'day' })).status).toBe(200);
    expect(stored.has(`${checkpoint}:day`)).toBe(true);
    expect(stored.has(checkpoint)).toBe(false);
  });

  it('requires a database and never accepts an arbitrary trusted URL', async () => {
    expect((await handleTrustedUsgsIngestion({ env: {} })).status).toBe(503);
    expect((await handleTrustedUsgsIngestion({ ...context, feedKey: 'https://attacker.example' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
