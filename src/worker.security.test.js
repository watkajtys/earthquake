// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { readBoundedJson } from './utils/workerRequestPolicy.js';

const token = 'synthetic-test-credential-never-deployed';
const request = (path, options = {}) => new Request(`https://earthquakeslive.com${path}`, {
  ...options, headers: { 'User-Agent': 'Worker-Security-Test/1.0', ...options.headers },
});
const post = (path, payload, credential = token) => request(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` },
  body: JSON.stringify(payload),
});
const ctx = { waitUntil: vi.fn() };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('deployed Worker trust boundaries', () => {
  const mutations = ['/api/batch-usgs-fetch', '/api/backfill-earthquake-details', '/api/fix-enhanced-data-flag'];
  it.each(mutations)('never runs maintenance on GET %s', async path => {
    const prepare = vi.fn();
    const response = await worker.fetch(request(path), { DB: { prepare }, ADMIN_API_TOKEN: token }, ctx);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(prepare).not.toHaveBeenCalled();
  });

  it.each([...mutations, '/api/cluster-definition', '/api/cache-stats'])('requires a configured server credential for %s', async path => {
    const prepare = vi.fn();
    const req = path.endsWith('cache-stats') ? request(path, { method: 'DELETE' }) : post(path, {});
    const response = await worker.fetch(req, { DB: { prepare } }, ctx);
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(prepare).not.toHaveBeenCalled();
  });

  it.each(['wrong', '', `${token}-wrong`])('rejects a bad admin credential before touching storage', async credential => {
    const prepare = vi.fn();
    const response = await worker.fetch(post('/api/cluster-definition', {}, credential), { ADMIN_API_TOKEN: token, DB: { prepare } }, ctx);
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('checks authentication equally on the workers.dev host', async () => {
    const response = await worker.fetch(new Request('https://earthquake.matty-f7e.workers.dev/api/cache-stats', {
      method: 'DELETE', headers: { 'User-Agent': 'Test' },
    }), { ADMIN_API_TOKEN: token }, ctx);
    expect(response.status).toBe(401);
  });

  it('registers only existing event members after valid authorization', async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const prepare = vi.fn(sql => ({ bind: (...ids) => ({
      all: async () => ({ results: ids.map(id => ({ id })) }),
      first: async () => null, run,
    }), sql }));
    const response = await worker.fetch(post('/api/cluster-definition', {
      clusterId: 'test-cluster', earthquakeIds: ['us1', 'us2'], strongestQuakeId: 'us1',
    }), { ADMIN_API_TOKEN: token, DB: { prepare } }, ctx);
    expect(response.status).toBe(201);
    expect(run).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0][0]).toContain('SELECT id FROM EarthquakeEvents');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects nonexistent cluster membership before insertion', async () => {
    const prepare = vi.fn(() => ({ bind: () => ({ all: async () => ({ results: [] }) }) }));
    const response = await worker.fetch(post('/api/cluster-definition', {
      clusterId: 'test-cluster', earthquakeIds: ['us1'], strongestQuakeId: 'us1',
    }), { ADMIN_API_TOKEN: token, DB: { prepare } }, ctx);
    expect(response.status).toBe(400);
    expect(prepare).toHaveBeenCalledOnce();
  });

  it.each(['bad%2Fid', 'bad%5Cid', 'bad%00id'])('rejects unsafe detail IDs before an R2 read: %s', async id => {
    const get = vi.fn();
    const response = await worker.fetch(request(`/api/earthquake/${id}`), { GEOJSON_BUCKET: { get } }, ctx);
    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('does not fetch or persist a caller-selected feed', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const prepare = vi.fn(); const put = vi.fn(); const send = vi.fn();
    const response = await worker.fetch(request('/api/usgs-proxy?apiUrl=https%3A%2F%2Funtrusted.invalid%2Ffeed'), {
      DB: { prepare }, USGS_LAST_RESPONSE_KV: { put }, GEOJSON_QUEUE: { send },
    }, ctx);
    expect(response.status).toBe(400);
    for (const call of [fetchMock, prepare, put, send]) expect(call).not.toHaveBeenCalled();
  });

  it.each(['', 'GPTBot', 'bastion', 'Mozilla/5.0'])('prevents shared caching of HTML/denials for %s', async userAgent => {
    const env = { ASSETS: { fetch: async () => new Response('<html>app</html>', { headers: {
      'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=300',
    } }) } };
    const response = await worker.fetch(request('/overview', { headers: { 'User-Agent': userAgent } }), env, ctx);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps invariant hashed assets cacheable', async () => {
    const response = await worker.fetch(request('/assets/app-hash.js'), { ASSETS: {
      fetch: async () => new Response('app', { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=31536000, immutable' } }),
    } }, ctx);
    expect(response.headers.get('Cache-Control')).toContain('immutable');
  });

  it('reports deployed identity without reading or writing storage', async () => {
    const env = Object.fromEntries(['ASSETS', 'DB', 'CLUSTER_KV', 'USGS_LAST_RESPONSE_KV', 'GEOJSON_BUCKET', 'GEOJSON_QUEUE', 'STATIC_KV'].map(name => [name, {}]));
    Object.assign(env, { DEPLOYMENT_ENVIRONMENT: 'production', RELEASE_REVISION: 'a'.repeat(40), WORKER_VERSION_METADATA: { id: 'version-test' } });
    const response = await worker.fetch(request('/api/release-identity'), env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', environment: 'production', revision: 'a'.repeat(40), versionId: 'version-test' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    delete env.DB;
    expect((await worker.fetch(request('/api/release-identity'), env, ctx)).status).toBe(503);
  });
});

describe('bounded inbound JSON', () => {
  it('rejects an oversized stream even if Content-Length lies', async () => {
    const input = new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '2' }, body: JSON.stringify({ value: 'x'.repeat(100) }) });
    await expect(readBoundedJson(input, 20)).rejects.toMatchObject({ status: 413 });
  });
  it('rejects missing JSON media type', async () => {
    await expect(readBoundedJson(new Request('https://example.test', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 415 });
  });
  it('handles malformed JSON without leaking parse details', async () => {
    await expect(readBoundedJson(post('/test', undefined))).rejects.toMatchObject({ status: 400 });
  });
});
