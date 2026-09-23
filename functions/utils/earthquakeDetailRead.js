import { isValidUsgsEventId, readBoundedJsonResponse, USGS_LIMITS, UsgsTransportError, validateUsgsDetail } from './usgs-transport.js';

// Shared read-only archive boundary for JSON detail responses and crawler HTML.
// A corrupt archive is an error, not a miss or an instruction to overwrite it.
export async function readArchivedEarthquakeDetail(bucket, eventId, { db, timeoutMs = USGS_LIMITS.timeoutMs } = {}) {
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
        let row = null;
        if (db) {
          try {
            row = await db.prepare(`SELECT source_updated_at_ms, detail_archive_key,
              detail_archive_revision_ms FROM EarthquakeEvents WHERE id = ?`).bind(eventId).first();
          } catch {
            throw new UsgsTransportError('Stored earthquake archive pointer is unavailable', {
              status: 503, code: 'ARCHIVE_DB_UNAVAILABLE',
            });
          }
        }
        const pointer = row?.detail_archive_key;
        if (pointer && (!Number.isSafeInteger(row.detail_archive_revision_ms) ||
            (Number.isSafeInteger(row.source_updated_at_ms) &&
              row.detail_archive_revision_ms < row.source_updated_at_ms))) return null;
        const object = await bucket.get(pointer || `${eventId}.json`);
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
        if (pointer && data.properties.updated !== row.detail_archive_revision_ms) {
          throw new UsgsTransportError('Committed earthquake archive revision is invalid', { code: 'ARCHIVE_REVISION_MISMATCH' });
        }
        if (!pointer && Number.isSafeInteger(row?.source_updated_at_ms) &&
            data.properties.updated < row.source_updated_at_ms) return null;
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
