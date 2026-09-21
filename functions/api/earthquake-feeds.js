import {
  FEED_PERIODS, MAX_FEED_POINTER_BYTES, feedPointerKey, validateFeedPointer,
  isFeedStale, readBoundedFeedJson,
} from '../../shared/earthquakeFeedContract.js';
import { sha256Hex } from '../../shared/clusterSummaryContract.js';

const unavailable = () => Response.json({ error: { code: 'FEED_UNAVAILABLE', message: 'Earthquake feed unavailable.' } },
  { status: 503, headers: { 'Cache-Control': 'no-store' } });
function objectMatches(object, descriptor) {
  return object && object.size === descriptor.byteLength && object.customMetadata?.sha256 === descriptor.sha256 &&
    object.httpMetadata?.contentType === 'application/json';
}
function feedHeaders(descriptor, now) {
  return new Headers({
    'Content-Type': 'application/json', 'Cache-Control': 'private, no-cache, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff', ETag: `"feed-${descriptor.sha256}"`,
    'X-Feed-Period': descriptor.period, 'X-Feed-Generation': descriptor.generationId,
    'X-Feed-Sequence': String(descriptor.snapshotSequence), 'X-Feed-Generated-At': String(descriptor.generatedAtMs),
    'X-Feed-Source-Observed-At': String(descriptor.sourceObservedAtMs),
    'X-Feed-Upstream-Generated-At': String(descriptor.upstreamGeneratedAtMs),
    'X-Feed-Coverage-Start': String(descriptor.coverageStartMs), 'X-Feed-Coverage-End': String(descriptor.coverageEndMs),
    'X-Feed-Complete': 'true', 'X-Feed-Stale': String(isFeedStale(descriptor, now)),
  });
}
function matchesEtag(value, etag) {
  return typeof value === 'string' && value.length <= 2048 && value.split(',').some(part =>
    part.trim() === '*' || part.trim().replace(/^W\//u, '') === etag);
}
async function readVerifiedBytes(object, descriptor, signal) {
  if (!objectMatches(object, descriptor) || !object.body?.getReader) throw new Error('Invalid feed object');
  const bytes = new Uint8Array(descriptor.byteLength);
  const reader = object.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  let offset = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (offset + value.byteLength > bytes.byteLength) throw new Error('Feed byte limit');
      bytes.set(value, offset); offset += value.byteLength;
    }
    if (offset !== bytes.byteLength || await sha256Hex(bytes) !== descriptor.sha256) throw new Error('Feed checksum mismatch');
    return bytes;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export async function onRequestGet({ request, env }) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {
    status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
  });
  const params = new URL(request.url).searchParams;
  const period = params.get('period') ?? 'day';
  if (!FEED_PERIODS.includes(period) || [...params.keys()].some(key => key !== 'period') || params.getAll('period').length > 1) {
    return Response.json({ error: { code: 'INVALID_PARAMETERS' } }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { const error = new Error('Feed read deadline'); controller.abort(error); reject(error); }, 10_000);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const bucket = env.GEOJSON_BUCKET;
      const pointerObject = await bucket.get(feedPointerKey(period));
      controller.signal.throwIfAborted();
      if (!pointerObject?.body || !Number.isSafeInteger(pointerObject.size) || pointerObject.size < 1 || pointerObject.size > MAX_FEED_POINTER_BYTES) {
        void pointerObject?.body?.cancel().catch(() => {});
        throw new Error('Feed pointer unavailable');
      }
      const pointer = validateFeedPointer(await readBoundedFeedJson(new Response(pointerObject.body), controller.signal, MAX_FEED_POINTER_BYTES), { period });
      const descriptor = pointer.current;
      const headers = feedHeaders(descriptor, Date.now());
      // Conditional requests verify the immutable object's existence/metadata,
      // without rereading a multi-megabyte body. Publisher supplies its checksum.
      if (request.method === 'HEAD' || matchesEtag(request.headers.get('If-None-Match'), headers.get('ETag'))) {
        const object = await bucket.head(descriptor.objectKey);
        controller.signal.throwIfAborted();
        if (!objectMatches(object, descriptor)) throw new Error('Feed object unavailable');
        if (matchesEtag(request.headers.get('If-None-Match'), headers.get('ETag'))) return new Response(null, { status: 304, headers });
        headers.set('Content-Length', String(descriptor.byteLength));
        return new Response(null, { headers });
      }
      const object = await bucket.get(descriptor.objectKey);
      controller.signal.throwIfAborted();
      const bytes = await readVerifiedBytes(object, descriptor, controller.signal);
      headers.set('Content-Length', String(bytes.byteLength));
      return new Response(bytes, { headers });
    })()]);
  } catch {
    return unavailable();
  } finally { clearTimeout(timer); }
}
