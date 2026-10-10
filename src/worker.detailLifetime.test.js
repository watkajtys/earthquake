// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { persistEarthquakeDetail } from '../functions/utils/earthquakeDetailPersistence.js';
import { usgsFeature } from '../functions/test-fixtures/usgs.js';
vi.mock('../functions/utils/earthquakeDetailPersistence.js', async original => ({ ...await original(), persistEarthquakeDetail: vi.fn().mockResolvedValue({}) }));
let env, ctx;
const request = signal => new Request('https://earthquakeslive.com/api/earthquake/event?private-query=secret', { signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(usgsFeature('event'))));
  env = { GEOJSON_BUCKET: { get: vi.fn().mockResolvedValue(null) }, DB: { prepare: vi.fn(() => ({ bind: () => ({ first: async () => null }) })) }, RELEASE_REVISION: 'revision-1', WORKER_VERSION_METADATA: { id: 'version-1' } };
  ctx = { waitUntil: vi.fn() };
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('one detail request lifetime', () => {
  it('bounds a stalled archive pointer and prevents late storage/upstream work', async () => {
    let resolveRead;
    env.DB.prepare.mockImplementation(() => ({ bind: () => ({ first: () => new Promise(resolve => { resolveRead = resolve; }) }) }));
    const result = worker.fetch(request(), env, ctx);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).status).toBe(504);
    resolveRead(null); await vi.advanceTimersByTimeAsync(0);
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(persistEarthquakeDetail).not.toHaveBeenCalled(); expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
  it('shares the deadline between a slow archive lookup and late upstream response', async () => {
    const cancel = vi.fn();
    env.GEOJSON_BUCKET.get.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(null), 8000)));
    fetch.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(new Response(new ReadableStream({ cancel }))), 3000)));
    const result = worker.fetch(request(), env, ctx);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).status).toBe(504);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cancel).toHaveBeenCalledOnce(); expect(persistEarthquakeDetail).not.toHaveBeenCalled();
  });
  it('bounds revision reads and cannot schedule persistence from a late revision result', async () => {
    let resolveRead;
    env.DB.prepare.mockImplementation(sql => ({ bind: () => ({ first: () => sql.includes('detail_archive_key') ? Promise.resolve(null)
      : new Promise(resolve => { resolveRead = resolve; }) }) }));
    const result = worker.fetch(request(), env, ctx);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).status).toBe(504);
    resolveRead(null); await vi.advanceTimersByTimeAsync(0);
    expect(persistEarthquakeDetail).not.toHaveBeenCalled(); expect(ctx.waitUntil).not.toHaveBeenCalled();
    const log = console.error.mock.calls.map(([value]) => value).find(value => typeof value === 'string' && value.includes('earthquake-detail-read-failed'));
    expect(JSON.parse(log)).toMatchObject({ code: 'DETAIL_TIMEOUT', stage: 'revision-read', elapsedMs: 10_000, versionId: 'version-1', revision: 'revision-1' });
    expect(log).not.toContain('private-query'); expect(log).not.toContain('secret');
  });
  it('cancels an in-flight client request and prevents late persistence', async () => {
    const controller = new AbortController(); let resolveFetch; const cancel = vi.fn();
    fetch.mockImplementation(() => new Promise(resolve => { resolveFetch = resolve; }));
    const result = worker.fetch(request(controller.signal), env, ctx);
    await vi.advanceTimersByTimeAsync(0); controller.abort();
    expect((await result).status).toBe(504);
    resolveFetch(new Response(new ReadableStream({ cancel }))); await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce(); expect(persistEarthquakeDetail).not.toHaveBeenCalled();
  });
  it('retains revision integrity and never persists conflicting science', async () => {
    env.DB.prepare.mockImplementation(sql => ({ bind: () => ({ first: async () => sql.includes('detail_archive_key') ? null : { source_updated_at_ms: 1750000001001 } }) }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(503);
    expect(persistEarthquakeDetail).not.toHaveBeenCalled(); expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
  it.each([null, '1750000001000', 1.5])('blocks a committed archive pointer with invalid revision%s before fallback', async revision => {
    env.DB.prepare.mockImplementation(() => ({ bind: () => ({ first: async () => ({
      detail_archive_revision_ms: revision, detail_archive_key: `details/v1/event/1750000001000/${'a'.repeat(64)}.json`,
    }) }) }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(502);
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(persistEarthquakeDetail).not.toHaveBeenCalled();
  });
  it('blocks a malformed stale archive pointer rather than treating corruption as a miss', async () => {
    env.DB.prepare.mockImplementation(() => ({ bind: () => ({ first: async () => ({
      source_updated_at_ms: 1750000002000, detail_archive_revision_ms: 1750000001000, detail_archive_key: 'unsafe-pointer',
    }) }) }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(502);
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(persistEarthquakeDetail).not.toHaveBeenCalled();
  });
  it('does not trust archived science with an invalid stored source revision', async () => {
    env.DB.prepare.mockImplementation(() => ({ bind: () => ({ first: async () => ({ source_updated_at_ms: 'bad-revision' }) }) }));
    expect((await worker.fetch(request(), env, ctx)).status).toBe(503);
    expect(env.GEOJSON_BUCKET.get).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(persistEarthquakeDetail).not.toHaveBeenCalled();
  });
});
