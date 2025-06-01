import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    REFRESH_INTERVAL_MS,
    MAJOR_QUAKE_THRESHOLD,
    ALERT_LEVELS,
    INITIAL_LOADING_MESSAGES,
    LOADING_MESSAGE_INTERVAL_MS
} from '../constants/appConstants';

const useEarthquakeData = (fetchDataCb) => {
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
            // Preserve lastMajorQuake across fetches until a newer one is found
            let currentLocalLastMajorQuake = lastMajorQuake;
            let currentLocalPreviousMajorQuake = previousMajorQuake;
            let currentLocalTimeBetween = timeBetweenPreviousMajorQuakes;


            let dailyErrorMsg = null;
            let weeklyErrorMsg = null;

            try {
                if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(0);
                const dailyRes = await fetchDataCb(USGS_API_URL_DAY);
                if (!isMounted) return;

                if (dailyRes?.features) {
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

                    const majD = dD.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD).sort((a, b) => b.properties.time - a.properties.time);
                    dailyMajor = majD.length > 0 ? majD[0] : null;
                    if (dailyMajor) {
                        if (!currentLocalLastMajorQuake || dailyMajor.properties.time > currentLocalLastMajorQuake.properties.time) {
                            currentLocalLastMajorQuake = dailyMajor;
                        }
                    }
                    setDataFetchTime(nowForFiltering);
                    setLastUpdated(new Date(dailyRes.metadata?.generated || nowForFiltering).toLocaleString());
                } else {
                    dailyErrorMsg = dailyRes?.metadata?.errorMessage || "Daily data features are missing.";
                }
            } catch (e) {
                if (!isMounted) return;
                dailyErrorMsg = e.message;
            }
            finally { if (isMounted) setIsLoadingDaily(false); }

            let weeklyMajorsList = [];
            try {
                if (isMounted && isInitialAppLoadRef.current) setLoadingMessageIndex(2);
                const weeklyResult = await fetchDataCb(USGS_API_URL_WEEK);
                if (!isMounted) return;

                if (weeklyResult?.features) {
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
                    if (dailyMajor) consolidatedMajors.push(dailyMajor); // From current day fetch
                    consolidatedMajors = [...consolidatedMajors, ...weeklyMajorsList]; // From current week fetch
                    // Add pre-existing lastMajorQuake if it's not already included and potentially newer than fetched ones
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
                     weeklyErrorMsg = weeklyResult?.metadata?.errorMessage || "Weekly data features are missing.";
                }
            } catch (e) {
                if (!isMounted) return;
                weeklyErrorMsg = e.message;
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
    }, [fetchDataCb]); // Dependencies: fetchDataCb. Other states are managed internally.

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
