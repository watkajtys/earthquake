import { findActiveClusters } from './calculate-clusters.POST.js';
import { vi, describe, it, expect } from 'vitest';

const createMockQuake = (id, mag, lat, lon, time = Date.now()) => ({
  id: id.toString(),
  properties: { mag, time },
  geometry: { coordinates: [lon, lat, 0] },
});

const generateMockQuakes = (count) => {
  const quakes = [];
  for (let i = 0; i < count; i++) {
    const lat = Math.random() * 180 - 90;
    const lon = Math.random() * 360 - 180;
    const mag = Math.random() * 8;
    quakes.push(createMockQuake(i, mag, lat, lon));
  }
  return quakes;
};

describe('findActiveClusters Performance Benchmark', () => {
  it('should run reasonably fast with 1000 quakes', () => {
    const quakes = generateMockQuakes(1000);
    const maxDistanceKm = 100;
    const minQuakes = 2;

    const startTime = performance.now();
    const clusters = findActiveClusters(quakes, maxDistanceKm, minQuakes);
    const endTime = performance.now();

    const duration = endTime - startTime;
    console.log(`Clustering 1000 quakes took ${duration.toFixed(2)} ms`);

    // Expect the test to complete within a reasonable time frame (e.g., 2 seconds)
    expect(duration).toBeLessThan(2000);
  });

  it('should run reasonably fast with 5000 quakes', () => {
    const quakes = generateMockQuakes(5000);
    const maxDistanceKm = 100;
    const minQuakes = 2;

    const startTime = performance.now();
    const clusters = findActiveClusters(quakes, maxDistanceKm, minQuakes);
    const endTime = performance.now();

    const duration = endTime - startTime;
    console.log(`Clustering 5000 quakes took ${duration.toFixed(2)} ms`);

    // Expect the test to complete within a reasonable time frame (e.g., 10 seconds)
    expect(duration).toBeLessThan(10000);
  });
});
