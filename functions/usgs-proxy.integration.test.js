// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker.js';
import { USGS_SUMMARY_URLS } from './utils/usgs-transport.js';
import { usgsCollection } from './test-fixtures/usgs.js';

beforeEach(() => {
  vi.stubGlobal('caches', { default: { match: vi.fn(), put: vi.fn().mockResolvedValue(undefined) } });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(usgsCollection())));
});
afterEach(() => vi.unstubAllGlobals());

describe('deployed Worker USGS proxy route', () => {
  it('routes a public summary read without exposing ingestion', async () => {
    const env = { DB: { prepare: vi.fn(), batch: vi.fn() }, USGS_LAST_RESPONSE_KV: { get: vi.fn(), put: vi.fn() } };
    const context = { waitUntil: vi.fn() };
    const response = await worker.fetch(new Request(`https://earthquake.test/api/usgs-proxy?apiUrl=${encodeURIComponent(USGS_SUMMARY_URLS.day)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }), env, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(usgsCollection());
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(env.DB.batch).not.toHaveBeenCalled();
    expect(env.USGS_LAST_RESPONSE_KV.get).not.toHaveBeenCalled();
    expect(env.USGS_LAST_RESPONSE_KV.put).not.toHaveBeenCalled();
  });

  it('rejects the former public cron selector through the actual exported Worker', async () => {
    const response = await worker.fetch(new Request(`https://earthquake.test/api/usgs-proxy?apiUrl=${encodeURIComponent(USGS_SUMMARY_URLS.hour)}&isCron=true`, { headers: { 'User-Agent': 'Mozilla/5.0' } }), {}, { waitUntil: vi.fn() });
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
  });
});
