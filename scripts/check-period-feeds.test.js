// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monitorPeriodFeeds } from './check-period-feeds.mjs';
import { publishEarthquakeFeed } from '../functions/background/publish-earthquake-feeds.js';
import { onRequestGet } from '../functions/api/earthquake-feeds.js';
import { createMemorySummaryBucket } from '../functions/utils/clusterSummarySnapshot.test-support.js';
const now = Date.UTC(2026, 8, 21);
let env;
beforeEach(() => { env = { GEOJSON_BUCKET: createMemorySummaryBucket() }; vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
const source = { type: 'FeatureCollection', metadata: { generated: now, status: 200, count: 0 }, features: [] };
const fetchImpl = url => onRequestGet({ request: new Request(url), env });
describe('read-only publication freshness monitor', () => {
  it('checks every period and fails overall health for one missing publication', async () => {
    for (const period of ['day', 'month']) await publishEarthquakeFeed(env, period, { now, fetchFeed: async () => source });
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const result = await monitorPeriodFeeds('https://example.test', { fetchImpl, now: () => now, log: vi.fn() });
    expect(result.healthy).toBe(false);
    expect(result.results.map(value => [value.period, value.state])).toEqual([['day', 'fresh'], ['week', 'unavailable'], ['month', 'fresh']]);
  });
  it('reports a verified previous generation as degraded even when its source age is fresh', async () => {
    for (const period of ['day', 'week', 'month']) {
      await publishEarthquakeFeed(env, period, { now, fetchFeed: async () => source });
      await publishEarthquakeFeed(env, period, { now: now + 1000,
        fetchFeed: async () => ({ ...source, metadata: { ...source.metadata, generated: now + 1000 } }) });
    }
    vi.spyOn(Date, 'now').mockReturnValue(now + 1000);
    const pointer = env.GEOJSON_BUCKET.readJson('earthquake-feeds/v1/day/current.json');
    env.GEOJSON_BUCKET.objects.delete(pointer.current.objectKey);
    const result = await monitorPeriodFeeds('https://example.test', { fetchImpl, now: () => now + 1000, log: vi.fn() });
    expect(result.healthy).toBe(false);
    expect(result.results[0]).toMatchObject({ period: 'day', state: 'degraded', stale: true, sourceAgeMs: 1000 });
  });

  it('retains source clocks and reports stale publications without treating them as empty or fresh', async () => {
    for (const period of ['day', 'week', 'month']) await publishEarthquakeFeed(env, period, { now, fetchFeed: async () => source });
    const later = now + 600_001; vi.spyOn(Date, 'now').mockReturnValue(later);
    const result = await monitorPeriodFeeds('https://example.test', { fetchImpl, now: () => later, log: vi.fn() });
    expect(result.healthy).toBe(false);
    expect(result.results.every(value => value.state === 'stale' && value.sourceAgeMs === 600_001 && value.upstreamGeneratedAtMs === now)).toBe(true);
  });
});
