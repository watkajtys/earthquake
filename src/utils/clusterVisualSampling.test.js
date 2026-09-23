import { describe, expect, it } from 'vitest';
import {
  groupQuakesForMap,
  MAX_CLUSTER_MAP_MARKERS,
  MAX_CHART_TIME_BUCKETS,
  sampleQuakesForChart,
} from './clusterVisualSampling.js';

const quake = (id, time, mag, longitude = -118, latitude = 34) => ({
  id,
  properties: { time, mag },
  geometry: { coordinates: [longitude, latitude] },
});

describe('cluster visual sampling', () => {
  it('keeps small chart sequences untouched', () => {
    const quakes = [quake('a', 1, 2), quake('b', 2, 3)];
    expect(sampleQuakesForChart(quakes, 730, quakes[1])).toBe(quakes);
  });

  it('bounds large chart sequences while preserving time and magnitude extrema and the mainshock', () => {
    const quakes = Array.from({ length: 1217 }, (_, index) => quake(`q${index}`, index, 2 + index % 4));
    quakes[400].properties.mag = 8.8;
    quakes[600].properties.mag = -0.5;
    const plotted = sampleQuakesForChart(quakes, 730, quakes[400]);
    expect(plotted.length).toBeLessThanOrEqual(MAX_CHART_TIME_BUCKETS * 5 + 3);
    expect(plotted.length).toBeLessThan(quakes.length);
    for (const index of [0, 400, 600, 1216]) {
      expect(plotted).toContain(quakes[index]);
    }
    expect(quakes).toHaveLength(1217);
  });

  it('retains both ends of a sequence whose events share a timestamp', () => {
    const quakes = Array.from({ length: 661 }, (_, index) => quake(`same-${index}`, 100, 2));
    const plotted = sampleQuakesForChart(quakes, 730, quakes[300]);
    expect(plotted).toContain(quakes[0]);
    expect(plotted).toContain(quakes[300]);
    expect(plotted).toContain(quakes[660]);
  });

  it('groups dense map events, retaining the strongest representative and an exact count', () => {
    const quakes = Array.from({ length: 1217 }, (_, index) => quake(`q${index}`, index, 2, -118, 34));
    quakes[500].properties.mag = 7.2;
    const groups = groupQuakesForMap(quakes, 8);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ quake: quakes[500], count: 1217 });
  });

  it('keeps individual markers when the visible set fits and excludes offscreen events', () => {
    const quakes = [quake('visible', 1, 2), quake('hidden', 2, 3, -100, 35)];
    const viewport = { contains: ([latitude, longitude]) => latitude < 35 && longitude < -110 };
    expect(groupQuakesForMap(quakes, 8, viewport)).toEqual([{ quake: quakes[0], count: 1 }]);
  });

  it('keeps an event visible across the date line when the map view is wrapped', () => {
    const wrappedQuake = quake('wrapped', 1, 2, -179, 10);
    const viewport = { contains: ([latitude, longitude]) => latitude === 10 && longitude >= 180 && longitude <= 182 };
    expect(groupQuakesForMap([wrappedQuake], 4, viewport)).toEqual([{ quake: wrappedQuake, count: 1 }]);
  });

  it('separates nearby events as zoom increases while never exceeding the marker cap', () => {
    const quakes = Array.from({ length: 661 }, (_, index) =>
      quake(`q${index}`, index, 2, -118 + index * 0.0001, 34));
    const lowZoom = groupQuakesForMap(quakes, 5);
    const highZoom = groupQuakesForMap(quakes, 15);
    expect(lowZoom.length).toBeLessThan(highZoom.length);
    expect(highZoom.length).toBeLessThanOrEqual(MAX_CLUSTER_MAP_MARKERS);
    expect(highZoom.reduce((sum, group) => sum + group.count, 0)).toBe(661);
  });
});
