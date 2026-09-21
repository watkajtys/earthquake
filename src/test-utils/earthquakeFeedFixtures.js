import { FEED_PERIOD_DAYS, isFeedStale } from '../../shared/earthquakeFeedContract.js';
export function earthquakeFeature(id = 'test-quake', properties = {}) {
  const now = Date.now();
  return { type: 'Feature', id, properties: { time: now - 60_000, updated: now - 30_000, mag: 5,
    place: 'Fixture location', alert: null, tsunami: 0, felt: 0, sig: 100,
    detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`,
    url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`, ...properties },
    geometry: { type: 'Point', coordinates: [0, 0, 10] } };
}
export function completeUsgsFeed(features = [earthquakeFeature()], generated = Date.now()) {
  return { type: 'FeatureCollection', features, metadata: { generated, status: 200, count: features.length } };
}
export function feedEnvelope(period = 'day', features = [earthquakeFeature()], overrides = {}) {
  const now = Date.now();
  const generated = overrides.upstreamGeneratedAtMs ?? now;
  const sequence = overrides.snapshotSequence ?? 1;
  return { schemaVersion: 1, source: 'usgs-summary', period,
    generationId: `11111111-1111-4111-8111-${String(sequence).padStart(12, '0')}`, snapshotSequence: sequence,
    generatedAtMs: now, sourceObservedAtMs: now, upstreamGeneratedAtMs: generated,
    coverageStartMs: generated - FEED_PERIOD_DAYS[period] * 86400_000, coverageEndMs: generated,
    complete: true, totalCount: features.length, features, ...overrides };
}
export function feedHeaders(envelope, extra = {}) {
  return { 'Content-Type': 'application/json', ETag: `"feed-${String(envelope.snapshotSequence).padStart(64, '0')}"`,
    'X-Feed-Generation': envelope.generationId, 'X-Feed-Sequence': String(envelope.snapshotSequence),
    'X-Feed-Generated-At': String(envelope.generatedAtMs), 'X-Feed-Source-Observed-At': String(envelope.sourceObservedAtMs),
    'X-Feed-Upstream-Generated-At': String(envelope.upstreamGeneratedAtMs),
    'X-Feed-Coverage-Start': String(envelope.coverageStartMs), 'X-Feed-Coverage-End': String(envelope.coverageEndMs),
    'X-Feed-Complete': String(envelope.complete), 'X-Feed-Period': envelope.period,
    'X-Feed-Stale': String(isFeedStale(envelope)), ...extra };
}
export function feedResponse(envelope = feedEnvelope(), { status = 200, headers = {} } = {}) {
  return new Response(status === 304 ? null : JSON.stringify(envelope), { status, headers: feedHeaders(envelope, headers) });
}
