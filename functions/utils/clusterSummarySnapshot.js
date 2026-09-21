import {
  SUMMARY_SCHEMA_VERSION, SUMMARY_SOURCE, SUMMARY_VIEW, SUMMARY_POINTER_KEY,
  SUMMARY_PAGE_SIZE, MAX_SUMMARY_ITEMS, MAX_SUMMARY_PAGE_BYTES,
  MAX_SUMMARY_POINTER_BYTES, MAX_SUMMARY_MANIFEST_BYTES, SUMMARY_MAX_AGE_MS,
  MAX_RETAINED_GENERATIONS, generationManifestKey, generationPageKey,
  summaryEnvelopeMetadata, projectSummaryItem, compareSummaryItems, sha256Hex,
  validateSummaryPointer, validateSummaryDescriptor, validateSummaryManifest, validateSummaryPage,
} from '../../shared/clusterSummaryContract.js';

export const SUMMARY_PROJECTION_SQL = `SELECT
  id, slug, title, locationName, quakeCount, maxMagnitude, startTime, endTime, strongestQuakeId
  FROM ClusterDefinitions
  WHERE endTime >= ? AND maxMagnitude >= ?
  LIMIT ?`;

// Bound streamed bytes even if object metadata is malformed or unavailable.
// R2 exceptions are errors, never a missing-object bootstrap signal.
export async function readSummaryJsonObject(bucket, key, maxBytes) {
  const object = await bucket.get(key);
  if (object === null) return null;
  if (!object || !Number.isSafeInteger(object.size) || object.size < 0 || object.size > maxBytes ||
      typeof object.etag !== 'string' || !object.etag || !object.body?.getReader) {
    throw new Error('Invalid or oversized cluster summary object');
  }
  const reader = object.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('Cluster summary object exceeds byte limit');
      chunks.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve original read failure. */ }
    throw error;
  } finally { reader.releaseLock(); }
  if (length !== object.size) throw new Error('Cluster summary object size mismatch');
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { value: JSON.parse(text), etag: object.etag, byteLength: length, text };
}
export async function readSummaryPointer(bucket) {
  const object = await readSummaryJsonObject(bucket, SUMMARY_POINTER_KEY, MAX_SUMMARY_POINTER_BYTES);
  return object === null ? { pointer: null, etag: null } : { pointer: validateSummaryPointer(object.value), etag: object.etag };
}
function encodeBounded(value, maxBytes) {
  const text = JSON.stringify(value);
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > maxBytes) throw new Error('Cluster summary snapshot exceeds byte limit');
  return { text, byteLength };
}
function confirmedWrite(result) {
  if (!result || typeof result.etag !== 'string' || !result.etag) throw new Error('R2 did not confirm cluster summary write');
}
async function putImmutable(bucket, key, text) {
  const result = await bucket.put(key, text, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
  });
  confirmedWrite(result);
}

export async function publishClusterSummarySnapshot(env, { now, randomUUID = () => crypto.randomUUID() } = {}) {
  if (!env?.GEOJSON_BUCKET?.get || !env.GEOJSON_BUCKET.put || !env.DB?.prepare) throw new Error('Missing cluster summary bindings');
  const clock = typeof now === 'function' ? now : () => now ?? Date.now();
  // The base ETag MUST precede the source read. Never rebase these observed rows
  // after losing the final compare-and-swap; the next run must read fresh data.
  const { pointer: previous, etag: baseEtag } = await readSummaryPointer(env.GEOJSON_BUCKET);
  const observationStartedAtMs = clock();
  if (!Number.isSafeInteger(observationStartedAtMs) || observationStartedAtMs < 0) throw new Error('Invalid observation time');
  const result = await env.DB.prepare(SUMMARY_PROJECTION_SQL)
    .bind(observationStartedAtMs - 30 * 86400_000, 4.5, MAX_SUMMARY_ITEMS + 1).all();
  if (result?.success !== true || !Array.isArray(result.results)) throw new Error('Cluster summary projection query failed');
  if (result.results.length > MAX_SUMMARY_ITEMS) throw new Error('Cluster summary projection exceeds item limit');
  const sourceObservedAtMs = clock();
  const items = [];
  const ids = new Set();
  for (const row of result.results) {
    const item = await projectSummaryItem(row);
    if (ids.has(item.id)) throw new Error('Duplicate cluster summary ID');
    ids.add(item.id); items.push(item);
  }
  items.sort(compareSummaryItems);
  const generationId = randomUUID();
  const descriptor = validateSummaryDescriptor({
    schemaVersion: SUMMARY_SCHEMA_VERSION, source: SUMMARY_SOURCE, sourceWatermarkMs: null,
    view: SUMMARY_VIEW, generationId, snapshotSequence: (previous?.current.snapshotSequence ?? 0) + 1,
    generatedAtMs: clock(), sourceObservedAtMs, totalCount: items.length,
    pageCount: Math.max(1, Math.ceil(items.length / SUMMARY_PAGE_SIZE)),
    manifestKey: generationManifestKey(generationId),
  });
  if (sourceObservedAtMs < observationStartedAtMs) throw new Error('Clock moved backwards during summary observation');
  const cursorSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  const manifest = { ...descriptor, pageSize: SUMMARY_PAGE_SIZE, pages: [], cursorSecret };
  for (let index = 0; index < descriptor.pageCount; index++) {
    const page = {
      ...summaryEnvelopeMetadata(descriptor), pageIndex: index,
      items: items.slice(index * SUMMARY_PAGE_SIZE, (index + 1) * SUMMARY_PAGE_SIZE),
    };
    const { text, byteLength } = encodeBounded(page, MAX_SUMMARY_PAGE_BYTES);
    const key = generationPageKey(generationId, index);
    manifest.pages.push({ key, count: page.items.length, sha256: await sha256Hex(text), byteLength });
    validateSummaryPage(page, manifest, index);
    await putImmutable(env.GEOJSON_BUCKET, key, text);
  }
  validateSummaryManifest(manifest, descriptor);
  await putImmutable(env.GEOJSON_BUCKET, descriptor.manifestKey, encodeBounded(manifest, MAX_SUMMARY_MANIFEST_BYTES).text);
  const history = previous ? [previous.current, ...previous.history]
    .filter(entry => descriptor.generatedAtMs - entry.generatedAtMs <= SUMMARY_MAX_AGE_MS)
    .slice(0, MAX_RETAINED_GENERATIONS - 1) : [];
  const pointer = validateSummaryPointer({ schemaVersion: SUMMARY_SCHEMA_VERSION, current: descriptor, history });
  const committed = await env.GEOJSON_BUCKET.put(SUMMARY_POINTER_KEY, encodeBounded(pointer, MAX_SUMMARY_POINTER_BYTES).text, {
    onlyIf: baseEtag === null ? { etagDoesNotMatch: '*' } : { etagMatches: baseEtag },
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
  });
  if (committed === null) return { published: false, reason: 'superseded' };
  confirmedWrite(committed);
  // Deliberately bounded/log-safe; the private cursor key never leaves manifest.
  return { published: true, generationId, snapshotSequence: descriptor.snapshotSequence, totalCount: items.length, pageCount: descriptor.pageCount };
}
