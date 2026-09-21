// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { handleTrustedUsgsIngestion } from '../functions/background/ingest-usgs-feed.js';
import { handleGenerateLists } from '../functions/background/generate-lists.js';
import { onRequestGet as backfill } from '../functions/api/backfill-earthquake-details.js';
import { storeClusterDefinition } from '../functions/utils/d1ClusterUtils.js';
import { clusterInput, clusterNow, createClusterSqliteFixture } from '../functions/utils/clusterSqliteFixture.test-support.js';
import { createMemorySummaryBucket } from '../functions/utils/clusterSummarySnapshot.test-support.js';
import { SUMMARY_POINTER_KEY } from '../shared/clusterSummaryContract.js';

vi.mock('../functions/background/ingest-usgs-feed.js', () => ({ handleTrustedUsgsIngestion: vi.fn() }));
vi.mock('../functions/background/generate-lists.js', () => ({ handleGenerateLists: vi.fn() }));
vi.mock('../functions/api/backfill-earthquake-details.js', () => ({ onRequestGet: vi.fn(), onRequestPost: vi.fn() }));

const features = [{ type: 'Feature', id: 'us-test', properties: { time: 1, updated: 2, mag: 3, place: 'Fixture' }, geometry: { type: 'Point', coordinates: [0, 0, 1] } }];
const env = { DB: {}, USGS_LAST_RESPONSE_KV: {} };
async function runScheduled(cron, bindings = env) {
  const tasks = [];
  const context = { waitUntil: vi.fn(promise => {
    // Observe rejections immediately, exactly as the platform does, while keeping
    // the actual exported Worker's scheduled/helper implementations intact.
    tasks.push(Promise.resolve(promise).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })));
  }) };
  await worker.scheduled({ cron, scheduledTime: Date.now() }, bindings, context);
  expect(context.waitUntil).toHaveBeenCalledOnce();
  return { results: await Promise.all(tasks), context };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  handleTrustedUsgsIngestion.mockResolvedValue(Response.json({ newOrUpdatedFeatures: features }));
  handleGenerateLists.mockResolvedValue(undefined);
  backfill.mockResolvedValue(Response.json({ success: true, processed: 1, errors: 0 }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('actual Worker scheduled failure propagation', () => {
  it('passes the trusted hourly payload to list generation and registers its completion', async () => {
    const { results, context } = await runScheduled('*/5 * * * *');
    expect(results[0].status).toBe('fulfilled');
    expect(handleTrustedUsgsIngestion).toHaveBeenCalledWith(expect.objectContaining({ env, executionContext: context, feedKey: 'hour' }));
    expect(handleTrustedUsgsIngestion.mock.calls[0][0]).not.toHaveProperty('request');
    expect(handleGenerateLists).toHaveBeenCalledWith({ env, newFeatures: features });
  });

  it.each([502, 503, 504])('rejects the scheduled lifetime when ingestion returns HTTP %s, without publishing lists', async status => {
    handleTrustedUsgsIngestion.mockResolvedValue(Response.json({ message: 'Incomplete persistence' }, { status }));
    const { results } = await runScheduled('*/5 * * * *');
    expect(results[0].status).toBe('rejected');
    expect(results[0].reason.message).toContain(`HTTP ${status}`);
    expect(handleGenerateLists).not.toHaveBeenCalled();
  });

  it('preserves a rejected checkpoint/ingestion error through waitUntil', async () => {
    const failure = new Error('Checkpoint write failed');
    handleTrustedUsgsIngestion.mockRejectedValue(failure);
    const { results } = await runScheduled('*/5 * * * *');
    expect(results[0]).toEqual({ status: 'rejected', reason: failure });
    expect(handleGenerateLists).not.toHaveBeenCalled();
  });

  it('rejects a missing DB before invoking ingestion or list generation', async () => {
    const { results } = await runScheduled('*/5 * * * *', {});
    expect(results[0].status).toBe('rejected');
    expect(results[0].reason.message).toContain('DB binding');
    expect(handleTrustedUsgsIngestion).not.toHaveBeenCalled();
    expect(handleGenerateLists).not.toHaveBeenCalled();
  });

  it('preserves a failed R2/bootstrap publication through the scheduled lifetime', async () => {
    const failure = new Error('R2 publication failed');
    handleGenerateLists.mockRejectedValue(failure);
    const { results } = await runScheduled('*/5 * * * *');
    expect(results[0]).toEqual({ status: 'rejected', reason: failure });
  });

  it('keeps the trusted scheduled backfill working without a public admin credential', async () => {
    const { results } = await runScheduled('*/30 * * * *');
    expect(results[0].status).toBe('fulfilled');
    const input = backfill.mock.calls[0][0];
    expect(input.env).toBe(env);
    expect(input.request.method).toBe('GET');
    expect(input.request.headers.has('Authorization')).toBe(false);
    expect(new URL(input.request.url).searchParams.get('batch_size')).toBe('10');
  });

  it('rejects a backfill response that reports partial failure despite HTTP 200', async () => {
    backfill.mockResolvedValue(Response.json({ success: false, processed: 2, errors: 1 }));
    const { results } = await runScheduled('*/30 * * * *');
    expect(results[0].status).toBe('rejected');
  });

  it('preserves a thrown backfill failure through waitUntil', async () => {
    const failure = new Error('Detail retry persistence failed');
    backfill.mockRejectedValue(failure);
    const { results } = await runScheduled('*/30 * * * *');
    expect(results[0]).toEqual({ status: 'rejected', reason: failure });
  });
});

describe('exported Worker ten-minute cluster lifetime with migrated SQLite', () => {
  let fixture;
  let clusterEnv;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(clusterNow);
    fixture = createClusterSqliteFixture();
    clusterEnv = { DB: fixture.db, GEOJSON_BUCKET: createMemorySummaryBucket(), CLUSTER_KV: { put: vi.fn().mockResolvedValue(undefined) } };
  });
  afterEach(() => { fixture.database.close(); vi.useRealTimers(); });

  it('publishes the winning canonical identity and keeps version bytes over repeated invocations', async () => {
    fixture.hooks.beforeExecute = async ({ sql, values }) => {
      if (!sql.includes('INSERT INTO ClusterDefinitions')) return;
      delete fixture.hooks.beforeExecute;
      await storeClusterDefinition(fixture.db, clusterInput({
        id: 'canonical-winner', slug: 'canonical-slug', stableKey: values[1],
      }));
    };
    const first = await runScheduled('*/10 * * * *', clusterEnv);
    expect(first.results).toEqual([{ status: 'fulfilled', value: undefined }]);
    expect(JSON.parse(clusterEnv.CLUSTER_KV.put.mock.calls[0][1])[0])
      .toMatchObject({ id: 'canonical-winner', slug: 'canonical-slug' });
    const version = `1.0${'1'.repeat(20_000)}`;
    fixture.database.prepare('UPDATE ClusterDefinitions SET version = ?').run(version);
    vi.setSystemTime(clusterNow + 600_000);
    const second = await runScheduled('*/10 * * * *', clusterEnv);
    expect(second.results).toEqual([{ status: 'fulfilled', value: undefined }]);
    const rows = fixture.database.prepare('SELECT id, slug, version, createdAt FROM ClusterDefinitions').all();
    expect(rows).toEqual([{ id: 'canonical-winner', slug: 'canonical-slug', version, createdAt: clusterNow }]);
    expect(JSON.parse(clusterEnv.CLUSTER_KV.put.mock.calls[1][1])[0])
      .toMatchObject({ id: 'canonical-winner', slug: 'canonical-slug', version });
    expect(handleTrustedUsgsIngestion).not.toHaveBeenCalled();
    expect(handleGenerateLists).not.toHaveBeenCalled();
    expect(clusterEnv.GEOJSON_BUCKET.readJson(SUMMARY_POINTER_KEY).current.snapshotSequence).toBe(2);
  });

  it('rejects waitUntil on an unconfirmed write and makes no replacement KV write', async () => {
    fixture.hooks.afterExecute = ({ sql, result }) => sql.includes('INSERT INTO ClusterDefinitions')
      ? { success: false } : result;
    const { results } = await runScheduled('*/10 * * * *', clusterEnv);
    expect(results[0].status).toBe('rejected');
    expect(results[0].reason.message).toContain('Cluster persistence failed');
    expect(clusterEnv.CLUSTER_KV.put).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalledWith('process-cluster-definitions: Cron job finished successfully.');
  });

  it('passes KV publication rejection through the registered lifetime', async () => {
    const failure = new Error('KV publication failed');
    clusterEnv.CLUSTER_KV.put.mockRejectedValue(failure);
    const { results } = await runScheduled('*/10 * * * *', clusterEnv);
    expect(results).toEqual([{ status: 'rejected', reason: failure }]);
    expect(console.log).not.toHaveBeenCalledWith('process-cluster-definitions: Cron job finished successfully.');
  });

  it('propagates compact publication failure through waitUntil after successful legacy persistence', async () => {
    clusterEnv.GEOJSON_BUCKET.hooks.beforePut = () => { throw new Error('Compact publication unavailable'); };
    const { results } = await runScheduled('*/10 * * * *', clusterEnv);
    expect(results[0].status).toBe('rejected');
    expect(results[0].reason.message).toBe('Compact publication unavailable');
    expect(clusterEnv.CLUSTER_KV.put).toHaveBeenCalledOnce();
    expect(clusterEnv.GEOJSON_BUCKET.readJson(SUMMARY_POINTER_KEY)).toBeNull();
  });

  it('keeps small and negative-magnitude members from clustering through compact counts and full detail', async () => {
    const update = fixture.database.prepare('UPDATE EarthquakeEvents SET magnitude = ? WHERE id = ?');
    [5, 1.1, 0, -0.5].forEach((magnitude, index) => update.run(magnitude, `quake${index + 1}`));
    const { results } = await runScheduled('*/10 * * * *', clusterEnv);
    expect(results[0].status).toBe('fulfilled');
    const [definition] = JSON.parse(clusterEnv.CLUSTER_KV.put.mock.calls[0][1]);
    expect(definition.quakeCount).toBe(4);
    expect(JSON.parse(definition.earthquakeIds).sort()).toEqual(['quake1', 'quake2', 'quake3', 'quake4']);
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    const summaryResponse = await worker.fetch(new Request('https://earthquakeslive.com/api/cluster-summaries', { headers }), clusterEnv, {});
    const summaries = await summaryResponse.json();
    expect(summaries.items[0]).toMatchObject({ id: definition.id, quakeCount: 4, maxMagnitude: 5 });
    const detailResponse = await worker.fetch(new Request(`https://earthquakeslive.com/api/cluster-detail-with-quakes?clusterId=${definition.id}`, { headers }), clusterEnv, {});
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail.quakes.map(quake => quake.properties.mag).sort((a, b) => a - b)).toEqual([-0.5, 0, 1.1, 5]);
    expect(detail.quakes).toHaveLength(4);
  });
});
