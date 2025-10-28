// src/contexts/earthquakeDataContextUtils.js
import { createContext } from 'react';

// The single, shared context object.
export const EarthquakeDataContext = createContext(undefined);

// Define action types for the reducer.
export const actionTypes = {
    DATA_FETCH_INITIATED: 'DATA_FETCH_INITIATED',
    DATA_FETCH_SUCCESS: 'DATA_FETCH_SUCCESS',
    DATA_FETCH_FAILURE: 'DATA_FETCH_FAILURE',
};

// Define the initial state for the context.
export const initialState = {
    isLoading: true,
    isInitialAppLoad: true,
    error: null,
    earthquakesLast24Hours: [],
    earthquakesLast7Days: [],
    earthquakesLast30Days: [],
    timeSeriesData: {},
    magnitudeDistribution: {},
    earthquakeCounts: {},
    regionData: {},
    deepestEarthquakes: {},
    strongestEarthquakes: {},
    lastUpdated: null,
    dataSources: {},
    dailyDataSource: null, // For compatibility with components that might use this
    weeklyDataSource: null,
    monthlyDataSource: null,
};

/**
 * Reducer function to manage the state of the earthquake data context.
 * It handles the different stages of data fetching: initiation, success, and failure.
 */
export const earthquakeReducer = (state, action) => {
    switch (action.type) {
        case actionTypes.DATA_FETCH_INITIATED:
            return {
                ...state,
                isLoading: true,
                error: null,
            };
        case actionTypes.DATA_FETCH_SUCCESS:
            // The payload is the entire pre-processed data object from the API.
            return {
                ...state,
                isLoading: false,
                isInitialAppLoad: false,
                error: null,
                ...action.payload,
                // Ensure legacy data source fields are populated for component compatibility.
                dailyDataSource: action.payload.dataSources?.daily || null,
                weeklyDataSource: action.payload.dataSources?.weekly || null,
                monthlyDataSource: action.payload.dataSources?.monthly || null,
            };
        case actionTypes.DATA_FETCH_FAILURE:
            return {
                ...state,
                isLoading: false,
                isInitialAppLoad: false,
                error: action.payload.error,
            };
        default:
            return state;
    }
};
