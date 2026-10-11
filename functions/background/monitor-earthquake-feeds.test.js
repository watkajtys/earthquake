// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { monitorEarthquakeFeeds } from './monitor-earthquake-feeds.js';
import { publishEarthquakeFeed } from './publish-earthquake-feeds.js';
import { createMemorySummaryBucket } from '../utils/clusterSummarySnapshot.test-support.js';
import { feedPointerKey, FEED_PERIODS } from '../../shared/earthquakeFeedContract.js';
const NOW = Date.UTC(2026, 8, 21, 12);
let env, bucket;
async function publish(now) {
  for (const period of FEED_PERIODS) await publishEarthquakeFeed(env, period, { now: () => now,
    fetchFeed: async () => ({ type: 'FeatureCollection', metadata: { generated: now, status: 200, count: 0 }, features: [] }) });
}
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  bucket = createMemorySummaryBucket(); env = { GEOJSON_BUCKET: bucket, RELEASE_REVISION: 'rev', WORKER_VERSION_METADATA: { id: 'ver' } };
  await publish(NOW);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it('observes fresh metadata without downloading snapshot bodies and retains real source age', async () => {
  const get = vi.spyOn(bucket, 'get'); const head = vi.spyOn(bucket, 'head');
  expect(await monitorEarthquakeFeeds(env)).toEqual(FEED_PERIODS.map(period => expect.objectContaining({ period, state: 'fresh', integrity: 'metadata-only', sourceAgeMs: 0, versionId: 'ver', revision: 'rev' })));
  expect(get.mock.calls.map(([key]) => key)).toEqual(FEED_PERIODS.map(feedPointerKey)); expect(head).toHaveBeenCalledTimes(3);
  vi.setSystemTime(NOW + 11 * 60_000);
  expect((await monitorEarthquakeFeeds(env)).map(result => result.state)).toEqual(['stale', 'stale', 'stale']);
});
it('labels eligible retained metadata degraded without claiming body verification and rejects expired fallback', async () => {
  vi.setSystemTime(NOW + 60_000); await publish(NOW + 60_000);
  for (const period of FEED_PERIODS) bucket.objects.delete(bucket.readJson(feedPointerKey(period)).current.objectKey);
  const get = vi.spyOn(bucket, 'get');
  expect((await monitorEarthquakeFeeds(env)).map(result => result.state)).toEqual(['degraded', 'degraded', 'degraded']);
  expect(get.mock.calls.every(([key]) => key.endsWith('/current.json'))).toBe(true);
  vi.setSystemTime(NOW + 31 * 60_000);
  expect((await monitorEarthquakeFeeds(env)).map(result => result.state)).toEqual(['unavailable', 'unavailable', 'unavailable']);
});
it('bounds hung binding reads and logs inconclusive observations without late followup', async () => {
  let resolve; const get = vi.spyOn(bucket, 'get').mockImplementation(() => new Promise(r => { resolve = r; }));
  const head = vi.spyOn(bucket, 'head');
  const pending = monitorEarthquakeFeeds(env); await vi.advanceTimersByTimeAsync(3000);
  expect(await pending).toEqual(FEED_PERIODS.map(period => expect.objectContaining({ period, state: 'inconclusive', code: 'R2_READ_TIMEOUT', stage: 'pointer-get', elapsedMs: 3000 })));
  resolve(null); await Promise.resolve(); expect(head).not.toHaveBeenCalled(); expect(get).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(console.log.mock.calls)).not.toContain('Snapshot read timed out');
});
it('rejects invalid pointer and mismatched object metadata without logging stored content', async () => {
  const original = bucket.get.bind(bucket);
  const get = vi.spyOn(bucket, 'get');
  const head = vi.spyOn(bucket, 'head').mockResolvedValue({ size: 1, customMetadata: { sha256: 'wrong' }, httpMetadata: { contentType: 'text/html' } });
  get.mockImplementation(async key => key === feedPointerKey('day')
    ? { size: 29, body: new Response('{"secret":"stored-sensitive"}').body }
    : original(key));
  expect((await monitorEarthquakeFeeds(env)).map(result => result.state)).toEqual(['unavailable', 'unavailable', 'unavailable']);
  expect(head).toHaveBeenCalledTimes(2);
  const logs = console.log.mock.calls.filter(([value]) => typeof value === 'string' && value.startsWith('{')).map(([value]) => JSON.parse(value));
  expect(logs).toHaveLength(3);
  expect(JSON.stringify(logs)).not.toContain('stored-sensitive');
  expect(logs[0]).toMatchObject({ period: 'day', code: 'INVALID_FEED_FIELDS' });
});

it('recovers one classified transport failure within the original budget, and reports exhaustion inconclusive', async () => {
  const original = bucket.get.bind(bucket);
  const attempts = new Map();
  const get = vi.spyOn(bucket, 'get').mockImplementation(async key => {
    const count = attempts.get(key) ?? 0; attempts.set(key, count + 1);
    if (!count) throw new Error('get: Internal error (10001)');
    return original(key);
  });
  const recovery = monitorEarthquakeFeeds(env); await vi.advanceTimersByTimeAsync(100);
  expect((await recovery).map(result => result.state)).toEqual(['fresh', 'fresh', 'fresh']);
  expect(get).toHaveBeenCalledTimes(6);
  get.mockClear().mockRejectedValue(new Error('get: Service unavailable (10043)'));
  const exhausted = monitorEarthquakeFeeds(env); await vi.advanceTimersByTimeAsync(100);
  expect(await exhausted).toEqual(FEED_PERIODS.map(period => expect.objectContaining({ period, state: 'inconclusive', code: 'R2_SERVICE_UNAVAILABLE', upstreamStatus: 503, elapsedMs: 100 })));
  expect(get).toHaveBeenCalledTimes(6);
});
it('keeps confirmed missing pointers unavailable but does not mistake failed HEAD reads for missing snapshots', async () => {
  bucket.objects.delete(feedPointerKey('day'));
  vi.spyOn(bucket, 'head').mockRejectedValue(new Error('head: Internal error (10001)'));
  const pending = monitorEarthquakeFeeds(env); await vi.advanceTimersByTimeAsync(100);
  expect((await pending).map(result => result.state)).toEqual(['unavailable', 'inconclusive', 'inconclusive']);
});

it('reports inconclusive when current metadata is missing and eligible retained metadata cannot be read', async () => {
  vi.setSystemTime(NOW + 60_000); await publish(NOW + 60_000);
  for (const period of FEED_PERIODS) bucket.objects.delete(bucket.readJson(feedPointerKey(period)).current.objectKey);
  const original = bucket.head.bind(bucket);
  const head = vi.spyOn(bucket, 'head').mockImplementation(async key => {
    if (bucket.objects.has(key)) throw new Error('head: Service unavailable (10043)');
    return original(key);
  });
  const pending = monitorEarthquakeFeeds(env); await vi.advanceTimersByTimeAsync(100);
  expect(await pending).toEqual(FEED_PERIODS.map(period => expect.objectContaining({ period, state: 'inconclusive', code: 'R2_SERVICE_UNAVAILABLE', stage: 'previous-head' })));
  expect(head).toHaveBeenCalledTimes(9);
});
