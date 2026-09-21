import { isValidUsgsEventId, readBoundedJsonResponse, USGS_LIMITS, UsgsTransportError, validateUsgsDetail } from './usgs-transport.js';

// Shared read-only archive boundary for JSON detail responses and crawler HTML.
// A corrupt archive is an error, not a miss or an instruction to overwrite it.
export async function readArchivedEarthquakeDetail(bucket, eventId, { timeoutMs = USGS_LIMITS.timeoutMs } = {}) {
  if (!isValidUsgsEventId(eventId)) throw new UsgsTransportError('Invalid earthquake event ID', { status: 400 });
  if (!bucket) return null;
  const controller = new AbortController();
  const timeoutError = new UsgsTransportError('Archived earthquake read timed out', { status: 504, code: 'ARCHIVE_TIMEOUT' });
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(timeoutError); reject(timeoutError); }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const object = await bucket.get(`${eventId}.json`);
        if (controller.signal.aborted) {
          await object?.body?.cancel().catch(() => {});
          throw timeoutError;
        }
        if (object === null) return null;
        const headers = new Headers();
        object.writeHttpMetadata?.(headers);
        if (Number.isSafeInteger(object.size) && object.size >= 0) headers.set('Content-Length', String(object.size));
        const { data, body } = await readBoundedJsonResponse(new Response(object.body, { headers }), USGS_LIMITS.detailBytes, controller.signal, { includeBody: true });
        validateUsgsDetail(data, eventId);
        // Preserve the exact validated bytes so stored representation metadata,
        // including the strong R2 ETag, remains correct for JSON detail reads.
        if (object.httpEtag) headers.set('ETag', object.httpEtag);
        headers.set('Content-Type', 'application/json');
        headers.set('X-Data-Source', 'R2-Storage');
        return { data, body, headers };
      })(),
      deadline,
    ]);
  } catch (error) {
    controller.abort(error);
    if (error instanceof UsgsTransportError) throw error;
    throw new UsgsTransportError('Archived earthquake detail is unavailable', { code: 'ARCHIVE_READ_FAILED' });
  } finally {
    clearTimeout(timer);
  }
}
