import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext.jsx';
import { server } from '../../mocks/server.js';
import { earthquakeFeature, feedEnvelope, feedHeaders, completeUsgsFeed } from '../../test-utils/earthquakeFeedFixtures.js';
const wrapper = ({ children }) => <EarthquakeDataProvider>{children}</EarthquakeDataProvider>;
const response = period => { const e = feedEnvelope(period, [earthquakeFeature(period)]); return HttpResponse.json(e, { headers: feedHeaders(e) }); };

describe('independent initial complete feed loads', () => {
  it('starts day/week together and accepts each successful snapshot independently', async () => {
    let releaseWeek; const pending = new Promise(resolve => { releaseWeek = resolve; });
    server.use(http.get('/api/earthquake-feeds', async ({ request }) => {
      const period = new URL(request.url).searchParams.get('period');
      if (period === 'week') await pending;
      return response(period);
    }));
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await waitFor(() => expect(result.current.dailyHasLoaded).toBe(true));
    expect(result.current.isLoadingWeekly).toBe(true);
    expect(result.current.earthquakesLast24Hours[0].id).toBe('day');
    releaseWeek();
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));
    expect(result.current.weeklyHasLoaded).toBe(true);
  });
  it.each(['day', 'week'])('retains the successful other period when %s and its fallback both fail', async failed => {
    server.use(http.get('/api/earthquake-feeds', ({ request }) => {
      const period = new URL(request.url).searchParams.get('period');
      return period === failed ? new HttpResponse(null, { status: 503 }) : response(period);
    }), http.get('/api/usgs-proxy', () => new HttpResponse(null, { status: 503 })));
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));
    expect(result.current[failed === 'day' ? 'dailyError' : 'weeklyError']).toBeTruthy();
    expect(result.current[failed === 'day' ? 'weeklyHasLoaded' : 'dailyHasLoaded']).toBe(true);
    expect(result.current[failed === 'day' ? 'dailyHasLoaded' : 'weeklyHasLoaded']).toBe(false);
  });
  it('uses validated fallback data when both primary snapshots are unavailable', async () => {
    server.use(http.get('/api/earthquake-feeds', () => new HttpResponse(null, { status: 503 })),
      http.get('/api/usgs-proxy', () => HttpResponse.json(completeUsgsFeed())));
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));
    expect(result.current).toMatchObject({ dailyDataSource: 'USGS', weeklyDataSource: 'USGS', error: null });
  });
  it('settles initial loading after both primary/fallback paths fail without fabricating successful empty feeds', async () => {
    server.use(http.get('/api/earthquake-feeds', () => new HttpResponse(null, { status: 503 })),
      http.get('/api/usgs-proxy', () => HttpResponse.json({ type: 'FeatureCollection', features: [] })));
    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
    await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));
    expect(result.current).toMatchObject({ dailyHasLoaded: false, weeklyHasLoaded: false, dailyDataSource: null, weeklyDataSource: null });
    expect(result.current.error).toContain('Daily & Weekly');
  });
});
