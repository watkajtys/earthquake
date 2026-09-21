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
    stored.set(checkpoint, JSON.stringify(usgsCollection().features));
    const response = await handleTrustedUsgsIngestion(context);
    expect(response.status).toBe(200);
    expect((await response.json()).newOrUpdatedFeatures).toEqual(usgsCollection().features);
    expect(db.batch).not.toHaveBeenCalled();
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
