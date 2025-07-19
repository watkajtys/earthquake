// src/contexts/earthquakeDataContextUtils.js
import { createContext } from 'react'; // Added import
import { getMagnitudeColor } from '../utils/utils.js'; // Needed for calculateMagnitudeDistribution
import { INITIAL_LOADING_MESSAGES, FEELABLE_QUAKE_THRESHOLD, MAJOR_QUAKE_THRESHOLD, ALERT_LEVELS } from '../constants/appConstants'; // Added ALERT_LEVELS

// --- Helper Function Definitions ---
export const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - hoursAgoStart * 36e5;
    const endTime = now - hoursAgoEnd * 36e5;
    return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
};

export const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - (daysAgoStart * 24 * 36e5);
    const endTime = now - (daysAgoEnd * 24 * 36e5);
    return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
};

export const consolidateMajorQuakesLogic = (currentLastMajor, currentPreviousMajor, newMajors) => {
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

export const sampleArray = (array, sampleSize) => {
    if (!Array.isArray(array) || array.length === 0) return [];
    if (sampleSize >= array.length) return [...array];

    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, sampleSize);
};

export function sampleArrayWithPriority(fullArray, sampleSize, priorityMagnitudeThreshold) {
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
        return sampleArray(priorityQuakes, sampleSize);
    } else {
        const remainingSlots = sampleSize - priorityQuakes.length;
        const sampledOtherQuakes = sampleArray(otherQuakes, remainingSlots);
        return [...priorityQuakes, ...sampledOtherQuakes];
    }
}

// --- Constants ---
export const SCATTER_SAMPLING_THRESHOLD_7_DAYS = 300;
export const SCATTER_SAMPLING_THRESHOLD_14_DAYS = 500;
export const SCATTER_SAMPLING_THRESHOLD_30_DAYS = 700;

export const MAGNITUDE_RANGES = [
    {name: '<1', min: -Infinity, max: 0.99},
    {name : '1-1.9', min : 1, max : 1.99},
    {name: '2-2.9', min: 2, max: 2.99},
    {name : '3-3.9', min : 3, max : 3.99},
    {name: '4-4.9', min: 4, max: 4.99},
    {name : '5-5.9', min : 5, max : 5.99},
    {name: '6-6.9', min: 6, max: 6.99},
    {name : '7+', min : 7, max : Infinity},
];

export const formatDateForTimeline = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const getInitialDailyCounts = (numDays, baseTime) => {
    const counts = [];
    for (let i = 0; i < numDays; i++) {
        const date = new Date(baseTime);
        date.setDate(date.getDate() - i);
        counts.push({ dateString: formatDateForTimeline(date.getTime()), count: 0 });
    }
    return counts.reverse();
};

export const calculateMagnitudeDistribution = (earthquakes) => {
    const distribution = MAGNITUDE_RANGES.map(range => ({
        name: range.name,
        count: 0,
        color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min)
    }));

    earthquakes.forEach(quake => {
        const mag = quake.properties.mag;
        if (mag === null || typeof mag !== 'number') return;

        for (const range of distribution) {
            const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
            if (mag >= rangeDetails.min && mag <= rangeDetails.max) {
                range.count++;
                break;
            }
        }
    });
    return distribution;
};

// --- State, Actions, Reducer (originally from EarthquakeDataContext.jsx) ---
/**
 * @typedef {object} EarthquakeDataState
 * @property {boolean} isLoadingDaily - Flag indicating if daily data is currently being fetched.
 * @property {boolean} isLoadingWeekly - Flag indicating if weekly data is currently being fetched.
 * @property {boolean} isLoadingMonthly - Flag indicating if monthly data is currently being fetched.
 * @property {boolean} isInitialAppLoad - Flag indicating if the application is performing its initial data load sequence.
 * @property {string|null} error - General error message for daily/weekly data fetching issues.
 * @property {string|null} monthlyError - Error message specific to monthly data fetching issues.
 * @property {number|null} dataFetchTime - Timestamp of the last successful data fetch.
 * @property {string|null} lastUpdated - Formatted string indicating when the data was last updated (from source metadata or fetch time).
 * @property {Array<object>} earthquakesLastHour - Earthquakes from the last hour.
 * @property {Array<object>} earthquakesPriorHour - Earthquakes from the hour before the last hour.
 * @property {Array<object>} earthquakesLast24Hours - Earthquakes from the last 24 hours.
 * @property {Array<object>} earthquakesLast72Hours - Earthquakes from the last 72 hours.
 * @property {Array<object>} earthquakesLast7Days - Earthquakes from the last 7 days.
 * @property {Array<object>} prev24HourData - Earthquakes from the 24 hours prior to the current 24-hour window (for comparison).
 * @property {Array<object>} prev7DayData - Earthquakes from the 7 days prior to the current 7-day window.
 * @property {Array<object>} prev14DayData - Earthquakes from the 14 days prior to the current 14-day window (used with 30-day view).
 * @property {Array<object>} allEarthquakes - All earthquakes loaded, typically representing the monthly data feed.
 * @property {Array<object>} earthquakesLast14Days - Earthquakes from the last 14 days.
 * @property {Array<object>} earthquakesLast30Days - Earthquakes from the last 30 days.
 * @property {Array<object>} globeEarthquakes - Sampled earthquakes for globe visualization.
 * @property {boolean} hasRecentTsunamiWarning - Flag indicating if there's a tsunami warning in the last 24 hours.
 * @property {string|null} highestRecentAlert - The highest alert level (e.g., "red", "orange") in the last 24 hours.
 * @property {Array<object>} activeAlertTriggeringQuakes - Earthquakes that triggered the `highestRecentAlert`.
 * @property {object|null} lastMajorQuake - The most recent major earthquake.
 * @property {object|null} previousMajorQuake - The major earthquake before the `lastMajorQuake`.
 * @property {number|null} timeBetweenPreviousMajorQuakes - Time difference in milliseconds between the last two major quakes.
 * @property {number} loadingMessageIndex - Index for cycling through loading messages.
 * @property {Array<string>} currentLoadingMessages - Array of loading messages displayed during initial load.
 * @property {boolean} hasAttemptedMonthlyLoad - Flag indicating if an attempt has been made to load monthly data.
 * @property {Array<{dateString: string, count: number}>} dailyCounts14Days - Daily earthquake counts for the last 14 days.
 * @property {Array<{dateString: string, count: number}>} dailyCounts30Days - Daily earthquake counts for the last 30 days.
 * @property {Array<object>} sampledEarthquakesLast14Days - Sampled earthquakes for the 14-day scatter plot.
 * @property {Array<object>} sampledEarthquakesLast30Days - Sampled earthquakes for the 30-day scatter plot.
 * @property {Array<{name: string, count: number, color: string}>} magnitudeDistribution14Days - Magnitude distribution for 14-day data.
 * @property {Array<{name: string, count: number, color: string}>} magnitudeDistribution30Days - Magnitude distribution for 30-day data.
 * @property {Array<{dateString: string, count: number}>} dailyCounts7Days - Daily earthquake counts for the last 7 days.
 * @property {Array<object>} sampledEarthquakesLast7Days - Sampled earthquakes for the 7-day scatter plot.
 * @property {Array<{name: string, count: number, color: string}>} magnitudeDistribution7Days - Magnitude distribution for 7-day data.
 * @property {object|null} tsunamiTriggeringQuake - The most recent quake that triggered a tsunami warning in the last 24 hours.
 * @property {('D1'|'USGS'|null)} dailyDataSource - Source of the daily earthquake data.
 * @property {('D1'|'USGS'|null)} weeklyDataSource - Source of the weekly earthquake data.
 * @property {('D1'|'USGS'|null)} monthlyDataSource - Source of the monthly earthquake data.
 */

/** @type {EarthquakeDataState} */
export const initialState = {
    filters: {
        minMagnitude: null,
        maxDepth: null,
    },
    searchTerm: '',
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
    hasAttemptedMonthlyLoad: false,
    dailyCounts14Days: [],
    dailyCounts30Days: [],
    sampledEarthquakesLast14Days: [],
    sampledEarthquakesLast30Days: [],
    magnitudeDistribution14Days: [],
    magnitudeDistribution30Days: [],
    dailyCounts7Days: [],
    sampledEarthquakesLast7Days: [],
    magnitudeDistribution7Days: [],
    tsunamiTriggeringQuake: null,
    dailyDataSource: null,
    weeklyDataSource: null,
    monthlyDataSource: null,
    shouldFetchMonthlyData: false,
    filteredGlobeEarthquakes: [],
};

// --- Context Object ---
/**
 * React Context for earthquake data.
 * @type {React.Context<EarthquakeDataState|null>}
 */
export const EarthquakeDataContext = createContext(null);

/**
 * Action types for the earthquake data reducer.
 * @enum {string}
 */
export const actionTypes = {
    SET_SEARCH_TERM: 'SET_SEARCH_TERM',
    SET_FILTER: 'SET_FILTER',
    SET_LOADING_FLAGS: 'SET_LOADING_FLAGS',
    SET_ERROR: 'SET_ERROR',
    /** Action type for when daily data has been fetched and processed.
     *  Payload should include `features`, `metadata`, `fetchTime`, and `dataSource`. */
    DAILY_DATA_PROCESSED: 'DAILY_DATA_PROCESSED',
    /** Action type for when weekly data has been fetched and processed.
     *  Payload should include `features`, `fetchTime`, and `dataSource`. */
    WEEKLY_DATA_PROCESSED: 'WEEKLY_DATA_PROCESSED',
    /** Action type for when monthly data has been fetched and processed.
     *  Payload should include `features`, `fetchTime`, and `dataSource`. */
    MONTHLY_DATA_PROCESSED: 'MONTHLY_DATA_PROCESSED',
    SET_INITIAL_LOAD_COMPLETE: 'SET_INITIAL_LOAD_COMPLETE',
    UPDATE_LOADING_MESSAGE_INDEX: 'UPDATE_LOADING_MESSAGE_INDEX',
    SET_LOADING_MESSAGES: 'SET_LOADING_MESSAGES',
    REQUEST_MONTHLY_DATA_LOAD: 'REQUEST_MONTHLY_DATA_LOAD',
    MONTHLY_DATA_LOAD_HANDLED: 'MONTHLY_DATA_LOAD_HANDLED',
};

/**
 * @typedef {object} DailyDataProcessedPayload
 * @property {Array<object>} features - Array of earthquake GeoJSON features.
 * @property {object|null} metadata - Metadata from the data source (primarily for USGS).
 * @property {number} fetchTime - Timestamp of when the data was fetched.
 * @property {('D1'|'USGS')} dataSource - The source of the data ('D1' or 'USGS').
 */

/**
 * @typedef {object} WeeklyDataProcessedPayload
 * @property {Array<object>} features - Array of earthquake GeoJSON features.
 * @property {number} fetchTime - Timestamp of when the data was fetched.
 * @property {('D1'|'USGS')} dataSource - The source of the data ('D1' or 'USGS').
 */

/**
 * @typedef {object} MonthlyDataProcessedPayload
 * @property {Array<object>} features - Array of earthquake GeoJSON features.
 * @property {number} fetchTime - Timestamp of when the data was fetched.
 * @property {('D1'|'USGS')} dataSource - The source of the data ('D1' or 'USGS').
 */

/**
 * Reducer function for managing earthquake data state.
 * @param {EarthquakeDataState} state - The current state.
 * @param {object} action - The dispatched action.
 * @param {actionTypes} action.type - The type of the action.
 * @param {object} action.payload - The payload of the action.
 * @returns {EarthquakeDataState} The new state.
 */
export function earthquakeReducer(state = initialState, action) {
    let newState;
    switch (action.type) {
        case actionTypes.SET_SEARCH_TERM:
            const searchTerm = action.payload;
            const filteredBySearch = state.globeEarthquakes.filter(quake => {
                const place = quake.properties.place.toLowerCase();
                return place.includes(searchTerm.toLowerCase());
            });
            newState = { ...state, searchTerm, filteredGlobeEarthquakes: filteredBySearch };
            break;
        case actionTypes.SET_FILTER:
            const { filterName, value } = action.payload;
            const newFilters = { ...state.filters, [filterName]: value };
            const filteredGlobeEarthquakes = state.globeEarthquakes.filter(quake => {
                const mag = quake.properties.mag;
                const depth = quake.geometry.coordinates[2];
                const minMag = newFilters.minMagnitude;
                const maxDepth = newFilters.maxDepth;
                const place = quake.properties.place.toLowerCase();
                if (minMag && mag < minMag) {
                    return false;
                }
                if (maxDepth && depth > maxDepth) {
                    return false;
                }
                if (state.searchTerm && !place.includes(state.searchTerm.toLowerCase())) {
                    return false;
                }
                return true;
            });
            newState = { ...state, filters: newFilters, filteredGlobeEarthquakes };
            break;
        case actionTypes.SET_LOADING_FLAGS:
            newState = { ...state, ...action.payload };
            break;
        case actionTypes.SET_ERROR:
            newState = { ...state, ...action.payload };
            break;
        case actionTypes.DAILY_DATA_PROCESSED: {
            /** @type {DailyDataProcessedPayload} */
            const { features, metadata, fetchTime, dataSource } = action.payload;
            const l24 = filterByTime(features, 24, 0, fetchTime);
            const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a.toUpperCase()]); // ALERT_LEVELS needs to be defined or imported
            const currentHighestAlert = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'red':0, 'orange':1, 'yellow':2 }[a] - { 'red':0, 'orange':1, 'yellow':2 }[b]))[0] : null;

            const dailyMajors = features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            const majorQuakeUpdates = consolidateMajorQuakesLogic(state.lastMajorQuake, state.previousMajorQuake, dailyMajors);

            let identifiedTsunamiQuake = null;
            const hasRecentTsunamiWarning = l24.some(q => q.properties.tsunami === 1);
            if (hasRecentTsunamiWarning) {
                const tsunamiQuakes = l24.filter(q => q.properties.tsunami === 1).sort((a, b) => b.properties.time - a.properties.time);
                if (tsunamiQuakes.length > 0) identifiedTsunamiQuake = tsunamiQuakes[0];
            }

            newState = {
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
                dailyDataSource: dataSource,
            };
            break;
        }
        case actionTypes.WEEKLY_DATA_PROCESSED: {
            /** @type {WeeklyDataProcessedPayload} */
            const { features, fetchTime, dataSource } = action.payload;
            const last72HoursData = filterByTime(features, 72, 0, fetchTime);

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

            const globeEarthquakes = [...deduplicatedLast72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 900);
            const filteredGlobeEarthquakes = globeEarthquakes.filter(quake => {
                const mag = quake.properties.mag;
                const depth = quake.geometry.coordinates[2];
                const minMag = state.filters.minMagnitude;
                const maxDepth = state.filters.maxDepth;
                const place = quake.properties.place.toLowerCase();
                if (minMag && mag < minMag) {
                    return false;
                }
                if (maxDepth && depth > maxDepth) {
                    return false;
                }
                if (state.searchTerm && !place.includes(state.searchTerm.toLowerCase())) {
                    return false;
                }
                return true;
            });

            newState = {
                ...state,
                isLoadingWeekly: false,
                earthquakesLast72Hours: deduplicatedLast72HoursData,
                prev24HourData: filterByTime(features, 48, 24, fetchTime),
                earthquakesLast7Days: currentEarthquakesLast7Days,
                globeEarthquakes,
                filteredGlobeEarthquakes,
                dailyCounts7Days,
                sampledEarthquakesLast7Days,
                magnitudeDistribution7Days,
                ...majorQuakeUpdates,
                weeklyDataSource: dataSource,
            };
            break;
        }
        case actionTypes.MONTHLY_DATA_PROCESSED: {
            /** @type {MonthlyDataProcessedPayload} */
            const { features, fetchTime, dataSource } = action.payload;
            const monthlyMajors = features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
            const majorQuakeUpdates = consolidateMajorQuakesLogic(state.lastMajorQuake, state.previousMajorQuake, monthlyMajors);

            const dailyCounts30Days = getInitialDailyCounts(30, fetchTime);
            const dailyCounts14Days = getInitialDailyCounts(14, fetchTime);
            const currentEarthquakesLast30Days = filterMonthlyByTime(features, 30, 0, fetchTime);
            const currentEarthquakesLast14Days = filterMonthlyByTime(features, 14, 0, fetchTime);
            const magnitudeDistribution30Days = calculateMagnitudeDistribution(currentEarthquakesLast30Days);
            const magnitudeDistribution14Days = calculateMagnitudeDistribution(currentEarthquakesLast14Days);

            currentEarthquakesLast30Days.forEach(quake => {
                const dateString = formatDateForTimeline(quake.properties.time);
                const dayEntry30 = dailyCounts30Days.find(d => d.dateString === dateString);
                if (dayEntry30) dayEntry30.count++;
            });
            currentEarthquakesLast14Days.forEach(quake => {
                const dateString = formatDateForTimeline(quake.properties.time);
                const dayEntry14 = dailyCounts14Days.find(d => d.dateString === dateString);
                if (dayEntry14) dayEntry14.count++;
            });

            const globeEarthquakes = [...state.earthquakesLast72Hours, ...features].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 900);
            const filteredGlobeEarthquakes = globeEarthquakes.filter(quake => {
                const mag = quake.properties.mag;
                const depth = quake.geometry.coordinates[2];
                const minMag = state.filters.minMagnitude;
                const maxDepth = state.filters.maxDepth;
                const place = quake.properties.place.toLowerCase();
                if (minMag && mag < minMag) {
                    return false;
                }
                if (maxDepth && depth > maxDepth) {
                    return false;
                }
                if (state.searchTerm && !place.includes(state.searchTerm.toLowerCase())) {
                    return false;
                }
                return true;
            });

            newState = {
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
                monthlyDataSource: dataSource,
                globeEarthquakes,
                filteredGlobeEarthquakes,
            };
            break;
        }
        case actionTypes.SET_INITIAL_LOAD_COMPLETE:
            newState = { ...state, isInitialAppLoad: false };
            break;
        case actionTypes.UPDATE_LOADING_MESSAGE_INDEX:
            newState = { ...state, loadingMessageIndex: (state.loadingMessageIndex + 1) % state.currentLoadingMessages.length };
            break;
        case actionTypes.SET_LOADING_MESSAGES:
            newState = { ...state, currentLoadingMessages: action.payload, loadingMessageIndex: 0 };
            break;
        case actionTypes.REQUEST_MONTHLY_DATA_LOAD:
            newState = { ...state, shouldFetchMonthlyData: true };
            break;
        case actionTypes.MONTHLY_DATA_LOAD_HANDLED:
            newState = { ...state, shouldFetchMonthlyData: false };
            break;
        default:
            newState = state; // No change for unknown actions
            break;
    }
    return newState;
}
