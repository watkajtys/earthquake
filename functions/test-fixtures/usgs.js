export function usgsFeature(id = 'us-test-1', overrides = {}) {
  return {
    type: 'Feature', id,
    properties: { mag: 2.4, place: 'Test location', time: 1750000000000, updated: 1750000001000, detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`, ...overrides },
    geometry: { type: 'Point', coordinates: [-121.5, 37.5, 8] },
  };
}

export function usgsCollection(features = [usgsFeature()]) {
  return { type: 'FeatureCollection', metadata: { count: features.length }, features };
}
