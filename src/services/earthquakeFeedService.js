import { fetchUsgsData } from './usgsApiService.js';
import { isValidGeoJson } from '../utils/geoJsonUtils.js';
import { USGS_API_URL_DAY, USGS_API_URL_WEEK, USGS_API_URL_MONTH } from '../constants/appConstants';

const windows = { day: [USGS_API_URL_DAY, 'Daily', 1], week: [USGS_API_URL_WEEK, 'Weekly', 7], month: [USGS_API_URL_MONTH, 'Monthly', 30] };

async function internalFeed(period, signal) {
  const response = await fetch(`/api/get-earthquakes?timeWindow=${period}`, { signal });
  const source = response.headers.get('X-Data-Source');
  if (!response.ok || !['R2', 'D1'].includes(source)) {
    throw new Error(`Failed to fetch earthquake data: ${response.status} ${await response.text()}`);
  }
  const records = await response.json();
  if (!Array.isArray(records)) throw new Error('Earthquake API response is not a list.');
  const now = Date.now();
  // Preserve the existing metadata/freshness gate. A new request does not make
  // old or incomplete R2 summaries current; the producer overhaul is separate.
  if (source === 'R2' && !records.every(record => record?.properties &&
      ['alert', 'tsunami', 'felt', 'sig'].every(key => Object.hasOwn(record.properties, key)) &&
      typeof record.summary_updated_at === 'number' && record.summary_updated_at >= now - 10 * 60_000 && record.summary_updated_at <= now)) {
    throw new Error('Cached R2 records are missing current summary metadata.');
  }
  const features = records.map(record => ({
    type: 'Feature', id: record.id,
    properties: { ...record.properties, mag: record.magnitude, place: record.place, time: record.event_time,
      detail: record.usgs_detail_url || `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${record.id}.geojson`,
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${record.id}` },
    geometry: { type: 'Point', coordinates: [record.longitude, record.latitude, record.depth] },
  }));
  return { features, metadata: null, fetchTime: Date.now(), dataSource: source, sourceGeneratedAtMs: null, coverage: null };
}

export async function fetchEarthquakeFeed(period, { signal } = {}) {
  const [url, label, days] = windows[period];
  let internalError;
  try { return await internalFeed(period, signal); }
  catch (error) { if (signal?.aborted) throw signal.reason || error; internalError = error.message; }
  let fallback;
  try {
    fallback = await fetchUsgsData(url, { signal });
    if (signal?.aborted) throw signal.reason;
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    throw new Error(`API Error (${label}): ${internalError}. USGS Fetch Error (${label}): ${error.message}`);
  }
  if (fallback?.error || !isValidGeoJson(fallback)) {
    throw new Error(`API Error (${label}): ${internalError}. USGS Error (${label}): ${fallback?.error?.message || `${label} USGS data features missing or invalid.`}`);
  }
  const generated = Number.isFinite(fallback.metadata?.generated) ? fallback.metadata.generated : null;
  return { features: fallback.features, metadata: fallback.metadata, fetchTime: Date.now(), dataSource: 'USGS', sourceGeneratedAtMs: generated,
    // Only fixed all-event USGS windows with a genuine generated timestamp can
    // disprove an absent event. Legacy R2/D1 arrays do not prove completeness.
    coverage: generated === null || fallback.metadata?.count !== fallback.features.length ? null :
      { complete: true, asOfMs: generated, startTimeMs: generated - days * 86400_000, endTimeMs: generated } };
}

export const fetchDailyFeed = options => fetchEarthquakeFeed('day', options);
export const fetchWeeklyFeed = options => fetchEarthquakeFeed('week', options);
export const fetchMonthlyFeed = options => fetchEarthquakeFeed('month', options);
