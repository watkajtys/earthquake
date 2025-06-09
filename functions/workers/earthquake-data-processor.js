// functions/workers/earthquake-data-processor.js
// This worker is responsible for periodically fetching and processing earthquake data.

// --- Constants (copied from functions/api/processed-earthquake-data.js) ---
const USGS_API_URL_DAY = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const USGS_API_URL_WEEK = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson";
const USGS_API_URL_MONTH = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson";

const FEELABLE_QUAKE_THRESHOLD = 2.5;
const MAJOR_QUAKE_THRESHOLD = 4.5;

const ALERT_LEVELS = {
    RED: { text: "RED", colorClass: "bg-red-100 border-red-500 text-red-700", detailsColorClass: "bg-red-50 border-red-400 text-red-800", description: "Potential for 1,000+ fatalities / $1B+ losses.", level: 0 },
    ORANGE: { text: "ORANGE", colorClass: "bg-orange-100 border-orange-500 text-orange-700", detailsColorClass: "bg-orange-50 border-orange-400 text-orange-800", description: "Potential for 100-999 fatalities / $100M-$1B losses.", level: 1 },
    YELLOW: { text: "YELLOW", colorClass: "bg-yellow-100 border-yellow-500 text-yellow-700", detailsColorClass: "bg-yellow-50 border-yellow-400 text-yellow-800", description: "Potential for 1-99 fatalities / $1M-$100M losses.", level: 2 },
    GREEN: { text: "GREEN", colorClass: "bg-green-100 border-green-500 text-green-700", detailsColorClass: "bg-green-50 border-green-400 text-green-800", description: "No significant impact expected (<1 fatality / <$1M losses).", level: 3 }
};

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

const SCATTER_SAMPLING_THRESHOLD_7_DAYS = 300;
const SCATTER_SAMPLING_THRESHOLD_14_DAYS = 500; // Note: Original file had 14_DAYS, prompt implies this might be a typo or needs adjustment for 30d context. Keeping as is from source.
const SCATTER_SAMPLING_THRESHOLD_30_DAYS = 700;

const getProcessedDataKvKey = (period) => `latest_processed_data_v1_${period}`;


// --- Utility Functions (copied from functions/api/processed-earthquake-data.js) ---

// getMagnitudeColor
const getMagnitudeColor = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return '#ccc';
    if (magnitude < 1) return '#70db70';
    if (magnitude < 2) return '#90ee90';
    if (magnitude < 3) return '#ffff00';
    if (magnitude < 4) return '#ffd700';
    if (magnitude < 5) return '#ffa500';
    if (magnitude < 6) return '#ff8c00';
    if (magnitude < 7) return '#ff4500';
    if (magnitude < 8) return '#ff0000';
    return '#dc143c';
};

// filterByTime
const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - hoursAgoStart * 3600000;
    const endTime = now - hoursAgoEnd * 3600000;
    return data.filter(q => q.properties && typeof q.properties.time === 'number' && q.properties.time >= startTime && q.properties.time < endTime);
};

// filterMonthlyByTime
const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - (daysAgoStart * 24 * 3600000);
    const endTime = now - (daysAgoEnd * 24 * 3600000);
    return data.filter(q => q.properties && typeof q.properties.time === 'number' && q.properties.time >= startTime && q.properties.time < endTime);
};

// consolidateMajorQuakesLogic
const consolidateMajorQuakesLogic = (currentLastMajor, currentPreviousMajor, newMajors) => {
    let consolidated = newMajors ? [...newMajors] : [];
    if (currentLastMajor && !consolidated.find(q => q.id === currentLastMajor.id)) {
        consolidated.push(currentLastMajor);
    }
    if (currentPreviousMajor && !consolidated.find(q => q.id === currentPreviousMajor.id)) {
        consolidated.push(currentPreviousMajor);
    }
    consolidated = consolidated
        .filter(q => q && q.id && q.properties && typeof q.properties.time === 'number')
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

// sampleArray
const sampleArray = (array, sampleSize) => {
    if (!Array.isArray(array) || array.length === 0) return [];
    if (sampleSize <= 0) return [];
    if (sampleSize >= array.length) return [...array];

    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, sampleSize);
};

// sampleArrayWithPriority
function sampleArrayWithPriority(fullArray, sampleSize, priorityMagnitudeThreshold) {
    if (!fullArray || fullArray.length === 0) return [];
    if (sampleSize <= 0) return [];

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

// formatDateForTimeline
const formatDateForTimeline = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

// getInitialDailyCounts
const getInitialDailyCounts = (numDays, baseTime) => {
    const countsMap = new Map();
    for (let i = 0; i < numDays; i++) {
        const date = new Date(baseTime);
        date.setUTCDate(date.getUTCDate() - (numDays - 1 - i));
        const dateString = formatDateForTimeline(date.getTime());
        countsMap.set(dateString, { dateString: dateString, count: 0 });
    }
    return countsMap;
};

// calculateMagnitudeDistribution
const calculateMagnitudeDistribution = (earthquakes) => {
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

// --- Adapted fetchWithProxy ---
// Needs 'env' passed to it to access PROXY_BASE_URL
const fetchWithProxy = async (usgsUrl, urlSourceName, env) => {
    const sourceName = "earthquake-data-processor-worker-fetch"; // More specific source for logging
    const proxyBaseUrl = env.PROXY_BASE_URL || '/'; // Default to relative if not set
    let fullProxyUrl;

    try {
      // Check if proxyBaseUrl is a full URL or just a path
      if (proxyBaseUrl.startsWith('http://') || proxyBaseUrl.startsWith('https://')) {
        fullProxyUrl = new URL("api/usgs-proxy", proxyBaseUrl);
      } else {
        // This case is tricky for workers as they don't have a "current request origin" like an API route.
        // If PROXY_BASE_URL is a path like '/', this won't work unless the worker itself is served from a path
        // that makes '/api/usgs-proxy' resolvable.
        // For robustness, PROXY_BASE_URL should ideally be a full URL for scheduled workers.
        // Using a placeholder or requiring PROXY_BASE_URL to be set for scheduled tasks is safer.
        if (!env.PROXY_BASE_URL) {
            console.warn(`[${sourceName}] PROXY_BASE_URL is not set and worker is trying to use relative path for proxy. This might fail. Please set PROXY_BASE_URL in worker environment.`);
            // Fallback to a non-functional placeholder or attempt relative, which might fail.
            // For now, let's assume it's a path that might work if deployed under the same domain.
            // This will likely need configuration during deployment.
            fullProxyUrl = new URL("api/usgs-proxy", "https://placeholder-worker-origin.com"); // Will use placeholder if PROXY_BASE_URL not set
            console.warn(`[${sourceName}] Attempting to use proxy at ${fullProxyUrl.toString()} (derived from relative path or placeholder)`);
        } else {
             // If PROXY_BASE_URL is just a path, it needs a base.
             // This part remains problematic if PROXY_BASE_URL is e.g. "/" without a proper base.
             // For now, best effort:
             console.warn(`[${sourceName}] PROXY_BASE_URL is a path ('${proxyBaseUrl}'). This should ideally be a full URL for workers. Attempting to resolve 'api/usgs-proxy' against it.`);
             fullProxyUrl = new URL("api/usgs-proxy", proxyBaseUrl.startsWith('/') ? `https://placeholder-for-relative-path.com${proxyBaseUrl}` : proxyBaseUrl);

        }
      }
    } catch (e) {
        console.error(`[${sourceName}] Invalid PROXY_BASE_URL or usgsUrl: ${e.message}. Base: '${proxyBaseUrl}', Target: 'api/usgs-proxy'`);
        throw new Error(`Invalid URL configuration for proxy: ${e.message}`);
    }

    fullProxyUrl.searchParams.set("apiUrl", usgsUrl);

    try {
        const response = await fetch(fullProxyUrl.toString());
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[${sourceName}] Error from usgs-proxy for ${urlSourceName} (${usgsUrl}): ${response.status}`, errorBody);
            throw new Error(`Failed to fetch ${urlSourceName} via proxy: ${response.status} - ${errorBody}`);
        }
        return await response.json();
    } catch (e) {
        console.error(`[${sourceName}] Network error fetching ${urlSourceName} via proxy (${fullProxyUrl.toString()}): ${e.message}`, e);
        throw e; // Re-throw after logging
    }
};


// --- Main Scheduled Worker Logic ---
export default {
  async scheduled(controller, env, ctx) {
    const sourceName = "earthquake-data-processor-worker";
    console.log(`[${sourceName}] Starting scheduled data processing.`);

    const periodsToProcess = ["24h", "7d", "30d"];

    try {
      // Fetch all raw data ONCE
      // fetchWithProxy now needs 'env'
      const [rawDayData, rawWeekData, rawMonthData] = await Promise.all([
        fetchWithProxy(USGS_API_URL_DAY, "USGS_DAY", env),
        fetchWithProxy(USGS_API_URL_WEEK, "USGS_WEEK", env),
        fetchWithProxy(USGS_API_URL_MONTH, "USGS_MONTH", env)
      ]);

      if (!rawDayData || !Array.isArray(rawDayData.features)) {
        console.error(`[${sourceName}] Invalid or missing features in daily data. Processing halted.`);
        return; // Exit if critical data is missing
      }
      if (!rawWeekData || !Array.isArray(rawWeekData.features)) {
        console.error(`[${sourceName}] Invalid or missing features in weekly data. Processing halted.`);
        return;
      }
      if (!rawMonthData || !Array.isArray(rawMonthData.features)) {
        console.error(`[${sourceName}] Invalid or missing features in monthly data. Processing halted.`);
        return;
      }

      for (const period of periodsToProcess) {
        console.log(`[${sourceName}] Processing data for period: ${period}`);
        const maxPeriod = period; // This is the 'requestedPeriod' equivalent
        const currentDataPeriodKvKey = getProcessedDataKvKey(maxPeriod);
        const DB = env.DB;
        const PROCESSED_DATA_KV = env.PROCESSED_DATA_KV;

        // --- Start of processing logic adapted from onRequestGet of processed-earthquake-data.js ---
        const now = Date.now();
        let allProcessedData = {
            dataFetchTime: now,
            lastUpdated: new Date(rawDayData.metadata?.generated || now).toLocaleString('en-US', { timeZone: 'UTC' }),
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
            globeEarthquakes: [],
            prev24HourData: [],
            earthquakesLast7Days: [],
            dailyCounts7Days: Array.from(getInitialDailyCounts(7, now).values()),
            sampledEarthquakesLast7Days: [],
            magnitudeDistribution7Days: calculateMagnitudeDistribution([]),
            feelableQuakes7Days_ctx: [],
            significantQuakes7Days_ctx: [],
            prev7DayData: [],
            allEarthquakesMonth: [],
            earthquakesLast14Days: [],
            earthquakesLast30Days: [],
            dailyCounts14Days: Array.from(getInitialDailyCounts(14, now).values()),
            dailyCounts30Days: Array.from(getInitialDailyCounts(30, now).values()),
            sampledEarthquakesLast14Days: [],
            sampledEarthquakesLast30Days: [],
            magnitudeDistribution14Days: calculateMagnitudeDistribution([]),
            magnitudeDistribution30Days: calculateMagnitudeDistribution([]),
            prev14DayData: [],
            feelableQuakes30Days_ctx: [],
            significantQuakes30Days_ctx: [],
        };

        const processedQuakeIds = new Set();
        const allPotentialMajorQuakes = [];
        const tempGlobeQuakesMap = new Map();

        const time24HoursAgo = now - 24 * 3600000;
        const time1HourAgo = now - 1 * 3600000;
        const time2HoursAgo = now - 2 * 3600000;
        const time72HoursAgo = now - 72 * 3600000;
        const time48HoursAgo = now - 48 * 3600000;
        const time7DaysAgo = now - 7 * 24 * 3600000;
        const time14DaysAgo = now - 14 * 24 * 3600000;
        const time28DaysAgo = now - 28 * 24 * 3600000; // Used for prev14DayData
        const time30DaysAgo = now - 30 * 24 * 3600000;

        const dailyCounts30DaysMap = getInitialDailyCounts(30, now);
        const dailyCounts14DaysMap = getInitialDailyCounts(14, now);
        const dailyCounts7DaysMap = getInitialDailyCounts(7, now);

        const magnitudeDistribution30Days = MAGNITUDE_RANGES.map(range => ({ name: range.name, count: 0, color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min) }));
        const magnitudeDistribution14Days = MAGNITUDE_RANGES.map(range => ({ name: range.name, count: 0, color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min) }));
        const magnitudeDistribution7Days = MAGNITUDE_RANGES.map(range => ({ name: range.name, count: 0, color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min) }));

        let tempEarthquakesLast30Days = [];
        let tempEarthquakesLast14Days = [];
        let tempEarthquakesLast7Days = [];

        let tempFeelableQuakes30Days_ctx = [];
        let tempSignificantQuakes30Days_ctx = [];
        let tempFeelableQuakes7Days_ctx = [];
        let tempSignificantQuakes7Days_ctx = [];

        let tempPrev14DayData = [];
        let tempPrev7DayData = [];

        // --- Monthly Features Processing (based on maxPeriod) ---
        if (maxPeriod === "30d" && rawMonthData && rawMonthData.features) {
            allProcessedData.allEarthquakesMonth = rawMonthData.features; // Assign all month data if period is 30d
            rawMonthData.features.forEach(quake => {
                if (!quake || !quake.properties || typeof quake.properties.time !== 'number' || typeof quake.properties.mag !== 'number') return;
                const { id, properties } = quake;
                const { time, mag } = properties;

                const isInLast30Days = time >= time30DaysAgo;
                const isInLast14Days = time >= time14DaysAgo;
                const isInPrev14DayWindow = time >= time28DaysAgo && time < time14DaysAgo;
                const isInPrev7DayWindow = time >= time14DaysAgo && time < time7DaysAgo;

                if (isInLast30Days) {
                    tempEarthquakesLast30Days.push(quake);
                    processedQuakeIds.add(id);
                    const dateString30 = formatDateForTimeline(time);
                    const dayEntry30 = dailyCounts30DaysMap.get(dateString30);
                    if (dayEntry30) dayEntry30.count++;
                    for (const range of magnitudeDistribution30Days) {
                        const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
                        if (mag >= rangeDetails.min && mag <= rangeDetails.max) { range.count++; break; }
                    }
                    if (mag >= FEELABLE_QUAKE_THRESHOLD) tempFeelableQuakes30Days_ctx.push(quake);
                    if (mag >= MAJOR_QUAKE_THRESHOLD) tempSignificantQuakes30Days_ctx.push(quake);
                    if (mag >= MAJOR_QUAKE_THRESHOLD) allPotentialMajorQuakes.push(quake);
                }
                if (isInLast14Days) { // This will contribute to 14d data if maxPeriod is 30d
                    tempEarthquakesLast14Days.push(quake);
                    // Only update 14d stats if not already processed by a more specific feed (though month is least specific)
                     if (!processedQuakeIds.has(id) || maxPeriod === "30d") { // ensure these are counted for 30d run for 14d stats
                        const dateString14 = formatDateForTimeline(time);
                        const dayEntry14 = dailyCounts14DaysMap.get(dateString14);
                        if (dayEntry14) dayEntry14.count++;
                        for (const range of magnitudeDistribution14Days) {
                            const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
                            if (mag >= rangeDetails.min && mag <= rangeDetails.max) { range.count++; break; }
                        }
                    }
                }
                if (isInPrev14DayWindow) tempPrev14DayData.push(quake);
                if (isInPrev7DayWindow) tempPrev7DayData.push(quake);
            });
        }

        // --- Weekly Features Processing (based on maxPeriod) ---
        if ((maxPeriod === "7d" || maxPeriod === "30d") && rawWeekData && rawWeekData.features) {
            rawWeekData.features.forEach(quake => {
                if (!quake || !quake.properties || typeof quake.properties.time !== 'number' || typeof quake.properties.mag !== 'number') return;
                const { id, properties } = quake;
                const { time, mag } = properties;

                const isInLast7Days = time >= time7DaysAgo;
                const isInLast72Hours = time >= time72HoursAgo;
                const isInPrev24HourWindow = time >= time48HoursAgo && time < time24HoursAgo;

                if (isInLast7Days) {
                    tempEarthquakesLast7Days.push(quake);
                    if (!processedQuakeIds.has(id)) { // Avoid double counting for stats if processed by month
                        const dateString7 = formatDateForTimeline(time);
                        const dayEntry7 = dailyCounts7DaysMap.get(dateString7);
                        if (dayEntry7) dayEntry7.count++;
                        for (const range of magnitudeDistribution7Days) {
                            const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
                            if (mag >= rangeDetails.min && mag <= rangeDetails.max) { range.count++; break; }
                        }
                        if (mag >= FEELABLE_QUAKE_THRESHOLD) tempFeelableQuakes7Days_ctx.push(quake);
                        if (mag >= MAJOR_QUAKE_THRESHOLD) tempSignificantQuakes7Days_ctx.push(quake);
                    }
                    if (mag >= MAJOR_QUAKE_THRESHOLD) allPotentialMajorQuakes.push(quake);
                    processedQuakeIds.add(id); // Mark as processed by weekly for daily feed check
                }
                if (isInLast72Hours) {
                    tempGlobeQuakesMap.set(id, quake);
                }
                if (isInPrev24HourWindow) {
                    allProcessedData.prev24HourData.push(quake);
                }
            });
        }

        // --- Daily Features Processing (always runs, contributes to all periods) ---
        if (rawDayData && rawDayData.features) {
            rawDayData.features.forEach(quake => {
                if (!quake || !quake.properties || typeof quake.properties.time !== 'number' || typeof quake.properties.mag !== 'number') return;
                const { id, properties } = quake;
                const { time, mag } = properties;

                if (time >= time24HoursAgo) {
                    allProcessedData.earthquakesLast24Hours.push(quake);
                    if (time >= time1HourAgo) {
                        allProcessedData.earthquakesLastHour.push(quake);
                    } else if (time >= time2HoursAgo && time < time1HourAgo) {
                        allProcessedData.earthquakesPriorHour.push(quake);
                    }
                }
                if (time >= time72HoursAgo) {
                    tempGlobeQuakesMap.set(id, quake);
                }
                if (mag >= MAJOR_QUAKE_THRESHOLD) {
                    allPotentialMajorQuakes.push(quake);
                }
                // No need to add to processedQuakeIds here as it's the most granular feed
            });
        }

        // --- Post-Loop Processing & Assignment ---
        const alertsIn24hr = allProcessedData.earthquakesLast24Hours
            .map(q => q.properties.alert)
            .filter(a => a && typeof a === 'string' && a.toLowerCase() !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
        allProcessedData.highestRecentAlert = alertsIn24hr.length > 0
            ? alertsIn24hr.sort((a,b) => (ALERT_LEVELS[a.toUpperCase()]?.level || 99) - (ALERT_LEVELS[b.toUpperCase()]?.level || 99))[0]
            : null;
        allProcessedData.activeAlertTriggeringQuakes = allProcessedData.highestRecentAlert
            ? allProcessedData.earthquakesLast24Hours.filter(q => q.properties.alert === allProcessedData.highestRecentAlert)
            : [];
        allProcessedData.hasRecentTsunamiWarning = allProcessedData.earthquakesLast24Hours.some(q => q.properties.tsunami === 1);
        if (allProcessedData.hasRecentTsunamiWarning) {
            const tsunamiQuakes = allProcessedData.earthquakesLast24Hours
                .filter(q => q.properties.tsunami === 1)
                .sort((a, b) => b.properties.time - a.properties.time);
            if (tsunamiQuakes.length > 0) allProcessedData.tsunamiTriggeringQuake = tsunamiQuakes[0];
        }

        const majorQuakeUpdates = consolidateMajorQuakesLogic(null, null, allPotentialMajorQuakes);
        allProcessedData.lastMajorQuake = majorQuakeUpdates.lastMajorQuake;
        allProcessedData.previousMajorQuake = majorQuakeUpdates.previousMajorQuake;
        allProcessedData.timeBetweenPreviousMajorQuakes = majorQuakeUpdates.timeBetweenPreviousMajorQuakes;

        allProcessedData.earthquakesLast72Hours = Array.from(tempGlobeQuakesMap.values());
        allProcessedData.globeEarthquakes = [...allProcessedData.earthquakesLast72Hours]
            .sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0))
            .slice(0, 900);

        // Populate data based on the current 'maxPeriod' (which is 'period' from the loop)
        if (maxPeriod === "30d") {
            allProcessedData.earthquakesLast30Days = tempEarthquakesLast30Days;
            allProcessedData.dailyCounts30Days = Array.from(dailyCounts30DaysMap.values());
            allProcessedData.magnitudeDistribution30Days = magnitudeDistribution30Days;
            allProcessedData.feelableQuakes30Days_ctx = tempFeelableQuakes30Days_ctx.sort((a,b) => b.properties.time - a.properties.time);
            allProcessedData.significantQuakes30Days_ctx = tempSignificantQuakes30Days_ctx.sort((a,b) => b.properties.time - a.properties.time);
            allProcessedData.sampledEarthquakesLast30Days = sampleArrayWithPriority(tempEarthquakesLast30Days, SCATTER_SAMPLING_THRESHOLD_30_DAYS, MAJOR_QUAKE_THRESHOLD);

            allProcessedData.earthquakesLast14Days = tempEarthquakesLast14Days; // Populated from month for 30d period
            allProcessedData.dailyCounts14Days = Array.from(dailyCounts14DaysMap.values());
            allProcessedData.magnitudeDistribution14Days = magnitudeDistribution14Days;
            allProcessedData.sampledEarthquakesLast14Days = sampleArrayWithPriority(tempEarthquakesLast14Days, SCATTER_SAMPLING_THRESHOLD_14_DAYS, MAJOR_QUAKE_THRESHOLD);

            allProcessedData.prev14DayData = tempPrev14DayData.sort((a,b) => b.properties.time - a.properties.time);
        }

        if (maxPeriod === "30d" || maxPeriod === "7d") {
            allProcessedData.earthquakesLast7Days = tempEarthquakesLast7Days;
            allProcessedData.dailyCounts7Days = Array.from(dailyCounts7DaysMap.values());
            allProcessedData.magnitudeDistribution7Days = magnitudeDistribution7Days;
            allProcessedData.feelableQuakes7Days_ctx = tempFeelableQuakes7Days_ctx.sort((a,b) => b.properties.time - a.properties.time);
            allProcessedData.significantQuakes7Days_ctx = tempSignificantQuakes7Days_ctx.sort((a,b) => b.properties.time - a.properties.time);
            allProcessedData.sampledEarthquakesLast7Days = sampleArrayWithPriority(tempEarthquakesLast7Days, SCATTER_SAMPLING_THRESHOLD_7_DAYS, MAJOR_QUAKE_THRESHOLD);

            // prev7DayData: if 30d, it's from monthly. if 7d, it's specifically filtered.
            if (maxPeriod === "7d") {
                 // For 7d period, prev7DayData is 14-7 days ago from MONTHLY feed (as per original logic)
                 allProcessedData.prev7DayData = filterMonthlyByTime(rawMonthData.features, 14, 7, now).sort((a,b) => b.properties.time - a.properties.time);
            } else { // maxPeriod === "30d"
                 allProcessedData.prev7DayData = tempPrev7DayData.sort((a,b) => b.properties.time - a.properties.time);
            }
        }

        // Cleanup: Nullify or empty data not relevant to the current processing period 'maxPeriod'
        if (maxPeriod === "24h") {
            allProcessedData.allEarthquakesMonth = [];
            allProcessedData.earthquakesLast30Days = []; allProcessedData.dailyCounts30Days = Array.from(getInitialDailyCounts(30, now).values()); allProcessedData.magnitudeDistribution30Days = calculateMagnitudeDistribution([]); allProcessedData.sampledEarthquakesLast30Days = []; allProcessedData.feelableQuakes30Days_ctx = []; allProcessedData.significantQuakes30Days_ctx = []; allProcessedData.prev14DayData = [];
            allProcessedData.earthquakesLast14Days = []; allProcessedData.dailyCounts14Days = Array.from(getInitialDailyCounts(14, now).values()); allProcessedData.magnitudeDistribution14Days = calculateMagnitudeDistribution([]); allProcessedData.sampledEarthquakesLast14Days = [];
            allProcessedData.earthquakesLast7Days = []; allProcessedData.dailyCounts7Days = Array.from(getInitialDailyCounts(7, now).values()); allProcessedData.magnitudeDistribution7Days = calculateMagnitudeDistribution([]); allProcessedData.sampledEarthquakesLast7Days = []; allProcessedData.feelableQuakes7Days_ctx = []; allProcessedData.significantQuakes7Days_ctx = []; allProcessedData.prev7DayData = [];
            // prev24HourData is populated from weekly feed, which is fine to keep if available, or clear if strict. Let's clear for strictness.
            allProcessedData.prev24HourData = [];
        } else if (maxPeriod === "7d") {
            allProcessedData.allEarthquakesMonth = [];
            allProcessedData.earthquakesLast30Days = []; allProcessedData.dailyCounts30Days = Array.from(getInitialDailyCounts(30, now).values()); allProcessedData.magnitudeDistribution30Days = calculateMagnitudeDistribution([]); allProcessedData.sampledEarthquakesLast30Days = []; allProcessedData.feelableQuakes30Days_ctx = []; allProcessedData.significantQuakes30Days_ctx = []; allProcessedData.prev14DayData = [];
            allProcessedData.earthquakesLast14Days = []; allProcessedData.dailyCounts14Days = Array.from(getInitialDailyCounts(14, now).values()); allProcessedData.magnitudeDistribution14Days = calculateMagnitudeDistribution([]); allProcessedData.sampledEarthquakesLast14Days = [];
             // prev24HourData is relevant for 7d.
        }
        // For "30d", all fields are relevant and populated.

        // --- End of processing logic ---

        const responseBody = JSON.stringify(allProcessedData);

        if (PROCESSED_DATA_KV) {
          try {
            await PROCESSED_DATA_KV.put(currentDataPeriodKvKey, responseBody);
            console.log(`[${sourceName}] Successfully stored processed data in KV for period: ${currentDataPeriodKvKey}.`);
          } catch (e) {
            console.error(`[${sourceName}] KV PUT error for period ${currentDataPeriodKvKey}: ${e.message}`, e);
          }
        } else {
          console.warn(`[${sourceName}] PROCESSED_DATA_KV binding not available.`);
        }

        if (DB) {
          try {
            const currentTimestampSeconds = Math.floor(Date.now() / 1000);
            const sql = `INSERT OR REPLACE INTO processed_data (period, data, timestamp) VALUES (?1, ?2, ?3)`;
            const stmt = DB.prepare(sql).bind(currentDataPeriodKvKey, responseBody, currentTimestampSeconds);
            ctx.waitUntil(
              stmt.run()
                .then(() => console.log(`[${sourceName}] Successfully stored processed data in D1 for period: ${currentDataPeriodKvKey}.`))
                .catch(e => console.error(`[${sourceName}] D1 INSERT/REPLACE error for period ${currentDataPeriodKvKey}: ${e.message}`, e))
            );
          } catch (e) {
            console.error(`[${sourceName}] Error initiating D1 WRITE for period ${currentDataPeriodKvKey}: ${e.message}`, e);
          }
        } else {
          console.warn(`[${sourceName}] D1 database binding (env.DB) not available.`);
        }
        console.log(`[${sourceName}] Finished processing for period: ${period}`);
      } // end of loop over periods

      console.log(`[${sourceName}] Scheduled data processing completed successfully.`);

    } catch (error) {
      console.error(`[${sourceName}] Critical error during scheduled data processing: ${error.message}`, error.stack);
      // Do not rethrow, allow worker to complete "successfully" from platform's view, but log error.
    }
  }
};
