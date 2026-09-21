// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './cluster-summaries.js';
import { publishClusterSummarySnapshot } from '../utils/clusterSummarySnapshot.js';
import { createMemorySummaryBucket } from '../utils/clusterSummarySnapshot.test-support.js';
import { createClusterSqliteFixture } from '../utils/clusterSqliteFixture.test-support.js';
import {
  SUMMARY_SCHEMA_VERSION, SUMMARY_POINTER_KEY, SUMMARY_PAGE_SIZE,
  MAX_SUMMARY_PAGE_BYTES, MAX_SUMMARY_ITEMS, SUMMARY_MAX_AGE_MS,
  generationManifestKey, generationPageKey, sha256Hex,
} from '../../shared/clusterSummaryContract.js';

const NOW = Date.UTC(2026, 8, 21, 12);
const GENERATION_A = '11111111-1111-4111-8111-111111111111';
const GENERATION_B = '22222222-2222-4222-8222-222222222222';
const encoder = new TextEncoder();
let objects, env;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  objects = new Map();
  env = {
    GEOJSON_BUCKET: { get: vi.fn(async key => {
      const text = objects.get(key);
      if (text === undefined) return null;
      const bytes = encoder.encode(text);
      return { size: bytes.byteLength, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) };
    }) },
    DB: { prepare: vi.fn(() => { throw new Error('D1 must not be read'); }) },
    CLUSTER_KV: { get: vi.fn(() => { throw new Error('Legacy KV must not be read'); }) },
  };
});
afterEach(() => { vi.restoreAllMocks(); });

function item(index) {
  return {
    id: `cluster-${String(index).padStart(5, '0')}`, slug: `cluster-${index}`,
    title: `Cluster ${index}`, locationName: 'Example', quakeCount: 3, maxMagnitude: 5,
    startTime: NOW - 60_000, endTime: NOW - 1000, strongestQuakeId: `event-${index}`,
    summaryRevision: 'a'.repeat(64),
  };
}

async function generation(count = 450, overrides = {}) {
  const metadata = {
    schemaVersion: SUMMARY_SCHEMA_VERSION, source: 'stored-cluster-definitions', sourceWatermarkMs: null,
    view: 'overview', generationId: GENERATION_A, snapshotSequence: 1,
    generatedAtMs: NOW, sourceObservedAtMs: NOW - 1000, totalCount: count,
    ...overrides,
  };
  const descriptor = {
    ...metadata, pageCount: Math.max(1, Math.ceil(count / SUMMARY_PAGE_SIZE)), manifestKey: generationManifestKey(metadata.generationId),
  };
  const pages = [];
  for (let pageIndex = 0; pageIndex < descriptor.pageCount; pageIndex++) {
    const offset = pageIndex * SUMMARY_PAGE_SIZE;
    const items = Array.from({ length: Math.min(SUMMARY_PAGE_SIZE, count - offset) }, (_, index) => item(offset + index));
    const text = JSON.stringify({ ...metadata, pageIndex, items });
    const key = generationPageKey(metadata.generationId, pageIndex);
    pages.push({ key, count: items.length, sha256: await sha256Hex(text), byteLength: encoder.encode(text).byteLength });
    objects.set(key, text);
  }
  const manifest = { ...descriptor, pageSize: SUMMARY_PAGE_SIZE, pages, cursorSecret: 'b'.repeat(64) };
  objects.set(descriptor.manifestKey, JSON.stringify(manifest));
  return { descriptor, manifest };
}

function publish(descriptor, history = []) {
  objects.set(SUMMARY_POINTER_KEY, JSON.stringify({ schemaVersion: SUMMARY_SCHEMA_VERSION, current: descriptor, history }));
}

async function call(query = '') {
  const response = await onRequestGet({ request: new Request(`https://example.com/api/cluster-summaries${query}`), env });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  return { response, body: await response.json() };
}
const withCursor = cursor => `?cursor=${encodeURIComponent(cursor)}`;
function editClaims(cursor, edit) {
  const [payload, signature] = cursor.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  edit(claims);
  return `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
}
async function rewritePage(fixture, index, edit) {
  const entry = fixture.manifest.pages[index];
  const page = JSON.parse(objects.get(entry.key));
  edit(page);
  const text = JSON.stringify(page);
  objects.set(entry.key, text);
  entry.byteLength = encoder.encode(text).byteLength;
  entry.sha256 = await sha256Hex(text);
  objects.set(fixture.descriptor.manifestKey, JSON.stringify(fixture.manifest));
}

describe('bounded committed cluster summaries', () => {
  it('returns the default page with explicit stored-data provenance and no internal fields', async () => {
    const fixture = await generation(); publish(fixture.descriptor);
    const { response, body } = await call('?view=overview&limit=100');
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ schemaVersion: 2, source: 'stored-cluster-definitions', sourceWatermarkMs: null,
      view: 'overview', generationId: GENERATION_A, snapshotSequence: 1, totalCount: 450, stale: false });
    expect(body.items).toEqual(Array.from({ length: 100 }, (_, index) => item(index)));
    expect(body.nextCursor.length).toBeLessThanOrEqual(256);
    expect(JSON.stringify(body)).not.toMatch(/cursorSecret|earthquakeIds|manifestKey|pageCount/);
    expect(env.GEOJSON_BUCKET.get.mock.calls.map(([key]) => key)).toEqual([
      SUMMARY_POINTER_KEY, fixture.descriptor.manifestKey, generationPageKey(GENERATION_A, 0),
    ]);
    expect(env.DB.prepare).not.toHaveBeenCalled(); expect(env.CLUSTER_KV.get).not.toHaveBeenCalled();
  });

  it('reads at most two bounded storage pages and paginates without skipped or repeated rows', async () => {
    const fixture = await generation(); publish(fixture.descriptor);
    let query = '?limit=150';
    const ids = [];
    do {
      env.GEOJSON_BUCKET.get.mockClear();
      const { response, body } = await call(query);
      expect(response.status).toBe(200);
      expect(body.items.length).toBeLessThanOrEqual(150);
      expect(env.GEOJSON_BUCKET.get.mock.calls.length).toBeLessThanOrEqual(4);
      ids.push(...body.items.map(row => row.id));
      query = body.nextCursor ? withCursor(body.nextCursor) : '';
    } while (query);
    expect(ids).toEqual(Array.from({ length: 450 }, (_, index) => item(index).id));
  });

  it('continues the retained committed generation after a new publication', async () => {
    const first = await generation(); publish(first.descriptor);
    const { body: page1 } = await call();
    const newer = await generation(300, { generationId: GENERATION_B, snapshotSequence: 2 });
    publish(newer.descriptor, [first.descriptor]);
    const { body: page2, response } = await call(withCursor(page1.nextCursor));
    expect(response.status).toBe(200);
    expect(page2.generationId).toBe(GENERATION_A);
    expect(page2.items[0]).toEqual(item(100));
    expect((await call()).body.generationId).toBe(GENERATION_B);
  });

  it('distinguishes a published empty set from missing publication', async () => {
    expect((await call()).response.status).toBe(503);
    const fixture = await generation(0); publish(fixture.descriptor);
    const { body, response } = await call();
    expect(response.status).toBe(200); expect(body).toMatchObject({ items: [], totalCount: 0, nextCursor: null });
  });

  it('keeps old current snapshots pageable and visibly stale without renewing cursor age', async () => {
    const fixture = await generation(450, { generatedAtMs: NOW - 3 * SUMMARY_MAX_AGE_MS, sourceObservedAtMs: NOW - 3 * SUMMARY_MAX_AGE_MS });
    publish(fixture.descriptor);
    const { body: first } = await call();
    expect(first.stale).toBe(true); expect(first.generatedAtMs).toBe(fixture.descriptor.generatedAtMs);
    vi.spyOn(Date, 'now').mockReturnValue(NOW + SUMMARY_MAX_AGE_MS - 1);
    const { body: second, response } = await call(withCursor(first.nextCursor));
    expect(response.status).toBe(200); expect(second.stale).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(NOW + SUMMARY_MAX_AGE_MS + 1);
    const expired = await call(withCursor(second.nextCursor));
    expect(expired.response.status).toBe(410); expect(expired.body.code).toBe('GENERATION_EXPIRED');
  });

  it('expires an old retired generation instead of switching pages to current', async () => {
    const first = await generation(450, { generatedAtMs: NOW - SUMMARY_MAX_AGE_MS - 1, sourceObservedAtMs: NOW - SUMMARY_MAX_AGE_MS - 1 });
    publish(first.descriptor);
    const { body } = await call();
    const newer = await generation(2, { generationId: GENERATION_B, snapshotSequence: 2 });
    publish(newer.descriptor, [first.descriptor]);
    const result = await call(withCursor(body.nextCursor));
    expect(result.response.status).toBe(410); expect(result.body.code).toBe('GENERATION_EXPIRED');
  });

  it('never reads a staged manifest that is not in committed pointer history', async () => {
    const staged = await generation(); publish(staged.descriptor);
    const { body } = await call();
    const committed = await generation(2, { generationId: GENERATION_B, snapshotSequence: 2 });
    publish(committed.descriptor);
    env.GEOJSON_BUCKET.get.mockClear();
    const result = await call(withCursor(body.nextCursor));
    expect(result.response.status).toBe(410);
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledExactlyOnceWith(SUMMARY_POINTER_KEY);
  });

  it('keeps a cross-page slice of large UTF-8 items within the response byte budget', async () => {
    const fixture = await generation(); publish(fixture.descriptor);
    for (let index = 0; index < fixture.manifest.pages.length; index++) {
      await rewritePage(fixture, index, page => { page.items.forEach(row => { row.locationName = 'é'.repeat(1000); }); });
    }
    const first = await call('?limit=150');
    expect(first.response.status).toBe(200);
    const second = await call(withCursor(first.body.nextCursor));
    expect(second.response.status).toBe(200);
    expect(second.body.items).toHaveLength(150);
    expect(encoder.encode(JSON.stringify(second.body)).byteLength).toBeLessThanOrEqual(MAX_SUMMARY_PAGE_BYTES);
  });

  it('serves the actual publisher output from migrated SQLite, filtering before pagination without legacy bytes', async () => {
    const sqlite = createClusterSqliteFixture();
    try {
      const insert = sqlite.database.prepare(`INSERT INTO ClusterDefinitions
        (id, slug, title, locationName, quakeCount, maxMagnitude, startTime, endTime, strongestQuakeId, earthquakeIds, version)
        VALUES (?, ?, 'Stored title', 'Stored place', 3, ?, ?, ?, 'quake1', ?, ?)`);
      const hugeLegacyVersion = '1.0' + '1'.repeat(20_000);
      for (let index = 0; index < 250; index++) insert.run(`ineligible-${index}`, `ineligible-${index}`, 4, NOW - 1000, NOW, '["quake1"]', hugeLegacyVersion);
      for (let index = 0; index < 205; index++) insert.run(item(index).id, item(index).slug, 5, NOW - 1000, NOW, '["quake1","quake2","quake3"]', hugeLegacyVersion);
      insert.run('historical', 'historical', 6, NOW - 32 * 86400_000, NOW - 31 * 86400_000, '[]', hugeLegacyVersion);
      const bucket = createMemorySummaryBucket();
      await publishClusterSummarySnapshot({ DB: sqlite.db, GEOJSON_BUCKET: bucket }, { now: NOW, randomUUID: () => GENERATION_A });
      expect(sqlite.queries).toHaveLength(1);
      expect(sqlite.queries[0].sql).not.toMatch(/earthquakeIds|version/);
      env.GEOJSON_BUCKET = bucket;
      const first = await call('?limit=200');
      expect(first.response.status).toBe(200); expect(first.body.totalCount).toBe(205);
      expect(first.body.items.map(row => row.id)).toEqual(Array.from({ length: 200 }, (_, index) => item(index).id));
      const last = await call(withCursor(first.body.nextCursor));
      expect(last.response.status).toBe(200); expect(last.body.items).toHaveLength(5); expect(last.body.nextCursor).toBeNull();
      expect(sqlite.queries).toHaveLength(1);
      expect(env.DB.prepare).not.toHaveBeenCalled(); expect(env.CLUSTER_KV.get).not.toHaveBeenCalled();
      expect(JSON.stringify(first.body)).not.toContain(hugeLegacyVersion);
    } finally { sqlite.database.close(); }
  });
});

describe('summary request and cursor validation', () => {
  it.each(['?limit=0', '?limit=-1', '?limit=201', '?limit=1.5', '?limit=01', '?limit=1e2', '?limit=',
    '?view=all', '?view=', '?limit=100&limit=100', '?unknown=x', '?cursor=', '?cursor=x&view=overview',
    `?cursor=${'a'.repeat(257)}`, '?cursor=../current.json', '?cursor=abc.%%%'])('rejects %s before any storage work', async query => {
    const result = await call(query);
    expect(result.response.status).toBe(400); expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled();
  });

  it.each([1, 200])('accepts the bounded limit %i', async limit => {
    const fixture = await generation(201); publish(fixture.descriptor);
    const result = await call(`?limit=${limit}`);
    expect(result.response.status).toBe(200); expect(result.body.items).toHaveLength(limit);
  });

  it('rejects valid-shaped cursor tampering through HMAC before reading pages', async () => {
    const fixture = await generation(); publish(fixture.descriptor);
    const { body } = await call();
    const tampered = editClaims(body.nextCursor, claims => { claims[2] = 200; });
    env.GEOJSON_BUCKET.get.mockClear();
    const result = await call(withCursor(tampered));
    expect(result.response.status).toBe(400); expect(result.body.code).toBe('INVALID_CURSOR');
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledTimes(2);
  });

  it.each([
    claims => { claims[0] = 99; }, claims => { claims[2] = -1; }, claims => { claims[2] = MAX_SUMMARY_ITEMS; },
    claims => { claims[3] = 201; }, claims => { claims[4] = 'all'; }, claims => { claims[5] = 2; },
    claims => { claims[6] = NOW + 60_001; }, claims => { claims.push('extra'); },
  ])('rejects invalid cursor claims before storage (case %#)', async edit => {
    const fixture = await generation(); publish(fixture.descriptor);
    const { body } = await call();
    env.GEOJSON_BUCKET.get.mockClear();
    expect((await call(withCursor(editClaims(body.nextCursor, edit)))).response.status).toBe(400);
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled();
  });
});

describe('summary storage validation', () => {
  it.each(['pointer', 'manifest', 'page'])('returns unavailable for missing %s', async target => {
    const fixture = await generation(); publish(fixture.descriptor);
    objects.delete(target === 'pointer' ? SUMMARY_POINTER_KEY : target === 'manifest' ? fixture.descriptor.manifestKey : fixture.manifest.pages[0].key);
    const result = await call();
    expect(result.response.status).toBe(503); expect(result.body).toEqual({ code: 'SUMMARY_UNAVAILABLE' });
  });

  it('does not expose storage errors or interpret them as empty data', async () => {
    env.GEOJSON_BUCKET.get.mockRejectedValue(new Error('sensitive internal storage message'));
    const result = await call();
    expect(result.response.status).toBe(503); expect(result.body).toEqual({ code: 'SUMMARY_UNAVAILABLE' });
  });

  it('rejects a page whose bytes no longer match its committed hash', async () => {
    const fixture = await generation(); publish(fixture.descriptor);
    const key = fixture.manifest.pages[0].key;
    objects.set(key, objects.get(key).replace('Example', 'Changed'));
    expect((await call()).response.status).toBe(503);
  });

  it.each([
    page => { page.generationId = GENERATION_B; }, page => { page.items.pop(); },
    page => { page.totalCount++; }, page => { page.pageIndex = 1; },
    page => { page.items[0].earthquakeIds = ['forbidden-membership']; },
  ])('rejects invalid page metadata/content even with updated hash (case %#)', async edit => {
    const fixture = await generation(); publish(fixture.descriptor);
    await rewritePage(fixture, 0, edit);
    expect((await call()).response.status).toBe(503);
  });

  it.each([
    manifest => { manifest.totalCount = MAX_SUMMARY_ITEMS + 1; },
    manifest => { manifest.pages[0].key = 'arbitrary-other-r2-object.json'; },
    manifest => { manifest.pages[0].count = 201; }, manifest => { manifest.pages.pop(); },
    manifest => { manifest.snapshotSequence++; },
  ])('rejects invalid manifest before reading pages (case %#)', async edit => {
    const fixture = await generation(); publish(fixture.descriptor);
    edit(fixture.manifest); objects.set(fixture.descriptor.manifestKey, JSON.stringify(fixture.manifest));
    const result = await call(); expect(result.response.status).toBe(503);
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledTimes(2);
  });

  it('enforces actual streamed bytes as well as R2 size metadata', async () => {
    const fixture = await generation(); publish(fixture.descriptor);
    const realGet = env.GEOJSON_BUCKET.get.getMockImplementation();
    const cancel = vi.fn();
    env.GEOJSON_BUCKET.get.mockImplementation(async key => key === fixture.manifest.pages[0].key
      ? { size: 100, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_SUMMARY_PAGE_BYTES + 1)); }, cancel }) }
      : realGet(key));
    expect((await call()).response.status).toBe(503); expect(cancel).toHaveBeenCalled();
  });

  it('checks UTF-8 bytes instead of character count', async () => {
    const fixture = await generation(); publish(fixture.descriptor);
    const key = fixture.manifest.pages[0].key;
    objects.set(key, '🌍'.repeat(MAX_SUMMARY_PAGE_BYTES / 3));
    expect((await call()).response.status).toBe(503);
  });

  it('validates empty generation page existence instead of manufacturing an empty success', async () => {
    const fixture = await generation(0); publish(fixture.descriptor);
    objects.delete(fixture.manifest.pages[0].key);
    expect((await call()).response.status).toBe(503);
  });

  it.each(['generatedAtMs', 'sourceObservedAtMs'])('rejects %s more than five minutes in the future', async field => {
    const overrides = { generatedAtMs: NOW + 300_001 };
    if (field === 'sourceObservedAtMs') overrides.sourceObservedAtMs = NOW + 300_001;
    const fixture = await generation(1, overrides); publish(fixture.descriptor);
    expect((await call()).response.status).toBe(503);
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledExactlyOnceWith(SUMMARY_POINTER_KEY);
  });

  it('accepts the explicit five-minute snapshot clock-skew boundary', async () => {
    const fixture = await generation(1, { generatedAtMs: NOW + 300_000, sourceObservedAtMs: NOW + 300_000 });
    publish(fixture.descriptor);
    expect((await call()).response.status).toBe(200);
  });

  it('rejects cross-page ordering/identity corruption even when both page hashes verify', async () => {
    const fixture = await generation(); publish(fixture.descriptor);
    const first = await call('?limit=150');
    await rewritePage(fixture, 1, page => { page.items[0] = item(199); });
    expect((await call(withCursor(first.body.nextCursor))).response.status).toBe(503);
  });
});
