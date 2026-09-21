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
