// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { usgsFeature } from '../functions/test-fixtures/usgs.js';
import { USGS_LIMITS } from '../functions/utils/usgs-transport.js';

const slug = '3-quakes-near-local-test-m6.3-12345-40d0--100d0';
let env;
let queries;
let earthquakeRow;
const earthquakeRowBase = id => ({
  id, event_time: 1750000000000, latitude: 2, longitude: 1,
  depth: 3, magnitude: -0.5, place: 'Test place',
});
beforeEach(() => {
  queries = [];
  earthquakeRow = earthquakeRowBase;
  env = {
    ASSETS: { fetch: vi.fn(async () => new Response('<html><head><script type="module" crossorigin src="/assets/index-built.js"></script><link rel="stylesheet" href="/assets/index-built.css"></head></html>')) },
    DB: { prepare: vi.fn((sql) => ({ bind(value) { queries.push({ sql, value }); return { first: async () => sql.includes('FROM EarthquakeEvents') ? earthquakeRow(value)
      : sql.includes('WHERE slug = ?') && value === slug ? {
      id: 'canonical-cluster', slug, strongestQuakeId: 'us123', quakeCount: 3, maxMagnitude: null, locationName: 'Test', updatedAt: '1750000000000', earthquakeIds: '["us123"]',
    } : null, all: async () => ({ results: [{ id: 'us123', magnitude: null, place: 'Test', event_time: 1750000000000, longitude: 1, latitude: 2, depth: 3 }] }) }; } })) },
  };
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const id = String(url).split('/').at(-1).replace('.geojson', '');
    return Response.json(usgsFeature(id, { mag: -0.5 }));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const crawler = (path) => worker.fetch(new Request(`https://example.test${path}`, { headers: { 'User-Agent': 'Googlebot' } }), env, { waitUntil: vi.fn() });
const archivedObject = (data) => ({
  body: new Response(JSON.stringify(data, null, 2)).body,
  httpEtag: '"stored-detail-etag"',
  writeHttpMetadata: (headers) => headers.set('Cache-Control', 'public, max-age=300'),
});

describe('exported Worker entity routes', () => {
  it.each([
    ['/quake/m-0.5-test-place-nc123', 'nc123'], ['/quake/munknown-test-place-nc123', 'nc123'],
    ['/quake/nc123', 'nc123'], ['/quake/us-test_1', 'us-test_1'], ['/quake/id/us-test_1', 'us-test_1'],
    [`/quake/${encodeURIComponent('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/nc123.geojson')}`, 'nc123'],
  ])('resolves crawler quake path %s to %s', async (path, id) => {
    const response = await crawler(path);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain(`https://earthquakeslive.com/quake/id/${id}`);
    expect(html).toContain('/assets/index-built.js');
    expect(html).not.toContain('/src/main.jsx');
    expect(queries).toHaveLength(1);
    expect(queries[0].value).toBe(id);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['/quake/%E0%A4%A', '/quake/%252F', `/quake/${encodeURIComponent('https://attacker.example/quake.geojson')}`])('rejects malformed/foreign quake path %s before upstream work', async (path) => {
    expect((await crawler(path)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('resolves generated cluster slugs exactly, without an upstream request or slug reconstruction', async () => {
    const response = await crawler(`/cluster/${slug}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(queries[0].value).toBe(slug);
    expect(queries).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(html).toContain(`https://earthquakeslive.com/cluster/${slug}`);
    expect(html).toContain('Maximum magnitude: unknown');
    expect(html).toContain('/assets/index-built.css');
  });
  it('reads the synthetic preview earthquake from R2 for both crawler and JSON routes without upstream work or writes', async () => {
    const data = usgsFeature('previewquake001', { place: 'SYNTHETIC PREVIEW California' });
    env.GEOJSON_BUCKET = { get: vi.fn(async () => archivedObject(data)), put: vi.fn() };
    env.GEOJSON_QUEUE = { send: vi.fn() };
    const waitUntil = vi.fn();
    const response = await worker.fetch(new Request('https://example.test/quake/id/previewquake001', { headers: { 'User-Agent': 'Googlebot' } }), env, { waitUntil });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('SYNTHETIC PREVIEW California');
    expect(html).toContain('<body><div id="root"><main>');
    expect(html).toContain('</main></div></body>');
    expect(html).not.toContain('</main><div id="root">');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const json = await worker.fetch(new Request('https://example.test/api/earthquake/previewquake001', { headers: { 'User-Agent': 'Mozilla/5.0' } }), env, { waitUntil });
    expect(json.status).toBe(200);
    expect(json.headers.get('X-Data-Source')).toBe('R2-Storage');
    expect(json.headers.get('ETag')).toBe('"stored-detail-etag"');
    expect(json.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(await json.text()).toBe(JSON.stringify(data, null, 2));
    expect(env.GEOJSON_BUCKET.get).toHaveBeenNthCalledWith(1, 'previewquake001.json');
    expect(fetch).not.toHaveBeenCalled();
    expect(env.DB.prepare).toHaveBeenCalledTimes(2);
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
    expect(env.GEOJSON_QUEUE.send).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });
  it('resolves a committed immutable pointer for crawler and JSON detail reads', async () => {
    const key = `details/v1/us123/1750000003000/${'a'.repeat(64)}.json`;
    const data = usgsFeature('us123', { place: 'Committed detail', updated: 1750000003000 });
    earthquakeRow = id => ({ ...earthquakeRowBase(id), source_updated_at_ms: 1750000003000,
      detail_archive_revision_ms: 1750000003000, detail_archive_key: key });
    env.GEOJSON_BUCKET = { get: vi.fn(async requested => requested === key ? archivedObject(data) : null) };
    const html = await (await crawler('/quake/id/us123')).text();
    const json = await worker.fetch(new Request('https://example.test/api/earthquake/us123', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }), env, { waitUntil: vi.fn() });
    expect(html).toContain('Committed detail');
    expect(json.status).toBe(200);
    expect(json.headers.get('X-Data-Source')).toBe('R2-Storage');
    expect((await json.json()).properties.place).toBe('Committed detail');
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledTimes(2);
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledWith(key);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    `details/v1/other123/1750000003000/${'a'.repeat(64)}.json`,
    `details/v1/us123/1750000002000/${'a'.repeat(64)}.json`,
    'details/v1/us123/1750000003000/not-a-hash.json',
    'details/v1/us123/1750000003000/../../other123.json',
    '',
  ])('rejects a corrupt D1 archive pointer before any R2 or upstream read: %s', async key => {
    earthquakeRow = id => ({ ...earthquakeRowBase(id), source_updated_at_ms: 1750000003000,
      detail_archive_revision_ms: 1750000003000, detail_archive_key: key });
    env.GEOJSON_BUCKET = { get: vi.fn() };
    const response = await crawler('/quake/id/us123');
    expect(response.status).toBe(502);
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects stale legacy R2 science and keeps crawler on D1 without upstream work', async () => {
    earthquakeRow = id => ({ ...earthquakeRowBase(id), place: 'Current D1 place',
      source_updated_at_ms: 1750000003000 });
    env.GEOJSON_BUCKET = { get: vi.fn(async () => archivedObject(usgsFeature('us123', {
      place: 'Stale archive place', updated: 1750000001000,
    }))), put: vi.fn() };
    const html = await (await crawler('/quake/id/us123')).text();
    expect(html).toContain('Current D1 place');
    expect(html).not.toContain('Stale archive place');
    expect(fetch).not.toHaveBeenCalled();
    const json = await worker.fetch(new Request('https://example.test/api/earthquake/us123', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }), env, { waitUntil: vi.fn() });
    expect(json.status).toBe(503);
    expect(fetch).toHaveBeenCalledOnce();
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });
  it('accepts a stored official alias and uses its canonical earthquake ID', async () => {
    env.GEOJSON_BUCKET = { get: vi.fn(async () => archivedObject(usgsFeature('canonical123', { ids: ',canonical123,alias123,' }))) };
    const response = await crawler('/quake/id/alias123');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('https://earthquakeslive.com/quake/id/canonical123');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['mismatch', 'invalid JSON', 'oversized declaration', 'oversized stream'])('rejects %s in archived detail without falling through to upstream', async failure => {
    const object = failure === 'mismatch' ? archivedObject(usgsFeature('other123'))
      : failure === 'invalid JSON' ? { body: new Response('{broken').body }
        : failure === 'oversized declaration' ? { ...archivedObject(usgsFeature('us123')), size: USGS_LIMITS.detailBytes + 1 }
          : { body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(USGS_LIMITS.detailBytes + 1)); controller.close(); } }) };
    env.GEOJSON_BUCKET = { get: vi.fn(async () => object), put: vi.fn() };
    const response = await crawler('/quake/id/us123');
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('Earthquake details unavailable');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });
  it('bounds a stalled archive lookup with a controlled timeout', async () => {
    vi.useFakeTimers();
    env.GEOJSON_BUCKET = { get: vi.fn(() => new Promise(() => {})) };
    const pending = crawler('/quake/id/us123');
    await vi.advanceTimersByTimeAsync(USGS_LIMITS.timeoutMs);
    expect((await pending).status).toBe(504);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('renders stored D1 summary on an archive miss without upstream work or writes', async () => {
    env.GEOJSON_BUCKET = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };
    const response = await crawler('/quake/id/us123');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('M -0.5 Earthquake');
    expect(queries).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
    expect(env.GEOJSON_BUCKET.put).not.toHaveBeenCalled();
  });
  it('keeps the JSON detail route upstream fallback for an archive miss', async () => {
    env.GEOJSON_BUCKET = { get: vi.fn().mockResolvedValue(null) };
    delete env.DB;
    const response = await worker.fetch(new Request('https://example.test/api/earthquake/us123', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }), env, { waitUntil: vi.fn() });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Data-Source')).toBe('USGS-API');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('returns 404 for a missing archived and stored earthquake without an upstream request', async () => {
    env.GEOJSON_BUCKET = { get: vi.fn().mockResolvedValue(null) };
    earthquakeRow = () => null;
    const response = await crawler('/quake/id/us123');
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns a retryable error when the D1 summary is unavailable or invalid', async () => {
    env.GEOJSON_BUCKET = { get: vi.fn().mockResolvedValue(null) };
    delete env.DB;
    expect((await crawler('/quake/id/us123')).status).toBe(503);
    env.DB = { prepare: vi.fn(() => { throw new Error('D1 unavailable'); }) };
    expect((await crawler('/quake/id/us123')).status).toBe(503);
    env.DB = { prepare: vi.fn(() => ({ bind: () => ({ first: async () => ({ ...earthquakeRow('us123'), latitude: null }) }) })) };
    expect((await crawler('/quake/id/us123')).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns a terminal404 for an unmatched legacy cluster', async () => {
    expect((await crawler('/cluster/overview_cluster_missing_3')).status).toBe(404);
    expect(queries.map(({ value }) => value)).toEqual(['overview_cluster_missing_3','overview_cluster_missing_3','missing']);
  });
  it('routes explicit JSON selectors through the deployed Worker and returns canonical metadata', async () => {
    const response = await worker.fetch(new Request(`https://example.test/api/cluster-detail-with-quakes?route=${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }), env, { waitUntil: vi.fn() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'canonical-cluster', clusterId: 'canonical-cluster', canonicalPath: `/cluster/${slug}`, quakes: [{ id: 'us123' }] });
  });
  it('rejects conflicting JSON selectors before any database query', async () => {
    const response = await worker.fetch(new Request(`https://example.test/api/cluster-detail-with-quakes?slug=${slug}&clusterId=other`, { headers: { 'User-Agent': 'Mozilla/5.0' } }), env, { waitUntil: vi.fn() });
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(queries).toHaveLength(0);
  });
  it('escapes markup in JSON-LD and regular HTML', async () => {
    earthquakeRow = id => ({ id, event_time: 1750000000000, latitude: 2, longitude: 1,
      depth: 3, magnitude: 2, place: '</script><script>bad()</script>' });
    const html = await (await crawler('/quake/id/us123')).text();
    expect(html).not.toContain('<script>bad()');
    expect(html).toContain('\\u003c/script>');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps normal browser routes on the built asset shell and suppresses HEAD bodies', async () => {
    const response = await worker.fetch(new Request(`https://example.test/cluster/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }), env, { waitUntil: vi.fn() });
    expect(response.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalled();
    expect(queries).toHaveLength(0);
    const head = await worker.fetch(new Request('https://example.test/quake/id/us123', { method: 'HEAD', headers: { 'User-Agent': 'Googlebot' } }), env, { waitUntil: vi.fn() });
    expect(await head.text()).toBe('');
    expect(head.headers.get('Cache-Control')).toBe('no-store');
  });
});
