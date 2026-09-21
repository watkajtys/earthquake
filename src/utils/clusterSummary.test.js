import { describe, expect, it } from 'vitest';
import { buildClusterSummaries } from './clusterSummary.js';

const options = { minimumMagnitude: 4.5, now: 100000000, formatTimeAgo: value => `${value}ms ago`, formatTimeDuration: value => `${value}ms` };

describe('stored cluster summary projection', () => {
  it('never reads membership, growing versions or client events to preserve the full definition', () => {
    const definition = { id: 'canonical', slug: 'stored-slug', title: 'Stored title', locationName: 'Stored location',
      quakeCount: 158, maxMagnitude: 6, startTime: 1, endTime: 90000000, strongestQuakeId: 'absent-from-client' };
    Object.defineProperty(definition, 'earthquakeIds', { get() { throw new Error('Membership must not be read'); } });
    Object.defineProperty(definition, 'version', { get() { throw new Error('Legacy version must not be read'); } });
    const [summary] = buildClusterSummaries([definition], options);
    expect(summary).toMatchObject({ id: 'canonical', slug: 'stored-slug', quakeCount: 158, maxMagnitude: 6,
      startTime: 1, endTime: 90000000, strongestQuakeId: 'absent-from-client', locationName: 'Stored location' });
    expect(summary).not.toHaveProperty('earthquakeIds');
    expect(summary).not.toHaveProperty('originalQuakes');
    expect(summary.timeRange).toEqual({ prefix: 'Active over ', value: '89999999ms', suffix: '' });
  });
  it('keeps the existing threshold and deterministically breaks scientific sort ties by canonical ID', () => {
    const base = { maxMagnitude: 5, startTime: 1, endTime: 2, quakeCount: 3 };
    expect(buildClusterSummaries([
      { ...base, id: 'b' }, { ...base, id: 'a' }, { ...base, id: 'newer', endTime: 3 },
      { ...base, id: 'low', maxMagnitude: 4.4 }, { ...base, id: 'unknown', maxMagnitude: null },
    ], options).map(value => value.id)).toEqual(['newer', 'a', 'b']);
  });
  it('marks missing counts and invalid ranges unavailable without deriving substitutes', () => {
    const [summary] = buildClusterSummaries([{ id: 'c', maxMagnitude: 5, quakeCount: null, startTime: 50, endTime: 20 }], options);
    expect(summary.quakeCount).toBeNull();
    expect(summary.strongestQuakeId).toBeNull();
    expect(summary.locationName).toBe('Unknown Cluster Location');
    expect(summary.timeRange.value).toBe('Time information unavailable');
  });
});
