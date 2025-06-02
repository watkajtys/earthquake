import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Removed React and EarthquakeDataContext direct imports
import useMonthlyEarthquakeData from './useMonthlyEarthquakeData'; 
import { fetchDataCb as actualFetchDataCb } from '../utils/fetchUtils'; 

import { USGS_API_URL_MONTH, MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';

vi.mock('../utils/fetchUtils', () => ({
  fetchDataCb: vi.fn(),
}));
const mockedFetchDataCb = actualFetchDataCb; 

const MOCKED_NOW = 1700000000000; 
const createMockEarthquake = (id, timeOffsetDays, mag, title = 'Test Quake') => ({
    type: 'Feature',
    properties: { mag, place: 'Test Place', time: MOCKED_NOW - timeOffsetDays * 24 * 3600 * 1000, updated: MOCKED_NOW - timeOffsetDays * 24 * 3600 * 1000, title, type: 'earthquake', status: 'reviewed', ids: `,test${id},` },
    geometry: { type: 'Point', coordinates: [0,0,0] },
    id: `test${id}`,
});

const mockMonthlyResponse = {
    type: 'FeatureCollection', metadata: { generated: MOCKED_NOW - 1000 * 60 * 60, count: 3 },
    features: [
        createMockEarthquake('month1', 1, 5.5),  
        createMockEarthquake('month2', 10, 6.0), 
        createMockEarthquake('month3', 20, 4.0), 
    ],
};
const emptyMockMonthlyResponse = { type: 'FeatureCollection', metadata: { generated: MOCKED_NOW, count: 0 }, features: [] };

// Mock functions that would be passed from the provider
let mockSetLoadingStatus;
let mockSetErrorState;
let mockSetMonthlyEarthquakeData;
let mockUpdateLastMajorQuake;
let mockSetHasAttemptedMonthlyLoad;
let mockHookProps;


describe('useMonthlyEarthquakeData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MOCKED_NOW));
    
    mockedFetchDataCb.mockReset();
    mockSetLoadingStatus = vi.fn();
    mockSetErrorState = vi.fn();
    mockSetMonthlyEarthquakeData = vi.fn();
    mockUpdateLastMajorQuake = vi.fn();
    mockSetHasAttemptedMonthlyLoad = vi.fn();

    mockHookProps = {
      lastMajorQuake: null, // This will be set by tests for different scenarios
      setLoadingStatus: mockSetLoadingStatus,
      setErrorState: mockSetErrorState,
      setMonthlyEarthquakeData: mockSetMonthlyEarthquakeData,
      updateLastMajorQuake: mockUpdateLastMajorQuake,
      setHasAttemptedMonthlyLoad: mockSetHasAttemptedMonthlyLoad,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Helper to render the hook with current mockHookProps
  const renderTestHook = (propsChanges = {}) => {
    const currentProps = { ...mockHookProps, ...propsChanges };
    return renderHook((p) => useMonthlyEarthquakeData(mockedFetchDataCb, p), { 
      initialProps: currentProps 
    });
  };


  describe('loadMonthlyData Functionality (Successful Fetch)', () => {
    beforeEach(() => {
      mockedFetchDataCb.mockResolvedValue({ ...mockMonthlyResponse });
    });

    it('should call context loading and attempt setters', async () => {
      const { result } = renderTestHook();
      await act(async () => { await result.current.loadMonthlyData(); });

      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ monthly: true });
      expect(mockSetHasAttemptedMonthlyLoad).toHaveBeenCalledWith(true);
      expect(mockSetErrorState).toHaveBeenCalledWith({ type: 'monthly', message: null });
      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ monthly: false });
    });

    it('should call setMonthlyEarthquakeData with processed data', async () => {
      const { result } = renderTestHook();
      await act(async () => { await result.current.loadMonthlyData(); });

      expect(mockSetMonthlyEarthquakeData).toHaveBeenCalledWith(expect.objectContaining({
        all: mockMonthlyResponse.features,
        last14: expect.arrayContaining([
            expect.objectContaining({ id: 'testmonth1' }),
            expect.objectContaining({ id: 'testmonth2' }),
        ]),
        last30: expect.arrayContaining([
            expect.objectContaining({ id: 'testmonth1' }),
            expect.objectContaining({ id: 'testmonth2' }),
            expect.objectContaining({ id: 'testmonth3' }),
        ]),
        prev7: expect.arrayContaining([expect.objectContaining({ id: 'testmonth2' })]), 
        prev14: expect.arrayContaining([expect.objectContaining({ id: 'testmonth3' })]), 
      }));
    });

    describe('Major Quake Consolidation with Context', () => {
      it('should call updateLastMajorQuake for major quakes from monthly if hook is passed null for lastMajorQuake', async () => {
        const { result } = renderTestHook({ lastMajorQuake: null }); // Explicitly pass null
        await act(async () => { await result.current.loadMonthlyData(); });

        expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
        expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth2' }));
      });

      it('should call updateLastMajorQuake consolidating with passed lastMajorQuake', async () => {
        const passedLastMajorQuake = createMockEarthquake('contextMajor', 5, 5.8);
        const { result } = renderTestHook({ lastMajorQuake: passedLastMajorQuake });
        
        await act(async () => { await result.current.loadMonthlyData(); });

        expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
        expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testcontextMajor' }));
        expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth2' }));
        
        const calls = mockUpdateLastMajorQuake.mock.calls;
        const times = calls.map(call => call[0].properties.time);
        expect(times[0]).toBeGreaterThanOrEqual(times[1]);
        if (times.length > 2) expect(times[1]).toBeGreaterThanOrEqual(times[2]);
      });

      it('should call updateLastMajorQuake even if passed lastMajorQuake is newest', async () => {
        const passedNewestMajorQuake = createMockEarthquake('contextNewestMajor', 0.5, 7.0);
        const { result } = renderTestHook({ lastMajorQuake: passedNewestMajorQuake });
        await act(async () => { await result.current.loadMonthlyData(); });

        expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testcontextNewestMajor' }));
        expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth1' }));
        expect(mockUpdateLastMajorQuake).toHaveBeenCalledWith(expect.objectContaining({ id: 'testmonth2' }));
      });
    });
  });

  describe('loadMonthlyData Functionality (Error Handling)', () => {
    it('should call setErrorState if fetch fails (network error)', async () => {
      mockedFetchDataCb.mockRejectedValue(new Error("Monthly network failure"));
      const { result } = renderTestHook();
      await act(async () => { await result.current.loadMonthlyData(); });

      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ monthly: false });
      expect(mockSetErrorState).toHaveBeenCalledWith({ type: 'monthly', message: 'Monthly Data Error: Monthly network failure' });
      expect(mockSetMonthlyEarthquakeData).not.toHaveBeenCalled(); 
      expect(mockUpdateLastMajorQuake).not.toHaveBeenCalled();
    });

    it('should call setErrorState if response has no features', async () => {
      mockedFetchDataCb.mockResolvedValue({ ...emptyMockMonthlyResponse });
      const { result } = renderTestHook();
      await act(async () => { await result.current.loadMonthlyData(); });
      
      expect(mockSetErrorState).toHaveBeenCalledWith({ type: 'monthly', message: "Monthly data is currently unavailable or incomplete." });
      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ monthly: false });
    });

    it('should call setErrorState if response has metadata error message', async () => {
      mockedFetchDataCb.mockResolvedValue({ metadata: { errorMessage: "USGS monthly error" } });
      const { result } = renderTestHook();
      await act(async () => { await result.current.loadMonthlyData(); });

      expect(mockSetErrorState).toHaveBeenCalledWith({ type: 'monthly', message: "USGS monthly error" });
      expect(mockSetLoadingStatus).toHaveBeenCalledWith({ monthly: false });
    });
  });
});
