import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext.jsx';
import { server } from '../../mocks/server.js';
import { earthquakeFeature, feedEnvelope, feedHeaders, completeUsgsFeed } from '../../test-utils/earthquakeFeedFixtures.js';
const wrapper = ({ children }) => <EarthquakeDataProvider>{children}</EarthquakeDataProvider>;
async function month() {
  const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
  await waitFor(() => expect(result.current.isInitialAppLoad).toBe(false));
  act(() => result.current.loadMonthlyData());
  await waitFor(() => expect(result.current.hasAttemptedMonthlyLoad && !result.current.isLoadingMonthly).toBe(true));
  return result;
}
function handleMonth(handler) {
  server.use(http.get('/api/earthquake-feeds', ({ request }) => {
    const period = new URL(request.url).searchParams.get('period');
    if (period === 'month') return handler();
    const envelope = feedEnvelope(period, []);
    return HttpResponse.json(envelope, { headers: feedHeaders(envelope) });
  }));
}
describe('opt-in complete monthly feed', () => {
  it('accepts an older event with old event metadata inside a freshly validated complete month', async () => {
    const event = earthquakeFeature('old', { time: Date.now() - 25 * 86400000, updated: Date.now() - 20 * 86400000 });
    handleMonth(() => { const e = feedEnvelope('month', [event]); return HttpResponse.json(e, { headers: feedHeaders(e) }); });
    const result = await month();
    expect(result.current.allEarthquakes).toEqual([event]);
    expect(result.current).toMatchObject({ monthlyHasLoaded: true, monthlyDataSource: 'USGS snapshot', monthlyError: null });
  });
  it('uses a complete validated fallback after a missing monthly snapshot', async () => {
    handleMonth(() => new HttpResponse(null, { status: 404 }));
    server.use(http.get('/api/usgs-proxy', () => HttpResponse.json(completeUsgsFeed())));
    const result = await month();
    expect(result.current).toMatchObject({ monthlyHasLoaded: true, monthlyDataSource: 'USGS', monthlyError: null });
  });
  it('accepts a successful empty month rather than confusing it with an unavailable period', async () => {
    handleMonth(() => { const e = feedEnvelope('month', []); return HttpResponse.json(e, { headers: feedHeaders(e) }); });
    const result = await month();
    expect(result.current).toMatchObject({ monthlyHasLoaded: true, allEarthquakes: [], monthlyError: null });
  });
  it.each([
    { type: 'FeatureCollection', features: [] },
    { type: 'FeatureCollection', metadata: { generated: Date.now(), status: 200, count: 0 } },
    { error: { message: 'Unavailable' } },
  ])('rejects an invalid fallback and keeps retry available', async invalid => {
    handleMonth(() => new HttpResponse(null, { status: 503 }));
    server.use(http.get('/api/usgs-proxy', () => HttpResponse.json(invalid)));
    const result = await month();
    expect(result.current.monthlyHasLoaded).toBe(false);
    expect(result.current.monthlyError).toBeTruthy();
    handleMonth(() => { const e = feedEnvelope('month', []); return HttpResponse.json(e, { headers: feedHeaders(e) }); });
    act(() => result.current.loadMonthlyData());
    await waitFor(() => expect(result.current.monthlyHasLoaded).toBe(true));
    expect(result.current.monthlyError).toBeNull();
  });
});
