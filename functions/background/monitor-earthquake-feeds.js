import { FEED_PERIODS, MAX_FEED_POINTER_BYTES, FEED_FALLBACK_MAX_AGE_MS,
  feedPointerKey, validateFeedPointer, readBoundedFeedJson, isFeedStale } from '../../shared/earthquakeFeedContract.js';
import { readR2 } from '../utils/r2ReadRetry.js';
import { snapshotReadBudget } from '../utils/snapshotReadBudget.js';
import { failureDiagnostics, releaseDiagnostics } from '../utils/failureDiagnostics.js';

// Small pointer GET + immutable-object HEAD only. This cannot establish body
// integrity or that the API's hash-verified retained fallback will succeed.
export async function monitorEarthquakeFeeds(env) {
  const parent = new AbortController();
  return Promise.all(FEED_PERIODS.map(async period => {
    let descriptor;
    let state = 'unavailable';
    let diagnostic;
    let stage = 'pointer-get';
    let uncertain = false;
    const startedAtMs = Date.now();
    try {
      await snapshotReadBudget(parent.signal, 3000, async signal => {
        const bucket = env.GEOJSON_BUCKET;
        const object = await readR2(bucket, 'get', feedPointerKey(period), signal);
        signal.throwIfAborted();
        if (!object?.body || !Number.isSafeInteger(object.size) || object.size < 1 || object.size > MAX_FEED_POINTER_BYTES) {
          void object?.body?.cancel().catch(() => {});
          throw Object.assign(new Error('Pointer unavailable'), { code: 'FEED_POINTER_UNAVAILABLE' });
        }
        stage = 'pointer-read';
        const value = await readBoundedFeedJson(new Response(object.body), signal, MAX_FEED_POINTER_BYTES);
        stage = 'pointer-validate';
        const pointer = validateFeedPointer(value, { period });
        const matches = async candidate => {
          const head = await readR2(bucket, 'head', candidate.objectKey, signal);
          signal.throwIfAborted();
          return head && head.size === candidate.byteLength && head.customMetadata?.sha256 === candidate.sha256 &&
            head.httpMetadata?.contentType === 'application/json';
        };
        let currentAvailable = false;
        stage = 'current-head';
        try { currentAvailable = await matches(pointer.current); }
        catch (error) { signal.throwIfAborted(); uncertain = true; diagnostic = failureDiagnostics(error, { code: 'FEED_METADATA_READ_FAILED', stage: 'current-head' }); }
        if (currentAvailable) { descriptor = pointer.current; state = isFeedStale(descriptor) ? 'stale' : 'fresh'; return; }
        const previous = pointer.previous;
        stage = 'previous-head';
        if (previous && Date.now() - Math.min(previous.sourceObservedAtMs, previous.upstreamGeneratedAtMs) <= FEED_FALLBACK_MAX_AGE_MS && await matches(previous)) {
          signal.throwIfAborted();
          if (Date.now() - Math.min(previous.sourceObservedAtMs, previous.upstreamGeneratedAtMs) <= FEED_FALLBACK_MAX_AGE_MS) {
            descriptor = previous; state = 'degraded';
          }
        }
        if (state === 'unavailable' && uncertain) state = 'inconclusive';
      });
    } catch (error) {
      // Transport/deadline failure supplies no evidence that stored data is
      // unavailable. Missing objects and invalid pointer content do.
      const invalid = error?.code?.startsWith('INVALID_FEED_') || ['FEED_POINTER_UNAVAILABLE', 'FEED_BYTE_LIMIT'].includes(error?.code) || error instanceof SyntaxError;
      state = invalid ? 'unavailable' : 'inconclusive'; descriptor = undefined;
      diagnostic = failureDiagnostics(error, { code: 'FEED_METADATA_READ_FAILED', stage });
    }
    const observedAtMs = Date.now();
    const result = { event: 'feed-serving-metadata-freshness', period, state,
      observation: 'pointer-and-object-head', integrity: 'metadata-only', observedAtMs, elapsedMs: Math.max(0, observedAtMs - startedAtMs),
      ...(descriptor ? { sourceAgeMs: Math.max(0, observedAtMs - descriptor.upstreamGeneratedAtMs),
        observationAgeMs: Math.max(0, observedAtMs - descriptor.sourceObservedAtMs), snapshotSequence: descriptor.snapshotSequence } : {}),
      ...diagnostic, ...releaseDiagnostics(env) };
    console.log(JSON.stringify(result));
    return result;
  }));
}
