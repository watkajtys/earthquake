// src/contexts/EarthquakeDataContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { fetchProcessedEarthquakeData } from '../services/processedDataService';
import {
    REFRESH_INTERVAL_MS,
    FEELABLE_QUAKE_THRESHOLD, // Retained: Might be used by UI components for quick checks or display logic
    MAJOR_QUAKE_THRESHOLD,    // Retained: Might be used by UI components
    ALERT_LEVELS,             // Retained: Used for UI display of alerts
    INITIAL_LOADING_MESSAGES, // Retained: Used for loading screen
    LOADING_MESSAGE_INTERVAL_MS // Retained: Used for loading screen
} from '../constants/appConstants';

const EarthquakeDataContext = createContext(null);

// --- Initial State (aligns with new worker output) ---
const initialState = {
    isLoadingData: true,
    isInitialAppLoad: true,
    error: null,
    dataFetchTime: null,
    lastUpdated: null, // From worker's rawDayData.metadata.generated

    // Directly from worker output
    earthquakesLastHour: [],
    earthquakesPriorHour: [],
    earthquakesLast24Hours: [],
    highestRecentAlert: null,
    activeAlertTriggeringQuakes: [],
    hasRecentTsunamiWarning: false,
    tsunamiTriggeringQuake: null,
    lastMajorQuake: null,
    previousMajorQuake: null,
    timeBetweenPreviousMajorQuakes: null,

    earthquakesLast72Hours: [],
    prev24HourData: [], // From worker (week feed, 24-48h ago)
    earthquakesLast7Days: [],
    globeEarthquakes: [], // From worker (top 900 from last 72h)
    dailyCounts7Days: [],
    sampledEarthquakesLast7Days: [],
    magnitudeDistribution7Days: [],

    allEarthquakesMonth: [], // Raw monthly data from worker
    earthquakesLast14Days: [],
    earthquakesLast30Days: [],
    dailyCounts14Days: [],
    dailyCounts30Days: [],
    sampledEarthquakesLast14Days: [],
    sampledEarthquakesLast30Days: [],
    magnitudeDistribution14Days: [],
    magnitudeDistribution30Days: [],
    prev7DayData: [], // From worker (month feed, 7-14d ago)
    prev14DayData: [], // From worker (month feed, 14-28d ago)

    // Client-derived (can still be useful, but now based on worker's filtered data)
    // These specific _ctx fields match the worker's output structure for these derived lists
    feelableQuakes7Days_ctx: [],
    significantQuakes7Days_ctx: [],
    feelableQuakes30Days_ctx: [],
    significantQuakes30Days_ctx: [],

    // UI state
    loadingMessageIndex: 0,
    currentLoadingMessages: INITIAL_LOADING_MESSAGES,
};

// --- Action Types ---
const actionTypes = {
    SET_LOADING: 'SET_LOADING',
    SET_PROCESSED_DATA: 'SET_PROCESSED_DATA',
    SET_ERROR: 'SET_ERROR',
    UPDATE_LOADING_MESSAGE_INDEX: 'UPDATE_LOADING_MESSAGE_INDEX',
    // SET_LOADING_MESSAGES is implicitly handled by initial state and useEffect
};

// --- Reducer ---
const earthquakeReducer = (state, action) => {
    switch (action.type) {
        case actionTypes.SET_LOADING:
            return {
                ...state,
                isLoadingData: action.payload,
                ...(action.payload ? { error: null } : {}) // Clear error when setting loading to true
            };
        case actionTypes.SET_PROCESSED_DATA:
            return {
                ...state,
                isLoadingData: false,
                isInitialAppLoad: false, // Mark initial load as complete
                error: null,
                ...action.payload, // Spread all data from the worker
            };
        case actionTypes.SET_ERROR:
            return {
                ...state,
                isLoadingData: false,
                isInitialAppLoad: false, // Mark initial load as complete even on error
                error: action.payload,
            };
        case actionTypes.UPDATE_LOADING_MESSAGE_INDEX:
            return {
                ...state,
                loadingMessageIndex: (state.loadingMessageIndex + 1) % state.currentLoadingMessages.length
            };
        default:
            return state;
    }
};

// --- Provider Component ---
export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);

    useEffect(() => {
        let isMounted = true;

        const orchestrateInitialDataLoad = async () => {
            if (!isMounted) return;

            dispatch({ type: actionTypes.SET_LOADING, payload: true });

            try {
                const result = await fetchProcessedEarthquakeData(); // Call the new service

                if (!isMounted) return;

                if (result.data && !result.error) {
                    dispatch({ type: actionTypes.SET_PROCESSED_DATA, payload: result.data });
                } else {
                    // Use the error message from the service's structured error response
                    const errorMessage = result.error?.message || "Failed to fetch processed earthquake data.";
                    console.error("Error in orchestrateInitialDataLoad, dispatching SET_ERROR:", errorMessage); // Added console log
                    dispatch({ type: actionTypes.SET_ERROR, payload: errorMessage });
                }
            } catch (e) { // This catch is for unexpected errors if fetchProcessedEarthquakeData itself throws catastrophically
                if (!isMounted) return;
                console.error("Catastrophic error in orchestrateInitialDataLoad, dispatching SET_ERROR:", e.message); // Added console log
                dispatch({ type: actionTypes.SET_ERROR, payload: e.message || "An unexpected error occurred." });
            }
        };

        orchestrateInitialDataLoad();
        const intervalId = setInterval(orchestrateInitialDataLoad, REFRESH_INTERVAL_MS);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, []); // Empty dependency array: run once on mount and clean up on unmount

    // Loading message cycling effect
    useEffect(() => {
        let messageInterval;
        if (state.isInitialAppLoad && state.isLoadingData) {
            messageInterval = setInterval(() => {
                dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [state.isInitialAppLoad, state.isLoadingData]);

    const isLoadingInitialData = useMemo(() => state.isLoadingData && state.isInitialAppLoad, [state.isLoadingData, state.isInitialAppLoad]);
    const currentLoadingMessage = useMemo(() => state.currentLoadingMessages[state.loadingMessageIndex], [state.currentLoadingMessages, state.loadingMessageIndex]);
    
    const contextValue = useMemo(() => ({
        ...state,
        isLoadingInitialData, 
        currentLoadingMessage,
        // No loadMonthlyData function needed anymore
    }), [
        state,
        isLoadingInitialData, 
        currentLoadingMessage, 
    ]);

    return (
        <EarthquakeDataContext.Provider value={contextValue}>
            {children}
        </EarthquakeDataContext.Provider>
    );
};

// --- Custom Hook ---
export const useEarthquakeDataState = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) {
        throw new Error('useEarthquakeDataState must be used within an EarthquakeDataProvider');
    }
    return context;
};

// No longer exporting initialState, actionTypes, earthquakeReducer
// export { EarthquakeDataContext, initialState, actionTypes, earthquakeReducer };
export { EarthquakeDataContext };
