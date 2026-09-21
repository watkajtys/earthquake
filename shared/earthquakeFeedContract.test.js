// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FEED_FRESHNESS_MS, FEED_CLOCK_SKEW_MS, MAX_FEED_FEATURES, validateCompleteUsgsFeed,
  validateFeedEnvelope, validateFeedPointer, readBoundedFeedJson,
} from './earthquakeFeedContract.js';
const now = Date.UTC(2026, 8, 21);
function source() {
  return { type: 'FeatureCollection', metadata: { generated: now, status: 200, count: 1 }, features: [{
    type: 'Feature', id: 'us-fixture', properties: { time: now - 29 * 86400_000, updated: now - 28 * 86400_000,
      mag: -0.5, place: null, alert: null, felt: null, tsunami: 0, sig: 0 },
    geometry: { type: 'Point', coordinates: [180, -90, -2] },
  }] };
}
function envelope() {
  return { schemaVersion: 1, source: 'usgs-summary', period: 'month',
    generationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', snapshotSequence: 1,
    generatedAtMs: now, sourceObservedAtMs: now, upstreamGeneratedAtMs: now,
    coverageStartMs: now - 30 * 86400_000, coverageEndMs: now, complete: true, totalCount: 1,
    features: source().features };
}
describe('complete earthquake feed contract', () => {
  it('accepts old and negative/null magnitude events in a fresh complete monthly observation', () => {
    const data = source();
    expect(validateCompleteUsgsFeed(data, 'month', { now })).toBe(data);
    data.features[0].properties.mag = null;
    expect(validateCompleteUsgsFeed(data, 'month', { now })).toBe(data);
    expect(validateFeedEnvelope(envelope(), { now })).toMatchObject({ totalCount: 1 });
  });
  it('accepts a genuine complete empty upstream result', () => {
    expect(validateCompleteUsgsFeed({ ...source(), metadata: { generated: now, status: 200, count: 0 }, features: [] }, 'day', { now }).features).toEqual([]);
  });
  it.each(['alert', 'felt', 'tsunami', 'sig'])('rejects missing %s without manufacturing metadata', key => {
    const data = source(); delete data.features[0].properties[key];
    expect(() => validateCompleteUsgsFeed(data, 'month', { now })).toThrow('alert metadata');
  });
  it.each([
    data => { data.metadata.count = 0; }, data => { delete data.metadata.status; },
    data => { data.metadata.generated = now - FEED_FRESHNESS_MS - 1; },
    data => { data.metadata.generated = now + FEED_CLOCK_SKEW_MS + 1; },
    data => { data.features.push(data.features[0]); data.metadata.count = 2; },
    data => { data.features[0].geometry.coordinates[0] = 181; },
    data => { data.features[0].properties.time = now - 31 * 86400_000; },
    data => { data.features[0].properties.updated = now + FEED_CLOCK_SKEW_MS + 1; },
    data => { data.features[0].properties.detail = 'https://evil.invalid/a'; },
    data => { data.features[0].properties.felt = -1; },
    data => { data.features[0].properties.alert = 'invalid'; },
    data => { data.features = Array(MAX_FEED_FEATURES + 1).fill(data.features[0]); data.metadata.count = data.features.length; },
  ])('rejects an invalid upstream contract', mutate => {
    const data = source(); mutate(data);
    expect(() => validateCompleteUsgsFeed(data, 'month', { now })).toThrow();
  });
  it.each([
    value => { value.complete = false; }, value => { value.source = 'D1'; },
    value => { value.period = 'year'; }, value => { value.totalCount = 0; },
    value => { value.coverageStartMs++; }, value => { value.generatedAtMs = now + FEED_CLOCK_SKEW_MS + 1; },
    value => { value.snapshotSequence = 0; }, value => { value.generationId = '../current'; },
    value => { value.extra = true; },
  ])('rejects an invalid snapshot envelope', mutate => {
    const value = envelope(); mutate(value);
    expect(() => validateFeedEnvelope(value, { now })).toThrow();
  });
  it('receipt and publication cannot make an old source fresh', () => {
    const value = envelope();
    expect(() => validateFeedEnvelope(value, { now: now + FEED_FRESHNESS_MS + 1 })).toThrow('stale');
    value.sourceObservedAtMs += FEED_FRESHNESS_MS + 1;
    value.generatedAtMs = value.sourceObservedAtMs;
    expect(() => validateFeedEnvelope(value, { now: value.generatedAtMs })).toThrow('stale');
    expect(validateFeedEnvelope(value, { now: value.generatedAtMs, requireFresh: false })).toBe(value);
  });
  it('rejects descriptor period/key/sequence mismatches before storage lookup', () => {
    const { features: _features, ...metadata } = envelope();
    const current = { ...metadata, objectKey: `earthquake-feeds/v1/month/${metadata.generationId}.json`, byteLength: 300, sha256: 'a'.repeat(64) };
    expect(validateFeedPointer({ schemaVersion: 1, period: 'month', current, previous: null }, { now }).current).toBe(current);
    expect(() => validateFeedPointer({ schemaVersion: 1, period: 'day', current, previous: null }, { now })).toThrow();
    expect(() => validateFeedPointer({ schemaVersion: 1, period: 'month', current: { ...current, objectKey: 'list-month.json' }, previous: null }, { now })).toThrow();
  });
  it('bounds actual streamed bytes without relying on Content-Length', async () => {
    const cancel = new AbortController();
    await expect(readBoundedFeedJson(new Response('123456'), cancel.signal, 5)).rejects.toThrow('byte limit');
    await expect(readBoundedFeedJson(new Response('{}', { headers: { 'Content-Length': '900' } }), cancel.signal, 5)).rejects.toThrow('byte limit');
    expect(await readBoundedFeedJson(new Response('{}'), cancel.signal, 5)).toEqual({});
  });
  it('cancels a hanging body on abort', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const result = readBoundedFeedJson(response, controller.signal);
    controller.abort(new Error('Cancelled'));
    await expect(result).rejects.toThrow('Cancelled');
    expect(cancelled).toBe(true);
  });
});
