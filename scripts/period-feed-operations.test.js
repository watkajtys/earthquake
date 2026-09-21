// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createPreviewFeedCollections } from './preview-feed-fixtures.mjs';
import { checkPeriodFeeds } from './check-period-feeds.mjs';
import { publishEarthquakeFeeds } from '../functions/background/publish-earthquake-feeds.js';
import { onRequestGet } from '../functions/api/earthquake-feeds.js';
import { createMemorySummaryBucket } from '../functions/utils/clusterSummarySnapshot.test-support.js';
import { feedPointerKey, MAX_FEED_BYTES } from '../shared/earthquakeFeedContract.js';

const feature = (id, time, mag = 5) => ({ type: 'Feature', id,
  geometry: { type: 'Point', coordinates: [0, 0, 10] }, properties: {
    time, updated: time, mag, place: 'SYNTHETIC PREVIEW event', alert: null, felt: 0, tsunami: 0, sig: 20,
  } });

async function publishedFixture(now = Date.now()) {
  const features = [feature('previewquake001', now - 3600_000), feature('previewquake004', now - 9 * 86400_000)];
  const sources = createPreviewFeedCollections(features, now, { includeEdgeCases: true });
  const bucket = createMemorySummaryBucket();
  const env = { GEOJSON_BUCKET: bucket };
  await publishEarthquakeFeeds(env, { now, fetchFeed: async period => sources[period] });
  const fetchImpl = vi.fn((url, options) => onRequestGet({ request: new Request(url, options), env }));
  return { bucket, sources, features, fetchImpl, now };
}

describe('period feed operational checks', () => {
  it('seeds actual publication without mutating legacy fixtures, including old monthly and negative/null magnitudes', async () => {
    const { sources, features, bucket, now } = await publishedFixture();
    expect(features).toHaveLength(2);
    expect(sources.day.features.map(item => item.properties.mag)).toEqual([5, -0.2]);
    expect(sources.week.features.map(item => item.properties.mag)).toEqual([5, -0.2, null]);
    expect(sources.month.features).toHaveLength(4);
    expect(sources.month.features.find(item => item.id === 'previewquake004').properties.updated).toBe(now - 9 * 86400_000);
    for (const period of ['day', 'week', 'month']) {
      const pointer = bucket.readJson(feedPointerKey(period));
      expect(pointer.current.totalCount).toBe(sources[period].features.length);
      expect(sources[period].metadata).toEqual({ status: 200, generated: now, count: sources[period].features.length });
      expect(bucket.readJson(pointer.current.objectKey).features).toEqual(sources[period].features);
    }
  });

  it('checks all three real API payloads and source metadata without logging features', async () => {
    const { fetchImpl } = await publishedFixture();
    const log = vi.fn();
    const results = await checkPeriodFeeds('https://preview.example', { fetchImpl, log, preview: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(results.map(result => result.period)).toEqual(['day', 'week', 'month']);
    expect(results.map(result => result.totalCount)).toEqual([2, 3, 4]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('features');
    expect(JSON.stringify(log.mock.calls)).not.toContain('previewquake001');
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.method).toBe('GET');
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.headers['User-Agent']).toBe('Earthquake-Deployment-Smoke/1.0');
    }
  });

  it('verifies conditional GET and HEAD metadata without renewing source time', async () => {
    const { fetchImpl, now } = await publishedFixture();
    const results = await checkPeriodFeeds('https://preview.example', { fetchImpl, log: vi.fn(), conditional: true });
    expect(fetchImpl).toHaveBeenCalledTimes(9);
    expect(results.every(result => result.upstreamGeneratedAtMs === now)).toBe(true);
    expect(fetchImpl.mock.calls.filter(([, options]) => options.method === 'HEAD')).toHaveLength(3);
  });

  it('accepts compressed GET weak ETags and strong conditional/HEAD validators without mislabeling wire bytes', async () => {
    const { fetchImpl: original } = await publishedFixture();
    const fetchImpl = vi.fn(async (url, options) => {
      const response = await original(url, options);
      if (options.method === 'GET' && response.status === 200) {
        response.headers.set('ETag', `W/${response.headers.get('ETag')}`);
        response.headers.set('Content-Length', '123');
        response.headers.set('Content-Encoding', 'br');
      }
      return response;
    });
    const results = await checkPeriodFeeds('https://preview.example', { fetchImpl, log: vi.fn(), conditional: true });
    expect(results.every(result => result.observedHeaderBytes === 123 && result.decodedBytes > 123)).toBe(true);
    expect(fetchImpl.mock.calls.filter(([, options]) => options.method === 'HEAD')
      .every(([, options]) => !options.headers['If-None-Match'])).toBe(true);
  });

  it.each(['stale', 'missing-alert', 'wrong-count', 'wrong-header', 'oversize', 'unavailable', 'non-synthetic'])('rejects %s before checking later periods', async kind => {
    const { fetchImpl: original } = await publishedFixture();
    const fetchImpl = vi.fn(async (url, options) => {
      const response = await original(url, options);
      if (kind === 'unavailable') return Response.json({}, { status: 503 });
      const headers = new Headers(response.headers);
      if (kind === 'oversize') headers.set('Content-Length', String(MAX_FEED_BYTES + 1));
      if (kind === 'wrong-header') headers.set('X-Feed-Upstream-Generated-At', '1');
      const value = await response.json();
      if (kind === 'stale') value.sourceObservedAtMs -= 11 * 60_000;
      if (kind === 'missing-alert') delete value.features[0].properties.alert;
      if (kind === 'wrong-count') value.totalCount++;
      if (kind === 'non-synthetic') value.features[0].properties.place = 'Real event';
      return new Response(JSON.stringify(value), { headers });
    });
    await expect(checkPeriodFeeds('https://preview.example', { fetchImpl, log: vi.fn(), preview: true })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('accepts genuine complete empty feeds', async () => {
    const now = Date.now();
    const sources = createPreviewFeedCollections([], now);
    const env = { GEOJSON_BUCKET: createMemorySummaryBucket() };
    await publishEarthquakeFeeds(env, { now, fetchFeed: async period => sources[period] });
    const results = await checkPeriodFeeds('https://preview.example', {
      fetchImpl: (url, options) => onRequestGet({ request: new Request(url, options), env }), log: vi.fn(),
    });
    expect(results.map(result => result.totalCount)).toEqual([0, 0, 0]);
  });

  it('rejects unsafe origins before fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(checkPeriodFeeds('https://user:secret@example.test/path', { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
