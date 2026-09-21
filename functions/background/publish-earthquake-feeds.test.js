// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { publishEarthquakeFeed, publishEarthquakeFeeds } from './publish-earthquake-feeds.js';
import { createMemorySummaryBucket } from '../utils/clusterSummarySnapshot.test-support.js';
import { sha256Hex } from '../../shared/clusterSummaryContract.js';
import { feedPointerKey, feedObjectKey, validateFeedEnvelope, validateFeedPointer, MAX_FEED_BYTES, FEED_FRESHNESS_MS, FEED_CLOCK_SKEW_MS } from '../../shared/earthquakeFeedContract.js';

const baseTime = Date.UTC(2026, 8, 21);
const generation = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const feature = (id = 'quake1', properties = {}) => ({ type: 'Feature', id,
  properties: { time: baseTime - 60_000, updated: baseTime - 1000, mag: 4.5, place: 'Example',
    alert: null, felt: null, tsunami: 0, sig: 50,
    detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`, ...properties },
  geometry: { type: 'Point', coordinates: [-118, 34, 10] },
});
const feed = (generated = baseTime, features = [feature()]) => ({
  type: 'FeatureCollection', metadata: { generated, status: 200, count: features.length }, features,
});
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
let bucket;
let env;
let time;
let nextId;
let source;
let fetchFeed;
const publish = (period = 'day', options = {}) => publishEarthquakeFeed(env, period, {
  now: () => time, fetchFeed, randomUUID: () => generation(nextId++), ...options,
});
const pointer = (period = 'day') => bucket.readJson(feedPointerKey(period));
const snapshot = (period = 'day') => bucket.readJson(pointer(period).current.objectKey);
function advance(ms = 300_000, features = source.features) {
  time += ms; vi.setSystemTime(time); source = feed(time, features);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(baseTime);
  bucket = createMemorySummaryBucket(); env = { GEOJSON_BUCKET: bucket };
  time = baseTime; nextId = 1; source = feed(); fetchFeed = vi.fn(async () => source);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('independent immutable complete period publication', () => {
  it('captures the pointer before fetching and publishes a checked complete envelope with native checksum', async () => {
    fetchFeed.mockImplementation(async period => {
      expect(period).toBe('day');
      expect(bucket.calls).toEqual([{ method: 'get', key: feedPointerKey('day') }]);
      return source;
    });
    const result = await publish();
    expect(result).toMatchObject({ period: 'day', published: true, generationId: generation(1), snapshotSequence: 1,
      totalCount: 1, upstreamGeneratedAtMs: baseTime, durationMs: 0, cleanupDeferred: false });
    const saved = pointer();
    expect(validateFeedPointer(saved, { period: 'day', now: time })).toBe(saved);
    const data = snapshot();
    expect(validateFeedEnvelope(data, { period: 'day', now: time })).toBe(data);
    expect(data).toMatchObject({ generatedAtMs: baseTime, sourceObservedAtMs: baseTime,
      coverageStartMs: baseTime - 86400_000, coverageEndMs: baseTime, complete: true, features: source.features });
    const object = bucket.objects.get(saved.current.objectKey);
    expect(saved.current.sha256).toBe(await sha256Hex(object.bytes));
    expect(object.customMetadata.sha256).toBe(saved.current.sha256);
    expect(object.customMetadata.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(bucket.calls.find(call => call.key === saved.current.objectKey)).toMatchObject({
      options: { sha256: saved.current.sha256, onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } },
    });
    expect(saved.previous).toBeNull();
    expect(Object.hasOwn(result, 'features')).toBe(false);
    expect(env).not.toHaveProperty('DB'); expect(env).not.toHaveProperty('CLUSTER_KV');
  });

  it.each(['day', 'week', 'month'])('uses the correct independent %s period source and coverage', async period => {
    await publish(period);
    expect(fetchFeed).toHaveBeenCalledWith(period);
    expect(snapshot(period).period).toBe(period);
    expect(snapshot(period).coverageStartMs).toBe(baseTime - ({ day: 1, week: 7, month: 30 }[period]) * 86400_000);
  });

  it('preserves full metadata, zero/negative/null magnitudes and a valid old monthly event', async () => {
    source = feed(baseTime, [feature('negative', { mag: -1.5, time: baseTime - 25 * 86400_000, updated: baseTime - 2 * 86400_000,
      alert: 'green', felt: 0, tsunami: 1, sig: 0, cdi: 3.2, mmi: 4, customScientificProperty: { method: 'retained' } }),
    feature('unknown', { mag: null, place: null, alert: null, felt: null, tsunami: null, sig: null }), feature('zero', { mag: 0 })]);
    await publish('month');
    expect(snapshot('month').features).toEqual(source.features);
  });

  it('replaces the complete window for corrections and deletions instead of merging stale records', async () => {
    source = feed(baseTime, [feature('revised', { mag: 5 }), feature('removed')]);
    await publish(); const original = pointer().current.objectKey;
    advance(300_000, [feature('revised', { mag: 4, updated: baseTime + 299_000 })]);
    await publish();
    expect(snapshot().features.map(value => value.id)).toEqual(['revised']);
    expect(snapshot().features[0].properties.mag).toBe(4);
    expect(bucket.readJson(original).features).toHaveLength(2);
    expect(pointer().previous.objectKey).toBe(original);
  });

  it('publishes a genuine empty complete snapshot', async () => {
    source = feed(baseTime, []);
    expect(await publish()).toMatchObject({ published: true, totalCount: 0 });
    expect(snapshot()).toMatchObject({ complete: true, features: [], totalCount: 0 });
  });

  it('does not renew clocks or sequence for an identical source generation, including reordered keys/features', async () => {
    source = feed(baseTime, [feature('b'), feature('a')]); await publish();
    const before = bucket.objects.get(feedPointerKey('day'));
    time += 300_000;
    source = feed(baseTime, source.features.toReversed().map(value => Object.fromEntries(Object.entries(value).reverse())));
    const writes = bucket.calls.filter(call => call.method === 'put').length;
    expect(await publish()).toMatchObject({ published: false, reason: 'unchanged', snapshotSequence: 1 });
    expect(bucket.objects.get(feedPointerKey('day'))).toBe(before);
    expect(bucket.calls.filter(call => call.method === 'put')).toHaveLength(writes);
    expect(snapshot()).toMatchObject({ generatedAtMs: baseTime, sourceObservedAtMs: baseTime });
  });

  it('rejects changed content at an equal source generation', async () => {
    await publish(); const before = bucket.objects.get(feedPointerKey('day'));
    source = feed(baseTime, [feature('quake1', { mag: 6 })]);
    await expect(publish()).rejects.toThrow('mismatched snapshot content');
    expect(bucket.objects.get(feedPointerKey('day'))).toBe(before);
  });

  it('rejects an equal-source retry when the previously committed object is missing', async () => {
    await publish(); bucket.objects.delete(pointer().current.objectKey);
    await expect(publish()).rejects.toThrow('missing or mismatched');
  });

  it('rejects backwards source generations without replacing a fresh pointer', async () => {
    await publish(); source = feed(baseTime - 1000);
    const before = bucket.objects.get(feedPointerKey('day'));
    await expect(publish()).rejects.toThrow('generation moved backwards');
    expect(bucket.objects.get(feedPointerKey('day'))).toBe(before);
  });

  it('rejects publication clock rollback before fetching or writing', async () => {
    await publish(); fetchFeed.mockClear(); time -= 1000;
    await expect(publish()).rejects.toThrow('Clock moved backwards');
    expect(fetchFeed).not.toHaveBeenCalled();
  });
});

describe('validation and failure boundaries', () => {
  it.each([
    ['count', value => { value.metadata.count = 2; }],
    ['missing-alert', value => { delete value.features[0].properties.alert; }],
    ['stale', value => { value.metadata.generated = baseTime - FEED_FRESHNESS_MS - 1; }],
    ['future', value => { value.metadata.generated = baseTime + FEED_CLOCK_SKEW_MS + 1; }],
    ['invalid-status', value => { value.metadata.status = 500; }],
    ['future-update', value => { value.features[0].properties.updated = baseTime + FEED_CLOCK_SKEW_MS + 1; }],
    ['outside-window', value => { value.features[0].properties.time = baseTime - 86400_000 - FEED_CLOCK_SKEW_MS - 1; }],
    ['duplicate', value => { value.features.push(value.features[0]); value.metadata.count = 2; }],
  ])('rejects %s source and retains the previous complete snapshot', async (_, corrupt) => {
    await publish(); const before = bucket.objects.get(feedPointerKey('day'));
    source = structuredClone(source); corrupt(source);
    await expect(publish()).rejects.toThrow();
    expect(bucket.objects.get(feedPointerKey('day'))).toBe(before);
    expect(bucket.calls.filter(call => call.method === 'delete')).toHaveLength(0);
  });

  it('rejects an oversized full feature payload instead of truncating properties', async () => {
    source.features[0].properties.extra = 'x'.repeat(MAX_FEED_BYTES);
    await expect(publish()).rejects.toThrow('byte limit');
    expect(bucket.calls.some(call => call.method === 'put')).toBe(false);
  });

  it.each(['read-error', 'malformed-pointer'])('never bootstraps over %s', async failure => {
    if (failure === 'read-error') bucket.hooks.beforeGet = () => { throw new Error('R2 unavailable'); };
    else bucket.seed(feedPointerKey('day'), '{}');
    await expect(publish()).rejects.toThrow();
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(bucket.calls.some(call => call.method === 'put')).toBe(false);
  });

  it.each(['object', 'pointer'])('retains prior pointer and does not retire anything on %s write failure', async stage => {
    await publish(); advance(); await publish(); advance();
    const before = bucket.objects.get(feedPointerKey('day'));
    bucket.hooks.beforePut = key => {
      if ((key === feedPointerKey('day')) === (stage === 'pointer')) throw new Error('write failed');
    };
    await expect(publish()).rejects.toThrow('write failed');
    expect(bucket.objects.get(feedPointerKey('day'))).toBe(before);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('reports lost pointer acknowledgement and retries from a fresh pointer/source without unsafe retirement', async () => {
    bucket.hooks.afterPut = (key, result) => { if (key === feedPointerKey('day')) throw new Error('lost acknowledgement'); return result; };
    await expect(publish()).rejects.toThrow('lost acknowledgement');
    expect(pointer().current.snapshotSequence).toBe(1);
    delete bucket.hooks.afterPut;
    expect(await publish()).toMatchObject({ published: false, reason: 'unchanged', snapshotSequence: 1 });
    expect(fetchFeed).toHaveBeenCalledTimes(2);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('keeps the existing upstream ten-second source deadline', async () => {
    vi.useFakeTimers(); vi.setSystemTime(baseTime);
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const result = publish('day', { fetchFeed: undefined });
    const settled = result.then(() => ({ fulfilled: true }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await settled).error).toMatchObject({ code: 'USGS_TIMEOUT', status: 504 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bucket.calls.some(call => call.method === 'put')).toBe(false);
  });
});

describe('single-attempt compare-and-swap', () => {
  it.each([false, true])('rejects a delayed publisher without rebasing stale rows (existing=%s)', async existing => {
    if (existing) { await publish(); advance(); }
    const delayedGeneration = generation(nextId);
    const held = deferred(); const release = deferred();
    bucket.hooks.beforePut = async key => { if (key === feedObjectKey('day', delayedGeneration)) { held.resolve(); await release.promise; } };
    const delayed = publish(); await held.promise;
    advance(); const winner = await publish(); release.resolve();
    expect(await delayed).toMatchObject({ published: false, reason: 'superseded' });
    expect(pointer().current.generationId).toBe(winner.generationId);
    expect(bucket.calls.filter(call => call.method === 'get' && call.key === feedPointerKey('day'))).toHaveLength(existing ? 3 : 2);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('does not overwrite an immutable generation on UUID collision', async () => {
    await publish(); const before = bucket.objects.get(pointer().current.objectKey);
    advance(); await expect(publish('day', { randomUUID: () => generation(1) })).rejects.toThrow('did not confirm');
    expect(bucket.objects.get(pointer().current.objectKey)).toBe(before);
  });
});

describe('bounded retirement after acknowledged publication', () => {
  it('retires exactly prior.previous after grace and preserves current plus last-good fallback', async () => {
    await publish(); const first = pointer().current.objectKey;
    advance(); await publish(); const second = pointer().current.objectKey;
    advance(); expect(await publish()).toMatchObject({ published: true, cleanupDeferred: false });
    expect(bucket.calls.filter(call => call.method === 'delete')).toEqual([{ method: 'delete', key: first }]);
    expect(bucket.objects.has(first)).toBe(false);
    expect(bucket.objects.has(second)).toBe(true);
    expect(bucket.objects.has(pointer().current.objectKey)).toBe(true);
    expect(pointer().previous.objectKey).toBe(second);
  });

  it('does not retire early during rapid publication', async () => {
    await publish(); const first = pointer().current.objectKey;
    advance(1000); await publish(); advance(1000);
    expect(await publish()).toMatchObject({ published: true, cleanupDeferred: true });
    expect(bucket.objects.has(first)).toBe(true);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('uses actual pointer commit age after a slow staging upload, not payload creation time', async () => {
    await publish(); const first = pointer().current.objectKey;
    advance(1000);
    const secondGeneration = generation(nextId);
    bucket.hooks.beforePut = key => {
      if (key === feedObjectKey('day', secondGeneration)) {
        time += 120_000; vi.setSystemTime(time);
      }
    };
    await publish();
    const second = pointer().current;
    expect(second.generatedAtMs).toBe(baseTime + 1000);
    expect(bucket.objects.get(feedPointerKey('day')).uploaded.getTime()).toBe(baseTime + 121_000);
    delete bucket.hooks.beforePut;
    advance(1000);
    expect(await publish()).toMatchObject({ published: true, cleanupDeferred: true });
    expect(bucket.objects.has(first)).toBe(true);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it.each([undefined, new Date('invalid'), new Date(baseTime + 99_999_999)])('defers retirement when pointer commit time is unavailable or future: %s', async uploaded => {
    await publish(); const first = pointer().current.objectKey;
    advance(); await publish(); advance();
    bucket.objects.get(feedPointerKey('day')).uploaded = uploaded;
    expect(await publish()).toMatchObject({ published: true, cleanupDeferred: true });
    expect(bucket.objects.has(first)).toBe(true);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('reports deferred cleanup without misreporting an already committed publication as failed', async () => {
    await publish(); const first = pointer().current.objectKey;
    advance(); await publish(); advance();
    bucket.hooks.beforeDelete = () => { throw new Error('temporary deletion failure'); };
    expect(await publish()).toMatchObject({ published: true, cleanupDeferred: true, snapshotSequence: 3 });
    expect(pointer().current.snapshotSequence).toBe(3);
    expect(bucket.objects.has(first)).toBe(true);
  });

  it('a superseded run never deletes a previously referenced object', async () => {
    await publish(); advance(); await publish(); advance();
    const held = deferred(); const release = deferred(); const loser = generation(nextId);
    bucket.hooks.beforePut = async key => { if (key === feedObjectKey('day', loser)) { held.resolve(); await release.promise; } };
    const delayed = publish(); await held.promise; advance(); await publish();
    const deletesBefore = bucket.calls.filter(call => call.method === 'delete').length;
    release.resolve(); expect(await delayed).toMatchObject({ reason: 'superseded' });
    expect(bucket.calls.filter(call => call.method === 'delete')).toHaveLength(deletesBefore);
  });
});

describe('sequential independent period orchestration', () => {
  it('attempts every period after a failure, publishes the other periods, then rejects with bounded outcomes', async () => {
    let active = 0; let maximumActive = 0;
    const fetchEach = vi.fn(async period => {
      active++; maximumActive = Math.max(maximumActive, active);
      await Promise.resolve(); active--;
      if (period === 'week') throw new Error('week unavailable');
      return feed();
    });
    let failure;
    try { await publishEarthquakeFeeds(env, { now: baseTime, fetchFeed: fetchEach, randomUUID: () => generation(nextId++) }); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(globalThis.AggregateError);
    expect(failure.results.map(result => [result.period, result.published])).toEqual([['day', true], ['week', false], ['month', true]]);
    expect(failure.errors).toHaveLength(1);
    expect(maximumActive).toBe(1);
    expect(fetchEach.mock.calls.map(([period]) => period)).toEqual(['day', 'week', 'month']);
    expect(pointer('day')).not.toBeNull(); expect(pointer('week')).toBeNull(); expect(pointer('month')).not.toBeNull();
    expect(JSON.stringify(failure.results)).not.toContain('features');
  });

  it('returns bounded successful and unchanged outcomes without renewing pointers', async () => {
    const options = { now: baseTime, fetchFeed: async () => feed(), randomUUID: () => generation(nextId++) };
    const first = await publishEarthquakeFeeds(env, options);
    expect(first.every(result => result.published)).toBe(true);
    const second = await publishEarthquakeFeeds(env, options);
    expect(second.every(result => !result.published && result.reason === 'unchanged')).toBe(true);
  });
});
