// src/context/EarthquakeDataContext.jsx
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import useEarthquakeData from '../hooks/useEarthquakeData';
import useMonthlyEarthquakeData from '../hooks/useMonthlyEarthquakeData';
import { HEADER_TIME_UPDATE_INTERVAL_MS } from '../constants/appConstants'; // Assuming this constant is needed for header time

const EarthquakeDataContext = createContext();

export const useEarthquakeDataState = () => useContext(EarthquakeDataContext);

// Definition of fetchDataCb (moved from HomePage.jsx or a new shared util)
const fetchDataCb = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            let errorBody = '';
            try { errorBody = await response.text(); } catch (e) { /* ignore */ }
            throw new Error(`HTTP error! status: ${response.status} ${response.statusText}. ${errorBody}`);
        }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error(`Expected JSON but received ${contentType}`);
        }
        const data = await response.json();
        const featuresArray = Array.isArray(data?.features) ? data.features : [];
        const sanitizedFeatures = featuresArray
            .filter(f => f?.properties?.type === 'earthquake')
            .map(f => ({
                ...f,
                properties: { ...f.properties, mag: (f.properties.mag === null || typeof f.properties.mag === 'number') ? f.properties.mag : null, detail: f.properties.detail || f.properties.url },
                geometry: f.geometry || {type: "Point", coordinates: [null, null, null]}
            }));
        return {features: sanitizedFeatures, metadata: data?.metadata || {generated: Date.now()}};
    } catch (e) {
        console.error(`Error in fetchDataCb from ${url}:`, e);
        return {features: [], metadata: {generated: Date.now(), error: true, errorMessage: e.message}};
    }
};

// Helper for formatting time (moved from HomePage.jsx or a new shared util)
const formatTimeAgo = (milliseconds) => {
    if (milliseconds === null || milliseconds < 0) return 'N/A';
    if (milliseconds < 30000) return 'just now';
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} sec${seconds !== 1 ? 's' : ''} ago`;
};


export const EarthquakeDataProvider = ({ children }) => {
    const [appCurrentTime, setAppCurrentTime] = useState(Date.now());

    // These states will be managed by the provider directly now
    const [globalLastMajorQuake, setGlobalLastMajorQuake] = useState(null);
    const [globalPreviousMajorQuake, setGlobalPreviousMajorQuake] = useState(null);
    const [globalTimeBetweenMajorQuakes, setGlobalTimeBetweenMajorQuakes] = useState(null);

    const dailyHookData = useEarthquakeData(fetchDataCb);

    // Pass internal setters to useMonthlyEarthquakeData
    const monthlyHookData = useMonthlyEarthquakeData(
        fetchDataCb,
        globalLastMajorQuake,
        setGlobalLastMajorQuake,
        setGlobalPreviousMajorQuake,
        setGlobalTimeBetweenMajorQuakes
    );

    // Effect to sync lastMajorQuake from daily hook to global state if it's newer
    useEffect(() => {
        if (dailyHookData.lastMajorQuake) {
            if (!globalLastMajorQuake || dailyHookData.lastMajorQuake.properties.time > globalLastMajorQuake.properties.time) {
                setGlobalLastMajorQuake(dailyHookData.lastMajorQuake);
                // Potentially update previous and timeBetween based on daily hook's perspective if it's the absolute latest
                if (dailyHookData.previousMajorQuake) {
                     setGlobalPreviousMajorQuake(dailyHookData.previousMajorQuake);
                }
                if (dailyHookData.timeBetweenPreviousMajorQuakes) {
                    setGlobalTimeBetweenMajorQuakes(dailyHookData.timeBetweenPreviousMajorQuakes);
                }
            }
        }
    }, [dailyHookData.lastMajorQuake, dailyHookData.previousMajorQuake, dailyHookData.timeBetweenPreviousMajorQuakes, globalLastMajorQuake]);

    // Effect for appCurrentTime, previously in HomePage
    useEffect(() => {
        const timerId = setInterval(() => setAppCurrentTime(Date.now()), HEADER_TIME_UPDATE_INTERVAL_MS);
        return () => clearInterval(timerId);
    }, []);

    const headerTimeDisplay = useMemo(() => {
        const connectingMsg = "Connecting to Seismic Network...";
        const awaitingMsg = "Awaiting Initial Data...";
        if (dailyHookData.isInitialAppLoad && (dailyHookData.isLoadingDaily || dailyHookData.isLoadingWeekly) && !dailyHookData.dataFetchTime) {
            return connectingMsg;
        }
        if (!dailyHookData.dataFetchTime) {
            return awaitingMsg;
        }
        const timeSinceFetch = appCurrentTime - dailyHookData.dataFetchTime;
        return `Live Data (7-day): ${timeSinceFetch < 30000 ? 'just now' : formatTimeAgo(timeSinceFetch)} | USGS Feed Updated: ${dailyHookData.lastUpdated || 'N/A'}`;
    }, [dailyHookData.isInitialAppLoad, dailyHookData.isLoadingDaily, dailyHookData.isLoadingWeekly, dailyHookData.dataFetchTime, appCurrentTime, dailyHookData.lastUpdated]);

    const contextValue = {
        ...dailyHookData, // Spread all values from useEarthquakeData
        lastMajorQuake: globalLastMajorQuake, // Override with the globally managed one
        previousMajorQuake: globalPreviousMajorQuake, // Override
        timeBetweenPreviousMajorQuakes: globalTimeBetweenMajorQuakes, // Override
        // Expose specific monthly data and functions
        isLoadingMonthly: monthlyHookData.isLoadingMonthly,
        hasAttemptedMonthlyLoad: monthlyHookData.hasAttemptedMonthlyLoad,
        monthlyError: monthlyHookData.monthlyError,
        allEarthquakes: monthlyHookData.allEarthquakes,
        earthquakesLast14Days: monthlyHookData.earthquakesLast14Days,
        earthquakesLast30Days: monthlyHookData.earthquakesLast30Days,
        prev7DayDataForMonthly: monthlyHookData.prev7DayData, // Renamed to avoid clash if dailyHookData also has prev7DayData
        prev14DayDataForMonthly: monthlyHookData.prev14DayData, // Renamed
        loadMonthlyData: monthlyHookData.loadMonthlyData,
        // Header related items
        appCurrentTime,
        headerTimeDisplay,
        // Utilities that might be needed by components consuming the context
        fetchDataCb: useCallback(fetchDataCb, []), // Memoize if passed down
        formatTimeAgo: useCallback(formatTimeAgo, []), // Memoize
    };

    return (
        <EarthquakeDataContext.Provider value={contextValue}>
            {children}
        </EarthquakeDataContext.Provider>
    );
};
