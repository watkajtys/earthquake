// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEarthquakeFeed } from './earthquakeFeedService.js';
import { publishEarthquakeFeed } from '../../functions/background/publish-earthquake-feeds.js';
import { onRequestGet } from '../../functions/api/earthquake-feeds.js';
import { createMemorySummaryBucket } from '../../functions/utils/clusterSummarySnapshot.test-support.js';
import { earthquakeFeature, completeUsgsFeed } from '../test-utils/earthquakeFeedFixtures.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('publisher/API/browser feed contract', () => {
  it('consumes actual published bytes, compressed weak ETags, matching 304s and a corrected replacement without fallback', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 8, 21); vi.setSystemTime(now);
    const bucket = createMemorySummaryBucket();
    const env = { GEOJSON_BUCKET: bucket };
    let source = completeUsgsFeed([earthquakeFeature('revised'), earthquakeFeature('removed')]);
    await publishEarthquakeFeed(env, 'day', { fetchFeed: async () => source });
    const statuses = [];
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      expect(String(url)).toBe('/api/earthquake-feeds?period=day');
      const response = await onRequestGet({ request: new Request(`https://local.test${url}`, options), env });
      statuses.push(response.status);
      if (response.status === 200) response.headers.set('ETag', `W/${response.headers.get('ETag')}`);
      return response;
    });
    const first = await fetchEarthquakeFeed('day');
    expect(first.features).toEqual(source.features);
    vi.setSystemTime(now + 60_000);
    const unchanged = await fetchEarthquakeFeed('day', { previousData: first });
    expect(unchanged.features).toBe(first.features);
    expect(unchanged.sourceGeneratedAtMs).toBe(now);
    expect(unchanged.fetchTime).toBe(now + 60_000);
    vi.setSystemTime(now + 300_000);
    source = completeUsgsFeed([earthquakeFeature('revised', { mag: 4, updated: Date.now() })]);
    await publishEarthquakeFeed(env, 'day', { fetchFeed: async () => source });
    const changed = await fetchEarthquakeFeed('day', { previousData: unchanged });
    expect(changed.features.map(feature => feature.id)).toEqual(['revised']);
    expect(changed.features[0].properties.mag).toBe(4);
    expect(changed.sourceGeneratedAtMs).toBe(now + 300_000);
    expect(changed.snapshotCache.envelope.snapshotSequence).toBe(2);
    expect(statuses).toEqual([200, 304, 200]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
