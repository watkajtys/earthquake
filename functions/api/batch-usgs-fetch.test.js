// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBatchUsgsFetch } from './batch-usgs-fetch.js';
import { usgsCollection, usgsFeature } from '../test-fixtures/usgs.js';

let env;
const request = (input) => new Request('https://example.test/api/batch-usgs-fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(usgsCollection())));
  env = { DB: { prepare: vi.fn(() => ({ bind: vi.fn().mockReturnValue({}) })), batch: vi.fn(async (statements) => statements.map(() => ({ success: true, meta: { changes: 1 } }))) } };
});
afterEach(() => vi.unstubAllGlobals());

describe('bounded trusted catalog catch-up', () => {
  it('persists one bounded page and exposes explicit continuation', async () => {
    fetch.mockResolvedValue(Response.json(usgsCollection(Array.from({ length: 1000 }, (_, index) => usgsFeature(`event-${index}`)))));
    const response = await handleBatchUsgsFetch({ request: request({ startDate: '2026-01-01', endDate: '2026-01-08' }), env });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ complete: true, fetched: 1000, hasMore: true, nextOffset: 1001 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports an incomplete database page as retryable503 without advancing the cursor', async () => {
    env.DB.batch.mockRejectedValue(new Error('Transient D1 failure'));
    const response = await handleBatchUsgsFetch({ request: request({ startDate: '2026-01-01', endDate: '2026-01-02' }), env });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ complete: false, nextOffset: null });
  });

  it.each([
    { startDate: '2026-02-30', endDate: '2026-03-01' },
    { startDate: '2026-01-01', endDate: '2026-01-09' },
    { startDate: '2026-01-01', endDate: '2026-01-02', offset: -1 },
    { startDate: '2026-01-01', endDate: '2026-01-02', apiUrl: 'https://attacker.example' },
  ])('rejects invalid or excessive input before upstream work %#', async (input) => {
    expect((await handleBatchUsgsFetch({ request: request(input), env })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(env.DB.batch).not.toHaveBeenCalled();
  });

  it('rejects legacy GET and oversized bodies', async () => {
    expect((await handleBatchUsgsFetch({ request: new Request('https://example.test/api/batch-usgs-fetch'), env })).status).toBe(405);
    expect((await handleBatchUsgsFetch({ request: request({ junk: 'x'.repeat(4096) }), env })).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
});
