import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker from './process-cluster-definitions.js';
import * as spatial from '../utils/spatialClusterUtils.js';

const rows = [
  { id: 'quake1', magnitude: 3.0, event_time: 1672531200000, longitude: -122.7, latitude: 38.8, depth: 5, place: 'Test Location' },
  { id: 'quake2', magnitude: 3.2, event_time: 1672531260000, longitude: -122.71, latitude: 38.81, depth: 5.5, place: 'Test Location' },
  { id: 'quake3', magnitude: 2.8, event_time: 1672531320000, longitude: -122.69, latitude: 38.79, depth: 4.8, place: 'Test Location' },
];
const cluster = { id: 'test-cluster', earthquakeIds: ['quake1', 'quake2', 'quake3'] };
function fixture({ existing = true } = {}) {
  const source = vi.fn().mockResolvedValue({ success: true, results: rows });
  const snapshot = vi.fn().mockResolvedValue({ success: true, results: [cluster] });
  const run = vi.fn().mockResolvedValue({ success: true });
  const prepare = vi.fn(sql => {
    const stmt = { bind: vi.fn().mockReturnThis(), run };
    if (sql.includes('FROM EarthquakeEvents')) stmt.all = source;
    else if (sql.includes('WHERE stableKey')) stmt.first = vi.fn().mockResolvedValue(existing ? { id: cluster.id, version: 1 } : null);
    else if (sql.includes('FROM ClusterDefinitions')) stmt.all = snapshot;
    return stmt;
  });
  return { env: { DB: { prepare }, CLUSTER_KV: { put: vi.fn().mockResolvedValue(undefined) } }, source, snapshot, run };
}
beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('scheduled cluster publication failure boundaries', () => {
  it.each([true, false])('publishes after confirmed persistence (existing=%s)', async existing => {
    const { env, run } = fixture({ existing });
    await worker.scheduled(null, env, {});
    expect(run).toHaveBeenCalledOnce();
    expect(env.CLUSTER_KV.put).toHaveBeenCalledWith('active_clusters', JSON.stringify([cluster]), { expirationTtl: 3600 });
  });
  it('preserves the old snapshot and propagates a spatial-budget failure', async () => {
    const { env, run } = fixture();
    const error = Object.assign(new Error('Budget exceeded'), { code: 'SPATIAL_BUDGET_EXCEEDED' });
    vi.spyOn(spatial, 'findActiveClustersOptimized').mockImplementationOnce(() => { throw error; });
    await expect(worker.scheduled(null, env, {})).rejects.toBe(error);
    expect(run).not.toHaveBeenCalled(); expect(env.CLUSTER_KV.put).not.toHaveBeenCalled();
  });
  it.each([true, false])('does not publish a partial snapshot after unconfirmed D1 writes (existing=%s)', async existing => {
    const { env, run, snapshot } = fixture({ existing }); run.mockResolvedValue({ success: false });
    await expect(worker.scheduled(null, env, {})).rejects.toThrow('Cluster persistence failed');
    expect(snapshot).not.toHaveBeenCalled(); expect(env.CLUSTER_KV.put).not.toHaveBeenCalled();
  });
  it('propagates a rejected D1 update and retains the published snapshot', async () => {
    const { env, run } = fixture(); run.mockRejectedValue(new Error('D1 unavailable'));
    await expect(worker.scheduled(null, env, {})).rejects.toThrow('Cluster persistence failed');
    expect(env.CLUSTER_KV.put).not.toHaveBeenCalled();
  });
  it.each(['source', 'snapshot'])('does not turn an unsuccessful %s query into empty data', async query => {
    const f = fixture(); f[query].mockResolvedValue({ success: false, results: [] });
    await expect(worker.scheduled(null, f.env, {})).rejects.toThrow('query failed');
    expect(f.env.CLUSTER_KV.put).not.toHaveBeenCalled();
  });
  it('rejects a KV publication failure and does not log successful completion', async () => {
    const { env } = fixture(); const error = new Error('KV unavailable'); env.CLUSTER_KV.put.mockRejectedValue(error);
    await expect(worker.scheduled(null, env, {})).rejects.toBe(error);
    expect(console.log).not.toHaveBeenCalledWith('process-cluster-definitions: Cron job finished successfully.');
  });
});
