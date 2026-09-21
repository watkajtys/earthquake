import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLegacyStaticAsset } from './legacyStaticAssets.js';
import { PREVIOUS_RELEASE_ASSETS } from './previousReleaseAssets.js';

const javascript = Object.entries(PREVIOUS_RELEASE_ASSETS).find(([path]) => path.endsWith('.js'));
const stylesheet = Object.entries(PREVIOUS_RELEASE_ASSETS).find(([path]) => path.endsWith('.css'));
let env;
function stored(asset, overrides = {}) {
  return {
    size: asset.byteLength, customMetadata: { sha256: asset.sha256 },
    httpMetadata: { contentType: asset.contentType },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('archived bytes')); controller.close(); } }),
    ...overrides,
  };
}
const request = (path, options) => new Request(`https://example.com${path}`, options);
beforeEach(() => {
  env = { GEOJSON_BUCKET: { get: vi.fn(), head: vi.fn() }, STATIC_KV: { get: vi.fn() } };
});
afterEach(() => vi.restoreAllMocks());

describe('exact previous-release asset archive', () => {
  it('has only bounded content-addressed JS/CSS map entries', () => {
    expect(javascript).toBeDefined(); expect(stylesheet).toBeDefined();
    for (const [path, asset] of Object.entries(PREVIOUS_RELEASE_ASSETS)) {
      expect(path).toMatch(/^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/);
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.key).toBe(`static-assets/v1/${asset.sha256}`);
      expect(asset.byteLength).toBeGreaterThan(0);
      expect(asset.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
      expect(asset.contentType.split(';')[0]).toBe(path.endsWith('.css') ? 'text/css' : 'application/javascript');
    }
  });

  it.each([['JavaScript', () => javascript], ['CSS', () => stylesheet]])('streams mapped %s with correct immutable metadata', async (_, pick) => {
    const [path, asset] = pick();
    env.GEOJSON_BUCKET.get.mockResolvedValue(stored(asset));
    const response = await handleLegacyStaticAsset(request(path), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(asset.contentType);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('Content-Length')).toBe(String(asset.byteLength));
    expect(response.headers.get('ETag')).toBe(`"sha256-${asset.sha256}"`);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await response.text()).toBe('archived bytes');
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledExactlyOnceWith(asset.key);
    expect(env.STATIC_KV.get).not.toHaveBeenCalled();
  });

  it('works in preview without the August STATIC_KV binding', async () => {
    const [path, asset] = javascript;
    delete env.STATIC_KV;
    env.GEOJSON_BUCKET.get.mockResolvedValue(stored(asset));
    expect((await handleLegacyStaticAsset(request(path), env)).status).toBe(200);
  });

  it('uses metadata-only HEAD with no body', async () => {
    const [path, asset] = javascript;
    env.GEOJSON_BUCKET.head.mockResolvedValue(stored(asset, { body: undefined }));
    const response = await handleLegacyStaticAsset(request(path, { method: 'HEAD' }), env);
    expect(response.status).toBe(200); expect(response.body).toBeNull();
    expect(response.headers.get('Content-Type')).toBe(asset.contentType);
    expect(response.headers.get('Content-Length')).toBe(String(asset.byteLength));
    expect(env.GEOJSON_BUCKET.head).toHaveBeenCalledExactlyOnceWith(asset.key);
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled();
  });

  it.each(['matching', 'weak matching', 'list matching', 'wildcard'])('honors %s conditional requests without returning the object body', async kind => {
    const [path, asset] = javascript;
    const tag = `"sha256-${asset.sha256}"`;
    const condition = kind === 'matching' ? tag : kind === 'weak matching' ? `W/${tag}` : kind === 'list matching' ? `"other", ${tag}` : '*';
    env.GEOJSON_BUCKET.get.mockResolvedValue(stored(asset));
    const response = await handleLegacyStaticAsset(request(path, { headers: { 'If-None-Match': condition } }), env);
    expect(response.status).toBe(304); expect(response.body).toBeNull();
    expect(response.headers.get('ETag')).toBe(tag);
    expect(response.headers.get('Cache-Control')).toContain('immutable');
  });

  it.each([
    ['missing object', () => null],
    ['wrong size', asset => stored(asset, { size: asset.byteLength + 1 })],
    ['oversized', asset => stored(asset, { size: 9 * 1024 * 1024 })],
    ['missing digest', asset => stored(asset, { customMetadata: {} })],
    ['wrong digest', asset => stored(asset, { customMetadata: { sha256: '0'.repeat(64) } })],
    ['HTML object', asset => stored(asset, { httpMetadata: { contentType: 'text/html' } })],
    ['missing body', asset => stored(asset, { body: undefined })],
  ])('returns truthful no-store 503 for %s instead of permitting SPA fallback', async (_, object) => {
    const [path, asset] = javascript;
    env.GEOJSON_BUCKET.get.mockResolvedValue(object(asset));
    const response = await handleLegacyStaticAsset(request(path), env);
    expect(response).not.toBeNull(); expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).not.toContain('javascript');
    expect(env.STATIC_KV.get).not.toHaveBeenCalled();
  });

  it('hides storage exception details', async () => {
    env.GEOJSON_BUCKET.get.mockRejectedValue(new Error('private internal failure'));
    const response = await handleLegacyStaticAsset(request(javascript[0]), env);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('Previous release asset unavailable.');
  });

  it('reports a missing archive binding without falling through', async () => {
    delete env.GEOJSON_BUCKET;
    const response = await handleLegacyStaticAsset(request(javascript[0]), env);
    expect(response.status).toBe(503);
  });

  it.each(['/', '/index.html', '/assets/unknown-12345678.js', '/assets/unknown.css',
    '/static-assets/v1/private', '/assets/%2e%2e/private.json', '/api/cluster-summaries'])('never queries either store for unmapped %s', async path => {
    expect(await handleLegacyStaticAsset(request(path), env)).toBeNull();
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled(); expect(env.GEOJSON_BUCKET.head).not.toHaveBeenCalled();
    expect(env.STATIC_KV.get).not.toHaveBeenCalled();
  });

  it('does not interpret a query parameter as an alternate archive key', async () => {
    const [path, asset] = javascript;
    env.GEOJSON_BUCKET.get.mockResolvedValue(stored(asset));
    expect((await handleLegacyStaticAsset(request(`${path}?key=private.json`), env)).status).toBe(200);
    expect(env.GEOJSON_BUCKET.get).toHaveBeenCalledExactlyOnceWith(asset.key);
  });

  it('ignores non-read methods without touching storage', async () => {
    expect(await handleLegacyStaticAsset(request(javascript[0], { method: 'POST' }), env)).toBeNull();
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled(); expect(env.GEOJSON_BUCKET.head).not.toHaveBeenCalled();
  });

  it('retains the exact August KV compatibility path', async () => {
    env.STATIC_KV.get.mockResolvedValue('August asset');
    const response = await handleLegacyStaticAsset(request('/assets/index-CPiVOLY-.css'), env);
    expect(response.status).toBe(200); expect(await response.text()).toBe('August asset');
    expect(env.STATIC_KV.get).toHaveBeenCalledExactlyOnceWith('assets/index-CPiVOLY-.1e3382384a.css');
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled();
  });
});
