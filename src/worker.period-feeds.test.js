// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { publishEarthquakeFeed } from '../functions/background/publish-earthquake-feeds.js';
import { handleTrustedUsgsIngestion } from '../functions/background/ingest-usgs-feed.js';
import { handleGenerateLists } from '../functions/background/generate-lists.js';
import { createMemorySummaryBucket } from '../functions/utils/clusterSummarySnapshot.test-support.js';
import { feedPointerKey, MAX_FEED_POINTER_BYTES, validateFeedEnvelope } from '../shared/earthquakeFeedContract.js';

vi.mock('../functions/background/ingest-usgs-feed.js', () => ({ handleTrustedUsgsIngestion: vi.fn() }));
vi.mock('../functions/background/generate-lists.js', () => ({ handleGenerateLists: vi.fn() }));
const now = Date.UTC(2026, 8, 21, 12);
function source(period, generated = now) {
  return { type: 'FeatureCollection', metadata: { generated, status: 200, count: 1 }, features: [{
    type: 'Feature', id: `us-${period}`, properties: {
      mag: period === 'month' ? null : -0.5, time: generated - (period === 'month' ? 20 * 86400_000 : 60_000),
      updated: generated - 30_000, place: 'Fixture', alert: null, felt: null, tsunami: 0, sig: 0,
    }, geometry: { type: 'Point', coordinates: [0, 0, 1] },
  }] };
}
let bucket;
let env;
const request = (query = '?period=day', options = {}) => new Request(`https://earthquakeslive.com/api/earthquake-feeds${query}`,
  { ...options, headers: { 'User-Agent': 'Mozilla/5.0', ...options.headers } });
async function publish(period = 'day') { return publishEarthquakeFeed(env, period, { now: () => Date.now(), fetchFeed: async name => source(name, Date.now()) }); }
async function fetchFeed(query, options) { return worker.fetch(request(query, options), env, {}); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  bucket = createMemorySummaryBucket();
  env = { GEOJSON_BUCKET: bucket, DB: { prepare: vi.fn(() => { throw new Error('No request-path D1'); }) }, CLUSTER_KV: { get: vi.fn() } };
  handleTrustedUsgsIngestion.mockResolvedValue(Response.json({ newOrUpdatedFeatures: [] }));
  handleGenerateLists.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('actual Worker complete period read route', () => {
  it.each(['day', 'week', 'month'])('serves a complete %s snapshot without D1, KV or upstream requests', async period => {
    await publish(period); bucket.calls.length = 0;
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No request-path upstream'); }));
    const response = await fetchFeed(`?period=${period}`);
    expect(response.status).toBe(200);
    const body = validateFeedEnvelope(await response.json(), { period, now });
    expect(body.features).toEqual(source(period).features);
    expect(body.complete).toBe(true);
    expect(response.headers.get('X-Feed-Stale')).toBe('false');
    expect(response.headers.get('X-Feed-Upstream-Generated-At')).toBe(String(now));
    expect(response.headers.get('Cache-Control')).toContain('must-revalidate');
    expect(bucket.calls.map(call => call.method)).toEqual(['get', 'get']);
    expect(env.DB.prepare).not.toHaveBeenCalled(); expect(env.CLUSTER_KV.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns unavailable rather than empty when no publication exists', async () => {
    const response = await fetchFeed();
    expect(response.status).toBe(503); expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'FEED_UNAVAILABLE' } });
  });
  it('returns genuine empty complete observations as success', async () => {
    await publishEarthquakeFeed(env, 'day', { now: () => now, fetchFeed: async () => ({ ...source('day'), metadata: { generated: now, status: 200, count: 0 }, features: [] }) });
    expect(await (await fetchFeed()).json()).toMatchObject({ complete: true, totalCount: 0, features: [] });
  });
  it.each(['?period=year', '?period=day&period=week', '?period=day&url=https://evil.invalid', '?period='])('rejects invalid parameters %s before reading storage', async query => {
    expect((await fetchFeed(query)).status).toBe(400); expect(bucket.calls).toHaveLength(0);
  });
  it.each(['POST', 'DELETE', 'PUT'])('rejects %s without side effects', async method => {
    expect((await fetchFeed('', { method })).status).toBe(405); expect(bucket.calls).toHaveLength(0);
  });
  it('HEAD and weak conditional GET preserve all metadata without reading the feature body', async () => {
    await publish();
    const first = await fetchFeed(); const etag = first.headers.get('ETag');
    await first.arrayBuffer(); bucket.calls.length = 0;
    const conditional = await fetchFeed('', { headers: { 'If-None-Match': `W/${etag}` } });
    expect(conditional.status).toBe(304); expect(await conditional.text()).toBe('');
    for (const [key, value] of first.headers) if (key.startsWith('x-feed-')) expect(conditional.headers.get(key)).toBe(value);
    expect(bucket.calls.map(call => call.method)).toEqual(['get', 'head']);
    const head = await fetchFeed('', { method: 'HEAD' });
    expect(head.status).toBe(200); expect(await head.text()).toBe('');
    expect(head.headers.get('Content-Length')).toBe(first.headers.get('Content-Length'));
  });
  it('marks old last-good data stale even on a successful conditional response', async () => {
    await publish(); const etag = (await fetchFeed()).headers.get('ETag');
    vi.setSystemTime(now + 600_001);
    const response = await fetchFeed('', { headers: { 'If-None-Match': etag } });
    expect(response.status).toBe(304); expect(response.headers.get('X-Feed-Stale')).toBe('true');
    expect(response.headers.get('X-Feed-Upstream-Generated-At')).toBe(String(now));
  });
  it.each(['missing', 'wrong-size', 'wrong-checksum', 'wrong-content-type'])('does not validate unavailable cached body on304: %s', async failure => {
    await publish(); const etag = (await fetchFeed()).headers.get('ETag');
    const descriptor = bucket.readJson(feedPointerKey('day')).current;
    const object = bucket.objects.get(descriptor.objectKey);
    if (failure === 'missing') bucket.objects.delete(descriptor.objectKey);
    if (failure === 'wrong-size') object.bytes = new Uint8Array(0);
    if (failure === 'wrong-checksum') object.customMetadata.sha256 = '0'.repeat(64);
    if (failure === 'wrong-content-type') object.httpMetadata.contentType = 'text/html';
    expect((await fetchFeed('', { headers: { 'If-None-Match': etag } })).status).toBe(503);
  });
  it('rejects corrupt stored bytes even with unchanged metadata', async () => {
    await publish();
    const descriptor = bucket.readJson(feedPointerKey('day')).current;
    bucket.objects.get(descriptor.objectKey).bytes[0] = 0;
    expect((await fetchFeed()).status).toBe(503);
  });
  it('rejects oversized, malformed, cross-period and future pointers', async () => {
    await publish(); const original = bucket.readJson(feedPointerKey('day'));
    for (const value of ['x'.repeat(MAX_FEED_POINTER_BYTES + 1), '{', { ...original, period: 'week' },
      { ...original, current: { ...original.current, generatedAtMs: now + 120_000 } }]) {
      bucket.seed(feedPointerKey('day'), value);
      expect((await fetchFeed()).status).toBe(503);
    }
  });
  it('bounds a hung R2 read to the route deadline', async () => {
    bucket.hooks.beforeGet = () => new Promise(() => {});
    const response = fetchFeed();
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await response).status).toBe(503);
    expect(JSON.parse(console.error.mock.calls.at(-1)[0])).toMatchObject({
      event: 'earthquake-feed-read-failed', period: 'day', method: 'GET', stage: 'pointer-get',
      reason: 'deadline', elapsedMs: 10_000, stageElapsedMs: 10_000,
    });
  });
  it('identifies a stalled immutable object read without logging its key or feed payload', async () => {
    await publish('week');
    const descriptor = bucket.readJson(feedPointerKey('week')).current;
    bucket.hooks.beforeGet = key => key === descriptor.objectKey ? new Promise(() => {}) : undefined;
    const response = fetchFeed('?period=week');
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await response).status).toBe(503);
    const log = console.error.mock.calls.at(-1)[0];
    expect(JSON.parse(log)).toMatchObject({
      event: 'earthquake-feed-read-failed', period: 'week', method: 'GET', stage: 'object-get', reason: 'deadline',
    });
    expect(log).not.toContain(descriptor.objectKey);
    expect(log).not.toContain('us-week');
  });
  it('identifies a failed metadata check on conditional requests', async () => {
    await publish();
    const etag = (await fetchFeed()).headers.get('ETag');
    bucket.hooks.beforeHead = () => { throw new Error('private R2 key and account details'); };
    expect((await fetchFeed('', { headers: { 'If-None-Match': etag } })).status).toBe(503);
    const log = console.error.mock.calls.at(-1)[0];
    expect(JSON.parse(log)).toMatchObject({
      event: 'earthquake-feed-read-failed', period: 'day', method: 'GET', stage: 'object-head', reason: 'read-failed',
    });
    expect(log).not.toContain('private R2 key and account details');
  });
  it('cancels R2 bodies that arrive after the read deadline', async () => {
    let resolveRead;
    let cancelled = false;
    env.GEOJSON_BUCKET = { get: () => new Promise(resolve => { resolveRead = resolve; }) };
    const response = fetchFeed();
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await response).status).toBe(503);
    resolveRead({ body: new ReadableStream({ cancel() { cancelled = true; } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(cancelled).toBe(true);
  });
});

describe('actual five-minute Worker publication with real publisher', () => {
  async function scheduled() {
    const tasks = [];
    await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: now }, env, { waitUntil(promise) {
      tasks.push(Promise.resolve(promise).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })));
    } });
    return Promise.all(tasks);
  }
  function upstream(failedPeriod) {
    vi.stubGlobal('fetch', vi.fn(async url => {
      const period = /all_(day|week|month)\.geojson$/.exec(url)?.[1];
      if (!period || period === failedPeriod) return new Response(null, { status: 502 });
      return Response.json(source(period));
    }));
  }
  it('publishes all periods even when hourly ingestion fails', async () => {
    upstream(); handleTrustedUsgsIngestion.mockRejectedValue(new Error('D1 ingestion failed'));
    const result = await scheduled();
    expect(result[0].status).toBe('rejected');
    for (const period of ['day', 'week', 'month']) expect(bucket.readJson(feedPointerKey(period)).current.totalCount).toBe(1);
    expect(handleGenerateLists).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('publishes healthy periods and surfaces one upstream period failure after legacy work', async () => {
    upstream('week');
    const result = await scheduled(); expect(result[0].status).toBe('rejected');
    expect(bucket.readJson(feedPointerKey('day')).current.complete).toBe(true);
    expect(bucket.readJson(feedPointerKey('month')).current.complete).toBe(true);
    expect(bucket.readJson(feedPointerKey('week'))).toBeNull();
    expect(handleGenerateLists).toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(3);
  });
});
