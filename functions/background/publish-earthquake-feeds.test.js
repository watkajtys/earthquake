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
      totalCount: 1, upstreamGeneratedAtMs: baseTime, durationMs: 0 });
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
    expect(fetchFeed).toHaveBeenCalledWith(period, expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: expect.any(Number) }));
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

  it('bounds each source attempt at ten seconds and permits only one timeout retry', async () => {
    vi.useFakeTimers(); vi.setSystemTime(baseTime);
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const result = publish('day', { fetchFeed: undefined });
    const settled = result.then(() => ({ fulfilled: true }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(20_200);
    expect((await settled).error).toMatchObject({ code: 'USGS_TIMEOUT', status: 504 });
    expect(fetch).toHaveBeenCalledTimes(2);
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

describe('permanent immutable complete-feed archive', () => {
  it('retains every generation after the pointer has moved beyond it', async () => {
    const archived = [];
    for (let index = 0; index < 5; index++) {
      if (index) advance();
      const result = await publish();
      expect(result).toMatchObject({ published: true, snapshotSequence: index + 1 });
      expect(result).not.toHaveProperty('cleanupDeferred');
      const key = pointer().current.objectKey;
      archived.push({ key, sha256: await sha256Hex(bucket.objects.get(key).bytes) });
    }

    expect(pointer().previous.objectKey).toBe(archived.at(-2).key);
    for (const { key, sha256 } of archived) {
      expect(bucket.objects.has(key)).toBe(true);
      expect(await sha256Hex(bucket.objects.get(key).bytes)).toBe(sha256);
    }
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('retains old generations through rapid publication and an invalid pointer upload timestamp', async () => {
    await publish(); const first = pointer().current.objectKey;
    advance(1000); await publish();
    bucket.objects.get(feedPointerKey('day')).uploaded = new Date('invalid');
    advance(1000);
    expect(await publish()).toMatchObject({ published: true, snapshotSequence: 3 });
    expect(bucket.objects.has(first)).toBe(true);
    expect(bucket.calls.some(call => call.method === 'delete')).toBe(false);
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

  it.each([
    ['old feature', value => { value.features[0].properties.time = baseTime - 31 * 86400_000; }, 'INVALID_FEED_FEATURE_TIMESTAMPS'],
    ['alert metadata', value => { delete value.features[0].properties.alert; }, 'INVALID_FEED_ALERT_METADATA'],
  ])('distinguishes invalid %s from transport faults without exposing feature content', async (_, corrupt, code) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalid = feed(); corrupt(invalid);
    let failure;
    try { await publishEarthquakeFeeds(env, { now: baseTime, fetchFeed: async () => invalid }); } catch (error) { failure = error; }
    expect(failure.errors).toHaveLength(3);
    expect(failure.errors.every(error => error.code === code)).toBe(true);
    expect(log.mock.calls.map(([, value]) => [value.period, value.stage, value.code]))
      .toEqual(['day', 'week', 'month'].map(period => [period, 'source-validation', code]));
    expect(bucket.calls.some(call => call.method === 'put')).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('features');
  });

  it('bounds an invalid caller period before logging its validation failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(publishEarthquakeFeed(env, 'https://secret.invalid/?token=hidden')).rejects.toMatchObject({ code: 'INVALID_FEED_PERIOD' });
    expect(log).toHaveBeenCalledWith('[period-feeds] Period publication failed.', expect.objectContaining({ period: 'unknown', code: 'INVALID_FEED_PERIOD' }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret.invalid|hidden/);
  });

  it('assigns a stable code to unconfirmed storage writes', async () => {
    bucket.hooks.afterPut = () => null;
    await expect(publish()).rejects.toMatchObject({ code: 'FEED_WRITE_UNCONFIRMED', message: 'R2 did not confirm earthquake feed write' });
  });

  it('logs every cause with stage, release and upstream status before retaining the aggregate', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const upstream = Object.assign(new Error('https://secret.invalid/?token=hidden'), { code: 'USGS_HTTP_ERROR', upstreamStatus: 503 });
    env.WORKER_VERSION_METADATA = { id: 'test-version' }; env.RELEASE_REVISION = 'b'.repeat(40);
    const options = { now: baseTime, fetchFeed: async period => { if (period === 'week') throw upstream; return feed(); }, randomUUID: () => generation(nextId++) };
    let aggregate;
    try { await publishEarthquakeFeeds(env, options); } catch (error) { aggregate = error; }
    expect(aggregate.errors).toEqual([upstream]);
    expect(log).toHaveBeenCalledWith('[period-feeds] Period publication failed.', { period: 'week', stage: 'source-fetch',
      code: 'USGS_HTTP_ERROR', upstreamStatus: 503, attempt: 1, elapsedMs: 0, versionId: 'test-version', revision: 'b'.repeat(40) });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret.invalid|hidden|features/);
    log.mockClear(); bucket.hooks.beforeGet = () => { throw new Error('raw credentials hidden'); };
    await expect(publishEarthquakeFeeds(env, options)).rejects.toBeInstanceOf(globalThis.AggregateError);
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.map(([, diagnostic]) => diagnostic.stage)).toEqual(['pointer-read', 'pointer-read', 'pointer-read']);
    expect(JSON.stringify(log.mock.calls)).not.toContain('credentials');
  });

  it('returns bounded successful and unchanged outcomes without renewing pointers', async () => {
    const options = { now: baseTime, fetchFeed: async () => feed(), randomUUID: () => generation(nextId++) };
    const first = await publishEarthquakeFeeds(env, options);
    expect(first.every(result => result.published)).toBe(true);
    const second = await publishEarthquakeFeeds(env, options);
    expect(second.every(result => !result.published && result.reason === 'unchanged')).toBe(true);
  });
});

describe('publisher recovery and operational freshness', () => {
  const reset = () => new Error('put: storage service failure (10001)');
  it('recovers one transient pointer read and one source failure without replacing the comparison base', async () => {
    let reads = 0;
    bucket.hooks.beforeGet = () => { if (++reads === 1) throw new Error('get: storage service failure (10043)'); };
    fetchFeed.mockRejectedValueOnce(Object.assign(new Error('upstream unavailable'), { code: 'USGS_UPSTREAM_ERROR', upstreamStatus: 503 }));
    const pending = publish();
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toMatchObject({ published: true });
    expect(fetchFeed).toHaveBeenCalledTimes(2);
    expect(reads).toBe(2);
    expect(pointer().current.snapshotSequence).toBe(1);
  });
  it.each(['object', 'pointer'])('recognizes a committed %s write after a transient lost acknowledgement', async write => {
    let lost = false; const lostReady = deferred();
    bucket.hooks.afterPut = (key, result) => {
      if (!lost && ((key === feedPointerKey('day')) === (write === 'pointer'))) { lost = true; lostReady.resolve(); throw reset(); }
      return result;
    };
    const pending = publish(); await lostReady.promise; await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toMatchObject({ published: true, snapshotSequence: 1 });
    expect(pointer().current.snapshotSequence).toBe(1);
    expect(fetchFeed).toHaveBeenCalledOnce();
    expect(bucket.calls.filter(call => call.method === 'delete')).toHaveLength(0);
  });
  it('rejects corrupt metadata after an immutable write acknowledgement is lost', async () => {
    let lost = false; const lostReady = deferred();
    bucket.hooks.afterPut = (key, result) => {
      if (!lost && key !== feedPointerKey('day')) {
        lost = true; bucket.objects.get(key).httpMetadata.contentType = 'text/html';
        lostReady.resolve(); throw reset();
      }
      return result;
    };
    const pending = publish().catch(error => error); await lostReady.promise; await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toMatchObject({ code: 'FEED_WRITE_UNCONFIRMED' });
    expect(pointer()).toBeNull();
  });

  it('does not rebase the original pointer condition after a failed write and a concurrent winner', async () => {
    await publish(); advance();
    const base = bucket.objects.get(feedPointerKey('day')).etag;
    const failedGeneration = generation(nextId);
    let blocked = false; const blockedReady = deferred();
    bucket.hooks.beforePut = key => {
      if (key === feedPointerKey('day') && !blocked) { blocked = true; blockedReady.resolve(); throw reset(); }
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loser = publish();
    await blockedReady.promise;
    advance(1000); const winner = await publish();
    await vi.advanceTimersByTimeAsync(200);
    expect(await loser).toMatchObject({ reason: 'superseded', generationId: failedGeneration });
    expect(pointer().current.generationId).toBe(winner.generationId);
    expect(log).toHaveBeenCalledWith('[period-feeds] Freshness check.', expect.objectContaining({ state: 'superseded', stale: null, sourceAgeMs: null }));
    const writes = bucket.calls.filter(call => call.method === 'put' && call.key === feedPointerKey('day'));
    expect(writes.at(-1).options.onlyIf.etagMatches).toBe(base);
  });
  it('bounds a stalled initial get, cancels its late body and never fetches or writes afterwards', async () => {
    const cancel = vi.fn(); let resolve;
    bucket.get = vi.fn(() => new Promise(done => { resolve = done; }));
    const pending = publish().catch(error => error);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ code: 'FEED_OPERATION_TIMEOUT' });
    resolve({ body: new ReadableStream({ cancel }) }); await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(bucket.calls.filter(call => call.method === 'put')).toHaveLength(0);
  });
  it('cancels a stalled pointer body within its read budget', async () => {
    const cancel = vi.fn(); bucket.get = vi.fn(async () => ({ size: 2, etag: 'etag', body: new ReadableStream({ cancel }) }));
    const pending = publish().catch(error => error); await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ code: 'FEED_OPERATION_TIMEOUT' });
    expect(cancel).toHaveBeenCalledOnce(); expect(fetchFeed).not.toHaveBeenCalled();
  });
  it('never retries or starts a pointer write after a timed-out immutable put resolves late', async () => {
    let release; const putReady = deferred(); bucket.hooks.beforePut = () => new Promise(resolve => { release = resolve; putReady.resolve(); });
    const pending = publish().catch(error => error); await putReady.promise; await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ code: 'FEED_OPERATION_TIMEOUT' });
    delete bucket.hooks.beforePut; release(); await vi.advanceTimersByTimeAsync(0);
    expect(bucket.calls.filter(call => call.method === 'put')).toHaveLength(1);
    expect(pointer()).toBeNull();
  });
  it('continues healthy periods after a stalled first-period operation expires', async () => {
    bucket.hooks.beforeGet = key => key === feedPointerKey('day') ? new Promise(() => {}) : undefined;
    const pending = publishEarthquakeFeeds(env, { now: () => Date.now(), fetchFeed: async () => feed(), randomUUID: () => generation(nextId++) }).catch(error => error);
    await vi.advanceTimersByTimeAsync(8000);
    const error = await pending;
    expect(error.results.map(value => [value.period, value.published])).toEqual([['day', false], ['week', true], ['month', true]]);
    expect(error.errors[0].code).toBe('FEED_OPERATION_TIMEOUT');
  });

  it('enforces a total period budget and does not issue later writes after expiry', async () => {
    const putReady = deferred(); let release;
    bucket.hooks.beforePut = () => new Promise(resolve => { release = resolve; putReady.resolve(); });
    const pending = publish('day', { timeoutMs: 1000 }).catch(error => error); await putReady.promise;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ code: 'FEED_PUBLICATION_TIMEOUT' });
    delete bucket.hooks.beforePut; release(); await vi.advanceTimersByTimeAsync(0);
    expect(bucket.calls.filter(call => call.method === 'put')).toHaveLength(1); expect(pointer()).toBeNull();
  });

  it('reports last observed committed freshness during source validation failure without renewing it', async () => {
    await publish(); const committed = pointer().current;
    time += FEED_FRESHNESS_MS + 1; vi.setSystemTime(time);
    source = feed(time); source.features[0].properties.felt = 'bad';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(publish()).rejects.toMatchObject({ code: 'INVALID_FEED_ALERT_METADATA' });
    expect(warn).toHaveBeenCalledWith('[period-feeds] Freshness check.', expect.objectContaining({ period: 'day',
      state: 'stale', stale: true, sourceAgeMs: FEED_FRESHNESS_MS + 1, publicationAgeMs: FEED_FRESHNESS_MS + 1 }));
    expect(pointer().current).toEqual(committed);
  });
});
