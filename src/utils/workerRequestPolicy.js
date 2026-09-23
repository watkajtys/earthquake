import { timingSafeEqual } from 'node:crypto';

export class RequestPolicyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function policyError(message, status, headers = {}) {
  return Response.json({ status: 'error', message }, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export async function requireAdmin(request, env) {
  if (typeof env.ADMIN_API_TOKEN !== 'string' || env.ADMIN_API_TOKEN.length < 32) {
    return policyError('Administrative API is not configured.', 503);
  }
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.length <= 4096 && /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return policyError('Authorization required.', 401, { 'WWW-Authenticate': 'Bearer' });
  // Hash to equal-length inputs before the runtime's constant-time comparison.
  const encode = new TextEncoder();
  const [expected, supplied] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(env.ADMIN_API_TOKEN)),
    crypto.subtle.digest('SHA-256', encode.encode(match[1])),
  ]);
  if (!timingSafeEqual(new Uint8Array(expected), new Uint8Array(supplied))) {
    return policyError('Authorization required.', 401, { 'WWW-Authenticate': 'Bearer' });
  }
  return null;
}

export async function readBoundedJson(request, maxBytes = 64 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new RequestPolicyError('Content-Type must be application/json.', 415);
  }
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new RequestPolicyError('Request body is too large.', 413);
  }
  if (!request.body) throw new RequestPolicyError('A JSON body is required.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RequestPolicyError('Request body timed out.', 408)), 30_000);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestPolicyError('Request body is too large.', 413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new RequestPolicyError('Expected a JSON object.');
    }
    return data;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof RequestPolicyError) throw error;
    throw new RequestPolicyError('Invalid JSON body.');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export function validateCalculation(payload, defaultMinQuakes) {
  const earthquakes = payload.earthquakes;
  const maxDistanceKm = payload.maxDistanceKm ?? 100;
  const minQuakes = payload.minQuakes ?? defaultMinQuakes;
  if (!Array.isArray(earthquakes) || earthquakes.length > 20_000) {
    throw new RequestPolicyError('earthquakes must contain at most 20000 features.');
  }
  if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0 || maxDistanceKm > 500 ||
      !Number.isInteger(minQuakes) || minQuakes < 1 || minQuakes > 20_000) {
    throw new RequestPolicyError('Invalid cluster radius or minimum count.');
  }
  const ids = new Set();
  const projected = earthquakes.map((earthquake) => {
    const { id, properties, geometry } = earthquake || {};
    if (!Array.isArray(geometry?.coordinates)) throw new RequestPolicyError('Invalid earthquake coordinates.');
    const [longitude, latitude, depth] = geometry?.coordinates || [];
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id) ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        (depth != null && !Number.isFinite(depth)) ||
        (properties?.mag != null && !Number.isFinite(properties.mag)) ||
        !Number.isFinite(properties?.time)) {
      throw new RequestPolicyError('Invalid or duplicate earthquake feature.');
    }
    ids.add(id);
    return {
      type: 'Feature', id,
      geometry: { type: 'Point', coordinates: [longitude, latitude, depth ?? null] },
      properties: { mag: properties.mag ?? null, time: properties.time },
    };
  });
  return { earthquakes: projected, maxDistanceKm, minQuakes };
}

const administrativePaths = new Set([
  '/api/batch-usgs-fetch', '/api/backfill-earthquake-details', '/api/fix-enhanced-data-flag',
]);

export async function enforceRoutePolicy(request, env) {
  const path = new URL(request.url).pathname;
  if (administrativePaths.has(path)) {
    if (request.method !== 'POST') return policyError('Method Not Allowed', 405, { Allow: 'POST' });
    return requireAdmin(request, env);
  }
  if ((path === '/api/cluster-definition' && request.method === 'POST') ||
      (path === '/api/calculate-clusters' && request.method === 'POST') ||
      (path === '/api/cache-stats' && request.method === 'DELETE')) {
    return requireAdmin(request, env);
  }
  if (path.startsWith('/api/earthquake/') && !['GET', 'HEAD'].includes(request.method)) {
    return policyError('Method Not Allowed', 405, { Allow: 'GET, HEAD' });
  }
  return null;
}

export function finalizeResponse(request, response, env) {
  const path = new URL(request.url).pathname;
  const noStore = /^text\/html\b/i.test(response.headers.get('Content-Type') || '') ||
    response.status >= 400 || response.status === 204 ||
    administrativePaths.has(path) || path === '/api/calculate-clusters' ||
    path === '/api/release-identity' || !['GET', 'HEAD'].includes(request.method) ||
    request.headers.has('Authorization');
  if (!noStore && env.DEPLOYMENT_ENVIRONMENT !== 'preview' && request.method !== 'HEAD') return response;
  const result = new Response(request.method === 'HEAD' ? null : response.body, response);
  if (noStore) result.headers.set('Cache-Control', 'no-store');
  if (env.DEPLOYMENT_ENVIRONMENT === 'preview') result.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return result;
}
