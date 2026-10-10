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

// Older feed details move to the catalog. Validate the Location as data, then
// construct the only permitted second request ourselves; never follow it blindly.
function detailCatalogRedirect(location, id) {
  if (typeof location !== 'string' || location.length > 2048 || /[\s\\#]/u.test(location) ||
      !/^(?:https:\/\/earthquake\.usgs\.gov)?\/fdsnws\/event\/1\/query\?/u.test(location)) return null;
  let target;
  try { target = new URL(location, USGS_ORIGIN); } catch { return null; }
  if (target.origin !== USGS_ORIGIN || target.username || target.password || target.port || target.hash ||
      target.pathname !== '/fdsnws/event/1/query' || target.searchParams.size !== 2 ||
      target.searchParams.get('eventid') !== id || target.searchParams.get('format') !== 'geojson') return null;
  const canonical = new URL('/fdsnws/event/1/query', USGS_ORIGIN);
  canonical.search = new URLSearchParams({ eventid: id, format: 'geojson' }).toString();
  return canonical.href;
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

async function isDeletedEventResponse(response, signal) {
  if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('text/plain') || !response.body) return false;
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  let text = '';
  let bytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) return false;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return /^The requested event has been deleted\. To see information for deleted events,/m.test(text);
  } catch {
    signal.throwIfAborted();
    return false;
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function fetchBoundedJson(url, { maxBytes, timeoutMs = USGS_LIMITS.timeoutMs, signal, detail = false, detailId, allowEmpty = false }) {
  const controller = new AbortController();
  const timeoutError = new UsgsTransportError('USGS request timed out', { status: 504, code: 'USGS_TIMEOUT' });
  let timer;
  let abortParent;
  const deadline = new Promise((_, reject) => {
    abortParent = () => {
      const error = signal.reason instanceof UsgsTransportError ? signal.reason
        : new UsgsTransportError('USGS request aborted', { status: 504, code: 'USGS_ABORTED' });
      controller.abort(error); reject(error);
    };
    if (signal?.aborted) abortParent();
    else signal?.addEventListener('abort', abortParent, { once: true });
    timer = setTimeout(() => { controller.abort(timeoutError); reject(timeoutError); }, timeoutMs);
  });
  const waitForRetry = () => new Promise((resolve, reject) => {
    controller.signal.throwIfAborted();
    const finish = () => { controller.signal.removeEventListener('abort', abort); resolve(); };
    const delay = setTimeout(finish, 100);
    const abort = () => { clearTimeout(delay); controller.signal.removeEventListener('abort', abort); reject(controller.signal.reason); };
    controller.signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([
      (async () => {
        const requestOptions = {
          redirect: 'manual', signal: controller.signal,
          headers: { Accept: 'application/geo+json, application/json', 'User-Agent': 'EarthquakesLive/1.0 (+https://earthquakeslive.com)' },
        };
        const fetchResponse = async target => {
          controller.signal.throwIfAborted();
          let response;
          try { response = await fetch(target, requestOptions); }
          catch {
            if (controller.signal.aborted) throw controller.signal.reason;
            throw new UsgsTransportError('USGS network request failed', { code: 'USGS_NETWORK_ERROR' });
          }
          if (controller.signal.aborted) void response.body?.cancel().catch(() => {});
          controller.signal.throwIfAborted();
          return response;
        };
        let target = url;
        let followedRedirect = false;
        for (let attempt = 0; ; attempt++) {
          try {
            let response = await fetchResponse(target);
            if (!followedRedirect && detail && detailId && target === usgsDetailUrl(detailId) && response.status === 302 && !response.redirected) {
              const catalog = detailCatalogRedirect(response.headers.get('Location'), detailId);
              if (catalog) {
                await response.body?.cancel().catch(() => {});
                controller.signal.throwIfAborted();
                followedRedirect = true;
                target = catalog;
                response = await fetchResponse(target);
              }
            }
            if (!response.ok || response.redirected) {
              if (detail && detailId && response.status === 409 && !response.redirected &&
                  await isDeletedEventResponse(response, controller.signal)) {
                throw new UsgsTransportError('USGS event has been deleted', {
                  status: 410, code: 'USGS_EVENT_DELETED', upstreamStatus: 409,
                });
              }
              await response.body?.cancel().catch(() => {});
              throw new UsgsTransportError('USGS request failed', {
                status: detail && response.status === 404 ? 404 : 502,
                code: response.status >= 300 && response.status < 400 ? 'USGS_REDIRECT_REJECTED' : 'USGS_UPSTREAM_ERROR',
                upstreamStatus: response.status,
              });
            }
            if (allowEmpty && response.status === 204) return { type: 'FeatureCollection', features: [] };
            return await readBoundedJsonResponse(response, maxBytes, controller.signal);
          } catch (error) {
            controller.signal.throwIfAborted();
            const transient = error.code === 'USGS_NETWORK_ERROR' ||
              (error.code === 'USGS_UPSTREAM_ERROR' && [429, 500, 502, 503, 504].includes(error.upstreamStatus));
            if (!detail || attempt > 0 || !transient) throw error;
            // Retry the last validated destination, without another redirect or
            // a new timer. Payload, ID, alias and missing-event errors are terminal.
            await waitForRetry();
          }
        }
      })(),
      deadline,
    ]);
  } catch (error) {
    controller.abort(error);
    if (error instanceof UsgsTransportError) throw error;
    throw new UsgsTransportError('USGS request failed');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abortParent); }
}

export async function fetchUsgsSummary(urlOrFeedKey, options = {}) {
  const url = validateUsgsSummaryUrl(USGS_SUMMARY_URLS[urlOrFeedKey] || urlOrFeedKey);
  const data = await fetchBoundedJson(url, { maxBytes: USGS_LIMITS.summaryBytes, ...options });
  return validateUsgsSummary(data, options.maxFeatures);
}

export async function fetchValidatedDetail(id, options = {}) {
  const data = await fetchBoundedJson(usgsDetailUrl(id), { maxBytes: USGS_LIMITS.detailBytes, ...options, detail: true, detailId: id });
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
