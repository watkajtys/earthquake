// src/contexts/EarthquakeDataContext.jsx
import React, { createContext, useContext, useEffect, useCallback, useMemo, useReducer } from 'react'; // Removed useState, useRef; Added useReducer
import { fetchUsgsData } from '../services/usgsApiService';
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    USGS_API_URL_MONTH,
    REFRESH_INTERVAL_MS,
    FEELABLE_QUAKE_THRESHOLD, // Added
    MAJOR_QUAKE_THRESHOLD,
    ALERT_LEVELS,
    INITIAL_LOADING_MESSAGES,
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';

const EarthquakeDataContext = createContext(null);

// Helper function for filtering by time (used by reducer)
const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - hoursAgoStart * 36e5;
    const endTime = now - hoursAgoEnd * 36e5;
    return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
};

// Helper for monthly data (days to hours)
const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - (daysAgoStart * 24 * 36e5);
    const endTime = now - (daysAgoEnd * 24 * 36e5);
    return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
};

// Helper function for major quake consolidation (used by reducer)
const consolidateMajorQuakesLogic = (currentLastMajor, currentPreviousMajor, newMajors) => {
    let consolidated = [...newMajors];
    if (currentLastMajor && !consolidated.find(q => q.id === currentLastMajor.id)) {
        consolidated.push(currentLastMajor);
    }
    if (currentPreviousMajor && !consolidated.find(q => q.id === currentPreviousMajor.id)) {
        consolidated.push(currentPreviousMajor);
    }
    consolidated = consolidated
        .sort((a, b) => b.properties.time - a.properties.time)
        .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id));

    const newLastMajor = consolidated.length > 0 ? consolidated[0] : null;
    const newPreviousMajor = consolidated.length > 1 ? consolidated[1] : null;
    const newTimeBetween = newLastMajor && newPreviousMajor ? newLastMajor.properties.time - newPreviousMajor.properties.time : null;
    
    return { 
        lastMajorQuake: newLastMajor, 
        previousMajorQuake: newPreviousMajor, 
        timeBetweenPreviousMajorQuakes: newTimeBetween 
    };
};


const initialState = {
    isLoadingDaily: true,
    isLoadingWeekly: true,
    isLoadingMonthly: false,
    isInitialAppLoad: true,
    error: null,
    monthlyError: null,
    dataFetchTime: null,
    lastUpdated: null,
    earthquakesLastHour: [],
    earthquakesPriorHour: [],
    earthquakesLast24Hours: [],
    earthquakesLast72Hours: [],
    earthquakesLast7Days: [],
    prev24HourData: [],
    prev7DayData: [],
    prev14DayData: [],
    allEarthquakes: [],
    earthquakesLast14Days: [],
    earthquakesLast30Days: [],
    globeEarthquakes: [],
    hasRecentTsunamiWarning: false,
    highestRecentAlert: null,
    activeAlertTriggeringQuakes: [],
    lastMajorQuake: null,
    previousMajorQuake: null,
    timeBetweenPreviousMajorQuakes: null,
    loadingMessageIndex: 0,
    currentLoadingMessages: INITIAL_LOADING_MESSAGES,
    hasAttemptedMonthlyLoad: false, // Added this from previous useState
};

const actionTypes = {
    SET_LOADING_FLAGS: 'SET_LOADING_FLAGS',
    SET_ERROR: 'SET_ERROR',
    DAILY_DATA_PROCESSED: 'DAILY_DATA_PROCESSED',
    WEEKLY_DATA_PROCESSED: 'WEEKLY_DATA_PROCESSED',
    MONTHLY_DATA_PROCESSED: 'MONTHLY_DATA_PROCESSED',
    SET_INITIAL_LOAD_COMPLETE: 'SET_INITIAL_LOAD_COMPLETE',
    UPDATE_LOADING_MESSAGE_INDEX: 'UPDATE_LOADING_MESSAGE_INDEX',
    SET_LOADING_MESSAGES: 'SET_LOADING_MESSAGES', // For setting initial messages
};

function earthquakeReducer(state, action) {
    switch (action.type) {
        case actionTypes.SET_LOADING_FLAGS:
            return { ...state, ...action.payload };
        case actionTypes.SET_ERROR:
            return { ...state, ...action.payload };
        case actionTypes.DAILY_DATA_PROCESSED: {
            const { features, metadata, fetchTime } = action.payload;
            const l24 = filterByTime(features, 24, 0, fetchTime);
            const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
            const currentHighestAlert = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'red':0, 'orange':1, 'yellow':2 }[a] - { 'red':0, 'orange':1, 'yellow':2 }[b]))[0] : null;
            
            const dailyMajors = features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            const majorQuakeUpdates = consolidateMajorQuakesLogic(state.lastMajorQuake, state.previousMajorQuake, dailyMajors);

            return {
                ...state,
                isLoadingDaily: false,
                dataFetchTime: fetchTime,
                lastUpdated: new Date(metadata?.generated || fetchTime).toLocaleString(),
                earthquakesLastHour: filterByTime(features, 1, 0, fetchTime),
                earthquakesPriorHour: filterByTime(features, 2, 1, fetchTime),
                earthquakesLast24Hours: l24,
                hasRecentTsunamiWarning: l24.some(q => q.properties.tsunami === 1),
                highestRecentAlert: currentHighestAlert,
                activeAlertTriggeringQuakes: currentHighestAlert ? l24.filter(q => q.properties.alert === currentHighestAlert) : [],
                ...majorQuakeUpdates,
            };
        }
        case actionTypes.WEEKLY_DATA_PROCESSED: {
            const { features, fetchTime } = action.payload; // Assuming fetchTime might be useful, though not directly used for weekly state here
            const last72HoursData = filterByTime(features, 72, 0, fetchTime);
            
            const weeklyMajors = features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            // Pass dailyMajors from state if available and recent, or an empty array.
            // For simplicity here, we'll assume weekly can consolidate its own, or daily has already run.
            // A more robust solution might involve passing daily fetched majors if they are newer than state's.
            const majorQuakeUpdates = consolidateMajorQuakesLogic(state.lastMajorQuake, state.previousMajorQuake, weeklyMajors);

            return {
                ...state,
                isLoadingWeekly: false,
                earthquakesLast72Hours: last72HoursData,
                prev24HourData: filterByTime(features, 48, 24, fetchTime),
                earthquakesLast7Days: filterByTime(features, 7 * 24, 0, fetchTime),
                globeEarthquakes: [...last72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 900),
                ...majorQuakeUpdates,
            };
        }
        case actionTypes.MONTHLY_DATA_PROCESSED: {
            const { features, fetchTime } = action.payload;
            const monthlyMajors = features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            const majorQuakeUpdates = consolidateMajorQuakesLogic(state.lastMajorQuake, state.previousMajorQuake, monthlyMajors);
            
            return {
                ...state,
                isLoadingMonthly: false,
                hasAttemptedMonthlyLoad: true,
                monthlyError: null, // Clear error on success
                allEarthquakes: features,
                earthquakesLast14Days: filterMonthlyByTime(features, 14, 0, fetchTime),
                earthquakesLast30Days: filterMonthlyByTime(features, 30, 0, fetchTime),
                prev7DayData: filterMonthlyByTime(features, 14, 7, fetchTime),
                prev14DayData: filterMonthlyByTime(features, 28, 14, fetchTime),
                ...majorQuakeUpdates,
            };
        }
        case actionTypes.SET_INITIAL_LOAD_COMPLETE:
            return { ...state, isInitialAppLoad: false };
        case actionTypes.UPDATE_LOADING_MESSAGE_INDEX:
            return { ...state, loadingMessageIndex: (state.loadingMessageIndex + 1) % state.currentLoadingMessages.length };
        case actionTypes.SET_LOADING_MESSAGES: // Added to set initial messages
            return { ...state, currentLoadingMessages: action.payload, loadingMessageIndex: 0 };
        default:
            return state;
    }
}

export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);
    
    useEffect(() => {
        let isMounted = true;
        const orchestrateInitialDataLoad = async () => {
            if (!isMounted) return;

            if (state.isInitialAppLoad) {
                dispatch({ type: actionTypes.SET_LOADING_MESSAGES, payload: INITIAL_LOADING_MESSAGES });
            }
            dispatch({ 
                type: actionTypes.SET_LOADING_FLAGS, 
                payload: { isLoadingDaily: true, isLoadingWeekly: true } 
            });
            dispatch({ type: actionTypes.SET_ERROR, payload: { generalError: null } });

            const nowForFiltering = Date.now();
            let dailyError = null;
            let weeklyError = null;

            // Fetch Daily Data
            try {
                if (isMounted && state.isInitialAppLoad) dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
                const dailyRes = await fetchUsgsData(USGS_API_URL_DAY);
                if (!isMounted) return;

                if (!dailyRes.error && dailyRes.features) {
                    if (isMounted && state.isInitialAppLoad) dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
                    dispatch({
                        type: actionTypes.DAILY_DATA_PROCESSED,
                        payload: { features: dailyRes.features, metadata: dailyRes.metadata, fetchTime: nowForFiltering }
                    });
                } else {
                    dailyError = dailyRes?.error?.message || "Daily data features are missing.";
                }
            } catch (e) {
                if (!isMounted) return;
                dailyError = e.message || "Error processing daily data.";
            } finally {
                if (isMounted && !dailyError) { // Only set loading false if no error during fetch itself
                     // isLoadingDaily is set by DAILY_DATA_PROCESSED
                } else if (isMounted && dailyError) {
                    dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: false } });
                }
            }

            // Fetch Weekly Data
            try {
                if (isMounted && state.isInitialAppLoad) dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
                const weeklyResult = await fetchUsgsData(USGS_API_URL_WEEK);
                if (!isMounted) return;

                if (!weeklyResult.error && weeklyResult.features) {
                     if (isMounted && state.isInitialAppLoad) dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
                    dispatch({
                        type: actionTypes.WEEKLY_DATA_PROCESSED,
                        payload: { features: weeklyResult.features, fetchTime: nowForFiltering }
                    });
                } else {
                    weeklyError = weeklyResult?.error?.message || "Weekly data features are missing.";
                }
            } catch (e) {
                if (!isMounted) return;
                weeklyError = e.message || "Error processing weekly data.";
            } finally {
                 if (isMounted && !weeklyError) {
                    // isLoadingWeekly is set by WEEKLY_DATA_PROCESSED
                 } else if (isMounted && weeklyError) {
                    dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingWeekly: false } });
                 }
            }
            
            if (isMounted) {
                let finalError = null;
                if (dailyError && weeklyError) finalError = "Failed to fetch critical daily and weekly earthquake data.";
                else if (dailyError) finalError = `Daily data error: ${dailyError}. Weekly data loaded if available.`;
                else if (weeklyError) finalError = `Weekly data error: ${weeklyError}. Daily data loaded if available.`;
                dispatch({ type: actionTypes.SET_ERROR, payload: { error: finalError } });
                
                if (state.isInitialAppLoad) {
                    dispatch({ type: actionTypes.SET_INITIAL_LOAD_COMPLETE });
                }
            }
        };

        orchestrateInitialDataLoad();
        const intervalId = setInterval(orchestrateInitialDataLoad, REFRESH_INTERVAL_MS);
        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.isInitialAppLoad]); // Dependency on isInitialAppLoad to re-initiate message cycling logic if app were to somehow reset to initial load state.

    // Loading message cycling effect
    useEffect(() => {
        let messageInterval;
        if (state.isInitialAppLoad && (state.isLoadingDaily || state.isLoadingWeekly)) {
            messageInterval = setInterval(() => {
                dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [state.isInitialAppLoad, state.isLoadingDaily, state.isLoadingWeekly]);


    const loadMonthlyData = useCallback(async () => {
        dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: true, hasAttemptedMonthlyLoad: true }});
        dispatch({type: actionTypes.SET_ERROR, payload: { monthlyError: null }});
        
        const nowForFiltering = Date.now();
        try {
            const monthlyResult = await fetchUsgsData(USGS_API_URL_MONTH);
            if (!monthlyResult.error && monthlyResult.features && monthlyResult.features.length > 0) {
                dispatch({
                    type: actionTypes.MONTHLY_DATA_PROCESSED,
                    payload: { features: monthlyResult.features, fetchTime: nowForFiltering }
                });
            } else {
                dispatch({type: actionTypes.SET_ERROR, payload: { monthlyError: monthlyResult?.error?.message || "Monthly data is unavailable or incomplete." }});
                dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false }}); // Also set loading false on error
            }
        } catch (e) {
            dispatch({ type: actionTypes.SET_ERROR, payload: { monthlyError: `Monthly Data Processing Error: ${e.message || "An unexpected error occurred."}` }});
            dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false }}); // Also set loading false on error
        }
    }, []); 


    const isLoadingInitialData = useMemo(() => (state.isLoadingDaily || state.isLoadingWeekly) && state.isInitialAppLoad, [state.isLoadingDaily, state.isLoadingWeekly, state.isInitialAppLoad]);
    const currentLoadingMessage = useMemo(() => state.currentLoadingMessages[state.loadingMessageIndex], [state.currentLoadingMessages, state.loadingMessageIndex]);

    // Memoized filtered lists
    const feelableQuakes7Days_ctx = useMemo(() => {
        if (!state.earthquakesLast7Days) return [];
        return state.earthquakesLast7Days.filter(
            quake => quake.properties.mag !== null && quake.properties.mag >= FEELABLE_QUAKE_THRESHOLD
        );
    }, [state.earthquakesLast7Days]);

    const significantQuakes7Days_ctx = useMemo(() => {
        if (!state.earthquakesLast7Days) return [];
        return state.earthquakesLast7Days.filter(
            quake => quake.properties.mag !== null && quake.properties.mag >= MAJOR_QUAKE_THRESHOLD
        );
    }, [state.earthquakesLast7Days]);

    const feelableQuakes30Days_ctx = useMemo(() => {
        if (!state.allEarthquakes) return [];
        return state.allEarthquakes.filter(
            quake => quake.properties.mag !== null && quake.properties.mag >= FEELABLE_QUAKE_THRESHOLD
        );
    }, [state.allEarthquakes]);

    const significantQuakes30Days_ctx = useMemo(() => {
        if (!state.allEarthquakes) return [];
        return state.allEarthquakes.filter(
            quake => quake.properties.mag !== null && quake.properties.mag >= MAJOR_QUAKE_THRESHOLD
        );
    }, [state.allEarthquakes]);
    
    const contextValue = useMemo(() => ({
        ...state, // Spread all state properties
        isLoadingInitialData, 
        currentLoadingMessage,
        // Function to trigger monthly data load (already uses dispatch)
        loadMonthlyData,
        // New filtered lists (derived from state)
        feelableQuakes7Days_ctx,
        significantQuakes7Days_ctx,
        feelableQuakes30Days_ctx,
        significantQuakes30Days_ctx,
    }), [
        state, // Main state object from reducer
        isLoadingInitialData, 
        currentLoadingMessage, 
        loadMonthlyData, // useCallback ensures this is stable if its deps are empty
        feelableQuakes7Days_ctx, significantQuakes7Days_ctx,
        feelableQuakes30Days_ctx, significantQuakes30Days_ctx
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

export { EarthquakeDataContext };
