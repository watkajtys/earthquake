// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { handleTrustedUsgsIngestion } from '../functions/background/ingest-usgs-feed.js';
import { handleGenerateLists } from '../functions/background/generate-lists.js';
import { onRequestGet as backfill } from '../functions/api/backfill-earthquake-details.js';

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
