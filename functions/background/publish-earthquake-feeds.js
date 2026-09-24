import { fetchUsgsSummary } from '../utils/usgs-transport.js';
import { readSummaryJsonObject } from '../utils/clusterSummarySnapshot.js';
import { sha256Hex } from '../../shared/clusterSummaryContract.js';
import {
  FEED_SCHEMA_VERSION, FEED_SOURCE, FEED_PERIODS, FEED_PERIOD_DAYS,
  MAX_FEED_BYTES, MAX_FEED_POINTER_BYTES, feedPointerKey, feedObjectKey,
  feedEnvelopeMetadata, validateCompleteUsgsFeed, validateFeedEnvelope,
  validateFeedDescriptor, validateFeedPointer,
} from '../../shared/earthquakeFeedContract.js';

const HASH = /^[0-9a-f]{64}$/u;
function clockFor(now) { return typeof now === 'function' ? now : () => now ?? Date.now(); }
function encodeBounded(value, maximum) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > maximum) throw new Error('Earthquake feed exceeds byte limit');
  return bytes;
}
function confirmedWrite(result) {
  if (!result || typeof result.etag !== 'string' || !result.etag) throw new Error('R2 did not confirm earthquake feed write');
}
function outcome(period, descriptor, startedAtMs, clock, extras) {
  return { period, ...extras, generationId: descriptor.generationId, snapshotSequence: descriptor.snapshotSequence,
    totalCount: descriptor.totalCount, byteLength: descriptor.byteLength,
    upstreamGeneratedAtMs: descriptor.upstreamGeneratedAtMs, durationMs: Math.max(0, clock() - startedAtMs) };
}

// Sorting keys and feature IDs makes the source hash insensitive to transport
// object-key/member ordering. Every retained feature property still contributes.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
async function sourceHash(features) {
  const sorted = [...features].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const bytes = new TextEncoder().encode(canonicalJson(sorted));
  if (bytes.byteLength > MAX_FEED_BYTES) throw new Error('Earthquake feed exceeds byte limit');
  return sha256Hex(bytes);
}

export async function publishEarthquakeFeed(env, period, {
  now, fetchFeed = fetchUsgsSummary, randomUUID = () => crypto.randomUUID(),
} = {}) {
  const key = feedPointerKey(period);
  const bucket = env?.GEOJSON_BUCKET;
  if (!bucket?.get || !bucket.put || !bucket.head) throw new Error('Missing earthquake feed R2 binding');
  const clock = clockFor(now);
  const startedAtMs = clock();
  // Take the comparison base before the source fetch. A conditional loser must
  // discard its staged observation; it must never rebase old data on a new ETag.
  const read = await readSummaryJsonObject(bucket, key, MAX_FEED_POINTER_BYTES);
  const previous = read ? validateFeedPointer(read.value, { period, now: startedAtMs }) : null;
  if (previous && startedAtMs < previous.current.generatedAtMs) throw new Error('Clock moved backwards before feed observation');
  const source = await fetchFeed(period);
  const sourceObservedAtMs = clock();
  validateCompleteUsgsFeed(source, period, { now: sourceObservedAtMs });
  const upstreamGeneratedAtMs = source.metadata.generated;
  if (previous && upstreamGeneratedAtMs < previous.current.upstreamGeneratedAtMs) {
    throw new Error('USGS feed generation moved backwards');
  }
  const sourceSha256 = await sourceHash(source.features);
  if (previous && upstreamGeneratedAtMs === previous.current.upstreamGeneratedAtMs) {
    // Do not manufacture freshness by replacing an unchanged upstream snapshot.
    // Verify its canonical content through immutable object metadata, avoiding a
    // second large GeoJSON parse while the newly fetched source is in memory.
    const object = await bucket.head(previous.current.objectKey);
    if (!object || object.size !== previous.current.byteLength ||
        object.customMetadata?.sha256 !== previous.current.sha256 ||
        !HASH.test(object.customMetadata?.sourceSha256 ?? '') ||
        object.customMetadata.sourceSha256 !== sourceSha256) {
      throw new Error('Equal USGS generation has missing or mismatched snapshot content');
    }
    return outcome(period, previous.current, startedAtMs, clock, { published: false, reason: 'unchanged' });
  }
  const generationId = randomUUID();
  const envelope = validateFeedEnvelope({
    schemaVersion: FEED_SCHEMA_VERSION, source: FEED_SOURCE, period, generationId,
    snapshotSequence: (previous?.current.snapshotSequence ?? 0) + 1,
    generatedAtMs: clock(), sourceObservedAtMs, upstreamGeneratedAtMs,
    coverageStartMs: upstreamGeneratedAtMs - FEED_PERIOD_DAYS[period] * 86400_000,
    coverageEndMs: upstreamGeneratedAtMs, complete: true, totalCount: source.features.length,
    features: source.features,
  }, { period, now: clock() });
  if (sourceObservedAtMs < startedAtMs) throw new Error('Clock moved backwards during feed observation');
  const bytes = encodeBounded(envelope, MAX_FEED_BYTES);
  const sha256 = await sha256Hex(bytes);
  const descriptor = validateFeedDescriptor({
    ...feedEnvelopeMetadata(envelope), objectKey: feedObjectKey(period, generationId), byteLength: bytes.byteLength, sha256,
  }, { period, now: clock() });
  const objectWrite = await bucket.put(descriptor.objectKey, bytes, {
    onlyIf: { etagDoesNotMatch: '*' }, sha256,
    customMetadata: { sha256, sourceSha256 },
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
  });
  confirmedWrite(objectWrite);
  const pointer = validateFeedPointer({ schemaVersion: FEED_SCHEMA_VERSION, period, current: descriptor, previous: previous?.current ?? null }, { period, now: clock() });
  const committed = await bucket.put(key, encodeBounded(pointer, MAX_FEED_POINTER_BYTES), {
    onlyIf: read ? { etagMatches: read.etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
  });
  if (committed === null) return outcome(period, descriptor, startedAtMs, clock, { published: false, reason: 'superseded' });
  confirmedWrite(committed);
  // Immutable complete snapshots are the archive. Advancing the two-entry
  // pointer changes discovery, not retention of older generations.
  // No full payload or source object enters logging/aggregate results.
  return outcome(period, descriptor, startedAtMs, clock, { published: true });
}

export async function publishEarthquakeFeeds(env, options = {}) {
  const results = [];
  const failures = [];
  // The monthly source alone measured ~7.6 MB decoded. Sequential periods keep
  // large source/envelope buffers out of three concurrent publication attempts.
  for (const period of FEED_PERIODS) {
    try { results.push(await publishEarthquakeFeed(env, period, options)); }
    catch (error) {
      failures.push(error);
      results.push({ period, published: false, reason: 'failed' });
    }
  }
  if (failures.length) {
    const error = new globalThis.AggregateError(failures, `Earthquake feed publication failed for ${failures.length} periods`);
    error.results = results;
    throw error;
  }
  return results;
}
