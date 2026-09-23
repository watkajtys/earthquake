// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { smokeDeployment } from './smoke-deployment.mjs';
import { publishEarthquakeFeeds } from '../functions/background/publish-earthquake-feeds.js';
import { onRequestGet } from '../functions/api/earthquake-feeds.js';
import { createMemorySummaryBucket } from '../functions/utils/clusterSummarySnapshot.test-support.js';
import { createPreviewFeedCollections } from './preview-feed-fixtures.mjs';
import { PREVIOUS_RELEASE_ASSETS } from '../src/previousReleaseAssets.js';

const ORIGIN = 'http://localhost:8787';
const SLUG = '3-quakes-near-persisted--35.2-179.9-stable-key';
const EVENT_ID = 'previewquake001';
const cluster = { id: 'cluster-uuid', slug: 'other-stored-slug', strongestQuakeId: EVENT_ID, title: 'SYNTHETIC PREVIEW cluster' };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

function fixture({ magnitude = 4, canonicalMismatch = false, externalSitemap = false, emptySitemap = false, badCrawlerAsset = false, badPreviousAsset = false, devEntry = false, noCrawlerCss = false, quakeNoindex = false, summaryUnavailable = false, summaryStale = false, extraCurrentAssetCount = 0, periodFeedsResponse } = {}) {
  const calls = [];
  let publishedFeeds;
  async function feedResponse(url, options) {
    if (periodFeedsResponse) return periodFeedsResponse(url, options);
    publishedFeeds ??= (async () => {
      const now = Date.now();
      const sources = createPreviewFeedCollections([], now, { includeEdgeCases: true });
      const env = { GEOJSON_BUCKET: createMemorySummaryBucket() };
      await publishEarthquakeFeeds(env, { now, fetchFeed: async period => sources[period] });
      return env;
    })();
    return onRequestGet({ request: new Request(url, options), env: await publishedFeeds });
  }
  const fetchImpl = vi.fn(async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    expect(url.origin).toBe(ORIGIN);
    expect(options.method).toBe('GET');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const path = url.pathname;
    if (path === '/api/earthquake-feeds') return feedResponse(url, options);
    if (path === '/api/get-earthquakes') return json([{ id: EVENT_ID, place: 'SYNTHETIC PREVIEW event' }], 200, { 'X-Data-Source': 'R2' });
    if (path === '/api/get-clusters') return json([cluster]);
    if (path === '/api/cluster-summaries') return summaryUnavailable ? json({ code: 'SUMMARY_UNAVAILABLE' }, 503) : json({
      schemaVersion: 2, source: 'stored-cluster-definitions', sourceWatermarkMs: null, view: 'overview',
      generationId: '12345678-1234-4123-8123-123456789abc', snapshotSequence: 1,
      sourceObservedAtMs: 1700000000000, generatedAtMs: 1700000000001,
      totalCount: 0, items: [], nextCursor: null, stale: summaryStale,
    });
    if (path === '/api/unknown-deployment-smoke-check') return json({ status: 'error' }, 404);
    if (['/api/batch-usgs-fetch', '/api/backfill-earthquake-details', '/api/fix-enhanced-data-flag'].includes(path)) return json({}, 405, { Allow: 'POST' });
    if (path === '/api/usgs-proxy') return json({}, 400);
    if (path === `/api/earthquake/${EVENT_ID}`) return json({ id: EVENT_ID, type: 'Feature', geometry: { coordinates: [0, 0, 5] }, properties: { mag: magnitude } }, 200, { 'X-Data-Source': 'R2-Storage' });
    if (path === '/api/cluster-detail-with-quakes') {
      const slug = url.searchParams.get('slug');
      if (slug) {
        expect(slug).toBe(SLUG);
        return json({ ...cluster, id: 'sitemap-cluster-uuid', slug, canonicalPath: `/cluster/${slug}` });
      }
      return json({ ...cluster, quakes: [{ id: EVENT_ID }], earthquakeIds: [EVENT_ID] });
    }
    if (path.endsWith('.xml')) {
      const loc = externalSitemap ? 'https://unexpected.invalid/cluster/other' : `https://earthquakeslive.com/cluster/${SLUG}`;
      return new Response(`<urlset>${emptySitemap ? '' : `<url><loc>${loc}</loc></url>`}</urlset>`, { headers: { 'Content-Type': 'application/xml' } });
    }
    if (path.startsWith('/assets/')) {
      if (badPreviousAsset && Object.hasOwn(PREVIOUS_RELEASE_ASSETS, path)) return new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } });
      const imports = path === '/assets/browser.js'
        ? Array.from({ length: extraCurrentAssetCount }, (_, index) => `import './current-${index}.js';`).join('\n') : '';
      return new Response(path.endsWith('.css') ? 'body{color:black}' : `export default 1;\n${imports}`, { headers: {
        'Content-Type': badCrawlerAsset && path === '/assets/crawler.js' ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'application/javascript',
      } });
    }
    const crawler = options.headers['User-Agent'].includes('Googlebot');
    const canonicalPath = path.startsWith('/cluster/') ? `/cluster/${SLUG}` : `/quake/id/${EVENT_ID}`;
    const canonical = `https://earthquakeslive.com${canonicalMismatch ? '/cluster/wrong' : canonicalPath}`;
    const assetName = crawler ? 'crawler' : 'browser';
    return new Response(`<html><head>${crawler && quakeNoindex && path.startsWith('/quake/') ? '<meta name="robots" content="noindex">' : ''}${crawler ? `<link href="${canonical}" rel="canonical">` : ''}<script src="/assets/${assetName}.js"></script>${crawler && noCrawlerCss ? '' : `<link rel="stylesheet" href="/assets/${assetName}.css">`}${crawler && devEntry ? '<script src="/src/main.jsx"></script>' : ''}</head><body>${crawler ? '<main><h1>Stored entity</h1></main>' : ''}<div id="root"></div></body></html>`, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });
  });
  return { fetchImpl, calls };
}

describe('deployment smoke crawler contract', () => {
  it('checks the combined retained and current asset graph beyond the old 232-path limit', async () => {
    const { fetchImpl } = fixture({ extraCurrentAssetCount: 17 });
    await expect(smokeDeployment([ORIGIN, '--preview'], { fetchImpl, log: vi.fn() }))
      .resolves.toMatchObject({ assets: 232 });
  });

  it.each([4, -0.2, null])('checks the emitted sitemap route, normal/crawler variants and built assets with magnitude %s', async magnitude => {
    const { fetchImpl, calls } = fixture({ magnitude });
    const result = await smokeDeployment([ORIGIN, '--preview'], { fetchImpl, log: vi.fn() });
    expect(result.assets).toBe(4 + Object.keys(PREVIOUS_RELEASE_ASSETS).length);
    const routeCalls = calls.filter(({ url }) => url.pathname === `/cluster/${SLUG}`);
    expect(routeCalls).toHaveLength(2);
    expect(routeCalls[0].options.headers['User-Agent']).not.toContain('Googlebot');
    expect(routeCalls[1].options.headers['User-Agent']).toContain('Googlebot');
    expect(calls.some(({ url }) => url.pathname === '/assets/crawler.js')).toBe(true);
    expect(calls.some(({ url }) => url.pathname === '/assets/crawler.css')).toBe(true);
    expect(calls.some(({ url }) => url.pathname === `/quake/id/${EVENT_ID}`)).toBe(true);
    expect(calls.some(({ url }) => url.pathname === `/quake/m${Number.isFinite(magnitude) ? magnitude : 'unknown'}-release-check-${EVENT_ID}`)).toBe(true);
    expect(calls.length).toBeLessThan(60 + Object.keys(PREVIOUS_RELEASE_ASSETS).length);
    expect(calls.filter(({ url }) => url.pathname === '/api/earthquake-feeds').map(({ url }) => url.searchParams.get('period'))).toEqual(['day', 'week', 'month']);
    for (const path of Object.keys(PREVIOUS_RELEASE_ASSETS)) expect(calls.some(call => call.url.pathname === path)).toBe(true);
  });

  it('accepts intentional noindex on a resolved non-significant earthquake', async () => {
    const { fetchImpl } = fixture({ magnitude: -0.2, quakeNoindex: true });
    await expect(smokeDeployment([ORIGIN, '--preview'], { fetchImpl, log: vi.fn() })).resolves.toMatchObject({ assets: 4 + Object.keys(PREVIOUS_RELEASE_ASSETS).length });
  });

  it.each([
    [{ canonicalMismatch: true }, /crawler canonical does not match/],
    [{ externalSitemap: true }, /unexpected cluster sitemap origin/],
    [{ emptySitemap: true }, /sitemap must emit/],
    [{ badCrawlerAsset: true }, /wrong content type/],
    [{ devEntry: true }, /development entry leaked/],
    [{ noCrawlerCss: true }, /missing built CSS/],
    [{ summaryUnavailable: true }, /unexpected HTTP status/],
    [{ summaryStale: true }, /recent stored summary/],
    [{ badPreviousAsset: true }, /wrong content type/],
  ])('rejects an invalid crawler deployment %#', async (options, message) => {
    const { fetchImpl } = fixture(options);
    await expect(smokeDeployment([ORIGIN, '--preview'], { fetchImpl, log: vi.fn() })).rejects.toThrow(message);
  });
});


describe('mandatory period-feed release gate', () => {
  it.each([[[]], [['--require-period-feeds']]])('validates all three actual publications with flags %j', async flags => {
    const { fetchImpl, calls } = fixture();
    await smokeDeployment([ORIGIN, '--preview', ...flags], { fetchImpl, log: vi.fn() });
    expect(calls.filter(({ url }) => url.pathname === '/api/earthquake-feeds').map(({ url }) => url.searchParams.get('period'))).toEqual(['day', 'week', 'month']);
  });

  it('fails an absent publication by default', async () => {
    const { fetchImpl } = fixture({ periodFeedsResponse: () => json({}, 503) });
    await expect(smokeDeployment([ORIGIN], { fetchImpl, log: vi.fn() })).rejects.toThrow(/unexpected HTTP status/);
  });

  it('offers no skip flag and documents the mandatory gate', async () => {
    const fetchImpl = vi.fn();
    await expect(smokeDeployment([ORIGIN, '--skip-period-feeds'], { fetchImpl })).rejects.toThrow(/Expected one base URL/);
    const log = vi.fn();
    await smokeDeployment(['--help'], { fetchImpl, log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('All three complete fresh period feeds are mandatory'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
