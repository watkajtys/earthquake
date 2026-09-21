import { isValidUsgsEventId, usgsDetailUrl, validateUsgsDetailUrl } from '../../functions/utils/usgs-transport.js';

const invalid = (message) => ({ ok: false, message });
const hasUnsafeCharacters = (value) => [...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\');

// Consume URL.pathname / useLocation().pathname, never already-decoded router params.
function decodedRoute(pathname, prefix) {
  if (typeof pathname !== 'string' || !pathname.startsWith(prefix) || pathname.length > 2048) return null;
  try {
    const value = decodeURIComponent(pathname.slice(prefix.length));
    return value && !hasUnsafeCharacters(value) ? value : null;
  } catch { return null; }
}

export function buildEarthquakePath(earthquake) {
  const id = typeof earthquake === 'string' ? earthquake : earthquake?.id;
  return isValidUsgsEventId(id) ? `/quake/id/${encodeURIComponent(id)}` : null;
}

export function eventIdFromDetailUrl(value) {
  try {
    const url = validateUsgsDetailUrl(value);
    return url.slice(url.lastIndexOf('/') + 1, -'.geojson'.length);
  } catch { return null; }
}

export function parseEarthquakePath(pathname) {
  const value = decodedRoute(pathname, '/quake/');
  if (!value) return invalid('Invalid earthquake URL.');
  let id;
  let format;
  if (value.startsWith('id/')) {
    id = value.slice(3);
    format = 'canonical';
  } else if (/^https?:/iu.test(value)) {
    id = eventIdFromDetailUrl(value);
    format = 'legacy-detail-url';
  } else {
    const descriptive = value.match(/^m(?:-?\d+(?:\.\d+)?|unknown)-.+-([A-Za-z0-9_]+)$/u);
    if (descriptive) {
      // Previously published descriptive links use the trailing identifier.
      // New links have an explicit id/ boundary so IDs containing '-' round-trip.
      id = descriptive[1];
      format = 'legacy-description';
    } else {
      if (/^m(?:-?\d+(?:\.\d+)?|unknown)-/u.test(value)) return invalid('Invalid earthquake URL.');
      id = value;
      format = 'legacy-id';
    }
  }
  if (!isValidUsgsEventId(id)) return invalid('Invalid earthquake identifier.');
  return { ok: true, eventId: id, detailUrl: usgsDetailUrl(id), canonicalPath: buildEarthquakePath(id), format };
}

export function isValidClusterRouteValue(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,512}$/u.test(value);
}

export function parseClusterPath(pathname) {
  const value = decodedRoute(pathname, '/cluster/');
  return isValidClusterRouteValue(value) ? { ok: true, route: value } : invalid('Invalid cluster URL.');
}

export function buildClusterPath(cluster) {
  const value = [cluster?.slug, cluster?.clusterId, cluster?.id].find(isValidClusterRouteValue);
  return value ? `/cluster/${encodeURIComponent(value)}` : null;
}

export function legacyClusterEventId(value) {
  const overview = value.match(/^overview_cluster_(.+)_(\d+)$/u);
  const descriptive = value.match(/^\d+-quakes-near-.+-up-to-m(?:-?\d+(?:\.\d+)?|unknown|NaN|null)-(.+)$/u);
  const id = overview?.[1] || descriptive?.[1];
  return isValidUsgsEventId(id) ? id : null;
}

function safeModalPath(path) {
  if (typeof path !== 'string' || path.length > 2048 || !path.startsWith('/') || path.startsWith('//') || hasUnsafeCharacters(path)) return null;
  try {
    const target = new URL(path, 'https://earthquakeslive.com');
    return target.origin === 'https://earthquakeslive.com' ? `${target.pathname}${target.search}${target.hash}` : null;
  } catch { return null; }
}

// Keep only this modal's return location and one parent's return location.
// The depth cap also bounds cyclic or excessively nested history state.
function sanitizedModalState(state, remaining = 2) {
  if (remaining === 0 || !state || typeof state !== 'object' || Array.isArray(state) || state.inAppNavigation !== true) return null;
  const returnTo = safeModalPath(state.returnTo);
  if (!returnTo) return null;
  const parent = sanitizedModalState(state.returnState, remaining - 1);
  return { inAppNavigation: true, returnTo, ...(parent ? { returnState: parent } : {}) };
}

export function buildModalNavigationState(location) {
  return sanitizedModalState({
    inAppNavigation: true,
    returnTo: `${location?.pathname || ''}${location?.search || ''}${location?.hash || ''}`,
    returnState: location?.state,
  }) || { inAppNavigation: true, returnTo: '/' };
}

export function modalReturnTarget(state) {
  const safeState = sanitizedModalState(state);
  return { path: safeState?.returnTo || '/', state: safeState?.returnState || null };
}

export function modalReturnPath(state) {
  return modalReturnTarget(state).path;
}

export function timestampMilliseconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value) return null;
  if (/^\d{11,16}$/u.test(value)) return Number(value);
  const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/u.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const result = Date.parse(normalized);
  return Number.isFinite(result) ? result : null;
}
