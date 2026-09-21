const USGS_ORIGIN = 'https://earthquake.usgs.gov';
const SUMMARY_PREFIX = '/earthquakes/feed/v1.0/summary/';
const DETAIL_PREFIX = '/earthquakes/feed/v1.0/detail/';

export const USGS_SUMMARY_URLS = Object.freeze(Object.fromEntries(
  ['hour', 'day', 'week', 'month'].map((period) => [period, `${USGS_ORIGIN}${SUMMARY_PREFIX}all_${period}.geojson`]),
));
export const USGS_LIMITS = Object.freeze({ summaryBytes: 16 * 1024 * 1024, detailBytes: 8 * 1024 * 1024, summaryFeatures: 30000, timeoutMs: 10000 });

export class UsgsTransportError extends Error {
  constructor(message, { status = 502, code = 'USGS_UPSTREAM_ERROR', upstreamStatus } = {}) {
    super(message);
    this.name = 'UsgsTransportError';
    this.status = status;
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

function invalidUrl() {
  return new UsgsTransportError('Unsupported USGS URL', { status: 400, code: 'INVALID_USGS_URL' });
}

function parseUsgsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/u.test(value)) throw invalidUrl();
  let url;
  try { url = new URL(value); } catch { throw invalidUrl(); }
  if (url.origin !== USGS_ORIGIN || url.username || url.password || url.search || url.hash) throw invalidUrl();
  return url;
}

export function validateUsgsSummaryUrl(value) {
  const url = parseUsgsUrl(value);
  if (!Object.values(USGS_SUMMARY_URLS).includes(url.href)) throw invalidUrl();
  return url.href;
}

export function isValidUsgsEventId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/u.test(value);
}

export function usgsDetailUrl(id) {
  if (!isValidUsgsEventId(id)) throw new UsgsTransportError('Invalid earthquake event ID', { status: 400, code: 'INVALID_EVENT_ID' });
  return `${USGS_ORIGIN}${DETAIL_PREFIX}${id}.geojson`;
}

export function validateUsgsDetailUrl(value) {
  const url = parseUsgsUrl(value);
  if (!url.pathname.startsWith(DETAIL_PREFIX) || !url.pathname.endsWith('.geojson')) throw invalidUrl();
  const id = url.pathname.slice(DETAIL_PREFIX.length, -'.geojson'.length);
  if (!isValidUsgsEventId(id) || url.href !== usgsDetailUrl(id)) throw invalidUrl();
  return url.href;
}

function invalidPayload() {
  return new UsgsTransportError('USGS returned invalid earthquake data', { code: 'INVALID_USGS_PAYLOAD' });
}

const isTimestamp = (value) => Number.isSafeInteger(value) && Math.abs(value) <= 8640000000000000;

function validateFeature(feature) {
  const properties = feature?.properties;
  const coordinates = feature?.geometry?.coordinates;
  if (feature?.type !== 'Feature' || !isValidUsgsEventId(feature.id) || !properties ||
      typeof properties !== 'object' || Array.isArray(properties) ||
      !isTimestamp(properties.time) || !isTimestamp(properties.updated) ||
      !(properties.mag === null || Number.isFinite(properties.mag)) ||
      !(properties.place === null || (typeof properties.place === 'string' && properties.place.length <= 2000)) ||
      feature.geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length !== 3 ||
      !coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) throw invalidPayload();
  if (properties.detail != null) {
    try {
      if (validateUsgsDetailUrl(properties.detail) !== usgsDetailUrl(feature.id)) throw invalidPayload();
    } catch { throw invalidPayload(); }
  }
  return feature;
}

export function validateUsgsSummary(data, maxFeatures = USGS_LIMITS.summaryFeatures) {
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > maxFeatures) throw invalidPayload();
  const ids = new Set();
  for (const feature of data.features) {
    validateFeature(feature);
    if (ids.has(feature.id)) throw invalidPayload();
    ids.add(feature.id);
  }
  return data;
}

export function validateUsgsDetail(data, requestedId) {
  validateFeature(data);
  if (data.id !== requestedId) {
    const aliases = typeof data.properties.ids === 'string' && data.properties.ids.length <= 10000
      ? data.properties.ids.split(',').filter(Boolean) : [];
    if (!aliases.every(isValidUsgsEventId) || !aliases.includes(requestedId)) throw invalidPayload();
  }
  return data;
}

export async function readBoundedJsonResponse(response, maxBytes, signal, { includeBody = false } = {}) {
  const declaredLength = response.headers.get('Content-Length');
  if (declaredLength && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new UsgsTransportError('USGS response exceeds the size limit', { code: 'USGS_RESPONSE_TOO_LARGE' });
  }
  if (!response.body) throw invalidPayload();
  const reader = response.body.getReader();
  const cancelOnAbort = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancelOnAbort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const pieces = [];
  const bodyChunks = includeBody ? [] : null;
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new UsgsTransportError('USGS response exceeds the size limit', { code: 'USGS_RESPONSE_TOO_LARGE' });
      bodyChunks?.push(value);
      pieces.push(decoder.decode(value, { stream: true }));
    }
    pieces.push(decoder.decode());
    const data = JSON.parse(pieces.join(''));
    return includeBody ? { data, body: new Blob(bodyChunks) } : data;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof UsgsTransportError || signal.aborted) throw error;
    throw invalidPayload();
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    reader.releaseLock();
  }
}

async function fetchBoundedJson(url, { maxBytes, timeoutMs = USGS_LIMITS.timeoutMs, detail = false, allowEmpty = false }) {
  const controller = new AbortController();
  const timeoutError = new UsgsTransportError('USGS request timed out', { status: 504, code: 'USGS_TIMEOUT' });
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(timeoutError); reject(timeoutError); }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          redirect: 'manual', signal: controller.signal,
          headers: { Accept: 'application/geo+json, application/json', 'User-Agent': 'EarthquakesLive/1.0 (+https://earthquakeslive.com)' },
        });
        if (!response.ok || response.redirected) {
          await response.body?.cancel().catch(() => {});
          throw new UsgsTransportError('USGS request failed', {
            status: detail && response.status === 404 ? 404 : 502,
            code: response.status >= 300 && response.status < 400 ? 'USGS_REDIRECT_REJECTED' : 'USGS_UPSTREAM_ERROR',
            upstreamStatus: response.status,
          });
        }
        if (allowEmpty && response.status === 204) return { type: 'FeatureCollection', features: [] };
        return await readBoundedJsonResponse(response, maxBytes, controller.signal);
      })(),
      deadline,
    ]);
  } catch (error) {
    controller.abort(error);
    if (error instanceof UsgsTransportError) throw error;
    throw new UsgsTransportError('USGS request failed');
  } finally { clearTimeout(timer); }
}

export async function fetchUsgsSummary(urlOrFeedKey, options = {}) {
  const url = validateUsgsSummaryUrl(USGS_SUMMARY_URLS[urlOrFeedKey] || urlOrFeedKey);
  const data = await fetchBoundedJson(url, { maxBytes: USGS_LIMITS.summaryBytes, ...options });
  return validateUsgsSummary(data, options.maxFeatures);
}

export async function fetchValidatedDetail(id, options = {}) {
  const data = await fetchBoundedJson(usgsDetailUrl(id), { maxBytes: USGS_LIMITS.detailBytes, ...options, detail: true });
  return validateUsgsDetail(data, id);
}

export function validateUsgsDateRange(startDate, endDate) {
  const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(startDate) || !validDate(endDate)) {
    throw new UsgsTransportError('Use real calendar dates in YYYY-MM-DD format', { status: 400, code: 'INVALID_DATE_RANGE' });
  }
  const duration = Date.parse(endDate) - Date.parse(startDate);
  if (duration <= 0 || duration > 7 * 86400000) {
    throw new UsgsTransportError('Date range must be positive and no longer than seven days', { status: 400, code: 'INVALID_DATE_RANGE' });
  }
}

// Administrative catch-up uses server-constructed, bounded catalog pages, never a caller-supplied URL.
export async function fetchUsgsCatalogPage({ startDate, endDate, offset = 1, limit = 1000 }, options = {}) {
  validateUsgsDateRange(startDate, endDate);
  if (!Number.isInteger(offset) || offset < 1 || offset > 20000 || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new UsgsTransportError('Invalid catalog page bounds', { status: 400, code: 'INVALID_CATALOG_PAGE' });
  }
  const url = new URL('/fdsnws/event/1/query', USGS_ORIGIN);
  url.search = new URLSearchParams({ format: 'geojson', starttime: startDate, endtime: endDate, orderby: 'time-asc', limit: String(limit), offset: String(offset) }).toString();
  const data = await fetchBoundedJson(url.href, { maxBytes: USGS_LIMITS.summaryBytes, ...options, allowEmpty: true });
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > limit) throw invalidPayload();
  // FDSN returns a query URL in properties.detail; scheduled summary feeds return a feed URL.
  // Validate either official representation, then persist the canonical event URL only.
  data.features = data.features.map((feature) => {
    if (!isValidUsgsEventId(feature?.id)) throw invalidPayload();
    const detail = feature.properties?.detail;
    const canonical = usgsDetailUrl(feature.id);
    if (detail != null && detail !== canonical) {
      let parsed;
      try { parsed = new URL(detail); } catch { throw invalidPayload(); }
      if (parsed.origin !== USGS_ORIGIN || parsed.username || parsed.password || parsed.hash ||
          parsed.pathname !== '/fdsnws/event/1/query' || parsed.searchParams.size !== 2 ||
          parsed.searchParams.get('eventid') !== feature.id || parsed.searchParams.get('format') !== 'geojson') throw invalidPayload();
    }
    return { ...feature, properties: { ...feature.properties, detail: canonical } };
  });
  return validateUsgsSummary(data, limit);
}
