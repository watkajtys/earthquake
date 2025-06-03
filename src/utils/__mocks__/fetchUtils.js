// src/utils/__mocks__/fetchUtils.js
import { vi } from 'vitest';

export const fetchDataCb = vi.fn(async (url) => {
  console.log(`Mocked fetchDataCb called with URL: ${url}`);
  if (url.includes('error=true')) {
    return Promise.resolve({
      features: [],
      metadata: { generated: Date.now(), error: true, errorMessage: 'Mocked fetch error' }
    });
  }
  if (url.includes('empty=true')) {
    return Promise.resolve({ features: [], metadata: { generated: Date.now() } });
  }
  // Generic successful response
  return Promise.resolve({
    features: [
      {
        type: 'Feature',
        properties: {
          mag: 1.0,
          place: 'Mockville',
          time: Date.now(),
          type: 'earthquake',
          detail: `${url}_detail_mock`
        },
        geometry: { type: 'Point', coordinates: [0, 0, 0] },
        id: `mock_id_${Date.now()}`
      }
    ],
    metadata: { generated: Date.now(), count: 1 }
  });
});
