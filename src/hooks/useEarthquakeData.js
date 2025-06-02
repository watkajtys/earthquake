import { useEffect, useCallback, useRef, useContext } from 'react';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';
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
 * Custom hook to manage the fetching and processing of daily and weekly earthquake data from USGS.
 * It updates the centralized state in EarthquakeDataContext.
 *
 * @param {function} fetchDataCb - Callback function responsible for fetching data from a given URL.
 */
const useEarthquakeData = (fetchDataCb) => {
    const context = useContext(EarthquakeDataContext);
    const loadingMessageIndexRef = useRef(0); // For cycling through messages

    // Destructure necessary states and setters from context
    const {
        // States needed for logic (read-only in this hook's main flow)
        lastMajorQuake, // Needed to compare with new potential major quakes
        previousMajorQuake, // Needed to compare
        timeBetweenPreviousMajorQuakes, // Needed to compare
        isInitialAppLoad, // To control initial loading behavior
        isLoadingDaily, // To control loading message effect
        isLoadingWeekly, // To control loading message effect

        // Setters from context
        setIsLoadingDaily,
        setIsLoadingWeekly,
        setError,
        setDataFetchTime,
        setLastUpdated,
        setEarthquakesLastHour,
        setEarthquakesPriorHour,
        setEarthquakesLast24Hours,
        setEarthquakesLast72Hours,
        setEarthquakesLast7Days,
        setPrev24HourData,
        setGlobeEarthquakes,
        setHasRecentTsunamiWarning,
        setHighestRecentAlert,
        setActiveAlertTriggeringQuakes,
        setLastMajorQuake,
        setPreviousMajorQuake,
        setTimeBetweenPreviousMajorQuakes,
        setCurrentLoadingMessage,
        setIsInitialAppLoad
    } = context;


    useEffect(() => {
        let isMounted = true;
        const orchestrateInitialDataLoad = async () => {
            if (!isMounted) return;

            if (!isInitialAppLoad) { // For refreshes
                setIsLoadingDaily(true);
                setIsLoadingWeekly(true);
            } else { // For initial load
                // Reset loading message index for the initial load sequence
                loadingMessageIndexRef.current = 0;
                setCurrentLoadingMessage(INITIAL_LOADING_MESSAGES[0]);
            }

            setError(null); 

            // Initialize data states to empty arrays via context
            // This is important for refreshes to clear old data before new data comes in
            // and prevent errors if fetches fail partially.
            setEarthquakesLastHour([]);
            setEarthquakesPriorHour([]);
            setEarthquakesLast24Hours([]);
            setEarthquakesLast72Hours([]);
            setEarthquakesLast7Days([]);
            setPrev24HourData([]);
            setGlobeEarthquakes([]);
            setActiveAlertTriggeringQuakes([]);
            // Do not reset major quake times here, they should persist or be updated carefully

            const nowForFiltering = Date.now();
            const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0) => {
                if (!Array.isArray(data)) return [];
                return data.filter(q =>
                    q.properties.time >= (nowForFiltering - hoursAgoStart * 36e5) &&
                    q.properties.time < (nowForFiltering - hoursAgoEnd * 36e5)
                );
            };

            let dailyErrorMsg = null;
            let weeklyErrorMsg = null;
            
            // Preserve lastMajorQuake across fetches until a newer one is found by this fetch cycle
            let currentCycleLastMajorQuake = lastMajorQuake;
            let currentCyclePreviousMajorQuake = previousMajorQuake;
            let currentCycleTimeBetween = timeBetweenPreviousMajorQuakes;

            try {
                if (isMounted && isInitialAppLoad) setCurrentLoadingMessage(INITIAL_LOADING_MESSAGES[0]);
                const dailyRes = await fetchDataCb(USGS_API_URL_DAY);
                if (!isMounted) return;

                if (dailyRes?.features) {
                    if (isMounted && isInitialAppLoad) setCurrentLoadingMessage(INITIAL_LOADING_MESSAGES[1]);
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
                    
                    setDataFetchTime(nowForFiltering); // Set fetch time for this batch
                    setLastUpdated(new Date(dailyRes.metadata?.generated || nowForFiltering).toLocaleString());
                } else {
                    dailyErrorMsg = dailyRes?.metadata?.errorMessage || "Daily data features are missing.";
                }
            } catch (e) {
                if (!isMounted) return;
                dailyErrorMsg = e.message;
            }
            finally { if (isMounted) setIsLoadingDaily(false); }

            try {
                if (isMounted && isInitialAppLoad) setCurrentLoadingMessage(INITIAL_LOADING_MESSAGES[2]);
                const weeklyResult = await fetchDataCb(USGS_API_URL_WEEK);
                if (!isMounted) return;

                if (weeklyResult?.features) {
                    if (isMounted && isInitialAppLoad) setCurrentLoadingMessage(INITIAL_LOADING_MESSAGES[3]);
                    const weeklyData = weeklyResult.features;
                    const last72HoursData = filterByTime(weeklyData, 72);
                    setEarthquakesLast72Hours(last72HoursData);
                    setPrev24HourData(filterByTime(weeklyData, 48, 24));
                    const last7DaysData = filterByTime(weeklyData, 7 * 24);
                    setEarthquakesLast7Days(last7DaysData);

                    const sortedForGlobe = [...last72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0));
                    setGlobeEarthquakes(sortedForGlobe.slice(0, 900));

                    // Major quake logic - needs careful state management via context
                    const allFetchedQuakes = [...(dailyRes?.features || []), ...weeklyData];
                    const majorQuakesFetched = allFetchedQuakes
                        .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD)
                        .sort((a, b) => b.properties.time - a.properties.time);
                    
                    let consolidatedMajors = [];
                    if (majorQuakesFetched.length > 0) consolidatedMajors.push(...majorQuakesFetched);
                    
                    // Include existing major quakes from context if not already in this fetch's list
                    if (lastMajorQuake && !consolidatedMajors.find(q => q.id === lastMajorQuake.id)) {
                        consolidatedMajors.push(lastMajorQuake);
                    }
                    if (previousMajorQuake && !consolidatedMajors.find(q => q.id === previousMajorQuake.id)) {
                        consolidatedMajors.push(previousMajorQuake);
                    }

                    consolidatedMajors = consolidatedMajors
                        .sort((a,b) => b.properties.time - a.properties.time)
                        .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id)); // Deduplicate

                    const newLastMajor = consolidatedMajors.length > 0 ? consolidatedMajors[0] : null;
                    const newPreviousMajor = consolidatedMajors.length > 1 ? consolidatedMajors[1] : null;

                    currentCycleLastMajorQuake = newLastMajor;
                    currentCyclePreviousMajorQuake = newPreviousMajor;

                    if (newLastMajor && newPreviousMajor) {
                        currentCycleTimeBetween = newLastMajor.properties.time - newPreviousMajor.properties.time;
                    } else {
                        currentCycleTimeBetween = null;
                    }
                } else {
                     weeklyErrorMsg = weeklyResult?.metadata?.errorMessage || "Weekly data features are missing.";
                }
            } catch (e) {
                if (!isMounted) return;
                weeklyErrorMsg = e.message;
            }
            finally {
                if (isMounted) {
                    setIsLoadingWeekly(false);
                    // Update major quake states through context
                    setLastMajorQuake(currentCycleLastMajorQuake);
                    setPreviousMajorQuake(currentCyclePreviousMajorQuake);
                    setTimeBetweenPreviousMajorQuakes(currentCycleTimeBetween);

                    let finalError = null;
                    if (dailyErrorMsg && weeklyErrorMsg) {
                        finalError = "Failed to fetch critical earthquake data. Some features may be unavailable.";
                    } else if (dailyErrorMsg) {
                        finalError = `Daily data error: ${dailyErrorMsg}. Some features may be affected.`;
                    } else if (weeklyErrorMsg) {
                        finalError = `Weekly data error: ${weeklyErrorMsg}. Some features may be affected.`;
                    }
                    // setError(null) is already called at the beginning of orchestrateInitialDataLoad,
                    // so if finalError remains null, the error state is effectively cleared.
                    setError(finalError); 

                    if (isInitialAppLoad) {
                        setIsInitialAppLoad(false); // Mark initial load as complete
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
    }, [
        fetchDataCb, 
        // Context states that influence processing logic directly (not setters)
        isInitialAppLoad, 
        lastMajorQuake, 
        previousMajorQuake,
        // Context setters (stable, but good practice to list if they were unstable)
        // For this case, they are stable, so primarily fetchDataCb and key context values drive re-runs.
        // Explicitly listing setters used, though ESLint might not require if they are known stable.
        setIsLoadingDaily, setIsLoadingWeekly, setError, setDataFetchTime, setLastUpdated,
        setEarthquakesLastHour, setEarthquakesPriorHour, setEarthquakesLast24Hours,
        setEarthquakesLast72Hours, setEarthquakesLast7Days, setPrev24HourData,
        setGlobeEarthquakes, setHasRecentTsunamiWarning, setHighestRecentAlert,
        setActiveAlertTriggeringQuakes, setLastMajorQuake, setPreviousMajorQuake,
        setTimeBetweenPreviousMajorQuakes, setCurrentLoadingMessage, setIsInitialAppLoad
    ]);

     // Update loading message during initial load
    useEffect(() => {
        let messageInterval;
        if (isInitialAppLoad && (isLoadingDaily || isLoadingWeekly)) {
            messageInterval = setInterval(() => {
                loadingMessageIndexRef.current = (loadingMessageIndexRef.current + 1) % INITIAL_LOADING_MESSAGES.length;
                setCurrentLoadingMessage(INITIAL_LOADING_MESSAGES[loadingMessageIndexRef.current]);
            }, LOADING_MESSAGE_INTERVAL_MS);
        } else if (!isInitialAppLoad && messageInterval) {
            // Clear interval if it's somehow still running after initial load
            clearInterval(messageInterval);
        }
        return () => clearInterval(messageInterval);
    }, [isInitialAppLoad, isLoadingDaily, isLoadingWeekly, setCurrentLoadingMessage]);

    // The hook no longer returns state values.
    // Its role is to perform side effects (fetching data, updating context).
    return null; // Or return {};
};

export default useEarthquakeData;
