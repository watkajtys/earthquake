import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext.jsx';
import { server } from '../../mocks/server.js';
import { earthquakeFeature, feedEnvelope, feedHeaders, completeUsgsFeed } from '../../test-utils/earthquakeFeedFixtures.js';
const wrapper = ({ children }) => <EarthquakeDataProvider>{children}</EarthquakeDataProvider>;
async function loadAll() {
  const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
  await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));
  act(() => result.current.loadMonthlyData());
  await waitFor(() => expect(result.current.hasAttemptedMonthlyLoad && !result.current.isLoadingMonthly).toBe(true));
  return result;
}
function respond(period, features) { const e = feedEnvelope(period, features); return HttpResponse.json(e, { headers: feedHeaders(e) }); }

describe('complete provider feed contract', () => {
  it('accepts complete day/week/month snapshots and preserves alert/revision/detail fields without a second fetch', async () => {
    const feature = earthquakeFeature('alert-quake', { alert: 'orange', tsunami: 1, felt: 240, sig: 900 });
    const primary = vi.fn(({ request }) => respond(new URL(request.url).searchParams.get('period'), [feature]));
    const fallback = vi.fn(() => HttpResponse.json(completeUsgsFeed()));
    server.use(http.get('/api/earthquake-feeds', primary), http.get('/api/usgs-proxy', fallback));
    const result = await loadAll();
    expect(primary).toHaveBeenCalledTimes(3);
    expect(fallback).not.toHaveBeenCalled();
    for (const events of [result.current.earthquakesLast24Hours, result.current.earthquakesLast7Days, result.current.allEarthquakes]) expect(events).toEqual([feature]);
    expect(result.current.highestRecentAlert).toBe('orange');
    expect(result.current.hasRecentTsunamiWarning).toBe(true);
    expect(result.current.dailyFeedStatus).toMatchObject({ dataSource: 'USGS snapshot', hasLoaded: true, stale: false, coverage: { complete: true } });
    expect(result.current.monthlySourceGeneratedAtMs).toBeTypeOf('number');
    act(() => result.current.loadMonthlyData());
    await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));
    expect(primary).toHaveBeenCalledTimes(3);
  });
  it('accepts complete empty snapshots as successful loaded periods', async () => {
    server.use(http.get('/api/earthquake-feeds', ({ request }) => respond(new URL(request.url).searchParams.get('period'), [])));
    const result = await loadAll();
    expect(result.current).toMatchObject({ dailyHasLoaded: true, weeklyHasLoaded: true, monthlyHasLoaded: true,
      allEarthquakes: [], error: null, monthlyError: null });
  });
  it.each(['alert', 'tsunami', 'felt', 'sig'])('falls back on missing %s metadata and validates the whole fallback', async missing => {
    const sparse = earthquakeFeature('sparse'); delete sparse.properties[missing];
    const good = earthquakeFeature('fallback');
    const fallback = vi.fn(() => HttpResponse.json(completeUsgsFeed([good])));
    server.use(http.get('/api/earthquake-feeds', ({ request }) => respond(new URL(request.url).searchParams.get('period'), [sparse])),
      http.get('/api/usgs-proxy', fallback));
    const result = await loadAll();
    expect(fallback).toHaveBeenCalledTimes(3);
    expect(result.current).toMatchObject({ dailyDataSource: 'USGS', weeklyDataSource: 'USGS', monthlyDataSource: 'USGS' });
    expect(result.current.allEarthquakes).toEqual([good]);
  });
  it.each([404, 503])('uses one fallback per period when the additive endpoint returns HTTP %s', async status => {
    const fallback = vi.fn(() => HttpResponse.json(completeUsgsFeed()));
    server.use(http.get('/api/earthquake-feeds', () => new HttpResponse(null, { status })), http.get('/api/usgs-proxy', fallback));
    const result = await loadAll();
    expect(fallback).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeNull();
  });
});
