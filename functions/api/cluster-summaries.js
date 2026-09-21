import {
  SUMMARY_SCHEMA_VERSION, SUMMARY_POINTER_KEY, SUMMARY_PAGE_SIZE,
  MAX_SUMMARY_PAGE_BYTES, MAX_SUMMARY_POINTER_BYTES, MAX_SUMMARY_MANIFEST_BYTES,
  MAX_SUMMARY_ITEMS, SUMMARY_MAX_AGE_MS, SUMMARY_STALE_AFTER_MS,
  validateSummaryPointer, validateSummaryManifest, validateSummaryPage,
  validateSummaryEnvelope, isSummaryGenerationId, summaryEnvelopeMetadata, sha256Hex,
} from '../../shared/clusterSummaryContract.js';

const MAX_CURSOR_LENGTH = 256;
const CLOCK_SKEW_MS = 60_000;
const SNAPSHOT_CLOCK_SKEW_MS = 5 * 60_000;
// Compact tags are part of cursor schema 2: overview, then the shared fixed
// endTime/magnitude/count descending and ID ascending order.
const CURSOR_VIEW = 'o';
const CURSOR_ORDER = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

class RequestFailure extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const invalidCursor = () => new RequestFailure(400, 'INVALID_CURSOR');
const unavailable = () => new RequestFailure(503, 'SUMMARY_UNAVAILABLE');

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidCursor();
  let bytes;
  try {
    bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  } catch { throw invalidCursor(); }
  if (base64url(bytes) !== value) throw invalidCursor();
  return bytes;
}

function readRequest(request, now) {
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || keys.some(key => !['view', 'limit', 'cursor'].includes(key))) {
    throw new RequestFailure(400, 'INVALID_PARAMETERS');
  }
  if (params.has('cursor')) {
    if (keys.length !== 1) throw new RequestFailure(400, 'INVALID_PARAMETERS');
    const cursor = params.get('cursor');
    if (!cursor || cursor.length > MAX_CURSOR_LENGTH) throw invalidCursor();
    const parts = cursor.split('.');
    if (parts.length !== 2) throw invalidCursor();
    const payload = decodeBase64url(parts[0]);
    const signature = decodeBase64url(parts[1]);
    let claims;
    try { claims = JSON.parse(decoder.decode(payload)); } catch { throw invalidCursor(); }
    if (!Array.isArray(claims) || claims.length !== 7 || claims[0] !== SUMMARY_SCHEMA_VERSION ||
        !isSummaryGenerationId(claims[1]) ||
        !Number.isSafeInteger(claims[2]) || claims[2] < 1 || claims[2] >= MAX_SUMMARY_ITEMS ||
        !Number.isSafeInteger(claims[3]) || claims[3] < 1 || claims[3] > SUMMARY_PAGE_SIZE ||
        claims[2] % claims[3] !== 0 || claims[4] !== CURSOR_VIEW || claims[5] !== CURSOR_ORDER ||
        !Number.isSafeInteger(claims[6]) || claims[6] < 0 || claims[6] > now + CLOCK_SKEW_MS ||
        signature.byteLength !== 32) throw invalidCursor();
    if (now - claims[6] > SUMMARY_MAX_AGE_MS) throw new RequestFailure(410, 'GENERATION_EXPIRED');
    return { generationId: claims[1], offset: claims[2], limit: claims[3], issuedAtMs: claims[6], payload, signature };
  }
  if (params.has('view') && params.get('view') !== 'overview') throw new RequestFailure(400, 'INVALID_PARAMETERS');
  const rawLimit = params.get('limit');
  if (rawLimit !== null && (!/^[1-9]\d{0,2}$/.test(rawLimit) || Number(rawLimit) > SUMMARY_PAGE_SIZE)) {
    throw new RequestFailure(400, 'INVALID_PARAMETERS');
  }
  return { generationId: null, offset: 0, limit: rawLimit === null ? 100 : Number(rawLimit), issuedAtMs: now };
}

// R2 metadata bounds the expected allocation; the stream bound also protects
// against malformed objects or a dishonest test/storage adapter's size field.
async function readObject(bucket, key, maxBytes) {
  const object = await bucket.get(key);
  if (!object || !Number.isSafeInteger(object.size) || object.size < 0 || object.size > maxBytes || !object.body) {
    throw unavailable();
  }
  const reader = object.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes || length > object.size) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (length !== object.size) throw unavailable();
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = decoder.decode(bytes);
  return { value: JSON.parse(text), text, byteLength: length };
}

function sameSnapshot(actual, expected) {
  const fields = ['schemaVersion', 'source', 'sourceWatermarkMs', 'view', 'generationId',
    'snapshotSequence', 'generatedAtMs', 'sourceObservedAtMs', 'totalCount'];
  return fields.every(key => actual[key] === expected[key]);
}

async function cursorKey(secret) {
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) throw unavailable();
  const bytes = Uint8Array.from(secret.match(/../g), hex => Number.parseInt(hex, 16));
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function nextCursor(descriptor, offset, request, key) {
  const payload = encoder.encode(JSON.stringify([SUMMARY_SCHEMA_VERSION, descriptor.generationId,
    offset, request.limit, CURSOR_VIEW, CURSOR_ORDER, request.issuedAtMs]));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
  const cursor = `${base64url(payload)}.${base64url(signature)}`;
  if (cursor.length > MAX_CURSOR_LENGTH) throw unavailable();
  return cursor;
}

function json(value, status = 200) {
  const body = JSON.stringify(value);
  if (encoder.encode(body).byteLength > MAX_SUMMARY_PAGE_BYTES) throw unavailable();
  return new Response(body, {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ request, env }) {
  try {
    const now = Date.now();
    const query = readRequest(request, now);
    const bucket = env.GEOJSON_BUCKET;
    if (!bucket?.get) throw unavailable();
    const pointer = validateSummaryPointer((await readObject(bucket, SUMMARY_POINTER_KEY, MAX_SUMMARY_POINTER_BYTES)).value);
    const descriptor = query.generationId === null || query.generationId === pointer.current.generationId
      ? pointer.current : pointer.history.find(item => item.generationId === query.generationId);
    if (!descriptor || (descriptor !== pointer.current && now - descriptor.generatedAtMs > SUMMARY_MAX_AGE_MS)) {
      throw new RequestFailure(410, 'GENERATION_EXPIRED');
    }
    if (descriptor.generatedAtMs > now + SNAPSHOT_CLOCK_SKEW_MS || descriptor.sourceObservedAtMs > now + SNAPSHOT_CLOCK_SKEW_MS) throw unavailable();
    const manifest = validateSummaryManifest((await readObject(bucket, descriptor.manifestKey, MAX_SUMMARY_MANIFEST_BYTES)).value, descriptor);
    if (!sameSnapshot(manifest, descriptor) || manifest.pageCount !== descriptor.pageCount || manifest.manifestKey !== descriptor.manifestKey) {
      throw unavailable();
    }
    const key = await cursorKey(manifest.cursorSecret);
    if (query.signature && !await crypto.subtle.verify('HMAC', key, query.signature, query.payload)) throw invalidCursor();
    if (query.offset > 0 && query.offset >= descriptor.totalCount) throw invalidCursor();
    const end = Math.min(query.offset + query.limit, descriptor.totalCount);
    const items = [];
    if (end > query.offset || descriptor.totalCount === 0) {
      const firstPage = Math.floor(query.offset / SUMMARY_PAGE_SIZE);
      const lastPage = descriptor.totalCount === 0 ? 0 : Math.floor((end - 1) / SUMMARY_PAGE_SIZE);
      for (let index = firstPage; index <= lastPage; index++) {
        const entry = manifest.pages[index];
        const stored = await readObject(bucket, entry.key, MAX_SUMMARY_PAGE_BYTES);
        if (stored.byteLength !== entry.byteLength || await sha256Hex(stored.text) !== entry.sha256) throw unavailable();
        const page = validateSummaryPage(stored.value, manifest, index);
        if (!sameSnapshot(page, descriptor) || page.pageIndex !== index || page.items.length !== entry.count) throw unavailable();
        const from = Math.max(0, query.offset - index * SUMMARY_PAGE_SIZE);
        const to = Math.min(page.items.length, end - index * SUMMARY_PAGE_SIZE);
        items.push(...page.items.slice(from, to));
      }
    }
    if (items.length !== end - query.offset) throw unavailable();
    return json(validateSummaryEnvelope({ ...summaryEnvelopeMetadata(descriptor), items,
      nextCursor: end < descriptor.totalCount ? await nextCursor(descriptor, end, query, key) : null,
      stale: now - descriptor.generatedAtMs > SUMMARY_STALE_AFTER_MS,
    }));
  } catch (error) {
    return json({ code: error instanceof RequestFailure ? error.code : 'SUMMARY_UNAVAILABLE' },
      error instanceof RequestFailure ? error.status : 503);
  }
}
