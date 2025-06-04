// src/contexts/EarthquakeDataContext.jsx
import React, { createContext, useContext, useEffect, useCallback, useMemo, useReducer } from 'react';
// Removed fetchUsgsData from services as we'll use direct fetch to CF Worker
import {
    REFRESH_INTERVAL_MS,
    INITIAL_LOADING_MESSAGES, // Assuming this contains some default messages
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';
// Removed ALERT_LEVELS, FEELABLE_QUAKE_THRESHOLD, MAJOR_QUAKE_THRESHOLD as worker handles this logic for overview.
// Client might still need thresholds for specific views if not covered by worker's stats/overview.
// Removed getMagnitudeColor and related MAGNITUDE_RANGES, daily counts, sampling logic as worker should provide this or it's simplified.

const EarthquakeDataContext = createContext(null);

const initialState = {
    isLoading: true, // Simplified loading state
    isInitialAppLoad: true,
    error: null, // General error for all fetches
    overviewError: null,
    feedError: null,
    lastUpdatedOverview: null,
    lastUpdatedFeed: null, // For the currently active feed
    currentFeedPeriod: 'last_7_days', // Default feed period

    // Data from /api/overview
    keyStatsForGlobe: null,
    topActiveRegionsOverview: [],
    latestFeelableQuakesSnippet: [],
    recentSignificantQuakesForOverview: [],
    overviewClusters: [],

    // Data from /api/feed?period=...
    // Store feeds in an object, keyed by period
    feeds: {
        // e.g., 'last_24_hours': { earthquakes: [], statistics: null, lastUpdated: null }
    },

    // Active feed data (for convenience in components)
    currentFeedData: {
        earthquakes: [],
        statistics: null,
        period: '',
        lastUpdated: null,
    },

    loadingMessageIndex: 0,
    currentLoadingMessages: INITIAL_LOADING_MESSAGES,
};

const actionTypes = {
    SET_LOADING: 'SET_LOADING',
    SET_ERROR: 'SET_ERROR', // Generic error
    FETCH_OVERVIEW_SUCCESS: 'FETCH_OVERVIEW_SUCCESS',
    FETCH_OVERVIEW_FAILURE: 'FETCH_OVERVIEW_FAILURE',
    FETCH_FEED_SUCCESS: 'FETCH_FEED_SUCCESS',
    FETCH_FEED_FAILURE: 'FETCH_FEED_FAILURE',
    SET_CURRENT_FEED_PERIOD: 'SET_CURRENT_FEED_PERIOD',
    SET_INITIAL_LOAD_COMPLETE: 'SET_INITIAL_LOAD_COMPLETE',
    UPDATE_LOADING_MESSAGE_INDEX: 'UPDATE_LOADING_MESSAGE_INDEX',
    SET_LOADING_MESSAGES: 'SET_LOADING_MESSAGES',
};

function earthquakeReducer(state = initialState, action) {
    switch (action.type) {
        case actionTypes.SET_LOADING:
            return { ...state, isLoading: action.payload };
        case actionTypes.SET_ERROR: // Handles generic errors
            return { ...state, error: action.payload, isLoading: false };
        case actionTypes.FETCH_OVERVIEW_SUCCESS:
            const overviewData = action.payload;
            let lastMajor = null;
            let previousMajor = null;
            let timeBetweenMajors = null;

            if (overviewData.recentSignificantQuakesForOverview && overviewData.recentSignificantQuakesForOverview.length > 0) {
                // Assuming recentSignificantQuakesForOverview is sorted by time descending from the worker
                lastMajor = overviewData.recentSignificantQuakesForOverview[0];
                if (overviewData.recentSignificantQuakesForOverview.length > 1) {
                    previousMajor = overviewData.recentSignificantQuakesForOverview[1];
                    if (lastMajor && previousMajor) {
                        timeBetweenMajors = lastMajor.properties.time - previousMajor.properties.time;
                    }
                }
            }

            return {
                ...state,
                keyStatsForGlobe: overviewData.keyStatsForGlobe,
                topActiveRegionsOverview: overviewData.topActiveRegionsOverview,
                latestFeelableQuakesSnippet: overviewData.latestFeelableQuakesSnippet,
                recentSignificantQuakesForOverview: overviewData.recentSignificantQuakesForOverview,
                overviewClusters: overviewData.overviewClusters,
                lastUpdatedOverview: new Date(overviewData.lastUpdated).toLocaleString(),
                // Set the derived major quake stats
                lastMajorQuake: lastMajor,
                previousMajorQuake: previousMajor,
                timeBetweenPreviousMajorQuakes: timeBetweenMajors,
                overviewError: null,
            };
        case actionTypes.FETCH_OVERVIEW_FAILURE:
            return { ...state, overviewError: action.payload, isLoading: false }; // Keep isLoading: false if critical overview fails
        case actionTypes.FETCH_FEED_SUCCESS:
            const { period, earthquakes, statistics, lastUpdated } = action.payload;
            const newFeeds = {
                ...state.feeds,
                [period]: { earthquakes, statistics, lastUpdated: new Date(lastUpdated).toLocaleString() }
            };
            // If this is the currently active feed, update currentFeedData
            const currentFeedUpdate = state.currentFeedPeriod === period
                ? {
                    currentFeedData: { earthquakes, statistics, period, lastUpdated: new Date(lastUpdated).toLocaleString() },
                    lastUpdatedFeed: new Date(lastUpdated).toLocaleString()
                  }
                : {};
            return {
                ...state,
                feeds: newFeeds,
                ...currentFeedUpdate,
                feedError: null, // Clear feed error on success for any feed
            };
        case actionTypes.FETCH_FEED_FAILURE:
            // Store error specific to a feed if needed, or a general feedError
             return { ...state, feedError: action.payload, isLoading: false }; // Keep isLoading: false if critical feed fails
        case actionTypes.SET_CURRENT_FEED_PERIOD:
            const newPeriod = action.payload;
            const newFeedExists = state.feeds[newPeriod];
            return {
                ...state,
                currentFeedPeriod: newPeriod,
                currentFeedData: newFeedExists
                    ? state.feeds[newPeriod]
                    : { earthquakes: [], statistics: null, period: newPeriod, lastUpdated: null }, // Reset if new feed not yet fetched
                lastUpdatedFeed: newFeedExists ? state.feeds[newPeriod].lastUpdated : null,
            };
        case actionTypes.SET_INITIAL_LOAD_COMPLETE:
            return { ...state, isInitialAppLoad: false, isLoading: false }; // Ensure isLoading is false
        case actionTypes.UPDATE_LOADING_MESSAGE_INDEX:
            return { ...state, loadingMessageIndex: (state.loadingMessageIndex + 1) % state.currentLoadingMessages.length };
        case actionTypes.SET_LOADING_MESSAGES:
            return { ...state, currentLoadingMessages: action.payload, loadingMessageIndex: 0 };
        default:
            return state;
    }
}

export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);

    const fetchApiData = useCallback(async (url, successAction, failureAction, specificLoadingFlag = null) => {
        if (specificLoadingFlag) dispatch({ type: actionTypes.SET_LOADING, payload: true }); // Or manage specific flags if needed

        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            const data = await response.json();
            dispatch({ type: successAction, payload: data });
            return data; // Return data for chaining or direct use if necessary
        } catch (e) {
            console.error(`Error fetching ${url}:`, e);
            dispatch({ type: failureAction, payload: e.message || 'Failed to fetch data' });
            dispatch({ type: actionTypes.SET_ERROR, payload: e.message || 'Failed to fetch data' }); // Set general error
            return null; // Indicate failure
        } finally {
            if (specificLoadingFlag) dispatch({ type: actionTypes.SET_LOADING, payload: false });
        }
    }, []);

    // Initial data load (Overview + default feed)
    const loadInitialData = useCallback(async () => {
        dispatch({ type: actionTypes.SET_LOADING, payload: true });
        if (state.isInitialAppLoad) {
            dispatch({ type: actionTypes.SET_LOADING_MESSAGES, payload: INITIAL_LOADING_MESSAGES });
        }

        const overviewSuccess = await fetchApiData(
            '/api/overview',
            actionTypes.FETCH_OVERVIEW_SUCCESS,
            actionTypes.FETCH_OVERVIEW_FAILURE
        );

        // Fetch default feed, e.g., last_7_days, only if overview was somewhat successful or independently
        // For critical data, you might stop if overview fails. Here, we attempt both.
        const feedSuccess = await fetchApiData(
            `/api/feed?period=${state.currentFeedPeriod}`, // Fetch the default/current feed
            actionTypes.FETCH_FEED_SUCCESS,
            actionTypes.FETCH_FEED_FAILURE
        );

        if (state.isInitialAppLoad) {
            dispatch({ type: actionTypes.SET_INITIAL_LOAD_COMPLETE });
        } else {
             // For subsequent refreshes, ensure loading is set to false if not handled by SET_INITIAL_LOAD_COMPLETE
            dispatch({ type: actionTypes.SET_LOADING, payload: false });
        }
         // If both failed, a general error is already set by fetchApiData.
         // If one fails, the specific error (overviewError or feedError) is set.
    }, [fetchApiData, state.isInitialAppLoad, state.currentFeedPeriod]);


    useEffect(() => {
        loadInitialData();
        const intervalId = setInterval(loadInitialData, REFRESH_INTERVAL_MS);
        return () => {
            clearInterval(intervalId);
        };
    }, [loadInitialData]); // loadInitialData is memoized with useCallback

    // Loading message cycling effect
    useEffect(() => {
        let messageInterval;
        // Use the general isLoading flag or a more specific one if available
        if (state.isInitialAppLoad && state.isLoading) {
            messageInterval = setInterval(() => {
                dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [state.isInitialAppLoad, state.isLoading]);


    const fetchFeedDataExternal = useCallback(async (period) => {
        if (!period) {
            console.warn("fetchFeedDataExternal called without a period.");
            return;
        }
        dispatch({ type: actionTypes.SET_LOADING, payload: true }); // General loading for feed switch

        // Set current feed period first, so UI can react (e.g. show "loading <period> data")
        // And ensure currentFeedData is updated to reflect the target period, even if data is not yet there
        dispatch({ type: actionTypes.SET_CURRENT_FEED_PERIOD, payload: period});

        await fetchApiData(
            `/api/feed?period=${period}`,
            actionTypes.FETCH_FEED_SUCCESS,
            actionTypes.FETCH_FEED_FAILURE
        );
        dispatch({ type: actionTypes.SET_LOADING, payload: false });
    }, [fetchApiData]);

    // This function is used by components to select a feed.
    // It first dispatches to update currentFeedPeriod, then fetches if not already cached.
    const setCurrentFeedPeriod = useCallback((period) => {
        if (state.currentFeedPeriod === period && state.feeds[period]) {
            // Data already exists and is current, no need to re-fetch, just ensure it's set
            dispatch({ type: actionTypes.SET_CURRENT_FEED_PERIOD, payload: period });
            return;
        }
        // If data for the period is not in state.feeds, or to force refresh:
        fetchFeedDataExternal(period);
    }, [state.currentFeedPeriod, state.feeds, fetchFeedDataExternal]);


    const isLoadingInitialData = useMemo(() => state.isLoading && state.isInitialAppLoad, [state.isLoading, state.isInitialAppLoad]);
    const currentLoadingMessage = useMemo(() => state.currentLoadingMessages[state.loadingMessageIndex], [state.currentLoadingMessages, state.loadingMessageIndex]);
    
    const contextValue = useMemo(() => ({
        ...state,
        isLoadingInitialData, 
        currentLoadingMessage,
        fetchFeedData: fetchFeedDataExternal, // Expose the direct fetch function for feeds
        setCurrentFeedPeriod, // Expose function to change active feed
        // Overview data pieces
        keyStatsForGlobe: state.keyStatsForGlobe,
        topActiveRegionsOverview: state.topActiveRegionsOverview,
        latestFeelableQuakesSnippet: state.latestFeelableQuakesSnippet,
        recentSignificantQuakesForOverview: state.recentSignificantQuakesForOverview,
        overviewClusters: state.overviewClusters,
        // Current feed data for easy consumption
        currentEarthquakes: state.currentFeedData.earthquakes,
        currentStatistics: state.currentFeedData.statistics,
        // errors
        error: state.error, // General error
        overviewError: state.overviewError,
        feedError: state.feedError,

    }), [
        state,
        isLoadingInitialData, 
        currentLoadingMessage, 
        fetchFeedDataExternal,
        setCurrentFeedPeriod,
    ]);

    return (
        <EarthquakeDataContext.Provider value={contextValue}>
            {children}
        </EarthquakeDataContext.Provider>
    );
};

export const useEarthquakeDataState = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) {
        throw new Error('useEarthquakeDataState must be used within an EarthquakeDataProvider');
    }
    return context;
};

// Exporting initialState and actionTypes might be useful for testing or if other modules need them.
// For this refactor, direct usage outside this file is less likely.
export { EarthquakeDataContext, initialState, actionTypes, earthquakeReducer };
