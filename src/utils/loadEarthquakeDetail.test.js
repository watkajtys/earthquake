// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEarthquakeDetail } from './loadEarthquakeDetail.js';
const detail = { id: 'event', properties: { title: 'Event' }, geometry: { coordinates: [0, 0, 1] } };
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('browser detail request recovery', () => {
  it('recovers one503 and keeps a shared caller signal', async () => {
    vi.useFakeTimers(); fetch.mockResolvedValueOnce(Response.json({ message: 'Unavailable' }, { status: 503 })).mockResolvedValueOnce(Response.json(detail));
    const result = loadEarthquakeDetail('event'); await vi.advanceTimersByTimeAsync(100);
    expect(await result).toEqual(detail); expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal).toBe(fetch.mock.calls[1][1].signal);
  });
  it.each([404, 410])('keeps confirmed%s terminal', async status => {
    fetch.mockResolvedValue(Response.json({ message: 'Missing' }, { status }));
    await expect(loadEarthquakeDetail('event')).rejects.toMatchObject({ status, retryable: false });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('rejects mismatched IDs without retrying', async () => {
    fetch.mockResolvedValue(Response.json({ ...detail, id: 'other' }));
    await expect(loadEarthquakeDetail('event')).rejects.toMatchObject({ code: 'DETAIL_INVALID_PAYLOAD', retryable: false });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('accepts an explicitly declared validated alias', async () => {
    fetch.mockResolvedValue(Response.json({ ...detail, id: 'canonical', properties: { ids: ',canonical,event,' } }));
    expect((await loadEarthquakeDetail('event')).id).toBe('canonical');
  });
  it('bounds stalled response bodies and cancels the reader', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); fetch.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const result = loadEarthquakeDetail('event', { timeoutMs: 50 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toMatchObject({ code: 'DETAIL_CLIENT_TIMEOUT', retryable: true });
    expect(cancel).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('cancels late responses after navigation', async () => {
    const controller = new AbortController(); let resolveFetch; const cancel = vi.fn();
    fetch.mockImplementation(() => new Promise(resolve => { resolveFetch = resolve; }));
    const result = loadEarthquakeDetail('event', { signal: controller.signal }).catch(error => error);
    controller.abort(); expect(await result).toMatchObject({ code: 'DETAIL_CLIENT_ABORTED' });
    resolveFetch(new Response(new ReadableStream({ cancel }))); await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not let retry waits extend the detail deadline', async () => {
    vi.useFakeTimers(); fetch.mockResolvedValue(Response.json({}, { status: 503 }));
    const result = loadEarthquakeDetail('event', { timeoutMs: 50 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toMatchObject({ code: 'DETAIL_CLIENT_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(100); expect(fetch).toHaveBeenCalledOnce();
  });
});
