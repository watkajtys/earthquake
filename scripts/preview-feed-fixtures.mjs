import { FEED_PERIOD_DAYS, FEED_PERIODS, validateCompleteUsgsFeed } from '../shared/earthquakeFeedContract.js';

// Preview-only source adapter. The actual publisher still validates these
// complete synthetic FeatureCollections and performs its ordinary R2 writes.
export function createPreviewFeedCollections(features, now, { includeEdgeCases = false } = {}) {
  if (includeEdgeCases) {
    const edgeCases = [['previewquake005', -0.2, 0.5], ['previewquake006', null, 48]].map(([id, mag, ageHours]) => ({
      type: 'Feature', id, geometry: { type: 'Point', coordinates: [-117.9, 35.1, 4] },
      properties: { mag, place: 'SYNTHETIC PREVIEW feed edge case', time: now - ageHours * 3600_000,
        updated: now - ageHours * 3600_000 + 60_000, alert: null, felt: null, tsunami: 0, sig: null },
    }));
    features = [...features, ...edgeCases];
  }
  return Object.fromEntries(FEED_PERIODS.map(period => {
    const selected = features.filter(feature => feature.properties.time >= now - FEED_PERIOD_DAYS[period] * 86400_000);
    const feed = { type: 'FeatureCollection', metadata: { status: 200, generated: now, count: selected.length }, features: selected };
    return [period, validateCompleteUsgsFeed(feed, period, { now })];
  }));
}
