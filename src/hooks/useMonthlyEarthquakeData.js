import { useState, useCallback } from 'react';
import { USGS_API_URL_MONTH, MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';

const useMonthlyEarthquakeData = (
    fetchDataCb,
    currentLastMajorQuake, // from useEarthquakeData
    setLastMajorQuake,     // from useEarthquakeData via HomePage
    setPreviousMajorQuake, // from useEarthquakeData via HomePage
    setTimeBetweenPreviousMajorQuakes // from useEarthquakeData via HomePage
) => {
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
    const [hasAttemptedMonthlyLoad, setHasAttemptedMonthlyLoad] = useState(false);
    const [monthlyError, setMonthlyError] = useState(null);
    const [allEarthquakes, setAllEarthquakes] = useState([]);
    const [earthquakesLast14Days, setEarthquakesLast14Days] = useState([]);
    const [earthquakesLast30Days, setEarthquakesLast30Days] = useState([]);
    const [prev7DayData, setPrev7DayData] = useState([]);
    const [prev14DayData, setPrev14DayData] = useState([]);

    const loadMonthlyData = useCallback(async () => {
        setIsLoadingMonthly(true);
        setHasAttemptedMonthlyLoad(true);
        setMonthlyError(null);

        // Initialize to empty arrays in case of error
        setAllEarthquakes([]);
        setEarthquakesLast14Days([]);
        setEarthquakesLast30Days([]);
        setPrev7DayData([]);
        setPrev14DayData([]);

        const nowForFiltering = Date.now();
        const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0) => {
            if (!Array.isArray(data)) return [];
            return data.filter(q =>
                q.properties.time >= (nowForFiltering - (hoursAgoStart * 24 * 36e5)) && // days to ms
                q.properties.time < (nowForFiltering - (hoursAgoEnd * 24 * 36e5))   // days to ms
            );
        };

        try {
            const monthlyResult = await fetchDataCb(USGS_API_URL_MONTH);
            if (monthlyResult?.features && monthlyResult.features.length > 0) {
                const monthlyData = monthlyResult.features;
                setAllEarthquakes(monthlyData);

                setEarthquakesLast14Days(filterByTime(monthlyData, 14, 0));
                setEarthquakesLast30Days(filterByTime(monthlyData, 30, 0));

                // prev7DayData: quakes between 7 and 14 days ago
                setPrev7DayData(filterByTime(monthlyData, 14, 7));
                // prev14DayData: quakes between 14 and 28 days ago (to compare with a 14-day period)
                setPrev14DayData(filterByTime(monthlyData, 28, 14));

                const majorQuakesMonthly = monthlyData
                    .filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD)
                    .sort((a, b) => b.properties.time - a.properties.time);

                let consolidatedMajors = [...majorQuakesMonthly];
                if (currentLastMajorQuake && !consolidatedMajors.find(q => q.id === currentLastMajorQuake.id)) {
                    consolidatedMajors.push(currentLastMajorQuake);
                }

                consolidatedMajors = consolidatedMajors
                    .sort((a,b) => b.properties.time - a.properties.time)
                    .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id));

                const finalLastMajorQuake = consolidatedMajors.length > 0 ? consolidatedMajors[0] : null;
                const finalPreviousMajorQuake = consolidatedMajors.length > 1 ? consolidatedMajors[1] : null;

                // Update states via setters passed from HomePage (originating from useEarthquakeData)
                setLastMajorQuake(finalLastMajorQuake);
                setPreviousMajorQuake(finalPreviousMajorQuake);

                if (finalLastMajorQuake && finalPreviousMajorQuake) {
                    setTimeBetweenPreviousMajorQuakes(finalLastMajorQuake.properties.time - finalPreviousMajorQuake.properties.time);
                } else {
                    setTimeBetweenPreviousMajorQuakes(null);
                }

            } else {
                console.error("Monthly data features are missing or empty in the response:", monthlyResult);
                setMonthlyError(monthlyResult?.metadata?.errorMessage || "Monthly data is currently unavailable or incomplete.");
            }
        } catch (e) {
            console.error("Failed to fetch monthly data:", e);
            setMonthlyError(`Monthly Data Error: ${e.message}`);
        } finally {
            setIsLoadingMonthly(false);
        }
    }, [fetchDataCb, currentLastMajorQuake, setLastMajorQuake, setPreviousMajorQuake, setTimeBetweenPreviousMajorQuakes]);

    return {
        isLoadingMonthly,
        hasAttemptedMonthlyLoad,
        monthlyError,
        allEarthquakes,
        earthquakesLast14Days,
        earthquakesLast30Days,
        prev7DayData,
        prev14DayData,
        loadMonthlyData,
    };
};

export default useMonthlyEarthquakeData;
