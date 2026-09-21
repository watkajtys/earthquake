// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleUsgsProxy } from '../routes/api/usgs-proxy.js';
import { USGS_SUMMARY_URLS } from '../utils/usgs-transport.js';
import { usgsCollection } from '../test-fixtures/usgs.js';

let cache;
let context;
const requestFor = (url = USGS_SUMMARY_URLS.hour, suffix = '', method = 'GET') => new Request(`https://example.test/api/usgs-proxy?apiUrl=${encodeURIComponent(url)}${suffix}`, { method });
beforeEach(() => {
  cache = { match: vi.fn(), put: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal('caches', { default: cache });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(usgsCollection())));
  context = {
    request: requestFor(),
    env: { DB: { prepare: vi.fn(), batch: vi.fn() }, USGS_LAST_RESPONSE_KV: { get: vi.fn(), put: vi.fn(), getWithMetadata: vi.fn() }, GEOJSON_QUEUE: { send: vi.fn() } },
    executionContext: { waitUntil: vi.fn() },
  };
});
afterEach(() => vi.unstubAllGlobals());

describe('public USGS proxy', () => {
  it('returns the original feed without any D1, checkpoint, statistic, or queue operations', async () => {
    const response = await handleUsgsProxy(context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(usgsCollection());
    expect(context.env.DB.prepare).not.toHaveBeenCalled();
    expect(context.env.DB.batch).not.toHaveBeenCalled();
    expect(context.env.USGS_LAST_RESPONSE_KV.get).not.toHaveBeenCalled();
    expect(context.env.USGS_LAST_RESPONSE_KV.put).not.toHaveBeenCalled();
    expect(context.env.USGS_LAST_RESPONSE_KV.getWithMetadata).not.toHaveBeenCalled();
    expect(context.env.GEOJSON_QUEUE.send).not.toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it.each(['&isCron=true', '&isCron=false', '&apiUrl=another', '&extra=1'])('rejects unsupported selectors before any upstream/cache work: %s', async (suffix) => {
    context.request = requestFor(USGS_SUMMARY_URLS.hour, suffix);
    expect((await handleUsgsProxy(context)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.match).not.toHaveBeenCalled();
  });

  it('rejects an arbitrary destination before cache lookup', async () => {
    context.request = requestFor('https://attacker.example/payload');
    const response = await handleUsgsProxy(context);
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.match).not.toHaveBeenCalled();
  });

  it('preserves the missing URL error', async () => {
    context.request = new Request('https://example.test/api/usgs-proxy');
    const response = await handleUsgsProxy(context);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Missing apiUrl query parameter for proxy request');
  });

  it('uses a canonical, versioned cache key and does not retain upstream encodings/cookies/length', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify(usgsCollection()), { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '1000', 'Set-Cookie': 'private=1' } }));
    context.env.WORKER_CACHE_DURATION_SECONDS = '300';
    const response = await handleUsgsProxy(context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('s-maxage=300');
    for (const header of ['Content-Encoding', 'Content-Length', 'Set-Cookie']) expect(response.headers.get(header)).toBeNull();
    const key = new URL(cache.match.mock.calls[0][0]);
    expect(key.searchParams.get('cacheVersion')).toBe('2');
    expect(key.searchParams.get('apiUrl')).toBe(USGS_SUMMARY_URLS.hour);
    expect(cache.put.mock.calls[0][0]).toBe(key.href);
  });

  it('serves a cache hit without an upstream request', async () => {
    cache.match.mockResolvedValue(Response.json(usgsCollection()));
    expect((await handleUsgsProxy(context)).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('continues when Cache API reads/writes fail', async () => {
    cache.match.mockRejectedValue(new Error('unavailable'));
    cache.put.mockRejectedValue(new Error('unavailable'));
    expect((await handleUsgsProxy(context)).status).toBe(200);
    await Promise.all(context.executionContext.waitUntil.mock.calls.map(([promise]) => promise));
  });

  it('rejects methods other than GET and HEAD and returns HEAD without a body', async () => {
    context.request = requestFor(USGS_SUMMARY_URLS.hour, '', 'POST');
    const rejected = await handleUsgsProxy(context);
    expect(rejected.status).toBe(405);
    expect(rejected.headers.get('Allow')).toBe('GET, HEAD');
    expect(fetch).not.toHaveBeenCalled();
    context.request = requestFor(USGS_SUMMARY_URLS.hour, '', 'HEAD');
    expect(await (await handleUsgsProxy(context)).text()).toBe('');
  });

  it('returns sanitized, uncacheable upstream errors', async () => {
    fetch.mockResolvedValue(new Response('private upstream diagnostics', { status: 500 }));
    const response = await handleUsgsProxy(context);
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('private upstream diagnostics');
    expect(cache.put).not.toHaveBeenCalled();
  });
});
