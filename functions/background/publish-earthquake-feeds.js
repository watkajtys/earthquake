import { failureDiagnostics, releaseDiagnostics } from '../utils/failureDiagnostics.js';
import { fetchUsgsSummary } from '../utils/usgs-transport.js';
import { publicationBudget, publicationOperation, readPublicationPointer } from '../utils/publisherIO.js';
import { sha256Hex } from '../../shared/clusterSummaryContract.js';
import {
  FEED_SCHEMA_VERSION, FEED_SOURCE, FEED_PERIODS, FEED_PERIOD_DAYS,
  MAX_FEED_BYTES, MAX_FEED_POINTER_BYTES, FEED_FRESHNESS_MS, feedPointerKey, feedObjectKey,
  feedEnvelopeMetadata, validateCompleteUsgsFeed, validateFeedEnvelope,
  validateFeedDescriptor, validateFeedPointer,
} from '../../shared/earthquakeFeedContract.js';

const publicationError = (code, message) => Object.assign(new Error(message), { code });
const HASH = /^[0-9a-f]{64}$/u;
function clockFor(now) { return typeof now === 'function' ? now : () => now ?? Date.now(); }
function encodeBounded(value, maximum) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > maximum) throw publicationError('FEED_BYTE_LIMIT', 'Earthquake feed exceeds byte limit');
  return bytes;
}
function confirmedWrite(result) {
  if (!result || typeof result.etag !== 'string' || !result.etag) throw publicationError('FEED_WRITE_UNCONFIRMED', 'R2 did not confirm earthquake feed write');
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
  if (bytes.byteLength > MAX_FEED_BYTES) throw publicationError('FEED_BYTE_LIMIT', 'Earthquake feed exceeds byte limit');
  return sha256Hex(bytes);
}

export async function publishEarthquakeFeed(env, period, {
  now, fetchFeed = fetchUsgsSummary, randomUUID = () => crypto.randomUUID(), timeoutMs = 30_000,
} = {}) {
  const clock = clockFor(now);
  const startedAtMs = clock();
  let stage = 'binding';
  let attempt = 1;
  let observedDescriptor = null;
  let superseded = false;
  const budget = publicationBudget(timeoutMs);
  const io = (operation, options = {}) => publicationOperation(operation, budget, { ...options, onAttempt: value => { attempt = value; } });
  const freshness = () => {
    const observedAtMs = clock();
    const sourceAgeMs = observedDescriptor ? Math.max(0, observedAtMs - observedDescriptor.upstreamGeneratedAtMs) : null;
    const publicationAgeMs = observedDescriptor ? Math.max(0, observedAtMs - observedDescriptor.generatedAtMs) : null;
    const stale = observedDescriptor ? sourceAgeMs > FEED_FRESHNESS_MS || observedAtMs - observedDescriptor.sourceObservedAtMs > FEED_FRESHNESS_MS : null;
    const diagnostic = { event: 'feed-publication-freshness', period: FEED_PERIODS.includes(period) ? period : 'unknown',
      observedAtMs, sourceAgeMs, publicationAgeMs, stale, state: superseded ? 'superseded' : stale === null ? 'unknown' : stale ? 'stale' : 'fresh',
      observation: 'last-observed-committed',
      thresholdMs: FEED_FRESHNESS_MS, ...releaseDiagnostics(env) };
    if (stale !== false && !superseded) console.warn('[period-feeds] Freshness check.', diagnostic);
    else console.log('[period-feeds] Freshness check.', diagnostic);
  };
  try {
    const key = feedPointerKey(period);
    const bucket = env?.GEOJSON_BUCKET;
    if (!bucket?.get || !bucket.put || !bucket.head) throw publicationError('FEED_BINDING_MISSING', 'Missing earthquake feed R2 binding');
    stage = 'pointer-read';
    // Take the comparison base before the source fetch. A conditional loser must
    // discard its staged observation; it must never rebase old data on a new ETag.
    const read = await readPublicationPointer(bucket, key, MAX_FEED_POINTER_BYTES, budget);
    stage = 'pointer-validation';
    const previous = read ? validateFeedPointer(read.value, { period, now: startedAtMs }) : null;
    observedDescriptor = previous?.current ?? null;
    if (previous && startedAtMs < previous.current.generatedAtMs) throw publicationError('FEED_CLOCK_ROLLBACK', 'Clock moved backwards before feed observation');
    stage = 'source-fetch';
    const source = await io(signal => fetchFeed(period, { signal, timeoutMs: Math.min(10_000, budget.remaining()) }), { kind: 'source', maximumMs: 10_000 });
    const sourceObservedAtMs = clock();
    stage = 'source-validation';
    validateCompleteUsgsFeed(source, period, { now: sourceObservedAtMs });
    const upstreamGeneratedAtMs = source.metadata.generated;
    if (previous && upstreamGeneratedAtMs < previous.current.upstreamGeneratedAtMs) {
      throw publicationError('FEED_SOURCE_ROLLBACK', 'USGS feed generation moved backwards');
    }
    stage = 'source-hash';
    const sourceSha256 = await sourceHash(source.features);
    if (previous && upstreamGeneratedAtMs === previous.current.upstreamGeneratedAtMs) {
      // Do not manufacture freshness by replacing an unchanged upstream snapshot.
      // Verify its canonical content through immutable object metadata, avoiding a
      // second large GeoJSON parse while the newly fetched source is in memory.
      stage = 'snapshot-head';
      const object = await io(() => bucket.head(previous.current.objectKey));
      if (!object || object.size !== previous.current.byteLength ||
          object.customMetadata?.sha256 !== previous.current.sha256 ||
          !HASH.test(object.customMetadata?.sourceSha256 ?? '') ||
          object.customMetadata.sourceSha256 !== sourceSha256) {
        throw publicationError('FEED_SNAPSHOT_CONTENT_MISMATCH', 'Equal USGS generation has missing or mismatched snapshot content');
      }
      return outcome(period, previous.current, startedAtMs, clock, { published: false, reason: 'unchanged' });
    }
    stage = 'snapshot-validation';
    const generationId = randomUUID();
    const envelope = validateFeedEnvelope({
      schemaVersion: FEED_SCHEMA_VERSION, source: FEED_SOURCE, period, generationId,
      snapshotSequence: (previous?.current.snapshotSequence ?? 0) + 1,
      generatedAtMs: clock(), sourceObservedAtMs, upstreamGeneratedAtMs,
      coverageStartMs: upstreamGeneratedAtMs - FEED_PERIOD_DAYS[period] * 86400_000,
      coverageEndMs: upstreamGeneratedAtMs, complete: true, totalCount: source.features.length,
      features: source.features,
    }, { period, now: clock() });
    if (sourceObservedAtMs < startedAtMs) throw publicationError('FEED_CLOCK_ROLLBACK', 'Clock moved backwards during feed observation');
    const bytes = encodeBounded(envelope, MAX_FEED_BYTES);
    const sha256 = await sha256Hex(bytes);
    const descriptor = validateFeedDescriptor({
      ...feedEnvelopeMetadata(envelope), objectKey: feedObjectKey(period, generationId), byteLength: bytes.byteLength, sha256,
    }, { period, now: clock() });
    stage = 'snapshot-write';
    budget.signal.throwIfAborted();
    let objectAttempts = 1;
    const objectWrite = await publicationOperation(() => bucket.put(descriptor.objectKey, bytes, {
      onlyIf: { etagDoesNotMatch: '*' }, sha256,
      customMetadata: { sha256, sourceSha256 },
      httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
    }), budget, { onAttempt: value => { attempt = objectAttempts = value; } });
    if (objectWrite === null && objectAttempts > 1) {
      const stored = await io(() => bucket.head(descriptor.objectKey));
      if (!stored || stored.size !== descriptor.byteLength || stored.customMetadata?.sha256 !== sha256 ||
          stored.customMetadata?.sourceSha256 !== sourceSha256 || stored.httpMetadata?.contentType !== 'application/json') throw publicationError('FEED_WRITE_UNCONFIRMED', 'R2 did not confirm earthquake feed write');
    } else confirmedWrite(objectWrite);
    stage = 'pointer-validation';
    const pointer = validateFeedPointer({ schemaVersion: FEED_SCHEMA_VERSION, period, current: descriptor, previous: previous?.current ?? null }, { period, now: clock() });
    stage = 'pointer-write';
    budget.signal.throwIfAborted();
    let pointerAttempts = 1;
    let committed = await publicationOperation(() => bucket.put(key, encodeBounded(pointer, MAX_FEED_POINTER_BYTES), {
      onlyIf: read ? { etagMatches: read.etag } : { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
    }), budget, { onAttempt: value => { attempt = pointerAttempts = value; } });
    if (committed === null && pointerAttempts > 1) {
      const receipt = await readPublicationPointer(bucket, key, MAX_FEED_POINTER_BYTES, budget);
      const current = receipt ? validateFeedPointer(receipt.value, { period, now: clock() }).current : null;
      // Read-back confirms an acknowledgement only. Never change the comparison
      // ETag or retry old source data against a newer pointer.
      if (current?.generationId === descriptor.generationId && current.sha256 === descriptor.sha256 &&
          current.snapshotSequence === descriptor.snapshotSequence) committed = { etag: receipt.etag };
      observedDescriptor = current;
    }
    if (committed === null) {
      // A winner may have advanced freshness. The old base is no longer an
      // authoritative observation and must not trigger a false stale alert.
      observedDescriptor = null; superseded = true;
      return outcome(period, descriptor, startedAtMs, clock, { published: false, reason: 'superseded' });
    }
    confirmedWrite(committed);
    observedDescriptor = descriptor;
    // Immutable complete snapshots are the archive. Advancing the two-entry
    // pointer changes discovery, not retention of older generations.
    // No full payload or source object enters logging/aggregate results.
    return outcome(period, descriptor, startedAtMs, clock, { published: true });
  } catch (error) {
    const diagnostic = { period: FEED_PERIODS.includes(period) ? period : 'unknown', ...failureDiagnostics(error, { stage, code: 'FEED_PUBLICATION_FAILED' }),
      attempt, elapsedMs: Math.max(0, clock() - startedAtMs), ...releaseDiagnostics(env) };
    console.error('[period-feeds] Period publication failed.', diagnostic);
    // Keep the original exception identity/cause for the aggregate and caller.
    throw error;
  } finally { budget.close(); freshness(); }
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
