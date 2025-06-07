// functions/api/processed-earthquake-data.js

// --- Constants (ported from appConstants.js and EarthquakeDataContext.jsx) ---
const USGS_API_URL_DAY = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const USGS_API_URL_WEEK = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson";
const USGS_API_URL_MONTH = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson";

const FEELABLE_QUAKE_THRESHOLD = 2.5;
const MAJOR_QUAKE_THRESHOLD = 4.5; // Taken from appConstants.js

// ALERT_LEVELS from src/constants/appConstants.js
const ALERT_LEVELS = {
    RED: { text: "RED", colorClass: "bg-red-100 border-red-500 text-red-700", detailsColorClass: "bg-red-50 border-red-400 text-red-800", description: "Potential for 1,000+ fatalities / $1B+ losses.", level: 0 }, // Added level for sorting
    ORANGE: { text: "ORANGE", colorClass: "bg-orange-100 border-orange-500 text-orange-700", detailsColorClass: "bg-orange-50 border-orange-400 text-orange-800", description: "Potential for 100-999 fatalities / $100M-$1B losses.", level: 1 }, // Added level
    YELLOW: { text: "YELLOW", colorClass: "bg-yellow-100 border-yellow-500 text-yellow-700", detailsColorClass: "bg-yellow-50 border-yellow-400 text-yellow-800", description: "Potential for 1-99 fatalities / $1M-$100M losses.", level: 2 }, // Added level
    GREEN: { text: "GREEN", colorClass: "bg-green-100 border-green-500 text-green-700", detailsColorClass: "bg-green-50 border-green-400 text-green-800", description: "No significant impact expected (<1 fatality / <$1M losses).", level: 3 } // Added level
};

// MAGNITUDE_RANGES from src/contexts/EarthquakeDataContext.jsx
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
const SCATTER_SAMPLING_THRESHOLD_14_DAYS = 500;
const SCATTER_SAMPLING_THRESHOLD_30_DAYS = 700;

const getProcessedDataKvKey = (period) => `latest_processed_data_v1_${period}`;

// --- Utility Functions (ported from EarthquakeDataContext.jsx and utils.js) ---

// Helper to create JSON error responses (copied from [[catchall]].js for self-containment)
const jsonErrorResponse = (message, status, sourceName, upstreamStatus = undefined) => {
  const errorBody = {
    status: "error",
    message: message,
    source: sourceName,
  };
  if (upstreamStatus !== undefined) {
    errorBody.upstream_status = upstreamStatus;
  }
  return new Response(JSON.stringify(errorBody), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
};

// getMagnitudeColor (ported from src/utils/utils.js)
const getMagnitudeColor = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return '#ccc'; // Default for unknown
    if (magnitude < 1) return '#70db70'; // Light green
    if (magnitude < 2) return '#90ee90'; // Green
    if (magnitude < 3) return '#ffff00'; // Yellow
    if (magnitude < 4) return '#ffd700'; // Gold
    if (magnitude < 5) return '#ffa500'; // Orange
    if (magnitude < 6) return '#ff8c00'; // Dark Orange
    if (magnitude < 7) return '#ff4500'; // OrangeRed
    if (magnitude < 8) return '#ff0000'; // Red
    return '#dc143c'; // Crimson for 8+
};

// filterByTime (ported from EarthquakeDataContext.jsx)
const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - hoursAgoStart * 3600000;
    const endTime = now - hoursAgoEnd * 3600000;
    return data.filter(q => q.properties && typeof q.properties.time === 'number' && q.properties.time >= startTime && q.properties.time < endTime);
};

// filterMonthlyByTime (ported from EarthquakeDataContext.jsx)
const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - (daysAgoStart * 24 * 3600000);
    const endTime = now - (daysAgoEnd * 24 * 3600000);
    return data.filter(q => q.properties && typeof q.properties.time === 'number' && q.properties.time >= startTime && q.properties.time < endTime);
};

// consolidateMajorQuakesLogic (ported from EarthquakeDataContext.jsx)
const consolidateMajorQuakesLogic = (currentLastMajor, currentPreviousMajor, newMajors) => {
    let consolidated = newMajors ? [...newMajors] : [];
    if (currentLastMajor && !consolidated.find(q => q.id === currentLastMajor.id)) {
        consolidated.push(currentLastMajor);
    }
    if (currentPreviousMajor && !consolidated.find(q => q.id === currentPreviousMajor.id)) {
        consolidated.push(currentPreviousMajor);
    }
    consolidated = consolidated
        .filter(q => q && q.id && q.properties && typeof q.properties.time === 'number') // Ensure valid quakes
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

// sampleArray (ported from EarthquakeDataContext.jsx)
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

// sampleArrayWithPriority (ported from EarthquakeDataContext.jsx)
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

// formatDateForTimeline (ported from EarthquakeDataContext.jsx)
const formatDateForTimeline = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

// getInitialDailyCounts (ported from EarthquakeDataContext.jsx)
const getInitialDailyCounts = (numDays, baseTime) => {
    const counts = [];
    for (let i = 0; i < numDays; i++) {
        const date = new Date(baseTime);
        date.setUTCDate(date.getUTCDate() - i);
        counts.push({ dateString: formatDateForTimeline(date.getTime()), count: 0 });
    }
    return counts.reverse();
};

// calculateMagnitudeDistribution (ported from EarthquakeDataContext.jsx)
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

// --- Main Handler ---
export async function onRequestGet(context) {
  const sourceName = "processed-earthquake-data-worker";
  const { request, env } = context;
  const PROCESSED_DATA_KV = env.PROCESSED_DATA_KV;

  const url = new URL(request.url);
  const requestedPeriod = url.searchParams.get("maxPeriod") || "30d";
  const validPeriods = ["24h", "7d", "30d"];
  const maxPeriod = validPeriods.includes(requestedPeriod) ? requestedPeriod : "30d";
  const currentKvKey = getProcessedDataKvKey(maxPeriod);

  // 1. Check KV Cache first
  if (PROCESSED_DATA_KV) {
    try {
      const cachedData = await PROCESSED_DATA_KV.get(currentKvKey);
      if (cachedData) {
        console.log(`[${sourceName}] Cache hit for processed data (maxPeriod: ${maxPeriod}).`);
        return new Response(cachedData, {
          headers: {
            "Content-Type": "application/json",
            "X-Cache-Status": "hit",
            "Cache-Control": "public, max-age=60" // Add this line
          },
        });
      }
      console.log(`[${sourceName}] Cache miss for processed data (maxPeriod: ${maxPeriod}).`);
    } catch (e) {
      console.error(`[${sourceName}] KV GET error for key ${currentKvKey}: ${e.message}`, e);
      // Non-fatal, proceed to compute
    }
  } else {
    console.warn(`[${sourceName}] PROCESSED_DATA_KV not configured. Skipping cache check.`);
  }

  // 2. Fetch data from USGS Proxy
  const fetchWithProxy = async (usgsUrl, urlSourceName) => {
    const currentWorkerUrl = new URL(request.url);
    const proxyRequestUrl = new URL("/api/usgs-proxy", currentWorkerUrl.origin);
    proxyRequestUrl.searchParams.set("apiUrl", usgsUrl);

    try {
      const response = await fetch(proxyRequestUrl.toString());
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[${sourceName}] Error from usgs-proxy for ${urlSourceName} (${usgsUrl}): ${response.status}`, errorBody);
        throw new Error(`Failed to fetch ${urlSourceName} via proxy: ${response.status} - ${errorBody}`);
      }
      return await response.json();
    } catch (e) {
      console.error(`[${sourceName}] Network error fetching ${urlSourceName} via proxy (${usgsUrl}): ${e.message}`, e);
      throw e;
    }
  };

  let rawDayData, rawWeekData, rawMonthData;
  try {
    [rawDayData, rawWeekData, rawMonthData] = await Promise.all([
      fetchWithProxy(USGS_API_URL_DAY, "USGS_DAY"),
      fetchWithProxy(USGS_API_URL_WEEK, "USGS_WEEK"),
      fetchWithProxy(USGS_API_URL_MONTH, "USGS_MONTH"),
    ]);
  } catch (e) {
    return jsonErrorResponse(`Failed to fetch one or more USGS data feeds: ${e.message}`, 500, sourceName);
  }

  if (!rawDayData || !Array.isArray(rawDayData.features)) {
    return jsonErrorResponse("Invalid or missing features in daily data.", 500, sourceName);
  }
  if (!rawWeekData || !Array.isArray(rawWeekData.features)) {
    return jsonErrorResponse("Invalid or missing features in weekly data.", 500, sourceName);
  }
  if (!rawMonthData || !Array.isArray(rawMonthData.features)) {
    return jsonErrorResponse("Invalid or missing features in monthly data.", 500, sourceName);
  }

  // 3. Process Data
  try {
    const now = Date.now();
    let allProcessedData = {}; // Initialize

    // --- Always Included Data ---
    const dailyFeatures = rawDayData.features; // Needed for several always-included fields
    allProcessedData.dataFetchTime = now;
    allProcessedData.lastUpdated = new Date(rawDayData.metadata?.generated || now).toLocaleString('en-US', { timeZone: 'UTC' });

    const earthquakesLast24Hours = filterByTime(dailyFeatures, 24, 0, now);
    allProcessedData.earthquakesLastHour = filterByTime(earthquakesLast24Hours, 1, 0, now); // Filter from already filtered 24h
    allProcessedData.earthquakesPriorHour = filterByTime(earthquakesLast24Hours, 2, 1, now); // Filter from already filtered 24h
    allProcessedData.earthquakesLast24Hours = earthquakesLast24Hours;

    const alertsIn24hr = earthquakesLast24Hours
        .map(q => q.properties.alert)
        .filter(a => a && typeof a === 'string' && a.toLowerCase() !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
    allProcessedData.highestRecentAlert = alertsIn24hr.length > 0
        ? alertsIn24hr.sort((a,b) => (ALERT_LEVELS[a.toUpperCase()]?.level || 99) - (ALERT_LEVELS[b.toUpperCase()]?.level || 99))[0]
        : null;
    allProcessedData.activeAlertTriggeringQuakes = allProcessedData.highestRecentAlert
        ? earthquakesLast24Hours.filter(q => q.properties.alert === allProcessedData.highestRecentAlert)
        : [];

    const hasRecentTsunamiWarning = earthquakesLast24Hours.some(q => q.properties.tsunami === 1);
    allProcessedData.hasRecentTsunamiWarning = hasRecentTsunamiWarning;
    let identifiedTsunamiQuake = null;
    if (hasRecentTsunamiWarning) {
        const tsunamiQuakes = earthquakesLast24Hours.filter(q => q.properties.tsunami === 1);
        if (tsunamiQuakes.length > 0) {
            tsunamiQuakes.sort((a, b) => b.properties.time - a.properties.time);
            identifiedTsunamiQuake = tsunamiQuakes[0];
        }
    }
    allProcessedData.tsunamiTriggeringQuake = identifiedTsunamiQuake;

    // Consolidate major quakes using all available data for robustness
    let majorQuakesFromAllFeeds = [];
    if(dailyFeatures) majorQuakesFromAllFeeds.push(...dailyFeatures.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD));
    if(rawWeekData.features && (maxPeriod === "7d" || maxPeriod === "30d")) majorQuakesFromAllFeeds.push(...rawWeekData.features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD));
    if(rawMonthData.features && maxPeriod === "30d") majorQuakesFromAllFeeds.push(...rawMonthData.features.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD));

    const majorQuakeUpdates = consolidateMajorQuakesLogic(null, null, majorQuakesFromAllFeeds);
    allProcessedData.lastMajorQuake = majorQuakeUpdates.lastMajorQuake;
    allProcessedData.previousMajorQuake = majorQuakeUpdates.previousMajorQuake;
    allProcessedData.timeBetweenPreviousMajorQuakes = majorQuakeUpdates.timeBetweenPreviousMajorQuakes;

    // Data for Globe - always based on up to 72 hours from weekly feed if available
    const weeklyFeatures = rawWeekData.features;
    let earthquakesLast72Hours = [];
    if (maxPeriod === "7d" || maxPeriod === "30d") { // weeklyFeatures are relevant
        earthquakesLast72Hours = filterByTime(weeklyFeatures, 72, 0, now);
        const uniqueIds72h = new Set();
        allProcessedData.earthquakesLast72Hours = earthquakesLast72Hours.filter(q => {
            if(!uniqueIds72h.has(q.id)) { uniqueIds72h.add(q.id); return true; } return false;
        });
    } else { // 24h period, still provide the key but empty
        allProcessedData.earthquakesLast72Hours = [];
    }
    allProcessedData.globeEarthquakes = [...allProcessedData.earthquakesLast72Hours] // Use potentially filtered 72h data
        .sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0))
        .slice(0, 900);

    // --- Conditional Data based on maxPeriod ---
    if (maxPeriod === "24h") {
        allProcessedData.prev24HourData = []; // Based on weekly, so not available
        allProcessedData.earthquakesLast7Days = [];
        allProcessedData.dailyCounts7Days = getInitialDailyCounts(7, now).map(d => ({ ...d, count: 0 }));
        allProcessedData.sampledEarthquakesLast7Days = [];
        allProcessedData.magnitudeDistribution7Days = calculateMagnitudeDistribution([]);
        allProcessedData.feelableQuakes7Days_ctx = [];
        allProcessedData.significantQuakes7Days_ctx = [];
        allProcessedData.prev7DayData = [];

        allProcessedData.allEarthquakesMonth = [];
        allProcessedData.earthquakesLast14Days = [];
        allProcessedData.earthquakesLast30Days = [];
        allProcessedData.dailyCounts14Days = getInitialDailyCounts(14, now).map(d => ({ ...d, count: 0 }));
        allProcessedData.dailyCounts30Days = getInitialDailyCounts(30, now).map(d => ({ ...d, count: 0 }));
        allProcessedData.sampledEarthquakesLast14Days = [];
        allProcessedData.sampledEarthquakesLast30Days = [];
        allProcessedData.magnitudeDistribution14Days = calculateMagnitudeDistribution([]);
        allProcessedData.magnitudeDistribution30Days = calculateMagnitudeDistribution([]);
        allProcessedData.prev14DayData = [];
        allProcessedData.feelableQuakes30Days_ctx = [];
        allProcessedData.significantQuakes30Days_ctx = [];
    }

    if (maxPeriod === "7d" || maxPeriod === "30d") {
        allProcessedData.prev24HourData = filterByTime(weeklyFeatures, 48, 24, now);
        const earthquakesLast7Days = filterByTime(weeklyFeatures, 7 * 24, 0, now);
        allProcessedData.earthquakesLast7Days = earthquakesLast7Days;

        allProcessedData.dailyCounts7Days = getInitialDailyCounts(7, now);
        earthquakesLast7Days.forEach(quake => {
            const dateString = formatDateForTimeline(quake.properties.time);
            const dayEntry = allProcessedData.dailyCounts7Days.find(d => d.dateString === dateString);
            if (dayEntry) dayEntry.count++;
        });
        allProcessedData.sampledEarthquakesLast7Days = sampleArrayWithPriority(earthquakesLast7Days, SCATTER_SAMPLING_THRESHOLD_7_DAYS, MAJOR_QUAKE_THRESHOLD);
        allProcessedData.magnitudeDistribution7Days = calculateMagnitudeDistribution(earthquakesLast7Days);
        allProcessedData.feelableQuakes7Days_ctx = earthquakesLast7Days.filter(
            q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD
        );
        allProcessedData.significantQuakes7Days_ctx = earthquakesLast7Days.filter(
            q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD
        );
        allProcessedData.prev7DayData = filterMonthlyByTime(rawMonthData.features, 14, 7, now); // Uses month feed

        if (maxPeriod === "7d") { // Fill remaining 30d fields as empty
            allProcessedData.allEarthquakesMonth = []; // Or only weekly features if preferred for "7d" context
            allProcessedData.earthquakesLast14Days = []; // earthquakesLast7Days already populated
            allProcessedData.earthquakesLast30Days = [];
            allProcessedData.dailyCounts14Days = getInitialDailyCounts(14, now).map(d => ({ ...d, count: 0 }));
            allProcessedData.dailyCounts30Days = getInitialDailyCounts(30, now).map(d => ({ ...d, count: 0 }));
            allProcessedData.sampledEarthquakesLast14Days = [];
            allProcessedData.sampledEarthquakesLast30Days = [];
            allProcessedData.magnitudeDistribution14Days = calculateMagnitudeDistribution([]);
            allProcessedData.magnitudeDistribution30Days = calculateMagnitudeDistribution([]);
            allProcessedData.prev14DayData = [];
            allProcessedData.feelableQuakes30Days_ctx = [];
            allProcessedData.significantQuakes30Days_ctx = [];
        }
    }

    if (maxPeriod === "30d") {
        const monthlyFeatures = rawMonthData.features;
        allProcessedData.allEarthquakesMonth = monthlyFeatures;

        const earthquakesLast14Days = filterMonthlyByTime(monthlyFeatures, 14, 0, now);
        allProcessedData.earthquakesLast14Days = earthquakesLast14Days; // Overwrites if already set by 7d
        const earthquakesLast30Days = filterMonthlyByTime(monthlyFeatures, 30, 0, now);
        allProcessedData.earthquakesLast30Days = earthquakesLast30Days;

        allProcessedData.dailyCounts14Days = getInitialDailyCounts(14, now);
        earthquakesLast14Days.forEach(quake => {
            const dateString = formatDateForTimeline(quake.properties.time);
            const dayEntry = allProcessedData.dailyCounts14Days.find(d => d.dateString === dateString);
            if (dayEntry) dayEntry.count++;
        });

        allProcessedData.dailyCounts30Days = getInitialDailyCounts(30, now);
        earthquakesLast30Days.forEach(quake => {
            const dateString = formatDateForTimeline(quake.properties.time);
            const dayEntry = allProcessedData.dailyCounts30Days.find(d => d.dateString === dateString);
            if (dayEntry) dayEntry.count++;
        });

        allProcessedData.sampledEarthquakesLast14Days = sampleArrayWithPriority(earthquakesLast14Days, SCATTER_SAMPLING_THRESHOLD_14_DAYS, MAJOR_QUAKE_THRESHOLD);
        allProcessedData.sampledEarthquakesLast30Days = sampleArrayWithPriority(earthquakesLast30Days, SCATTER_SAMPLING_THRESHOLD_30_DAYS, MAJOR_QUAKE_THRESHOLD);
        allProcessedData.magnitudeDistribution14Days = calculateMagnitudeDistribution(earthquakesLast14Days);
        allProcessedData.magnitudeDistribution30Days = calculateMagnitudeDistribution(earthquakesLast30Days);

        allProcessedData.prev14DayData = filterMonthlyByTime(monthlyFeatures, 28, 14, now);
        // prev7DayData is already populated from 7d/30d common block using month feed

        allProcessedData.feelableQuakes30Days_ctx = earthquakesLast30Days.filter(
            q => q.properties.mag !== null && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD
        );
        allProcessedData.significantQuakes30Days_ctx = earthquakesLast30Days.filter(
            q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD
        );
    }

    const responseBody = JSON.stringify(allProcessedData);

    if (PROCESSED_DATA_KV) {
      try {
        let kvTtl = 300;
        if (env.PROCESSED_DATA_TTL_SECONDS) {
          const parsedTtl = parseInt(env.PROCESSED_DATA_TTL_SECONDS, 10);
          if (!isNaN(parsedTtl) && parsedTtl > 0) {
            kvTtl = parsedTtl;
          } else {
            console.warn(`[${sourceName}] Invalid PROCESSED_DATA_TTL_SECONDS for key ${currentKvKey}. Using default ${kvTtl}s.`);
          }
        }
        context.waitUntil(
            PROCESSED_DATA_KV.put(currentKvKey, responseBody, { expirationTtl: kvTtl })
                .then(() => console.log(`[${sourceName}] Successfully cached processed data for key ${currentKvKey} (TTL: ${kvTtl}s).`))
                .catch(e => console.error(`[${sourceName}] KV PUT error for key ${currentKvKey}: ${e.message}`, e))
        );
      } catch (e) {
        console.error(`[${sourceName}] Error initiating KV PUT for key ${currentKvKey}: ${e.message}`, e);
      }
    }

    return new Response(responseBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Cache-Status": "miss",
        "Cache-Control": "public, max-age=60" // Add this line
      },
    });

  } catch (processingError) {
    console.error(`[${sourceName}] Error during data processing: ${processingError.message}`, processingError);
    return jsonErrorResponse(`Data processing failed: ${processingError.message}`, 500, sourceName);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") {
    return onRequestGet(context);
  }
  return new Response(JSON.stringify({status: "error", message: "Method not allowed. Only GET is supported.", source: "processed-earthquake-data-worker-router"}), {
    status: 405,
    headers: { "Allow": "GET", "Content-Type": "application/json" },
  });
}
