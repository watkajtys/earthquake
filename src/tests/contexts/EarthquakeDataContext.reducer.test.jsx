// src/tests/contexts/EarthquakeDataContext.reducer.test.jsx
import { earthquakeReducer, initialState, actionTypes } from '../../contexts/earthquakeDataContextUtils.js';

describe('EarthquakeDataContext Reducer (Refactored)', () => {

  it('should return the initial state for any unknown action', () => {
    expect(earthquakeReducer(initialState, { type: 'UNKNOWN_ACTION' })).toEqual(initialState);
  });

  it('should handle DATA_FETCH_INITIATED', () => {
    const action = { type: actionTypes.DATA_FETCH_INITIATED };
    const expectedState = {
      ...initialState,
      isLoading: true,
      error: null,
    };
    expect(earthquakeReducer(initialState, action)).toEqual(expectedState);
  });

  it('should handle DATA_FETCH_SUCCESS', () => {
    const mockPayload = {
      earthquakesLast24Hours: [{ id: 'test1' }],
      earthquakesLast7Days: [{ id: 'test2' }],
      earthquakesLast30Days: [{ id: 'test3' }],
      dataSources: { daily: 'USGS', weekly: 'D1', monthly: 'D1' },
      lastUpdated: new Date().toISOString(),
      // ... other pre-processed data fields
    };
    const action = { type: actionTypes.DATA_FETCH_SUCCESS, payload: mockPayload };
    const state = earthquakeReducer(initialState, action);

    expect(state.isLoading).toBe(false);
    expect(state.isInitialAppLoad).toBe(false);
    expect(state.error).toBeNull();
    expect(state.earthquakesLast24Hours).toEqual(mockPayload.earthquakesLast24Hours);
    expect(state.earthquakesLast7Days).toEqual(mockPayload.earthquakesLast7Days);
    expect(state.dailyDataSource).toBe('USGS');
    expect(state.weeklyDataSource).toBe('D1');
    expect(state.monthlyDataSource).toBe('D1');
    expect(state.lastUpdated).toBe(mockPayload.lastUpdated);
  });

  it('should handle DATA_FETCH_FAILURE', () => {
    const errorPayload = { error: 'Failed to fetch' };
    const action = { type: actionTypes.DATA_FETCH_FAILURE, payload: errorPayload };
    const state = earthquakeReducer(initialState, action);

    expect(state.isLoading).toBe(false);
    expect(state.isInitialAppLoad).toBe(false);
    expect(state.error).toBe('Failed to fetch');
    // Ensure data arrays are not modified on failure
    expect(state.earthquakesLast24Hours).toEqual(initialState.earthquakesLast24Hours);
  });

});
