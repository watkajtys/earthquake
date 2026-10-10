// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './earthquake-feeds.js';
import { publishEarthquakeFeed } from '../background/publish-earthquake-feeds.js';
import { createMemorySummaryBucket } from '../utils/clusterSummarySnapshot.test-support.js';
import { feedPointerKey } from '../../shared/earthquakeFeedContract.js';
const NOW = Date.UTC(2026, 8, 21, 12);
let bucket, env;
const request = options => new Request('https://example.test/api/earthquake-feeds?period=day', options);
const call = options => onRequestGet({ request: request(options), env });
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  bucket = createMemorySummaryBucket();
  env = { GEOJSON_BUCKET: bucket, RELEASE_REVISION: 'revision-1', WORKER_VERSION_METADATA: { id: 'version-1' } };
  await publishEarthquakeFeed(env, 'day', { now: () => NOW, fetchFeed: async () => ({
    type: 'FeatureCollection', metadata: { generated: NOW, status: 200, count: 0 }, features: [],
  }) });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('feed read retries preserve committed data', () => {
  it.each(['pointer', 'object', 'head'])('recovers one internal500%s read without moving freshness', async operation => {
    const descriptor = bucket.readJson(feedPointerKey('day')).current;
    const method = operation === 'head' ? 'head' : 'get';
    const original = bucket[method].bind(bucket); let failed = false;
    const target = operation === 'pointer' ? feedPointerKey('day') : descriptor.objectKey;
    const spy = vi.spyOn(bucket, method).mockImplementation(async key => {
      if (key === target && !failed) { failed = true; throw new Error(`R2 ${method.toUpperCase()} failed: (500) Internal Server Error`); }
      return original(key);
    });
    const result = call(operation === 'head' ? { method: 'HEAD' } : undefined);
    await vi.advanceTimersByTimeAsync(100);
    const response = await result;
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Feed-Source-Observed-At')).toBe(String(NOW));
    expect(response.headers.get('X-Feed-Upstream-Generated-At')).toBe(String(NOW));
    expect(spy.mock.calls.filter(([key]) => key === target)).toHaveLength(2);
  });
  it('returns the existing503 contract after retry exhaustion', async () => {
    const spy = vi.spyOn(bucket, 'get').mockRejectedValue(new Error('Network connection lost.'));
    const result = call(); await vi.advanceTimersByTimeAsync(100);
    const response = await result;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'FEED_UNAVAILABLE' } });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(console.error.mock.calls.at(-1)[0])).toMatchObject({ stage: 'pointer-get', code: 'R2_NETWORK_ERROR', versionId: 'version-1', revision: 'revision-1', elapsedMs: 100 });
  });
  it('does not retry corrupt stored bytes', async () => {
    const descriptor = bucket.readJson(feedPointerKey('day')).current;
    bucket.objects.get(descriptor.objectKey).bytes[0] = 0;
    const spy = vi.spyOn(bucket, 'get');
    expect((await call()).status).toBe(503);
    expect(spy.mock.calls.filter(([key]) => key === descriptor.objectKey)).toHaveLength(1);
  });
  it('keeps retry delay inside the original ten-second deadline', async () => {
    const spy = vi.spyOn(bucket, 'get').mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new Error('Network connection lost.')), 9950)));
    const result = call(); await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).status).toBe(503);
    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.parse(console.error.mock.calls.at(-1)[0])).toMatchObject({ reason: 'deadline', elapsedMs: 10_000 });
    await vi.advanceTimersByTimeAsync(100);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('verified previous feed fallback', () => {
  async function next() {
    vi.setSystemTime(NOW + 60_000);
    await publishEarthquakeFeed(env, 'day', { now: () => NOW + 60_000, fetchFeed: async () => ({
      type: 'FeatureCollection', metadata: { generated: NOW + 60_000, status: 200, count: 0 }, features: [],
    }) });
    return bucket.readJson(feedPointerKey('day'));
  }
  it.each(['missing', 'checksum', 'metadata', 'transient'])('serves verified previous bytes after current %s failure', async kind => {
    const pointer = await next();
    if (kind === 'missing') bucket.objects.delete(pointer.current.objectKey);
    if (kind === 'checksum') bucket.objects.get(pointer.current.objectKey).bytes[0] = 0;
    if (kind === 'metadata') bucket.objects.get(pointer.current.objectKey).customMetadata.sha256 = 'f'.repeat(64);
    if (kind === 'transient') bucket.hooks.beforeGet = key => { if (key === pointer.current.objectKey) throw new Error('Network connection lost.'); };
    const result = call(); await vi.advanceTimersByTimeAsync(100);
    const response = await result;
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Feed-Fallback')).toBe('true');
    expect(response.headers.get('X-Feed-Stale')).toBe('true');
    expect(response.headers.get('X-Feed-Upstream-Generated-At')).toBe(String(NOW));
    expect((await response.json()).snapshotSequence).toBe(1);
  });
  it.each(['HEAD', 'GET'])('verifies fallback bytes before conditional %s success', async method => {
    const pointer = await next(); bucket.objects.delete(pointer.current.objectKey);
    const response = await call({ method, headers: { 'If-None-Match': `"feed-${pointer.previous.sha256}"` } });
    expect(response.status).toBe(304);
    expect(response.headers.get('Content-Length')).toBeNull();
    expect(response.headers.get('X-Feed-Fallback')).toBe('true');
    expect(bucket.calls.some(entry => entry.method === 'get' && entry.key === pointer.previous.objectKey)).toBe(true);
    bucket.objects.get(pointer.previous.objectKey).bytes[0] = 0;
    expect((await call({ method })).status).toBe(503);
  });
  it('reserves time for fallback and cancels the stalled current stream', async () => {
    const pointer = await next(); const cancel = vi.fn();
    bucket.hooks.afterGet = (key, object) => key === pointer.current.objectKey
      ? { ...object, body: new ReadableStream({ cancel }) } : object;
    const result = call(); await vi.advanceTimersByTimeAsync(6000);
    expect((await result).status).toBe(200);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels a late current object without starting another read', async () => {
    const pointer = await next(); let resolve; const cancel = vi.fn();
    bucket.hooks.afterGet = (key, object) => key === pointer.current.objectKey
      ? new Promise(done => { resolve = () => done({ ...object, body: new ReadableStream({ cancel }) }); }) : object;
    const result = call(); await vi.advanceTimersByTimeAsync(6000);
    expect((await result).status).toBe(200);
    const calls = bucket.calls.length; resolve(); await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce(); expect(bucket.calls).toHaveLength(calls);
  });
  it('rejects previous data older than thirty minutes and does not extend its clocks', async () => {
    const pointer = await next(); bucket.objects.delete(pointer.current.objectKey);
    vi.setSystemTime(NOW + 30 * 60_000 + 1);
    bucket.calls.length = 0;
    expect((await call()).status).toBe(503);
    expect(bucket.calls.some(entry => entry.key === pointer.previous.objectKey)).toBe(false);
  });
  it('rejects a retained snapshot that expires while its bytes are being read', async () => {
    const pointer = await next(); bucket.objects.delete(pointer.current.objectKey);
    vi.setSystemTime(NOW + 30 * 60_000 - 1);
    bucket.hooks.beforeGet = key => key === pointer.previous.objectKey
      ? new Promise(resolve => setTimeout(resolve, 2)) : undefined;
    const pending = call(); await vi.advanceTimersByTimeAsync(2);
    expect((await pending).status).toBe(503);
  });
  it('keeps the total ten-second bound when both generations stall', async () => {
    await next(); bucket.hooks.afterGet = (key, object) => key === feedPointerKey('day') ? object
      : { ...object, body: new ReadableStream() };
    const result = call(); await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
  });
});
