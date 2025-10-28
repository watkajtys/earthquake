// src/contexts/EarthquakeDataContext.jsx
import React, { useContext, useEffect, useReducer, useMemo } from 'react';
import { earthquakeReducer, initialState, actionTypes, EarthquakeDataContext } from './earthquakeDataContextUtils.js';

/**
 * Provides pre-processed earthquake data to its child components.
 * This component fetches a comprehensive, pre-processed data object from the
 * `/api/get-earthquakes` endpoint upon initial mount and makes this data
 * available through the `useEarthquakeDataState` hook.
 */
export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);

    useEffect(() => {
        const fetchInitialData = async () => {
            dispatch({ type: actionTypes.DATA_FETCH_INITIATED });
            try {
                const response = await fetch('/api/get-earthquakes');
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
                }
                const data = await response.json();
                dispatch({
                    type: actionTypes.DATA_FETCH_SUCCESS,
                    payload: data,
                });
            } catch (error) {
                console.error("Failed to fetch initial earthquake data:", error);
                dispatch({
                    type: actionTypes.DATA_FETCH_FAILURE,
                    payload: { error: `Failed to fetch initial earthquake data: ${error.message}` },
                });
            }
        };

        fetchInitialData();
    }, []); // Empty dependency array ensures this runs only once on mount.

    const contextValue = useMemo(() => ({
        ...state
    }), [state]);

    return (
        <EarthquakeDataContext.Provider value={contextValue}>
            {children}
        </EarthquakeDataContext.Provider>
    );
};

/**
 * Custom hook to access the earthquake data state.
 * This hook must be used within a component that is a descendant of `EarthquakeDataProvider`.
 *
 * @returns {object} The full state from the EarthquakeDataContext.
 * @throws {Error} If used outside of an EarthquakeDataProvider.
 */
export const useEarthquakeDataState = () => {
    const context = useContext(EarthquakeDataContext);
    // When a context provider is not found, useContext returns the default value.
    // If createContext() was called without an argument, the default is undefined.
    if (context === undefined) {
        throw new Error('useEarthquakeDataState must be used within an EarthquakeDataProvider');
    }
    return context;
};
