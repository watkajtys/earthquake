// A complete, fixed USGS summary window; publication and event revision clocks
// are distinct. Legacy D1/R2 lists cannot satisfy this contract.
export const FEED_SCHEMA_VERSION = 1;
export const FEED_SOURCE = 'usgs-summary';
export const FEED_PERIOD_DAYS = Object.freeze({ day: 1, week: 7, month: 30 });
export const FEED_PERIODS = Object.freeze(Object.keys(FEED_PERIOD_DAYS));
export const FEED_PREFIX = 'earthquake-feeds/v1/';
export const MAX_FEED_BYTES = 17 * 1024 * 1024;
export const MAX_FEED_FEATURES = 30_000;
export const MAX_FEED_POINTER_BYTES = 8 * 1024;
export const FEED_FRESHNESS_MS = 10 * 60_000;
export const FEED_CLOCK_SKEW_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9_-]{1,100}$/u;
const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function check(condition, reason) { if (!condition) throw new Error(`Invalid earthquake feed: ${reason}`); }
function keys(value, required) {
  check(object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key)), 'fields');
}
export function feedSourceUrl(period) {
  check(FEED_PERIODS.includes(period), 'period');
  return `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${period}.geojson`;
}
export function feedPointerKey(period) {
  check(FEED_PERIODS.includes(period), 'period');
  return `${FEED_PREFIX}${period}/current.json`;
}
export function feedObjectKey(period, generationId) {
  check(FEED_PERIODS.includes(period) && typeof generationId === 'string' && UUID.test(generationId), 'object identity');
  return `${FEED_PREFIX}${period}/${generationId}.json`;
}

function validateFeatures(features, period, generated, now) {
  check(Array.isArray(features) && features.length <= MAX_FEED_FEATURES, 'feature count');
  const ids = new Set();
  for (const feature of features) {
    const p = feature?.properties;
    const c = feature?.geometry?.coordinates;
    check(feature?.type === 'Feature' && typeof feature.id === 'string' && ID.test(feature.id) &&
      !ids.has(feature.id) && object(p), 'feature identity');
    ids.add(feature.id);
    check(timestamp(p.time) && timestamp(p.updated) && p.updated <= now + FEED_CLOCK_SKEW_MS &&
      p.time >= generated - FEED_PERIOD_DAYS[period] * 86400_000 - FEED_CLOCK_SKEW_MS &&
      p.time <= generated + FEED_CLOCK_SKEW_MS, 'feature timestamps');
    check((p.mag === null || Number.isFinite(p.mag)) &&
      (p.place === null || (typeof p.place === 'string' && p.place.length <= 2000)), 'magnitude/place');
    check(feature.geometry?.type === 'Point' && Array.isArray(c) && c.length === 3 &&
      c.every(Number.isFinite) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90, 'coordinates');
    check(['alert', 'felt', 'tsunami', 'sig'].every(key => Object.hasOwn(p, key)) &&
      (p.alert === null || ['green', 'yellow', 'orange', 'red'].includes(p.alert)) &&
      (p.felt === null || (Number.isSafeInteger(p.felt) && p.felt >= 0)) &&
      (p.tsunami === null || p.tsunami === 0 || p.tsunami === 1) &&
      (p.sig === null || (Number.isFinite(p.sig) && p.sig >= 0)), 'alert metadata');
    if (p.detail != null) check(p.detail === `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${feature.id}.geojson`, 'detail URL');
  }
}

export function validateCompleteUsgsFeed(value, period, { now = Date.now(), requireFresh = true } = {}) {
  feedSourceUrl(period);
  const generated = value?.metadata?.generated;
  check(value?.type === 'FeatureCollection' && timestamp(generated) && generated <= now + FEED_CLOCK_SKEW_MS &&
    value.metadata.status === 200 && Number.isSafeInteger(value.metadata.count) && value.metadata.count >= 0 &&
    value.metadata.count === value.features?.length, 'upstream metadata');
  if (requireFresh) check(now - generated <= FEED_FRESHNESS_MS, 'stale upstream');
  validateFeatures(value.features, period, generated, now);
  return value;
}

const metadataKeys = ['schemaVersion', 'source', 'period', 'generationId', 'snapshotSequence',
  'generatedAtMs', 'sourceObservedAtMs', 'upstreamGeneratedAtMs', 'coverageStartMs', 'coverageEndMs', 'complete', 'totalCount'];
export function feedEnvelopeMetadata(value) { return Object.fromEntries(metadataKeys.map(key => [key, value[key]])); }
export function isFeedStale(value, now = Date.now()) {
  return now - value.upstreamGeneratedAtMs > FEED_FRESHNESS_MS || now - value.sourceObservedAtMs > FEED_FRESHNESS_MS;
}
function validateMetadata(value, { period = value?.period, now = Date.now(), requireFresh = false } = {}) {
  check(object(value) && value.schemaVersion === FEED_SCHEMA_VERSION && value.source === FEED_SOURCE &&
    FEED_PERIODS.includes(value.period) && value.period === period && value.complete === true, 'schema/source/period');
  check(typeof value.generationId === 'string' && UUID.test(value.generationId) &&
    Number.isSafeInteger(value.snapshotSequence) && value.snapshotSequence > 0, 'generation');
  check(timestamp(value.generatedAtMs) && timestamp(value.sourceObservedAtMs) && timestamp(value.upstreamGeneratedAtMs) &&
    value.generatedAtMs >= value.sourceObservedAtMs && value.generatedAtMs <= now + FEED_CLOCK_SKEW_MS &&
    value.upstreamGeneratedAtMs <= value.sourceObservedAtMs + FEED_CLOCK_SKEW_MS &&
    value.upstreamGeneratedAtMs <= now + FEED_CLOCK_SKEW_MS, 'publication timestamps');
  check(value.coverageEndMs === value.upstreamGeneratedAtMs &&
    value.coverageStartMs === value.coverageEndMs - FEED_PERIOD_DAYS[period] * 86400_000, 'coverage');
  check(Number.isSafeInteger(value.totalCount) && value.totalCount >= 0 && value.totalCount <= MAX_FEED_FEATURES, 'total count');
  if (requireFresh) check(!isFeedStale(value, now), 'stale snapshot');
}
export function validateFeedEnvelope(value, options = {}) {
  keys(value, [...metadataKeys, 'features']);
  validateMetadata(value, { requireFresh: true, ...options });
  validateFeatures(value.features, value.period, value.upstreamGeneratedAtMs, options.now ?? Date.now());
  check(value.totalCount === value.features.length, 'total mismatch');
  return value;
}
export function validateFeedDescriptor(value, options = {}) {
  keys(value, [...metadataKeys, 'objectKey', 'byteLength', 'sha256']);
  validateMetadata(value, options);
  check(value.objectKey === feedObjectKey(value.period, value.generationId) &&
    Number.isSafeInteger(value.byteLength) && value.byteLength > 0 && value.byteLength <= MAX_FEED_BYTES &&
    typeof value.sha256 === 'string' && HASH.test(value.sha256), 'object descriptor');
  return value;
}
export function validateFeedPointer(value, options = {}) {
  keys(value, ['schemaVersion', 'period', 'current', 'previous']);
  check(value.schemaVersion === FEED_SCHEMA_VERSION && value.period === (options.period ?? value.period), 'pointer schema');
  validateFeedDescriptor(value.current, { ...options, period: value.period });
  if (value.previous !== null) {
    validateFeedDescriptor(value.previous, { ...options, period: value.period, requireFresh: false });
    check(value.previous.snapshotSequence < value.current.snapshotSequence &&
      value.previous.generationId !== value.current.generationId &&
      value.previous.upstreamGeneratedAtMs < value.current.upstreamGeneratedAtMs, 'previous generation');
  }
  return value;
}

// Streaming byte bound shared by browser transport and the small R2 pointer.
// A caller-provided abort signal must cover the complete read, not just headers.
export async function readBoundedFeedJson(response, signal, maxBytes = MAX_FEED_BYTES) {
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Earthquake feed exceeds byte limit');
  }
  check(response.body?.getReader, 'missing response body');
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts = [];
  let bytes = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      check(bytes <= maxBytes, 'stream byte limit');
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return JSON.parse(parts.join(''));
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
