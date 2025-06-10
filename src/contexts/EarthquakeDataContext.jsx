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
import { getMagnitudeColor } from '../utils/utils.js'; // Added import

/**
 * React Context for providing global earthquake data and related loading states.
 * This context will hold fetched earthquake features, processed data (like hourly, daily, weekly summaries),
 * information about major quakes, alert levels, and functions to manage data fetching.
 *
 * @type {React.Context<Object|null>}
 */
const EarthquakeDataContext = createContext(null);

/**
 * Filters an array of earthquake objects based on a specified time window.
 *
 * @param {Array<Object>} data - The array of earthquake objects to filter. Each object should have `properties.time`.
 * @param {number} hoursAgoStart - The start of the time window in hours ago from `now`.
 * @param {number} [hoursAgoEnd=0] - The end of the time window in hours ago from `now`. Defaults to 0 (i.e., `now`).
 * @param {number} [now=Date.now()] - The reference timestamp for calculating the time window. Defaults to the current time.
 * @returns {Array<Object>} A new array containing earthquakes within the specified time window. Returns an empty array if input data is not an array.
 */
const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - hoursAgoStart * 36e5;
    const endTime = now - hoursAgoEnd * 36e5;
    return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
};

/**
 * Filters an array of earthquake objects based on a specified time window, with time parameters in days.
 *
 * @param {Array<Object>} data - The array of earthquake objects to filter. Each object should have `properties.time`.
 * @param {number} daysAgoStart - The start of the time window in days ago from `now`.
 * @param {number} [daysAgoEnd=0] - The end of the time window in days ago from `now`. Defaults to 0 (i.e., `now`).
 * @param {number} [now=Date.now()] - The reference timestamp for calculating the time window. Defaults to the current time.
 * @returns {Array<Object>} A new array containing earthquakes within the specified time window. Returns an empty array if input data is not an array.
 */
const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - (daysAgoStart * 24 * 36e5);
    const endTime = now - (daysAgoEnd * 24 * 36e5);
    return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
};

/**
 * Consolidates a list of new major earthquakes with existing ones to determine the latest
 * and second latest (previous) major earthquakes.
 * It ensures no duplicates and sorts them by time to find the most recent ones.
 *
 * @param {Object|null} currentLastMajor - The currently known last major earthquake object.
 * @param {Object|null} currentPreviousMajor - The currently known second latest (previous) major earthquake object.
 * @param {Array<Object>} newMajors - An array of newly fetched major earthquake objects.
 * @returns {{lastMajorQuake: Object|null, previousMajorQuake: Object|null, timeBetweenPreviousMajorQuakes: number|null}}
 *   An object containing the updated last major quake, previous major quake, and the time difference between them in milliseconds.
 */
const consolidateMajorQuakesLogic = (currentLastMajor, currentPreviousMajor, newMajors) => {
    let consolidated = [...newMajors];
    if (currentLastMajor && !consolidated.find(q => q.id === currentLastMajor.id)) {
        consolidated.push(currentLastMajor);
    }
    if (currentPreviousMajor && !consolidated.find(q => q.id === currentPreviousMajor.id)) {
        consolidated.push(currentPreviousMajor);
    }
    // Sort by time descending and remove duplicates by ID
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

/**
 * Performs a random sampling of an array using the Fisher-Yates shuffle algorithm.
 * Returns a new array containing `sampleSize` elements from the input `array`.
 *
 * @param {Array<any>} array - The array to sample from.
 * @param {number} sampleSize - The desired number of samples.
 * @returns {Array<any>} A new array with the sampled elements. Returns a copy of the original if `sampleSize` is too large, or an empty array for invalid inputs.
 */
const sampleArray = (array, sampleSize) => {
    if (!Array.isArray(array) || array.length === 0) return [];
    if (sampleSize >= array.length) return [...array]; // Return a copy if sample size is larger or equal

    const shuffled = [...array]; // Create a copy to avoid mutating the original array
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap elements
    }
    return shuffled.slice(0, sampleSize);
};

/**
 * Samples an array of earthquakes, prioritizing those above a certain magnitude threshold.
 * If the number of priority earthquakes is less than `sampleSize`, all priority earthquakes are included,
 * and the remaining slots are filled by randomly sampling from the other earthquakes.
 *
 * @param {Array<Object>} fullArray - The array of earthquake objects to sample from.
 * @param {number} sampleSize - The total desired number of samples.
 * @param {number} priorityMagnitudeThreshold - The magnitude at or above which earthquakes are considered priority.
 * @returns {Array<Object>} A new array with the sampled earthquake objects.
 */
function sampleArrayWithPriority(fullArray, sampleSize, priorityMagnitudeThreshold) {
    if (!fullArray || fullArray.length === 0) {
        return [];
    }
    if (sampleSize <= 0) {
        return [];
    }

    const priorityQuakes = fullArray.filter(
        q => q.properties && typeof q.properties.mag === 'number' && q.properties.mag >= priorityMagnitudeThreshold
    );

    const otherQuakes = fullArray.filter(
        q => !q.properties || typeof q.properties.mag !== 'number' || q.properties.mag < priorityMagnitudeThreshold
    );

    if (priorityQuakes.length >= sampleSize) {
        // If priority quakes alone meet or exceed sample size, sample from them
        return sampleArray(priorityQuakes, sampleSize);
    } else {
        // All priority quakes are included
        const remainingSlots = sampleSize - priorityQuakes.length;
        const sampledOtherQuakes = sampleArray(otherQuakes, remainingSlots);
        return [...priorityQuakes, ...sampledOtherQuakes];
    }
}

/**
 * Sampling threshold for scatter plots using 7-day data.
 * @type {number}
 */
const SCATTER_SAMPLING_THRESHOLD_7_DAYS = 300;
/**
 * Sampling threshold for scatter plots using 14-day data.
 * @type {number}
 */
const SCATTER_SAMPLING_THRESHOLD_14_DAYS = 500;
/**
 * Sampling threshold for scatter plots using 30-day data.
 * @type {number}
 */
const SCATTER_SAMPLING_THRESHOLD_30_DAYS = 700;

/**
 * Defines magnitude ranges for grouping earthquakes in distribution charts.
 * Each object includes a display `name`, `min` magnitude, `max` magnitude.
 * @type {Array<{name: string, min: number, max: number}>}
 */
const MAGNITUDE_RANGES = [
    {name: '<1', min: -Infinity, max: 0.99},
    {name : '1-1.9', min : 1, max : 1.99},
    {name: '2-2.9', min: 2, max: 2.99},
    {name : '3-3.9', min : 3, max : 3.99},
    {name: '4-4.9', min: 4, max: 4.99},
    {name : '5-5.9', min : 5, max : 5.99},
    {name: '6-6.9', min: 6, max: 6.99},
    {name : '7+', min : 7, max : Infinity},
];

/**
 * Formats a timestamp into a 'MMM D' string (e.g., "Oct 26").
 * @param {number} timestamp - The Unix timestamp in milliseconds.
 * @returns {string} The formatted date string.
 */
const formatDateForTimeline = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Generates an array of objects representing daily counts, initialized to zero,
 * for a specified number of days leading up to a `baseTime`.
 *
 * @param {number} numDays - The number of days to generate counts for.
 * @param {number} baseTime - The reference end timestamp (Unix milliseconds) from which to count backwards.
 * @returns {Array<{dateString: string, count: number}>} An array of daily count objects, sorted chronologically.
 */
const getInitialDailyCounts = (numDays, baseTime) => {
    const counts = [];
    for (let i = 0; i < numDays; i++) {
        const date = new Date(baseTime);
        date.setDate(date.getDate() - i);
        counts.push({ dateString: formatDateForTimeline(date.getTime()), count: 0 });
    }
    return counts.reverse(); // Ensure chronological order
};

/**
 * Calculates the distribution of earthquakes across predefined magnitude ranges.
 *
 * @param {Array<Object>} earthquakes - An array of earthquake objects. Each should have `properties.mag`.
 * @returns {Array<{name: string, count: number, color: string}>}
 *   An array of objects, where each object represents a magnitude range and contains
 *   its name, the count of earthquakes in that range, and an associated color.
 */
const calculateMagnitudeDistribution = (earthquakes) => {
    const distribution = MAGNITUDE_RANGES.map(range => ({
        name: range.name,
        count: 0,
        color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min) // Use range.min for color, handle -Infinity
    }));

    earthquakes.forEach(quake => {
        const mag = quake.properties.mag;
        if (mag === null || typeof mag !== 'number') return;

        for (const range of distribution) {
            // Find the correct range from MAGNITUDE_RANGES to check min/max
            const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
            if (mag >= rangeDetails.min && mag <= rangeDetails.max) {
                range.count++;
                break;
            }
        }
    });
    return distribution;
};

/**
 * Initial state for the EarthquakeDataContext.
 * Defines the structure for storing earthquake data, loading flags, error states,
 * and processed/derived information.
 * @type {Object}
 */
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
    dailyCounts14Days: [],
    dailyCounts30Days: [],
    sampledEarthquakesLast14Days: [],
    sampledEarthquakesLast30Days: [],
    magnitudeDistribution14Days: [],
    magnitudeDistribution30Days: [],
    dailyCounts7Days: [],
    sampledEarthquakesLast7Days: [],
    magnitudeDistribution7Days: [],
    tsunamiTriggeringQuake: null, // Add this
};

/**
 * Action types for the earthquakeReducer.
 * @type {Object.<string, string>}
 */
const actionTypes = {
    /** Action to set loading flags (e.g., `isLoadingDaily`, `isLoadingWeekly`). Payload should be an object with flag(s) to update. */
    SET_LOADING_FLAGS: 'SET_LOADING_FLAGS',
    /** Action to set error states (e.g., `error`, `monthlyError`). Payload should be an object with error message(s). */
    SET_ERROR: 'SET_ERROR',
    /** Action dispatched when daily earthquake data has been fetched and processed. Payload includes `features`, `metadata`, `fetchTime`. */
    DAILY_DATA_PROCESSED: 'DAILY_DATA_PROCESSED',
    /** Action dispatched when weekly earthquake data has been fetched and processed. Payload includes `features`, `fetchTime`. */
    WEEKLY_DATA_PROCESSED: 'WEEKLY_DATA_PROCESSED',
    /** Action dispatched when monthly earthquake data has been fetched and processed. Payload includes `features`, `fetchTime`. */
    MONTHLY_DATA_PROCESSED: 'MONTHLY_DATA_PROCESSED',
    /** Action to mark the initial application data load sequence as complete. */
    SET_INITIAL_LOAD_COMPLETE: 'SET_INITIAL_LOAD_COMPLETE',
    /** Action to update the index for cycling through loading messages. */
    UPDATE_LOADING_MESSAGE_INDEX: 'UPDATE_LOADING_MESSAGE_INDEX',
    /** Action to set the array of messages used during loading sequences. Payload is an array of strings. */
    SET_LOADING_MESSAGES: 'SET_LOADING_MESSAGES',
};

/**
 * Reducer function for managing the state of earthquake data.
 * It handles actions related to data fetching, processing, error handling, and loading states.
 *
 * @param {Object} state - The current state, defaults to `initialState`.
 * @param {Object} action - The action object, containing `type` and `payload`.
 * @param {string} action.type - The type of action to perform (from `actionTypes`).
 * @param {Object} [action.payload] - The data associated with the action.
 * @returns {Object} The new state.
 */
function earthquakeReducer(state = initialState, action) {
    switch (action.type) {
        case actionTypes.SET_LOADING_FLAGS:
            return { ...state, ...action.payload };
        case actionTypes.SET_ERROR:
            return { ...state, ...action.payload };
        case actionTypes.DAILY_DATA_PROCESSED: {
            // Processes daily data: updates last hour, 24h, alerts, major quakes, tsunami warnings.
            const { features, metadata, fetchTime } = action.payload;
            const l24 = filterByTime(features, 24, 0, fetchTime);
            const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
            const currentHighestAlert = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'red':0, 'orange':1, 'yellow':2 }[a] - { 'red':0, 'orange':1, 'yellow':2 }[b]))[0] : null;

            const dailyMajors = features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            const majorQuakeUpdates = consolidateMajorQuakesLogic(state.lastMajorQuake, state.previousMajorQuake, dailyMajors);

            let identifiedTsunamiQuake = null;
            const hasRecentTsunamiWarning = l24.some(q => q.properties.tsunami === 1);
            if (hasRecentTsunamiWarning) {
                const tsunamiQuakes = l24.filter(q => q.properties.tsunami === 1).sort((a, b) => b.properties.time - a.properties.time);
                if (tsunamiQuakes.length > 0) identifiedTsunamiQuake = tsunamiQuakes[0];
            }

            return {
                ...state,
                isLoadingDaily: false,
                dataFetchTime: fetchTime,
                lastUpdated: new Date(metadata?.generated || fetchTime).toLocaleString(),
                earthquakesLastHour: filterByTime(features, 1, 0, fetchTime),
                earthquakesPriorHour: filterByTime(features, 2, 1, fetchTime),
                earthquakesLast24Hours: l24,
                hasRecentTsunamiWarning,
                tsunamiTriggeringQuake: identifiedTsunamiQuake,
                highestRecentAlert: currentHighestAlert,
                activeAlertTriggeringQuakes: currentHighestAlert ? l24.filter(q => q.properties.alert === currentHighestAlert) : [],
                ...majorQuakeUpdates,
            };
        }
        case actionTypes.WEEKLY_DATA_PROCESSED: {
            // Processes weekly data: updates 72h, 7-day, previous 24h data, globe display data,
            // and calculates 7-day daily counts, sampled data, and magnitude distributions.
            const { features, fetchTime } = action.payload;
            const last72HoursData = filterByTime(features, 72, 0, fetchTime);

            // Deduplicate to ensure unique events if IDs overlap from different fetches (though less likely with single source)
            const uniqueEarthquakeIds = new Set();
            const deduplicatedLast72HoursData = last72HoursData.filter(quake => {
                if (!uniqueEarthquakeIds.has(quake.id)) {
                    uniqueEarthquakeIds.add(quake.id);
                    return true;
                }
                return false;
            });

            const currentEarthquakesLast7Days = filterByTime(features, 7 * 24, 0, fetchTime);
            const weeklyMajors = features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            const majorQuakeUpdates = consolidateMajorQuakesLogic(state.lastMajorQuake, state.previousMajorQuake, weeklyMajors);

            const dailyCounts7Days = getInitialDailyCounts(7, fetchTime);
            currentEarthquakesLast7Days.forEach(quake => {
                const dateString = formatDateForTimeline(quake.properties.time);
                const dayEntry = dailyCounts7Days.find(d => d.dateString === dateString);
                if (dayEntry) dayEntry.count++;
            });

            const sampledEarthquakesLast7Days = sampleArrayWithPriority(currentEarthquakesLast7Days, SCATTER_SAMPLING_THRESHOLD_7_DAYS, MAJOR_QUAKE_THRESHOLD);
            const magnitudeDistribution7Days = calculateMagnitudeDistribution(currentEarthquakesLast7Days);

            return {
                ...state,
                isLoadingWeekly: false,
                earthquakesLast72Hours: deduplicatedLast72HoursData,
                prev24HourData: filterByTime(features, 48, 24, fetchTime),
                earthquakesLast7Days: currentEarthquakesLast7Days,
                globeEarthquakes: [...deduplicatedLast72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 900),
                dailyCounts7Days,
                sampledEarthquakesLast7Days,
                magnitudeDistribution7Days,
                ...majorQuakeUpdates,
            };
        }
        case actionTypes.MONTHLY_DATA_PROCESSED: {
            // Processes monthly data: updates 14-day, 30-day, all earthquakes, previous 7/14 day data,
            // and calculates 14/30-day daily counts, sampled data, and magnitude distributions.
            const { features, fetchTime } = action.payload;
            const monthlyMajors = features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            const majorQuakeUpdates = consolidateMajorQuakesLogic(state.lastMajorQuake, state.previousMajorQuake, monthlyMajors);

            const dailyCounts30Days = getInitialDailyCounts(30, fetchTime);
            const dailyCounts14Days = getInitialDailyCounts(14, fetchTime);
            const currentEarthquakesLast30Days = filterMonthlyByTime(features, 30, 0, fetchTime);
            const currentEarthquakesLast14Days = filterMonthlyByTime(features, 14, 0, fetchTime);
            const magnitudeDistribution30Days = calculateMagnitudeDistribution(currentEarthquakesLast30Days);
            const magnitudeDistribution14Days = calculateMagnitudeDistribution(currentEarthquakesLast14Days);

            currentEarthquakesLast30Days.forEach(quake => { // Use already filtered 30-day data for 30-day counts
                const dateString = formatDateForTimeline(quake.properties.time);
                const dayEntry30 = dailyCounts30Days.find(d => d.dateString === dateString);
                if (dayEntry30) dayEntry30.count++;
            });
            currentEarthquakesLast14Days.forEach(quake => { // Use already filtered 14-day data for 14-day counts
                const dateString = formatDateForTimeline(quake.properties.time);
                const dayEntry14 = dailyCounts14Days.find(d => d.dateString === dateString);
                if (dayEntry14) dayEntry14.count++;
            });

            return {
                ...state,
                isLoadingMonthly: false,
                hasAttemptedMonthlyLoad: true,
                monthlyError: null,
                allEarthquakes: features,
                earthquakesLast14Days: currentEarthquakesLast14Days,
                earthquakesLast30Days: currentEarthquakesLast30Days,
                sampledEarthquakesLast14Days: sampleArrayWithPriority(currentEarthquakesLast14Days, SCATTER_SAMPLING_THRESHOLD_14_DAYS, MAJOR_QUAKE_THRESHOLD),
                sampledEarthquakesLast30Days: sampleArrayWithPriority(currentEarthquakesLast30Days, SCATTER_SAMPLING_THRESHOLD_30_DAYS, MAJOR_QUAKE_THRESHOLD),
                dailyCounts14Days,
                dailyCounts30Days,
                magnitudeDistribution14Days,
                magnitudeDistribution30Days,
                prev7DayData: filterMonthlyByTime(features, 14, 7, fetchTime),
                prev14DayData: filterMonthlyByTime(features, 28, 14, fetchTime),
                ...majorQuakeUpdates,
            };
        }
        case actionTypes.SET_INITIAL_LOAD_COMPLETE:
            return { ...state, isInitialAppLoad: false };
        case actionTypes.UPDATE_LOADING_MESSAGE_INDEX:
            return { ...state, loadingMessageIndex: (state.loadingMessageIndex + 1) % state.currentLoadingMessages.length };
        case actionTypes.SET_LOADING_MESSAGES:
            return { ...state, currentLoadingMessages: action.payload, loadingMessageIndex: 0 };
        default:
            return state;
    }
}

/**
 * Provides earthquake data to its children components via the EarthquakeDataContext.
 * It handles fetching data from USGS APIs, processing it, and managing state related to
 * earthquake events, loading status, errors, and various derived data sets (e.g., hourly,
 * daily, weekly summaries, major quake tracking, pre-aggregated chart data).
 *
 * Data is fetched on initial mount and then refreshed at a set interval (`REFRESH_INTERVAL_MS`).
 * It also provides a `loadMonthlyData` function for consumers to trigger the fetch of
 * more extensive historical data.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {React.ReactNode} props.children - The child components that will have access to this context.
 * @returns {JSX.Element} The EarthquakeDataProvider component.
 */
export const EarthquakeDataProvider = ({ children }) => {
    const [state, dispatch] = useReducer(earthquakeReducer, initialState);

    // Effect for initial data load and setting up the refresh interval.
    useEffect(() => {
        let isMounted = true;
        const orchestrateInitialDataLoad = async () => {
            if (!isMounted) return;

            if (state.isInitialAppLoad) {
                dispatch({ type: actionTypes.SET_LOADING_MESSAGES, payload: INITIAL_LOADING_MESSAGES });
            }
            dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: true, isLoadingWeekly: true } });
            dispatch({ type: actionTypes.SET_ERROR, payload: { error: null } }); // Clear general error

            const nowForFiltering = Date.now();
            let dailyError = null, weeklyError = null;

            try { // Daily data fetch
                if (isMounted && state.isInitialAppLoad) dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
                const dailyRes = await fetchUsgsData(USGS_API_URL_DAY);
                if (isMounted) {
                    if (!dailyRes.error && dailyRes.features) {
                        if (state.isInitialAppLoad) dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
                        dispatch({ type: actionTypes.DAILY_DATA_PROCESSED, payload: { features: dailyRes.features, metadata: dailyRes.metadata, fetchTime: nowForFiltering } });
                    } else dailyError = dailyRes?.error?.message || "Daily data features missing.";
                }
            } catch (e) { if (isMounted) dailyError = e.message || "Error processing daily data."; }
            finally { if (isMounted && dailyError) dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingDaily: false } });}

            try { // Weekly data fetch
                if (isMounted && state.isInitialAppLoad) dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
                const weeklyResult = await fetchUsgsData(USGS_API_URL_WEEK);
                if (isMounted) {
                    if (!weeklyResult.error && weeklyResult.features) {
                        if (state.isInitialAppLoad) dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
                        dispatch({ type: actionTypes.WEEKLY_DATA_PROCESSED, payload: { features: weeklyResult.features, fetchTime: nowForFiltering } });
                    } else weeklyError = weeklyResult?.error?.message || "Weekly data features missing.";
                }
            } catch (e) { if (isMounted) weeklyError = e.message || "Error processing weekly data."; }
            finally { if (isMounted && weeklyError) dispatch({ type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingWeekly: false } });}

            if (isMounted) {
                let finalErrorMsg = null;
                if (dailyError && weeklyError) finalErrorMsg = "Failed to fetch critical daily and weekly data.";
                else if (dailyError) finalErrorMsg = `Daily data error: ${dailyError}.`;
                else if (weeklyError) finalErrorMsg = `Weekly data error: ${weeklyError}.`;
                if (finalErrorMsg) dispatch({ type: actionTypes.SET_ERROR, payload: { error: finalErrorMsg } });

                if (state.isInitialAppLoad) dispatch({ type: actionTypes.SET_INITIAL_LOAD_COMPLETE });
            }
        };

        orchestrateInitialDataLoad();
        const intervalId = setInterval(orchestrateInitialDataLoad, REFRESH_INTERVAL_MS);
        return () => { isMounted = false; clearInterval(intervalId); };
    }, []); // Empty dependency array ensures this runs once on mount and cleanup on unmount.

    // Effect for cycling loading messages during initial load.
    useEffect(() => {
        let messageInterval;
        if (state.isInitialAppLoad && (state.isLoadingDaily || state.isLoadingWeekly)) {
            messageInterval = setInterval(() => {
                dispatch({ type: actionTypes.UPDATE_LOADING_MESSAGE_INDEX });
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [state.isInitialAppLoad, state.isLoadingDaily, state.isLoadingWeekly]);

    /**
     * Callback function to trigger the loading of extended monthly earthquake data.
     * Sets loading flags and fetches data from `USGS_API_URL_MONTH`.
     * Dispatches actions to update state with fetched data or errors.
     * @type {function(): Promise<void>}
     */
    const loadMonthlyData = useCallback(async () => {
        dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: true, hasAttemptedMonthlyLoad: true }});
        dispatch({type: actionTypes.SET_ERROR, payload: { monthlyError: null }});

        const nowForFiltering = Date.now();
        try {
            const monthlyResult = await fetchUsgsData(USGS_API_URL_MONTH);
            if (!monthlyResult.error && monthlyResult.features && monthlyResult.features.length > 0) {
                dispatch({ type: actionTypes.MONTHLY_DATA_PROCESSED, payload: { features: monthlyResult.features, fetchTime: nowForFiltering } });
            } else {
                const errorMsg = monthlyResult?.error?.message || "Monthly data is unavailable or incomplete.";
                dispatch({type: actionTypes.SET_ERROR, payload: { monthlyError: errorMsg }});
                dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false }});
            }
        } catch (e) {
            const errorMsg = `Monthly Data Processing Error: ${e.message || "An unexpected error occurred."}`;
            dispatch({ type: actionTypes.SET_ERROR, payload: { monthlyError: errorMsg }});
            dispatch({type: actionTypes.SET_LOADING_FLAGS, payload: { isLoadingMonthly: false }});
        }
    }, []);


    const isLoadingInitialData = useMemo(() => (state.isLoadingDaily || state.isLoadingWeekly) && state.isInitialAppLoad, [state.isLoadingDaily, state.isLoadingWeekly, state.isInitialAppLoad]);
    const currentLoadingMessage = useMemo(() => state.currentLoadingMessages[state.loadingMessageIndex], [state.currentLoadingMessages, state.loadingMessageIndex]);

    // Memoized selectors for derived earthquake lists
    const feelableQuakes7Days_ctx = useMemo(() => state.earthquakesLast7Days?.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) || [], [state.earthquakesLast7Days]);
    const significantQuakes7Days_ctx = useMemo(() => state.earthquakesLast7Days?.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) || [], [state.earthquakesLast7Days]);
    const feelableQuakes30Days_ctx = useMemo(() => state.allEarthquakes?.filter(q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD) || [], [state.allEarthquakes]);
    const significantQuakes30Days_ctx = useMemo(() => state.allEarthquakes?.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD) || [], [state.allEarthquakes]);

    // Construct the context value, including all state and memoized/callback functions.
    const contextValue = useMemo(() => ({
        ...state,
        isLoadingInitialData,
        currentLoadingMessage,
        loadMonthlyData,
        feelableQuakes7Days_ctx,
        significantQuakes7Days_ctx,
        feelableQuakes30Days_ctx,
        significantQuakes30Days_ctx,
        // Ensure all pre-aggregated data from state is explicitly part of the context value
        // (already covered by ...state, but listed for clarity if one were to pick specific items)
    }), [
        state, isLoadingInitialData, currentLoadingMessage, loadMonthlyData,
        feelableQuakes7Days_ctx, significantQuakes7Days_ctx,
        feelableQuakes30Days_ctx, significantQuakes30Days_ctx
    ]);

    return (
        <EarthquakeDataContext.Provider value={contextValue}>
            {children}
        </EarthquakeDataContext.Provider>
    );
};

/**
 * Custom hook to consume the EarthquakeDataContext.
 * Provides easy access to earthquake data, loading states, and related functions.
 * Throws an error if used outside of an `EarthquakeDataProvider`.
 *
 * @returns {Object} The context value, containing the earthquake data state and associated functions/values.
 * @throws {Error} If the hook is used outside an EarthquakeDataProvider.
 */
export const useEarthquakeDataState = () => {
    const context = useContext(EarthquakeDataContext);
    if (context === null) {
        throw new Error('useEarthquakeDataState must be used within an EarthquakeDataProvider');
    }
    return context;
};

// Exporting the context, initial state, action types, and reducer can be useful for testing or advanced usage.
export { EarthquakeDataContext, initialState, actionTypes, earthquakeReducer };
