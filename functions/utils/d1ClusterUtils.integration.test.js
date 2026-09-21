import { vi, describe, it, expect, beforeEach } from 'vitest';
import { storeClusterDefinition } from './d1ClusterUtils.js';

const createMockDbInstance = () => {
    const state = { binds: [] };
    const stmt = {
      bind: (...binds) => {
        state.binds = binds;
        return stmt;
      },
      run: vi.fn().mockResolvedValue({ success: true }),
    };
    return {
      prepare: vi.fn(() => stmt),
      _getBinds: () => state.binds,
      _run: stmt.run,
    };
  };

describe('storeClusterDefinition', () => {
  let mockDb;

  beforeEach(() => {
    vi.resetAllMocks();
    mockDb = createMockDbInstance();
  });

  it('should correctly bind all parameters to the SQL statement', async () => {
    const clusterData = {
      id: 'test-id',
      stableKey: 'test-stable-key',
      slug: 'test-slug',
      strongestQuakeId: 'quake-1',
      earthquakeIds: ['quake-1', 'quake-2'],
      title: 'Test Cluster',
      description: 'A test cluster',
      locationName: 'Test Location',
      maxMagnitude: 5.0,
      meanMagnitude: 4.5,
      minMagnitude: 4.0,
      depthRange: '10-20km',
      centroidLat: 35.1,
      centroidLon: -120.2,
      radiusKm: 50,
      startTime: 1672531200000,
      endTime: 1672534800000,
      durationHours: 1,
      quakeCount: 2,
      significanceScore: 100,
      version: 1,
      createdAt: 1672531200000,
    };

    expect(await storeClusterDefinition(mockDb, clusterData)).toEqual({ success: true, id: clusterData.id });

    const binds = mockDb._getBinds();
    expect(binds[0]).toBe(clusterData.id);
    expect(binds[1]).toBe(clusterData.stableKey);
    expect(binds[2]).toBe(clusterData.slug);
    expect(binds[3]).toBe(clusterData.strongestQuakeId);
    expect(binds[4]).toBe(JSON.stringify(clusterData.earthquakeIds));
    expect(binds[5]).toBe(clusterData.title);
    expect(binds[6]).toBe(clusterData.description);
    expect(binds[7]).toBe(clusterData.locationName);
    expect(binds[8]).toBe(clusterData.maxMagnitude);
    expect(binds[9]).toBe(clusterData.meanMagnitude);
    expect(binds[10]).toBe(clusterData.minMagnitude);
    expect(binds[11]).toBe(clusterData.depthRange);
    expect(binds[12]).toBe(clusterData.centroidLat);
    expect(binds[13]).toBe(clusterData.centroidLon);
    expect(binds[14]).toBe(clusterData.radiusKm);
    expect(binds[15]).toBe(clusterData.startTime);
    expect(binds[16]).toBe(clusterData.endTime);
    expect(binds[17]).toBe(clusterData.durationHours);
    expect(binds[18]).toBe(clusterData.quakeCount);
    expect(binds[19]).toBe(clusterData.significanceScore);
    expect(binds[20]).toBe(clusterData.version);
    expect(binds[21]).toBe(clusterData.createdAt);
    expect(binds[22]).toBeGreaterThan(0);
  });
});

it.each([undefined, {}, { success: false }])('does not report an unconfirmed D1 result as persisted: %j', async result => {
  const db = createMockDbInstance(); db._run.mockResolvedValue(result);
  const outcome = await storeClusterDefinition(db, {
    id: 'id', slug: 'slug', strongestQuakeId: 'quake', earthquakeIds: ['quake'],
    maxMagnitude: 4, startTime: 1, endTime: 2, quakeCount: 1,
  });
  expect(outcome.success).toBe(false);
});
