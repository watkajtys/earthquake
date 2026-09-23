// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { onRequestGet as getEarthquakes } from '../functions/api/get-earthquakes.js';
import { onRequestGet as getClusters } from '../functions/api/get-clusters.js';
import { onRequestGet as getClusterSummaries } from '../functions/api/cluster-summaries.js';
import { handleUsgsProxy } from '../functions/routes/api/usgs-proxy.js';
import { handleIndexSitemap } from '../functions/routes/sitemaps/index-sitemap.js';

vi.mock('../functions/api/get-earthquakes.js', () => ({ onRequestGet: vi.fn() }));
vi.mock('../functions/api/get-clusters.js', () => ({ onRequestGet: vi.fn() }));
vi.mock('../functions/api/cluster-summaries.js', () => ({ onRequestGet: vi.fn() }));
vi.mock('../functions/routes/api/usgs-proxy.js', () => ({ handleUsgsProxy: vi.fn() }));
vi.mock('../functions/routes/sitemaps/index-sitemap.js', () => ({ handleIndexSitemap: vi.fn() }));

const makeRequest = (path, init = {}) => new Request(`https://earthquakeslive.com${path}`, {
  ...init,
  headers: { 'User-Agent': 'Mozilla/5.0', ...init.headers },
});

describe('deployed Worker routing', () => {
  let env;
  let ctx;

  it('marks preview responses as non-indexable while preserving their content', async () => {
    env.DEPLOYMENT_ENVIRONMENT = 'preview';
    env.ASSETS.fetch.mockResolvedValue(new Response('preview html', {
      headers: { 'Content-Type': 'text/html', ETag: 'preview-v1' },
    }));
    const response = await worker.fetch(makeRequest('/'), env, ctx);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(response.headers.get('ETag')).toBe('preview-v1');
    expect(await response.text()).toBe('preview html');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    env = { ASSETS: { fetch: vi.fn() } };
    ctx = { waitUntil: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/', '/overview', '/learn/plate-tectonics', '/quake/m5-california-us123', '/cluster/test-slug', '/assets/app-new.js', '/robots.txt'])(
    'delegates %s to the current ASSETS deployment',
    async (path) => {
      const request = makeRequest(path);
      const assetResponse = new Response('asset body', { headers: { ETag: 'current-build' } });
      env.ASSETS.fetch.mockResolvedValue(assetResponse);

      const response = await worker.fetch(request, env, ctx);

      expect(env.ASSETS.fetch).toHaveBeenCalledExactlyOnceWith(request);
      expect(response).toBe(assetResponse);
    },
  );

  it('preserves an asset 304 response without reading or replacing it', async () => {
    const request = makeRequest('/assets/app-new.js', { headers: { 'If-None-Match': 'current-build' } });
    const assetResponse = new Response(null, { status: 304, headers: { ETag: 'current-build' } });
    env.ASSETS.fetch.mockResolvedValue(assetResponse);

    const response = await worker.fetch(request, env, ctx);

    expect(response).toBe(assetResponse);
    expect(env.ASSETS.fetch).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each([
    ['/assets/ClusterDetailModalWrapper-CMK5bsuw.js', 'assets/ClusterDetailModalWrapper-CMK5bsuw.a266bbb4fc.js', 'application/javascript; charset=utf-8'],
    ['/assets/index-CPiVOLY-.css', 'assets/index-CPiVOLY-.1e3382384a.css', 'text/css; charset=utf-8'],
  ])('keeps the previous hashed asset %s available for already-open pages', async (path, kvKey, contentType) => {
    env.STATIC_KV = { get: vi.fn().mockResolvedValue('previous asset') };

    const response = await worker.fetch(makeRequest(path), env, ctx);

    expect(env.STATIC_KV.get).toHaveBeenCalledExactlyOnceWith(kvKey);
    expect(response.headers.get('Content-Type')).toBe(contentType);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(await response.text()).toBe('previous asset');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it.each(['/', '/index.html', '/overview', '/robots.txt', '/assets/new-build.js'])(
    'never reads legacy KV for %s',
    async (path) => {
      env.STATIC_KV = { get: vi.fn().mockResolvedValue('previous asset') };
      const assetResponse = new Response('current frontend');
      env.ASSETS.fetch.mockResolvedValue(assetResponse);
      const request = makeRequest(path);

      expect(await worker.fetch(request, env, ctx)).toBe(assetResponse);
      expect(env.STATIC_KV.get).not.toHaveBeenCalled();
      expect(env.ASSETS.fetch).toHaveBeenCalledExactlyOnceWith(request);
    },
  );

  it('delegates old asset URLs to ASSETS when preview has no legacy KV binding', async () => {
    const request = makeRequest('/assets/ClusterDetailModalWrapper-CMK5bsuw.js');
    const assetResponse = new Response('asset unavailable', { status: 404 });
    env.ASSETS.fetch.mockResolvedValue(assetResponse);

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('asset unavailable');
    expect(env.ASSETS.fetch).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('delegates to ASSETS when an old asset is missing from KV', async () => {
    env.STATIC_KV = { get: vi.fn().mockResolvedValue(null) };
    const request = makeRequest('/assets/ClusterDetailModalWrapper-CMK5bsuw.js');
    const assetResponse = new Response('asset unavailable', { status: 404 });
    env.ASSETS.fetch.mockResolvedValue(assetResponse);

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('asset unavailable');
    expect(env.ASSETS.fetch).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('serves legacy asset headers without a body for HEAD requests', async () => {
    env.STATIC_KV = { get: vi.fn().mockResolvedValue('previous asset') };

    const response = await worker.fetch(makeRequest('/assets/index-CPiVOLY-.css', { method: 'HEAD' }), env, ctx);

    expect(response.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    expect(response.body).toBeNull();
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('serves compact summary metadata for HEAD without a response body', async () => {
    getClusterSummaries.mockResolvedValue(Response.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } }));
    const response = await worker.fetch(makeRequest('/api/cluster-summaries', { method: 'HEAD' }), env, ctx);
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(getClusterSummaries).toHaveBeenCalledOnce();
  });

  it('rejects compact summary writes before calling the read handler', async () => {
    const response = await worker.fetch(makeRequest('/api/cluster-summaries', { method: 'POST' }), env, ctx);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
    expect(getClusterSummaries).not.toHaveBeenCalled();
  });

  it.each(['/api', '/api/', '/api/unknown', '/api/unknown.json'])('returns JSON 404 for %s before SPA fallback', async (path) => {
    const response = await worker.fetch(makeRequest(path), env, ctx);

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.json()).toEqual({ status: 'error', message: 'API endpoint not found', source: 'worker-router' });
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/get-earthquakes?timeframe=day', getEarthquakes],
    ['/api/get-clusters', getClusters],
    ['/api/cluster-summaries', getClusterSummaries],
    ['/sitemap-index.xml', handleIndexSitemap],
  ])('preserves the handler for %s', async (path, handler) => {
    const request = makeRequest(path);
    const handlerResponse = new Response('handler result');
    handler.mockResolvedValue(handlerResponse);

    const response = await worker.fetch(request, env, ctx);

    expect(handler).toHaveBeenCalledExactlyOnceWith({ request, env, ctx });
    expect(response).toBe(handlerResponse);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('preserves the USGS proxy execution context', async () => {
    const request = makeRequest('/api/usgs-proxy');
    const handlerResponse = new Response('proxy result');
    handleUsgsProxy.mockResolvedValue(handlerResponse);

    expect(await worker.fetch(request, env, ctx)).toBe(handlerResponse);
    expect(handleUsgsProxy).toHaveBeenCalledExactlyOnceWith({ request, env, executionContext: ctx });
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('keeps the generated static sitemap ahead of assets', async () => {
    const response = await worker.fetch(makeRequest('/sitemap-static-pages.xml'), env, ctx);

    expect(response.headers.get('Content-Type')).toBe('application/xml');
    const xml = await response.text();
    expect(xml).toContain('https://earthquakeslive.com/learn/plate-tectonics');
    expect(xml).toContain('https://earthquakeslive.com/learn/what-causes-earthquakes');
    expect(xml).toContain('https://earthquakeslive.com/learn/earthquake-safety');
    expect(xml).toContain('https://earthquakeslive.com/learn/tsunamis-and-earthquakes');
    expect(xml).toContain('https://earthquakeslive.com/feeds?activeFeedPeriod=last_24_hours');
    expect(xml).not.toContain('<loc>https://earthquakeslive.com/feeds</loc>');
    expect(xml).not.toContain('<lastmod>');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['', 403],
    ['GPTBot', 403],
    ['early hints', 204],
  ])('preserves the User-Agent gate for "%s"', async (userAgent, status) => {
    const response = await worker.fetch(makeRequest('/', { headers: { 'User-Agent': userAgent } }), env, ctx);

    expect(response.status).toBe(status);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('prerenders earthquake links for crawlers before SPA fallback', async () => {
    env.ASSETS.fetch.mockResolvedValue(new Response(`<!DOCTYPE html><html><head>
      <script type="module" crossorigin src="/assets/index-current.js"></script>
      <link rel="stylesheet" crossorigin href="/assets/index-current.css">
      <script type="module" src="/src/main.jsx"></script>
    </head><body><div id="root"></div></body></html>`, { headers: { 'Content-Type': 'text/html' } }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'Feature',
      id: 'us123',
      properties: { mag: 5.1, place: 'Test location', time: Date.UTC(2026, 8, 20), updated: Date.UTC(2026, 8, 20) },
      geometry: { type: 'Point', coordinates: [-120, 35, 10] },
    }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(makeRequest('/quake/m5-test-location-us123', { headers: { 'User-Agent': 'Googlebot' } }), env, ctx);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us123.geojson', expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('Test location');
    expect(html).toContain('<script type="module" crossorigin src="/assets/index-current.js"></script>');
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/index-current.css">');
    expect(html).not.toContain('/src/main.jsx');
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(env.ASSETS.fetch.mock.calls[0][0].url).toBe('https://earthquakeslive.com/index.html');
  });
});
