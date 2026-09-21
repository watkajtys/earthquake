import { describe, expect, it } from 'vitest';
import { calculateBoundingBox, calculateBoundingBoxFromPoints, isPointInBoundingBox, longitudeIntervals, gridCellRanges, SpatialGrid } from './geoSpatialUtils.js';

describe('bounded spherical search boxes', () => {
  it.each([90, -90, 89.999, -89.999])('covers all longitudes when a 50 km search reaches the pole at %s', lat => {
    const bbox = calculateBoundingBox(lat, 179.9, 50);
    expect(bbox.west).toBe(-180); expect(bbox.east).toBe(180);
    expect(bbox.south).toBeGreaterThanOrEqual(-90); expect(bbox.north).toBeLessThanOrEqual(90);
    expect(isPointInBoundingBox(lat, -130, bbox)).toBe(true);
  });
  it('splits a wrapped box and treats +180 and -180 as the same meridian', () => {
    const bbox = calculateBoundingBox(0, 179.9, 50);
    expect(bbox.west).toBeGreaterThan(bbox.east);
    expect(isPointInBoundingBox(0, -179.8, bbox)).toBe(true);
    expect(isPointInBoundingBox(0, 179.8, bbox)).toBe(true);
    expect(isPointInBoundingBox(0, 0, bbox)).toBe(false);
    const boundary = calculateBoundingBox(0, 180, 0);
    expect(isPointInBoundingBox(0, -180, boundary)).toBe(true);
    expect(isPointInBoundingBox(0, 180, boundary)).toBe(true);
  });
  it('bounds a globe-spanning radius', () => {
    expect(calculateBoundingBox(30, 0, 100_000)).toEqual({ north: 90, south: -90, west: -180, east: 180 });
  });
  it.each([[Infinity, 0, 1], [0, NaN, 1], [91, 0, 1], [0, 181, 1], [0, 0, Infinity], [0, 0, -1]])('rejects invalid center/radius %j', (...args) => {
    expect(() => calculateBoundingBox(...args)).toThrow(RangeError);
  });
  it('buffers sets of points without unbounded polar coordinates', () => {
    const bbox = calculateBoundingBoxFromPoints([[90, 0], [89.9, 179], [Infinity, 0]], 50);
    expect(bbox.north).toBe(90); expect(bbox.west).toBe(-180); expect(bbox.east).toBe(180);
  });
  it('clamps huge finite query bounds to actual indexed cells', () => {
    const bounds = { south: 0, north: 1, west: 0, east: 1 };
    expect(gridCellRanges(bounds, 1, { south: -1e20, north: 1e20, west: -1e20, east: 1e20 })).toEqual([{ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }]);
    expect(gridCellRanges(bounds, 1, { south: 80, north: 90, west: -180, east: 180 })).toEqual([]);
    expect(() => longitudeIntervals({ south: -90, north: Infinity, west: -180, east: 180 })).toThrow(RangeError);
    expect(() => gridCellRanges(bounds, 0, bounds)).toThrow(RangeError);
  });
  it('queries the generic grid across the antimeridian without duplicate coarse cells', () => {
    const grid = new SpatialGrid({ south: -90, north: 90, west: -180, east: 180 }, 1);
    for (const [id, lng] of [['east', 179.9], ['west', -179.9], ['far', 0]]) grid.insert({ geometry: { type: 'Point', coordinates: [lng, 0] } }, id);
    expect(grid.query(calculateBoundingBox(0, 179.9, 50)).map(item => item.id).sort()).toEqual(['east', 'west']);
  });
});
