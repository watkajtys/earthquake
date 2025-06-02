import { useState, useEffect, useMemo, useRef } from 'react'; // Removed useCallback as orchestrateInitialDataLoad will be directly in useEffect
import { fetchUsgsData } from '../services/usgsApiService';
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    REFRESH_INTERVAL_MS,
    MAJOR_QUAKE_THRESHOLD,
    ALERT_LEVELS,
    INITIAL_LOADING_MESSAGES,
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';

/**
 * Custom hook to manage the fetching, processing, and state of daily and weekly earthquake data from USGS.
 * It handles initial data load, periodic refreshing, and derives various data views like recent quakes,
 * globe data, and statistics for major quakes and alerts.
 *
 * @returns {object} An object containing various states and data derived from earthquake feeds:
 * @property {boolean} isLoadingDaily - Loading state for the daily earthquake data feed.
 * @property {boolean} isLoadingWeekly - Loading state for the weekly earthquake data feed.
 * @property {boolean} isLoadingInitialData - True if either daily or weekly data is currently loading during the initial app load sequence.
 * @property {string | null} error - Error message string if any data fetch operation fails, otherwise null.
 * @property {number | null} dataFetchTime - Timestamp (in milliseconds) of the last successful data fetch operation.
 * @property {string | null} lastUpdated - Formatted string indicating when the source USGS data was last updated.
 * @property {Array<object>} earthquakesLastHour - Array of earthquake objects that occurred in the last hour.
 * @property {Array<object>} earthquakesPriorHour - Array of earthquake objects that occurred in the hour before the last hour.
 * @property {Array<object>} earthquakesLast24Hours - Array of earthquake objects that occurred in the last 24 hours.
 * @property {Array<object>} earthquakesLast72Hours - Array of earthquake objects from the weekly feed that occurred in the last 72 hours.
 * @property {Array<object>} earthquakesLast7Days - Array of earthquake objects from the weekly feed that occurred in the last 7 days.
 * @property {Array<object>} prev24HourData - Array of earthquake objects from 24-48 hours ago, used for trend comparison.
 * @property {Array<object>} globeEarthquakes - Processed list of up to 900 earthquakes from the last 72 hours, sorted by magnitude, for globe visualization.
 * @property {boolean} hasRecentTsunamiWarning - True if any earthquake in the last 24 hours had an associated tsunami warning.
 * @property {string | null} highestRecentAlert - The highest PAGER alert level (e.g., 'red', 'orange', 'yellow') recorded in the last 24 hours. Null if no alerts or only 'green'.
 * @property {Array<object>} activeAlertTriggeringQuakes - Array of earthquake objects that triggered the `highestRecentAlert`.
 * @property {object | null} lastMajorQuake - The most recent earthquake object that meets or exceeds the `MAJOR_QUAKE_THRESHOLD`.
 * @property {function} setLastMajorQuake - Setter function for `lastMajorQuake` state.
 * @property {object | null} previousMajorQuake - The earthquake object that was the major quake immediately before the current `lastMajorQuake`.
 * @property {function} setPreviousMajorQuake - Setter function for `previousMajorQuake` state.
 * @property {number | null} timeBetweenPreviousMajorQuakes - Time difference in milliseconds between `lastMajorQuake` and `previousMajorQuake`.
 * @property {function} setTimeBetweenPreviousMajorQuakes - Setter function for `timeBetweenPreviousMajorQuakes` state.
 * @property {string} currentLoadingMessage - A dynamic message displayed during the initial data loading sequence.
 * @property {boolean} isInitialAppLoad - True if the hook is currently processing its very first data load cycle upon app startup.
 */
const useEarthquakeData = () => {
    const [isLoadingDaily, setIsLoadingDaily] = useState(true);
    const [isLoadingWeekly, setIsLoadingWeekly] = useState(true);
    const [error, setError] = useState(null);
    const [dataFetchTime, setDataFetchTime] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [earthquakesLastHour, setEarthquakesLastHour] = useState([]);
    const [earthquakesPriorHour, setEarthquakesPriorHour] = useState([]);
    const [earthquakesLast24Hours, setEarthquakesLast24Hours] = useState([]);
    const [earthquakesLast72Hours, setEarthquakesLast72Hours] = useState([]);
    const [earthquakesLast7Days, setEarthquakesLast7Days] = useState([]);
    const [prev24HourData, setPrev24HourData] = useState([]);
    const [globeEarthquakes, setGlobeEarthquakes] = useState([]);
    const [hasRecentTsunamiWarning, setHasRecentTsunamiWarning] = useState(false);
    const [highestRecentAlert, setHighestRecentAlert] = useState(null);
    const [activeAlertTriggeringQuakes, setActiveAlertTriggeringQuakes] = useState([]);
    const [lastMajorQuake, setLastMajorQuake] = useState(null);
    const [previousMajorQuake, setPreviousMajorQuake] = useState(null);
    const [timeBetweenPreviousMajorQuakes, setTimeBetweenPreviousMajorQuakes] = useState(null);
    const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
    const [currentLoadingMessages, setCurrentLoadingMessages] = useState(INITIAL_LOADING_MESSAGES);
    const isInitialAppLoadRef = useRef(true);

    useEffect(() => {
        let isMounted = true;
        const orchestrateInitialDataLoad = async () => {
            if (!isMounted) return;

            // Reset states for refresh
            if (!isInitialAppLoadRef.current) {
                setIsLoadingDaily(true);
                setIsLoadingWeekly(true);
                // Do not reset loading messages here for refresh, only for initial load
            } else {
                setLoadingMessageIndex(0);
                setCurrentLoadingMessages(INITIAL_LOADING_MESSAGES);
            }

            setError(null); // Clear previous errors on new fetch attempt

            // Initialize data states to empty arrays to prevent errors if fetches fail partially
            setEarthquakesLastHour([]);
            setEarthquakesPriorHour([]);
            setEarthquakesLast24Hours([]);
            setEarthquakesLast72Hours([]);
            setEarthquakesLast7Days([]);
            setPrev24HourData([]);
            setGlobeEarthquakes([]);
            setActiveAlertTriggeringQuakes([]);

            const nowForFiltering = Date.now();
            const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0) => {
                // Ensure data is an array before filtering
                if (!Array.isArray(data)) return [];
                return data.filter(q =>
                    q.properties.time >= (nowForFiltering - hoursAgoStart * 36e5) &&
                    q.properties.time < (nowForFiltering - hoursAgoEnd * 36e5)
                );
            };

            let dailyMajor = null;
            let majD = []; // Initialize majD in a higher scope
            // Preserve lastMajorQuake across fetches until a newer one is found
            let currentLocalLastMajorQuake = lastMajorQuake;
            let currentLocalPreviousMajorQuake = previousMajorQuake;
            let currentLocalTimeBetween = timeBetweenPreviousMajorQuakes;


            let dailyErrorMsg = null;
            let weeklyErrorMsg = null;

            try {
                if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(0);
                const dailyRes = await fetchUsgsData(USGS_API_URL_DAY);
                if (!isMounted) return;

                if (!dailyRes.error && dailyRes.features) {
                    if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(1);
                    const dD = dailyRes.features;
                    setEarthquakesLastHour(filterByTime(dD, 1));
                    setEarthquakesPriorHour(filterByTime(dD, 2, 1));
                    const l24 = filterByTime(dD, 24);
                    setEarthquakesLast24Hours(l24);

                    setHasRecentTsunamiWarning(l24.some(q => q.properties.tsunami === 1));
                    const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
                    const currentHighestAlertValue = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'red':0, 'orange':1, 'yellow':2 }[a] - { 'red':0, 'orange':1, 'yellow':2 }[b]))[0] : null;
                    setHighestRecentAlert(currentHighestAlertValue);
                    if (currentHighestAlertValue && ALERT_LEVELS[currentHighestAlertValue.toUpperCase()]) {
                        setActiveAlertTriggeringQuakes(l24.filter(q => q.properties.alert === currentHighestAlertValue));
                    } else {
                        setActiveAlertTriggeringQuakes([]);
                    }

                    // Assign to the higher-scoped majD
                    majD = dD.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                    dailyMajor = majD.length > 0 ? majD[0] : null; 
                    if (dailyMajor) {
                        if (!currentLocalLastMajorQuake || dailyMajor.properties.time > currentLocalLastMajorQuake.properties.time) {
                            currentLocalLastMajorQuake = dailyMajor;
                        }
                    }
                    setDataFetchTime(nowForFiltering);
                    // Assuming successful fetch implies metadata might exist in dailyRes, not dailyRes.data
                    // If fetchUsgsData returns { data: dailyResJson } then it would be dailyRes.data.metadata
                    // Based on current fetchUsgsData, it's just dailyRes.metadata
                    setLastUpdated(new Date(dailyRes.metadata?.generated || nowForFiltering).toLocaleString());
                } else {
                    dailyErrorMsg = dailyRes?.error?.message || "Daily data features are missing or an error occurred.";
                }
            } catch (e) { // This catch is for unexpected errors in processing, not fetch errors handled by fetchUsgsData
                if (!isMounted) return;
                dailyErrorMsg = e.message || "An unexpected error occurred processing daily data.";
            }
            finally { if (isMounted) setIsLoadingDaily(false); }

            let weeklyMajorsList = [];
            try {
                if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(2);
                const weeklyResult = await fetchUsgsData(USGS_API_URL_WEEK);
                if (!isMounted) return;

                if (!weeklyResult.error && weeklyResult.features) {
                    if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(3);
                    const weeklyData = weeklyResult.features;
                    const last72HoursData = filterByTime(weeklyData, 72);
                    setEarthquakesLast72Hours(last72HoursData);
                    setPrev24HourData(filterByTime(weeklyData, 48, 24));
                    const last7DaysData = filterByTime(weeklyData, 7 * 24);
                    setEarthquakesLast7Days(last7DaysData);

                    const sortedForGlobe = [...last72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                    setGlobeEarthquakes(sortedForGlobe.slice(0, 900));

                    weeklyMajorsList = weeklyData.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                    const latestWeeklyMajor = weeklyMajorsList.length > 0 ? weeklyMajorsList[0] : null;
                    if (latestWeeklyMajor) {
                         if (!currentLocalLastMajorQuake || latestWeeklyMajor.properties.time > currentLocalLastMajorQuake.properties.time) {
                            currentLocalLastMajorQuake = latestWeeklyMajor;
                        }
                    }

                    let consolidatedMajors = [];
                    // majD (from daily fetch, now in scope) is already sorted by time, newest first.
                    // weeklyMajorsList is also sorted by time, newest first.
                    if (majD.length > 0) consolidatedMajors.push(...majD); // Add ALL major quakes from daily
                    consolidatedMajors.push(...weeklyMajorsList); // Add ALL major quakes from weekly
                    // Add pre-existing lastMajorQuake if it's not already included and potentially newer than fetched ones
                    // This pre-existing one could be from a previous fetch and might be older than daily/weekly but newer than others not in current feeds.
                    if(lastMajorQuake && !consolidatedMajors.find(q => q.id === lastMajorQuake.id)){
                        consolidatedMajors.push(lastMajorQuake);
                    }

                    consolidatedMajors = consolidatedMajors
                        .sort((a,b) => b.properties.time - a.properties.time)
                        .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id)); // Deduplicate

                    const newLastMajorQuake = consolidatedMajors.length > 0 ? consolidatedMajors[0] : null;
                    const newPreviousMajorQuake = consolidatedMajors.length > 1 ? consolidatedMajors[1] : null;

                    currentLocalLastMajorQuake = newLastMajorQuake;
                    currentLocalPreviousMajorQuake = newPreviousMajorQuake;


                    if (newLastMajorQuake && newPreviousMajorQuake) {
                        currentLocalTimeBetween = newLastMajorQuake.properties.time - newPreviousMajorQuake.properties.time;
                    } else {
                        currentLocalTimeBetween = null;
                    }
                } else {
                     weeklyErrorMsg = weeklyResult?.error?.message || "Weekly data features are missing or an error occurred.";
                }
            } catch (e) { // This catch is for unexpected errors in processing, not fetch errors handled by fetchUsgsData
                if (!isMounted) return;
                weeklyErrorMsg = e.message || "An unexpected error occurred processing weekly data.";
            }
            finally {
                if (isMounted) {
                    setIsLoadingWeekly(false);
                    setLastMajorQuake(currentLocalLastMajorQuake);
                    setPreviousMajorQuake(currentLocalPreviousMajorQuake);
                    setTimeBetweenPreviousMajorQuakes(currentLocalTimeBetween);

                    if (dailyErrorMsg && weeklyErrorMsg) {
                        setError("Failed to fetch critical earthquake data. Some features may be unavailable.");
                    } else if (dailyErrorMsg) {
                        setError(`Daily data error: ${dailyErrorMsg}.`);
                    } else if (weeklyErrorMsg) {
                        setError(`Weekly data error: ${weeklyErrorMsg}.`);
                    } else {
                        setError(null);
                    }
                    if (isInitialAppLoadRef.current) {
                        isInitialAppLoadRef.current = false;
                    }
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
    }, []); // Dependencies removed as fetchDataCb is now imported and orchestrateInitialDataLoad is defined within useEffect

     // Update loading message
    useEffect(() => {
        let messageInterval;
        if (isInitialAppLoadRef.current && (isLoadingDaily || isLoadingWeekly)) {
            messageInterval = setInterval(() => {
                setLoadingMessageIndex(prevIndex => (prevIndex + 1) % currentLoadingMessages.length);
            }, LOADING_MESSAGE_INTERVAL_MS);
        }
        return () => clearInterval(messageInterval);
    }, [isLoadingDaily, isLoadingWeekly, currentLoadingMessages.length]);


    const isLoadingInitialData = useMemo(() => (isLoadingDaily || isLoadingWeekly) && isInitialAppLoadRef.current, [isLoadingDaily, isLoadingWeekly]);

    const currentLoadingMessage = useMemo(() => currentLoadingMessages[loadingMessageIndex], [currentLoadingMessages, loadingMessageIndex]);

    return {
        isLoadingDaily,
        isLoadingWeekly,
        isLoadingInitialData,
        error,
        dataFetchTime,
        lastUpdated,
        earthquakesLastHour,
        earthquakesPriorHour,
        earthquakesLast24Hours,
        earthquakesLast72Hours,
        earthquakesLast7Days,
        prev24HourData,
        globeEarthquakes,
        hasRecentTsunamiWarning,
        highestRecentAlert,
        activeAlertTriggeringQuakes,
        lastMajorQuake,
        setLastMajorQuake, // Expose setters if HomePage needs to modify them based on other data (e.g. monthly)
        previousMajorQuake,
        setPreviousMajorQuake,
        timeBetweenPreviousMajorQuakes,
        setTimeBetweenPreviousMajorQuakes,
        currentLoadingMessage,
        isInitialAppLoad: isInitialAppLoadRef.current
    };
};

export default useEarthquakeData;
