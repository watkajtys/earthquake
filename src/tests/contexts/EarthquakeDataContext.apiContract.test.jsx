import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { EarthquakeDataProvider, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { server } from '../../mocks/server';
import { fetchUsgsData } from '../../services/usgsApiService';
import { USGS_API_URL_DAY, USGS_API_URL_WEEK, USGS_API_URL_MONTH } from '../../constants/appConstants';

vi.mock('../../services/usgsApiService', () => ({ fetchUsgsData: vi.fn() }));

const wrapper = ({ children }) => <EarthquakeDataProvider>{children}</EarthquakeDataProvider>;
const createRecord = (id) => ({
  id,
  event_time: Date.now() - 60_000,
  magnitude: 3.5,
  place: 'Test location',
  latitude: 35,
  longitude: -118,
  depth: 8,
  properties: { alert: null, tsunami: 0, felt: 0, sig: 100 },
  summary_updated_at: Date.now(),
});
const asFeature = (record) => ({
  type: 'Feature',
  id: record.id,
  properties: {
    ...record.properties,
    mag: record.magnitude, place: record.place, time: record.event_time,
    detail: record.usgs_detail_url || `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${record.id}.geojson`,
    url: `https://earthquake.usgs.gov/earthquakes/eventpage/${record.id}`,
  },
  geometry: { type: 'Point', coordinates: [record.longitude, record.latitude, record.depth] },
});

async function loadAllPeriods() {
  const { result } = renderHook(() => useEarthquakeDataState(), { wrapper });
  await waitFor(() => {
    expect(result.current.isInitialAppLoad).toBe(false);
    expect(result.current.isLoadingDaily).toBe(false);
    expect(result.current.isLoadingWeekly).toBe(false);
  });
  act(() => result.current.loadMonthlyData());
  await waitFor(() => {
    expect(result.current.hasAttemptedMonthlyLoad).toBe(true);
    expect(result.current.isLoadingMonthly).toBe(false);
  });
  return result;
}

describe('EarthquakeDataProvider API contract', () => {
  beforeEach(() => fetchUsgsData.mockReset());

  it.each(['R2', 'D1'])('uses %s records for day, week, and month without falling back', async (source) => {
    const record = createRecord('cached-quake');
    const requestedPeriods = [];
    server.use(http.get('/api/get-earthquakes', ({ request }) => {
      requestedPeriods.push(new URL(request.url).searchParams.get('timeWindow'));
      return HttpResponse.json([record], { headers: { 'X-Data-Source': source } });
    }));

    const result = await loadAllPeriods();

    expect(requestedPeriods).toEqual(['day', 'week', 'month']);
    expect(result.current.dailyDataSource).toBe(source);
    expect(result.current.weeklyDataSource).toBe(source);
    expect(result.current.monthlyDataSource).toBe(source);
    expect(result.current.earthquakesLast24Hours).toEqual([asFeature(record)]);
    expect(result.current.earthquakesLast7Days).toEqual([asFeature(record)]);
    expect(result.current.allEarthquakes).toEqual([asFeature(record)]);
    expect(result.current.error).toBeNull();
    expect(result.current.monthlyError).toBeNull();
    expect(fetchUsgsData).not.toHaveBeenCalled();

    // Loading the monthly feed again should retain its source while using the cache.
    act(() => result.current.loadMonthlyData());
    await waitFor(() => expect(result.current.isLoadingMonthly).toBe(false));
    expect(requestedPeriods).toEqual(['day', 'week', 'month']);
    expect(result.current.monthlyDataSource).toBe(source);
  });

  it('accepts empty R2 lists as successful feeds', async () => {
    server.use(http.get('/api/get-earthquakes', () =>
      HttpResponse.json([], { headers: { 'X-Data-Source': 'R2' } })
    ));

    const result = await loadAllPeriods();

    expect(result.current.dailyDataSource).toBe('R2');
    expect(result.current.weeklyDataSource).toBe('R2');
    expect(result.current.monthlyDataSource).toBe('R2');
    expect(result.current.allEarthquakes).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.monthlyError).toBeNull();
    expect(fetchUsgsData).not.toHaveBeenCalled();
  });

  it('preserves a stored USGS detail URL while supplying the event page link', async () => {
    const record = {
      ...createRecord('cached-quake'),
      usgs_detail_url: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=cached-quake&format=geojson',
    };
    server.use(http.get('/api/get-earthquakes', () =>
      HttpResponse.json([record], { headers: { 'X-Data-Source': 'R2' } })
    ));

    const result = await loadAllPeriods();
    for (const events of [result.current.earthquakesLast24Hours, result.current.earthquakesLast7Days, result.current.allEarthquakes]) {
      expect(events[0].properties.detail).toBe(record.usgs_detail_url);
      expect(events[0].properties.url).toBe('https://earthquake.usgs.gov/earthquakes/eventpage/cached-quake');
    }
    expect(fetchUsgsData).not.toHaveBeenCalled();
  });

  it('preserves R2 alert metadata through provider processing', async () => {
    const record = {
      ...createRecord('alert-quake'),
      magnitude: 5.5,
      properties: { alert: 'orange', tsunami: 1, felt: 240, sig: 900, status: 'reviewed' },
    };
    server.use(http.get('/api/get-earthquakes', () =>
      HttpResponse.json([record], { headers: { 'X-Data-Source': 'R2' } })
    ));

    const result = await loadAllPeriods();
    expect(result.current.hasRecentTsunamiWarning).toBe(true);
    expect(result.current.highestRecentAlert).toBe('orange');
    expect(result.current.activeAlertTriggeringQuakes.map(quake => quake.id)).toEqual(['alert-quake']);
    for (const events of [result.current.earthquakesLast24Hours, result.current.earthquakesLast7Days, result.current.allEarthquakes]) {
      expect(events[0].properties).toMatchObject({ alert: 'orange', tsunami: 1, felt: 240, sig: 900, status: 'reviewed' });
    }
    expect(fetchUsgsData).not.toHaveBeenCalled();
  });

  it.each(['properties', 'alert', 'tsunami', 'felt', 'sig'])('falls back when any R2 record is missing %s', async missingField => {
    const completeRecord = createRecord('complete-quake');
    const sparseRecord = createRecord('sparse-quake');
    if (missingField === 'properties') delete sparseRecord.properties;
    else delete sparseRecord.properties[missingField];
    const fallbackFeature = asFeature(createRecord('usgs-quake'));
    fetchUsgsData.mockResolvedValue({ type: 'FeatureCollection', features: [fallbackFeature] });
    server.use(http.get('/api/get-earthquakes', () =>
      HttpResponse.json([completeRecord, sparseRecord], { headers: { 'X-Data-Source': 'R2' } })
    ));

    const result = await loadAllPeriods();
    expect(result.current.dailyDataSource).toBe('USGS');
    expect(result.current.weeklyDataSource).toBe('USGS');
    expect(result.current.monthlyDataSource).toBe('USGS');
    expect(result.current.allEarthquakes).toEqual([fallbackFeature]);
    expect(fetchUsgsData.mock.calls.map(([url]) => url)).toEqual([
      USGS_API_URL_DAY, USGS_API_URL_WEEK, USGS_API_URL_MONTH,
    ]);
  });

  it.each([
    ['stale', () => Date.now() - 11 * 60_000],
    ['future', () => Date.now() + 60_000],
    ['missing', () => undefined],
    ['non-numeric', () => String(Date.now())],
  ])('falls back when rich R2 summary freshness is %s', async (_description, timestamp) => {
    const record = { ...createRecord('cached-quake'), summary_updated_at: timestamp() };
    const fallbackFeature = asFeature(createRecord('usgs-quake'));
    fetchUsgsData.mockResolvedValue({ type: 'FeatureCollection', features: [fallbackFeature] });
    server.use(http.get('/api/get-earthquakes', () =>
      HttpResponse.json([record], { headers: { 'X-Data-Source': 'R2' } })
    ));

    const result = await loadAllPeriods();
    expect(result.current.dailyDataSource).toBe('USGS');
    expect(result.current.weeklyDataSource).toBe('USGS');
    expect(result.current.monthlyDataSource).toBe('USGS');
    expect(result.current.allEarthquakes).toEqual([fallbackFeature]);
    expect(fetchUsgsData).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['missing R2 lists', () => HttpResponse.text('R2 object not found', { status: 404 })],
    ['an unknown source', () => HttpResponse.json([], { headers: { 'X-Data-Source': 'unknown' } })],
    ['an invalid R2 payload', () => HttpResponse.json({ error: 'not a list' }, { headers: { 'X-Data-Source': 'R2' } })],
    ['non-JSON R2 content', () => HttpResponse.text('<html>unavailable</html>', { headers: { 'X-Data-Source': 'R2' } })],
  ])('falls back to USGS for all periods after %s', async (_description, response) => {
    const fallbackFeature = asFeature(createRecord('usgs-quake'));
    fetchUsgsData.mockResolvedValue({ type: 'FeatureCollection', features: [fallbackFeature] });
    server.use(http.get('/api/get-earthquakes', response));

    const result = await loadAllPeriods();

    expect(fetchUsgsData.mock.calls.map(([url]) => url)).toEqual([
      USGS_API_URL_DAY, USGS_API_URL_WEEK, USGS_API_URL_MONTH,
    ]);
    expect(result.current.dailyDataSource).toBe('USGS');
    expect(result.current.weeklyDataSource).toBe('USGS');
    expect(result.current.monthlyDataSource).toBe('USGS');
    expect(result.current.allEarthquakes).toEqual([fallbackFeature]);
    expect(result.current.error).toBeNull();
    expect(result.current.monthlyError).toBeNull();
  });
});
