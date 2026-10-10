// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUsgsSummary, fetchValidatedDetail, fetchUsgsCatalogPage, USGS_SUMMARY_URLS, validateUsgsSummaryUrl, validateUsgsDetailUrl } from './usgs-transport.js';
import { usgsCollection, usgsFeature } from '../test-fixtures/usgs.js';

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded USGS transport', () => {
  it.each(Object.entries(USGS_SUMMARY_URLS))('accepts the fixed %s feed', async (_, url) => {
    fetch.mockResolvedValue(Response.json(usgsCollection()));
    expect(await fetchUsgsSummary(url)).toEqual(usgsCollection());
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }));
  });

  it.each([
    'https://attacker.example/all_hour.geojson', 'http://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
    'https://earthquake.usgs.gov.evil.test/earthquakes/feed/v1.0/summary/all_hour.geojson',
    'https://name:secret@earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
    'https://earthquake.usgs.gov:444/earthquakes/feed/v1.0/summary/all_hour.geojson',
    `${USGS_SUMMARY_URLS.hour}?foo=bar`, `${USGS_SUMMARY_URLS.hour}#fragment`,
    'https://earthquake.usgs.gov/fdsnws/event/1/query', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson',
  ])('rejects a noncanonical destination: %s', (url) => {
    expect(() => validateUsgsSummaryUrl(url)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects redirects without following them or consuming the error body', async () => {
    const cancel = vi.fn();
    fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 302, headers: { Location: 'https://attacker.example/payload' } }));
    await expect(fetchUsgsSummary('hour')).rejects.toMatchObject({ status: 502, code: 'USGS_REDIRECT_REJECTED' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalled();
  });

  it.each([undefined, '2'])('counts streamed bytes despite Content-Length=%s and cancels oversized bodies', async (length) => {
    const cancel = vi.fn();
    fetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(65))); }, cancel }), { headers: length ? { 'Content-Length': length } : {} }));
    await expect(fetchUsgsSummary('hour', { maxBytes: 64 })).rejects.toMatchObject({ code: 'USGS_RESPONSE_TOO_LARGE' });
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects oversized declared length before reading and cancels the body', async () => {
    const cancel = vi.fn();
    fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Length': '100' } }));
    await expect(fetchUsgsSummary('hour', { maxBytes: 64 })).rejects.toMatchObject({ code: 'USGS_RESPONSE_TOO_LARGE' });
    expect(cancel).toHaveBeenCalled();
  });

  it('applies one deadline to a stalled body and aborts/cancels it', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetch.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const result = fetchUsgsSummary('hour', { timeoutMs: 50 });
    const advance = vi.advanceTimersByTimeAsync(50);
    await expect(result).rejects.toMatchObject({ status: 504, code: 'USGS_TIMEOUT' });
    await advance;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalled();
  });

  it('applies the deadline while waiting for response headers', async () => {
    vi.useFakeTimers();
    fetch.mockReturnValue(new Promise(() => {}));
    const result = fetchUsgsSummary('hour', { timeoutMs: 50 });
    const advance = vi.advanceTimersByTimeAsync(50);
    await expect(result).rejects.toMatchObject({ status: 504 });
    await advance;
  });

  it.each([
    { type: 'FeatureCollection', features: [usgsFeature(), usgsFeature()] },
    usgsCollection([usgsFeature('bad/id')]),
    usgsCollection([usgsFeature('a', { updated: '1750000001000' })]),
    usgsCollection([usgsFeature('a', { detail: 'https://attacker.example/detail' })]),
    usgsCollection([{ ...usgsFeature(), geometry: { type: 'Point', coordinates: [0, 91, 2] } }]),
    { features: [] },
  ])('rejects malformed payload %#', async (payload) => {
    fetch.mockResolvedValue(Response.json(payload));
    await expect(fetchUsgsSummary('hour')).rejects.toMatchObject({ code: 'INVALID_USGS_PAYLOAD' });
  });

  it('allows explicit null scientific fields and retains application metadata', async () => {
    const payload = usgsCollection([usgsFeature('zero', { mag: null, place: null, felt: 2, alert: 'green', tsunami: 1, sig: 100 })]);
    payload.features[0].geometry.coordinates = [0, 0, 0];
    fetch.mockResolvedValue(Response.json(payload));
    expect(await fetchUsgsSummary('hour')).toEqual(payload);
  });

  it('enforces the record count separately from the byte limit', async () => {
    fetch.mockResolvedValue(Response.json(usgsCollection([usgsFeature('a'), usgsFeature('b')])));
    await expect(fetchUsgsSummary('hour', { maxFeatures: 1 })).rejects.toMatchObject({ code: 'INVALID_USGS_PAYLOAD' });
  });

  it('validates detail IDs before fetching and rejects mismatched IDs', async () => {
    await expect(fetchValidatedDetail('../bad')).rejects.toMatchObject({ status: 400 });
    expect(() => validateUsgsDetailUrl('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/%2e%2e/x.geojson')).toThrow();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue(Response.json(usgsFeature('other')));
    await expect(fetchValidatedDetail('wanted')).rejects.toMatchObject({ code: 'INVALID_USGS_PAYLOAD' });
  });

  it('accepts an explicitly listed upstream alias and preserves missing-event404', async () => {
    fetch.mockResolvedValueOnce(Response.json(usgsFeature('canonical', { ids: ',canonical,alias,' })));
    expect((await fetchValidatedDetail('alias')).id).toBe('canonical');
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(fetchValidatedDetail('missing')).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    '/fdsnws/event/1/query?eventid=us6000rhs0&format=geojson',
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=us6000rhs0',
  ])('follows the official detail302 shape once: %s', async location => {
    const cancel = vi.fn();
    const payload = usgsFeature('us6000rhs0', { detail: undefined });
    fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 302, headers: { Location: location } }))
      .mockResolvedValueOnce(Response.json(payload));
    expect(await fetchValidatedDetail('us6000rhs0')).toEqual(payload);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[1][0]).toBe('https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us6000rhs0&format=geojson');
    expect(fetch.mock.calls[1][1].redirect).toBe('manual');
    expect(fetch.mock.calls[1][1].signal).toBe(fetch.mock.calls[0][1].signal);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    null, 'https://attacker.example/fdsnws/event/1/query?eventid=event&format=geojson',
    '//earthquake.usgs.gov/fdsnws/event/1/query?eventid=event&format=geojson',
    'http://earthquake.usgs.gov/fdsnws/event/1/query?eventid=event&format=geojson',
    'https://user:password@earthquake.usgs.gov/fdsnws/event/1/query?eventid=event&format=geojson',
    'https://earthquake.usgs.gov:443/fdsnws/event/1/query?eventid=event&format=geojson',
    'https://earthquake.usgs.gov:444/fdsnws/event/1/query?eventid=event&format=geojson',
    '/fdsnws/event/1/query?eventid=other&format=geojson',
    '/fdsnws/event/1/query?eventid=event&format=geojson#',
    '/fdsnws/event/1/query?eventid=event&format=geojson&extra=1',
    '/fdsnws/event/1/query?eventid=event&eventid=event',
    '/fdsnws/event/1/query?eventid=event&format=geojson&format=geojson',
    '/fdsnws/event/1/query?eventid=event&format=xml',
    '/fdsnws/event/1/query/?eventid=event&format=geojson',
    '/fdsnws/event/1/other?eventid=event&format=geojson',
    '/fdsnws/event/1/query?eventid=event&format=geojson\\unsafe',
  ])('rejects unsafe detail redirect without a second request: %s', async location => {
    const cancel = vi.fn();
    fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), {
      status: 302, headers: location === null ? {} : { Location: location },
    }));
    await expect(fetchValidatedDetail('event')).rejects.toMatchObject({ code: 'USGS_REDIRECT_REJECTED', upstreamStatus: 302 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([301, 303, 307, 308])('rejects unapproved detail redirect status%s', async status => {
    fetch.mockResolvedValueOnce(new Response(null, { status, headers: { Location: '/fdsnws/event/1/query?eventid=event&format=geojson' } }));
    await expect(fetchValidatedDetail('event')).rejects.toMatchObject({ code: 'USGS_REDIRECT_REJECTED' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects a second redirect and cancels its body', async () => {
    const cancel = vi.fn();
    const headers = { Location: '/fdsnws/event/1/query?eventid=event&format=geojson' };
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 302, headers }));
    await expect(fetchValidatedDetail('event')).rejects.toMatchObject({ code: 'USGS_REDIRECT_REJECTED' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['headers', 'body'])('shares the initial deadline across the catalog hop and stalled%s', async stalled => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetch.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(new Response(null, {
      status: 302, headers: { Location: '/fdsnws/event/1/query?eventid=event&format=geojson' },
    })), 30))).mockImplementationOnce(() => stalled === 'headers' ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ cancel }))));
    const result = fetchValidatedDetail('event', { timeoutMs: 50 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(49);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ code: 'USGS_TIMEOUT', status: 504 });
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
    if (stalled === 'body') expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['malformed', 'mismatched ID', 'oversized', '404'])('preserves bounded validation for redirected detail: %s', async failure => {
    const cancel = vi.fn();
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/fdsnws/event/1/query?eventid=event&format=geojson' } }))
      .mockResolvedValueOnce(failure === '404' ? new Response(null, { status: 404 })
        : failure === 'malformed' ? new Response('not JSON')
          : failure === 'mismatched ID' ? Response.json(usgsFeature('other'))
            : new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(65)); }, cancel })));
    await expect(fetchValidatedDetail('event', { maxBytes: failure === 'oversized' ? 64 : 10000 })).rejects.toMatchObject(
      failure === '404' ? { status: 404, upstreamStatus: 404 } : { code: failure === 'oversized' ? 'USGS_RESPONSE_TOO_LARGE' : 'INVALID_USGS_PAYLOAD' });
    expect(fetch).toHaveBeenCalledTimes(2);
    if (failure === 'oversized') expect(cancel).toHaveBeenCalledOnce();
  });

  it('validates aliases after the catalog hop without accepting unrelated payloads', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/fdsnws/event/1/query?eventid=alias&format=geojson' } }))
      .mockResolvedValueOnce(Response.json(usgsFeature('canonical', { ids: ',canonical,alias,' })));
    expect((await fetchValidatedDetail('alias')).id).toBe('canonical');
  });

  it.each(['summary', 'catalog'])('never follows a legitimate-looking redirect for%s requests', async kind => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/fdsnws/event/1/query?eventid=event&format=geojson' } }));
    await expect(kind === 'summary' ? fetchUsgsSummary('hour')
      : fetchUsgsCatalogPage({ startDate: '2026-01-01', endDate: '2026-01-02' })).rejects.toMatchObject({ code: 'USGS_REDIRECT_REJECTED' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('constructs catalog URLs from bounded dates/pages and accepts empty204', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await fetchUsgsCatalogPage({ startDate: '2026-01-01', endDate: '2026-01-08', offset: 1001 })).toEqual({ type: 'FeatureCollection', features: [] });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin).toBe('https://earthquake.usgs.gov');
    expect(url.searchParams.get('limit')).toBe('1000');
    expect(url.searchParams.get('offset')).toBe('1001');
    expect(url.searchParams.get('orderby')).toBe('time-asc');
    expect(url.searchParams.has('minmagnitude')).toBe(false);
  });

  it('validates FDSN detail links and converts them to canonical feed links', async () => {
    const original = usgsFeature('event', { detail: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=event&format=geojson' });
    fetch.mockResolvedValueOnce(Response.json(usgsCollection([original])));
    const result = await fetchUsgsCatalogPage({ startDate: '2026-01-01', endDate: '2026-01-02' });
    expect(result.features[0].properties.detail).toBe(usgsFeature('event').properties.detail);
    fetch.mockResolvedValueOnce(Response.json(usgsCollection([usgsFeature('event', { detail: 'https://attacker.example/fdsnws/event/1/query?eventid=event&format=geojson' })])));
    await expect(fetchUsgsCatalogPage({ startDate: '2026-01-01', endDate: '2026-01-02' })).rejects.toMatchObject({ code: 'INVALID_USGS_PAYLOAD' });
  });

  it.each([
    ['2026-02-30', '2026-03-01', 1], ['2026-01-01', '2026-01-09', 1],
    ['2026-01-01', '2026-01-01', 1], ['2026-01-02', '2026-01-01', 1], ['2026-01-01', '2026-01-02', -1],
  ])('rejects invalid catalog input %s / %s / %s', async (startDate, endDate, offset) => {
    await expect(fetchUsgsCatalogPage({ startDate, endDate, offset })).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('USGS detail transient recovery and caller lifetime', () => {
  it('retries a transient catalog failure at the validated target without a second redirect', async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/fdsnws/event/1/query?eventid=event&format=geojson' } }))
      .mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json(usgsFeature('event')));
    const result = fetchValidatedDetail('event');
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).id).toBe('event');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toBe(fetch.mock.calls[1][0]);
  });
  it('classifies a network error separately and exhausts only one retry', async () => {
    vi.useFakeTimers(); fetch.mockRejectedValue(new TypeError('private network details'));
    const result = fetchValidatedDetail('event').catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ code: 'USGS_NETWORK_ERROR', status: 502 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps the retry wait inside the original deadline', async () => {
    vi.useFakeTimers(); fetch.mockResolvedValue(new Response(null, { status: 503 }));
    const result = fetchValidatedDetail('event', { timeoutMs: 50 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toMatchObject({ code: 'USGS_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([404, 409])('does not retry upstream%s', async status => {
    fetch.mockResolvedValue(new Response(null, { status }));
    await expect(fetchValidatedDetail('event')).rejects.toMatchObject({ upstreamStatus: status });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('never fetches for an already cancelled caller', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(fetchValidatedDetail('event', { signal: controller.signal })).rejects.toMatchObject({ code: 'USGS_ABORTED' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cancels a response arriving after caller cancellation', async () => {
    const controller = new AbortController(); const cancel = vi.fn(); let resolveFetch;
    fetch.mockImplementation(() => new Promise(resolve => { resolveFetch = resolve; }));
    const result = fetchValidatedDetail('event', { signal: controller.signal }).catch(error => error);
    controller.abort(); expect(await result).toMatchObject({ code: 'USGS_ABORTED' });
    resolveFetch(new Response(new ReadableStream({ cancel })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('classifies only the explicit official catalog deleted event as410', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/fdsnws/event/1/query?eventid=event&format=geojson' } }))
      .mockResolvedValueOnce(new Response('Error 409: Conflict\nThe requested event has been deleted. To see information for deleted events, perform a search.', { status: 409, headers: { 'Content-Type': 'text/plain' } }));
    await expect(fetchValidatedDetail('event')).rejects.toMatchObject({ status: 410, code: 'USGS_EVENT_DELETED', upstreamStatus: 409 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('recognizes the same explicit deleted response directly from the official feed detail', async () => {
    fetch.mockResolvedValueOnce(new Response('Error 409: Conflict\nThe requested event has been deleted. To see information for deleted events, perform a search.', {
      status: 409, headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    }));
    await expect(fetchValidatedDetail('event')).rejects.toMatchObject({ status: 410, code: 'USGS_EVENT_DELETED', upstreamStatus: 409 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['unrelated conflict', 'x'.repeat(4097), '{malformed'])('does not reinterpret unrelated/bounded catalog409 bodies', async body => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/fdsnws/event/1/query?eventid=event&format=geojson' } }))
      .mockResolvedValueOnce(new Response(body, { status: 409, headers: { 'Content-Type': 'text/plain' } }));
    await expect(fetchValidatedDetail('event')).rejects.toMatchObject({ status: 502, code: 'USGS_UPSTREAM_ERROR', upstreamStatus: 409 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
