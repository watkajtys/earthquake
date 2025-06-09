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
// Returns a Map for efficient O(1) lookups by dateString.
const getInitialDailyCounts = (numDays, baseTime) => {
    const countsMap = new Map();
    for (let i = 0; i < numDays; i++) {
        const date = new Date(baseTime);
        date.setUTCDate(date.getUTCDate() - (numDays - 1 - i)); // Iterate from oldest to newest
        const dateString = formatDateForTimeline(date.getTime());
        countsMap.set(dateString, { dateString: dateString, count: 0 });
    }
    return countsMap;
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
  const DB = env.DB; // Access D1 binding

  // CLUSTER_KV is still used by other parts of the application or could be.
  // PROCESSED_DATA_KV specific logic has been removed from this function.

  if (!DB) {
    console.warn(`[${sourceName}] D1 database binding (env.DB) not available. Data will not be cached in D1. Performance may be affected.`);
  }

  const url = new URL(request.url);
  const requestedPeriod = url.searchParams.get("maxPeriod") || "30d";
  const validPeriods = ["24h", "7d", "30d"];
  const maxPeriod = validPeriods.includes(requestedPeriod) ? requestedPeriod : "30d";
  const currentDataPeriodKey = getProcessedDataKvKey(maxPeriod); // Key used for D1 period column
  const D1_CACHE_TTL_SECONDS = 300; // 5 minutes, effective TTL for D1 data freshness check

  // 1. Check D1 Cache first
  if (DB) {
    try {
      const sql = `SELECT data, timestamp FROM processed_data WHERE period = ?1`;
      const stmt = DB.prepare(sql).bind(currentDataPeriodKey);
      const result = await stmt.first();

      if (result && result.data && result.timestamp) {
        const currentTimeSeconds = Math.floor(Date.now() / 1000);
        if ((currentTimeSeconds - result.timestamp) < D1_CACHE_TTL_SECONDS) {
          console.log(`[${sourceName}] D1 Cache hit for processed data (period: ${maxPeriod}).`);
          return new Response(result.data, {
            headers: {
              "Content-Type": "application/json",
              "X-Cache-Status": "hit-d1",
              "Cache-Control": "public, max-age=60" // Client-side cache
            },
          });
        } else {
          console.log(`[${sourceName}] D1 Cache stale for period: ${maxPeriod}. Fetching fresh data.`);
        }
      } else {
        console.log(`[${sourceName}] D1 Cache miss for period: ${maxPeriod}.`);
      }
    } catch (e) {
      console.error(`[${sourceName}] D1 SELECT error for period ${currentDataPeriodKey}: ${e.message}`, e);
      // Non-fatal, proceed to compute and fetch fresh data
    }
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
    const allProcessedData = {
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

    // Temporary accumulators
    const processedQuakeIds = new Set(); // Tracks quake IDs processed for general stats (counts, distributions) to avoid double counting.
    const allPotentialMajorQuakes = []; // Collects all quakes >= MAJOR_QUAKE_THRESHOLD from all feeds.

    // For building the earthquakesLast72Hours list (used for Globe)
    // Option 1: Map<id, quake>
    const tempGlobeQuakesMap = new Map();
    // Option 2: List + Set of IDs (more explicit to the "Set for de-duplication" wording)
    // let tempRawGlobeQuakesList = [];
    // let tempRawGlobeQuakeIdsSet = new Set();


    // Time boundaries
    const time24HoursAgo = now - 24 * 3600000;
    const time1HourAgo = now - 1 * 3600000;
    const time2HoursAgo = now - 2 * 3600000;

    const time72HoursAgo = now - 72 * 3600000;
    const time48HoursAgo = now - 48 * 3600000;

    const time7DaysAgo = now - 7 * 24 * 3600000;
    const time14DaysAgo = now - 14 * 24 * 3600000;
    const time28DaysAgo = now - 28 * 24 * 3600000;
    const time30DaysAgo = now - 30 * 24 * 3600000;

    // Initialize daily counts as Maps for efficient updates
    const dailyCounts30DaysMap = getInitialDailyCounts(30, now);
    const dailyCounts14DaysMap = getInitialDailyCounts(14, now);
    const dailyCounts7DaysMap = getInitialDailyCounts(7, now);

    // Initialize magnitude distributions (can be updated directly)
    const magnitudeDistribution30Days = MAGNITUDE_RANGES.map(range => ({ name: range.name, count: 0, color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min) }));
    const magnitudeDistribution14Days = MAGNITUDE_RANGES.map(range => ({ name: range.name, count: 0, color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min) }));
    const magnitudeDistribution7Days = MAGNITUDE_RANGES.map(range => ({ name: range.name, count: 0, color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min) }));

    // Temporary arrays for features before sampling/sorting
    let tempEarthquakesLast30Days = [];
    let tempEarthquakesLast14Days = [];
    let tempEarthquakesLast7Days = [];
    // tempEarthquakesLast72HoursSet was ambiguously used. Replaced by tempGlobeQuakesMap.

    let tempFeelableQuakes30Days_ctx = [];
    let tempSignificantQuakes30Days_ctx = [];
    let tempFeelableQuakes7Days_ctx = [];
    let tempSignificantQuakes7Days_ctx = [];

    let tempPrev14DayData = [];
    let tempPrev7DayData = [];

    // --- Refactored Monthly Features Processing ---
    // This loop populates data for 30d, 14d, and contributes to prev7DayData/prev14DayData
    // only if maxPeriod is "30d".
    if (maxPeriod === "30d" && rawMonthData.features) {
        allProcessedData.allEarthquakesMonth = rawMonthData.features;

        rawMonthData.features.forEach(quake => {
            if (!quake || !quake.properties || typeof quake.properties.time !== 'number' || typeof quake.properties.mag !== 'number') return;

            const { id, properties } = quake;
            const { time, mag } = properties;

            // Common windows for monthly processing
            const isInLast30Days = time >= time30DaysAgo;
            const isInLast14Days = time >= time14DaysAgo;
            const isInPrev14DayWindow = time >= time28DaysAgo && time < time14DaysAgo; // 28-14 days ago
            const isInPrev7DayWindow = time >= time14DaysAgo && time < time7DaysAgo; // 14-7 days ago (from 30d perspective)

            if (isInLast30Days) {
                tempEarthquakesLast30Days.push(quake);
                processedQuakeIds.add(id); // Add to processed set early for monthly source

                // Update dailyCounts30Days
                const dateString30 = formatDateForTimeline(time);
                const dayEntry30 = dailyCounts30DaysMap.get(dateString30);
                if (dayEntry30) dayEntry30.count++;

                // Update magnitudeDistribution30Days
                for (const range of magnitudeDistribution30Days) {
                    const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
                    if (mag >= rangeDetails.min && mag <= rangeDetails.max) {
                        range.count++;
                        break;
                    }
                }

                // Add to feelable/significant Quakes 30 Days
                if (mag >= FEELABLE_QUAKE_THRESHOLD) tempFeelableQuakes30Days_ctx.push(quake);
                if (mag >= MAJOR_QUAKE_THRESHOLD) tempSignificantQuakes30Days_ctx.push(quake);

                // Add to potential major quakes (ID check later in consolidateMajorQuakesLogic)
                if (mag >= MAJOR_QUAKE_THRESHOLD) allPotentialMajorQuakes.push(quake);
            }

            if (isInLast14Days) {
                tempEarthquakesLast14Days.push(quake);
                // Update dailyCounts14Days
                const dateString14 = formatDateForTimeline(time);
                const dayEntry14 = dailyCounts14DaysMap.get(dateString14);
                if (dayEntry14) dayEntry14.count++;

                // Update magnitudeDistribution14Days
                for (const range of magnitudeDistribution14Days) {
                    const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
                    if (mag >= rangeDetails.min && mag <= rangeDetails.max) {
                        range.count++;
                        break;
                    }
                }
            }

            if (isInPrev14DayWindow) { // "Previous 14 day" window (28-14 days ago)
                tempPrev14DayData.push(quake);
            }
            if (isInPrev7DayWindow) { // "Previous 7 day" window (14-7 days ago)
                tempPrev7DayData.push(quake);
            }
        });
    }


    // --- Refactored Weekly Features Processing ---
    // This loop populates data for 7d, 72hr, prev24hr.
    // It also contributes to major quakes list.
    // It ensures data is not doubly counted if already processed from monthly feed.
    if ((maxPeriod === "7d" || maxPeriod === "30d") && rawWeekData.features) {
        rawWeekData.features.forEach(quake => {
            if (!quake || !quake.properties || typeof quake.properties.time !== 'number' || typeof quake.properties.mag !== 'number') return;

            const { id, properties } = quake;
            const { time, mag } = properties;

            const isInLast7Days = time >= time7DaysAgo;
            const isInLast72Hours = time >= time72HoursAgo;
            const isInPrev24HourWindow = time >= time48HoursAgo && time < time24HoursAgo;

            if (isInLast7Days) {
                // Add to 7-day list only if not already added from monthly feed (if monthly feed was processed)
                // However, tempEarthquakesLast7Days should reflect all quakes in this window from this source for this period.
                // Duplication checks for stats are separate.
                tempEarthquakesLast7Days.push(quake);

                if (!processedQuakeIds.has(id)) { // Only update detailed stats if not processed by month
                    const dateString7 = formatDateForTimeline(time);
                    const dayEntry7 = dailyCounts7DaysMap.get(dateString7);
                    if (dayEntry7) dayEntry7.count++;

                    for (const range of magnitudeDistribution7Days) {
                        const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
                        if (mag >= rangeDetails.min && mag <= rangeDetails.max) {
                            range.count++;
                            break;
                        }
                    }
                    if (mag >= FEELABLE_QUAKE_THRESHOLD) tempFeelableQuakes7Days_ctx.push(quake);
                    if (mag >= MAJOR_QUAKE_THRESHOLD) tempSignificantQuakes7Days_ctx.push(quake);
                }
                 // Add to potential major quakes (consolidateMajorQuakesLogic handles de-duplication by ID later)
                if (mag >= MAJOR_QUAKE_THRESHOLD) {
                    allPotentialMajorQuakes.push(quake);
                }
                processedQuakeIds.add(id); // Mark as processed by weekly feed for subsequent daily feed check
            }

            if (isInLast72Hours) {
                // tempEarthquakesLast72HoursSet will store the quake objects directly
                // De-duplication happens because it's a Set, based on object reference if not careful.
                // For de-duplication by ID, we should add IDs and then reconstruct, or filter before adding.
                // The old code filtered after creating the list. Here, we can add unique quakes by ID.
                // Let's refine this: add actual quake objects to a temporary array and then de-duplicate.
                // For now, directly adding to a list that will be de-duplicated later:
                // allProcessedData.earthquakesLast72Hours.push(quake); // This was the old way, let's use the temp Set.
                // The Set should store the quake itself if we want to preserve all info.
                // To ensure de-duplication by ID in the Set, we'd need to manage it carefully or use a Map<id, quake>.
                // Let's use a Map for tempEarthquakesLast72Hours to store unique quakes by ID.
                if (isInLast72Hours) {
                    // Add to tempGlobeQuakesMap for de-duplication by ID.
                    // If a quake with the same ID already exists, it will be overwritten.
                    // USGS feeds are sorted by update time, then event time.
                    // Taking the latest one (which is what Map.set does) is generally fine.
                    tempGlobeQuakesMap.set(id, quake);
                }
            }

            if (isInPrev24HourWindow) { // 48 to 24 hours ago
                allProcessedData.prev24HourData.push(quake); // This list is usually small, direct push ok
            }
        });

        // Assign 7-day data from this loop
        allProcessedData.earthquakesLast7Days = tempEarthquakesLast7Days; // Will be sampled later
        allProcessedData.dailyCounts7Days = Array.from(dailyCounts7DaysMap.values());
        allProcessedData.magnitudeDistribution7Days = magnitudeDistribution7Days;
        allProcessedData.feelableQuakes7Days_ctx = tempFeelableQuakes7Days_ctx;
        allProcessedData.significantQuakes7Days_ctx = tempSignificantQuakes7Days_ctx;

        // If maxPeriod is "30d", the monthly loop already calculated prev7DayData from month features.
        // If maxPeriod is "7d", prev7DayData should also be from month features (as per original logic for 7d period).
        // The monthly loop for "30d" populates `tempPrev7DayData`.
        // If maxPeriod is "7d", the monthly loop does not run.
        // `prev7DayData` is initialized as empty.
        // The original code for 7d period (when 30d is not run) was:
        // allProcessedData.prev7DayData = filterMonthlyByTime(rawMonthData.features, 14, 7, now);
        // This logic needs to be outside this weekly loop, or conditional here.
        // It's handled in the legacy section for now if maxPeriod === "7d".
        // The new monthly loop (if run for 30d) sets `allProcessedData.prev7DayData = tempPrev7DayData;`
        // If maxPeriod === "7d", this `tempPrev7DayData` would be empty.
        // So, the logic `if (maxPeriod === "7d") { allProcessedData.prev7DayData = filterMonthlyByTime(rawMonthData.features, 14, 7, now); }`
        // from the legacy block should be preserved or integrated.
        // For now, this weekly loop does not set `prev7DayData`. It's set by monthly or legacy 7d logic.
    }


    // --- Refactored Daily Features Processing ---
    // This loop processes dailyFeatures for 24h, 1hr, prior hr stats, alerts, tsunami.
    // Also contributes to major quakes and the 72-hour globe quake list.
    if (rawDayData.features) {
        rawDayData.features.forEach(quake => {
            if (!quake || !quake.properties || typeof quake.properties.time !== 'number' || typeof quake.properties.mag !== 'number') return;

            const { id, properties } = quake;
            const { time, mag, alert, tsunami } = properties;

            // Populate earthquakesLast24Hours, earthquakesLastHour, earthquakesPriorHour
            if (time >= time24HoursAgo) {
                allProcessedData.earthquakesLast24Hours.push(quake);
                if (time >= time1HourAgo) {
                    allProcessedData.earthquakesLastHour.push(quake);
                } else if (time >= time2HoursAgo && time < time1HourAgo) { // Corrected: else if
                    allProcessedData.earthquakesPriorHour.push(quake);
                }
            }

            // Contribute to 72-hour list (de-duplicated by tempGlobeQuakesMap)
            if (time >= time72HoursAgo) {
                tempGlobeQuakesMap.set(id, quake); // Add/overwrite to ensure latest version
            }

            // Add to potential major quakes if not already processed for stats by other feeds
            // (consolidateMajorQuakesLogic handles final de-duplication by ID for the major quake list itself)
            if (mag >= MAJOR_QUAKE_THRESHOLD) {
                 allPotentialMajorQuakes.push(quake); // Duplicates by ID handled by consolidateMajorQuakesLogic
            }

            // Mark ID as processed for general stats for any subsequent (hypothetical) feeds
            // For daily feed, it's the last one, so less critical for *subsequent* feeds,
            // but good for consistency if logic order changes.
            processedQuakeIds.add(id);
        });
    }

    // Calculate alerts and tsunami info from the populated earthquakesLast24Hours
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
        if (tsunamiQuakes.length > 0) {
            allProcessedData.tsunamiTriggeringQuake = tsunamiQuakes[0];
        }
    }


    // --- Post-Loop Processing & Assignment ---
    // (To be added in the next step, e.g., sampling, sorting, final assignments)

    // --- Assign results from Monthly features processing (if run) ---
    if (maxPeriod === "30d") {
        allProcessedData.earthquakesLast30Days = tempEarthquakesLast30Days;
        allProcessedData.earthquakesLast14Days = tempEarthquakesLast14Days;
        allProcessedData.dailyCounts30Days = Array.from(dailyCounts30DaysMap.values());
        allProcessedData.dailyCounts14Days = Array.from(dailyCounts14DaysMap.values());
        allProcessedData.magnitudeDistribution30Days = magnitudeDistribution30Days;
        allProcessedData.magnitudeDistribution14Days = magnitudeDistribution14Days;
        allProcessedData.feelableQuakes30Days_ctx = tempFeelableQuakes30Days_ctx;
        allProcessedData.significantQuakes30Days_ctx = tempSignificantQuakes30Days_ctx;
        allProcessedData.prev14DayData = tempPrev14DayData;
        // prev7DayData from monthly is stored in tempPrev7DayData.
        // If weekly runs, it might have a more specific source or this one is used.
        // The new weekly loop does not set prev7DayData.
        // If 30d, monthly's tempPrev7DayData is authoritative unless 7d specific logic overrides.
        allProcessedData.prev7DayData = tempPrev7DayData;
    }


    // --- Finalize Major Quakes ---
    const majorQuakeUpdates = consolidateMajorQuakesLogic(null, null, allPotentialMajorQuakes);
    allProcessedData.lastMajorQuake = majorQuakeUpdates.lastMajorQuake;
    allProcessedData.previousMajorQuake = majorQuakeUpdates.previousMajorQuake;
    allProcessedData.timeBetweenPreviousMajorQuakes = majorQuakeUpdates.timeBetweenPreviousMajorQuakes;

    // --- Finalize 72-hour data for Globe ---
    allProcessedData.earthquakesLast72Hours = Array.from(tempGlobeQuakesMap.values());
    allProcessedData.globeEarthquakes = [...allProcessedData.earthquakesLast72Hours]
        .sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0))
        .slice(0, 900);

    // --- Sampling based on populated temp arrays ---
    // Note: original logic for 7d period used earthquakesLast7Days for sampling.
    // If maxPeriod is 30d, monthlyFeatures contributed to tempEarthquakesLast14Days and tempEarthquakesLast30Days.
    // Weekly features contributed to tempEarthquakesLast7Days.

    if (maxPeriod === "30d") {
        allProcessedData.sampledEarthquakesLast30Days = sampleArrayWithPriority(tempEarthquakesLast30Days, SCATTER_SAMPLING_THRESHOLD_30_DAYS, MAJOR_QUAKE_THRESHOLD);
        allProcessedData.sampledEarthquakesLast14Days = sampleArrayWithPriority(tempEarthquakesLast14Days, SCATTER_SAMPLING_THRESHOLD_14_DAYS, MAJOR_QUAKE_THRESHOLD);
        // For 30d period, 7d data is also fully available from weekly loop
        allProcessedData.sampledEarthquakesLast7Days = sampleArrayWithPriority(tempEarthquakesLast7Days, SCATTER_SAMPLING_THRESHOLD_7_DAYS, MAJOR_QUAKE_THRESHOLD);
    } else if (maxPeriod === "7d") {
        allProcessedData.sampledEarthquakesLast7Days = sampleArrayWithPriority(tempEarthquakesLast7Days, SCATTER_SAMPLING_THRESHOLD_7_DAYS, MAJOR_QUAKE_THRESHOLD);
        // For 7d period, 14d and 30d data are empty or minimal
        allProcessedData.sampledEarthquakesLast14Days = [];
        allProcessedData.sampledEarthquakesLast30Days = [];
    } else { // 24h
        allProcessedData.sampledEarthquakesLast7Days = [];
        allProcessedData.sampledEarthquakesLast14Days = [];
        allProcessedData.sampledEarthquakesLast30Days = [];
    }


    // --- Legacy "Conditional Data" section cleanup ---
    // The new loops populate most of the data directly or via temp arrays.
    // What remains is to ensure fields are correctly nulled or emptied based on maxPeriod
    // if they weren't populated by the new loops for that period.

    // The allProcessedData object was initialized with empty arrays for most fields.
    // The loops fill them if the period allows.
    // For example, if maxPeriod === "7d":
    // - Monthly loop (30d, 14d stats) does not run. So tempEarthquakesLast30Days etc. are empty.
    //   Assignments like `allProcessedData.earthquakesLast30Days = tempEarthquakesLast30Days;` will correctly assign empty [].
    // - Fields like dailyCounts30DaysMap, magnitudeDistribution30Days are initialized but not modified by monthly loop.
    //   Their .values() will be empty or default.

    // Check `prev7DayData` and `prev14DayData` specifically based on period.
    if (maxPeriod === "24h") {
        // Most fields are already initialized to empty.
        // prev24HourData, prev7DayData, prev14DayData would be empty as their loops wouldn't run or populate them for 24h.
        allProcessedData.prev24HourData = []; // weekly loop doesn't run for 24h
        allProcessedData.prev7DayData = [];   // monthly loop doesn't run
        allProcessedData.prev14DayData = [];  // monthly loop doesn't run
    } else if (maxPeriod === "7d") {
        // prev24HourData is populated by weekly loop.
        // prev7DayData should be from monthly feed as per original logic.
        // The monthly loop doesn't run for "7d", so tempPrev7DayData is [].
        // We need to explicitly filter rawMonthData here for prev7DayData for 7d period.
        allProcessedData.prev7DayData = filterMonthlyByTime(rawMonthData.features, 14, 7, now);
        allProcessedData.prev14DayData = []; // monthly loop for 28-14 days ago doesn't run
    }
    // If maxPeriod === "30d", prev7DayData and prev14DayData are populated by the monthly loop.

    // Ensure fields specific to longer periods are empty if a shorter period is requested.
    if (maxPeriod === "7d") {
        allProcessedData.allEarthquakesMonth = []; // Not requested
        allProcessedData.earthquakesLast30Days = []; // Already tempEarthquakesLast30Days which is empty
        allProcessedData.dailyCounts30Days = Array.from(getInitialDailyCounts(30, now).values()); // Reset to empty counts
        allProcessedData.magnitudeDistribution30Days = calculateMagnitudeDistribution([]); // Reset
        allProcessedData.feelableQuakes30Days_ctx = [];
        allProcessedData.significantQuakes30Days_ctx = [];
        // prev14DayData is already set to [] above for 7d.
        // earthquakesLast14Days, dailyCounts14Days, magnitudeDistribution14Days also need reset for 7d
        allProcessedData.earthquakesLast14Days = [];
        allProcessedData.dailyCounts14Days = Array.from(getInitialDailyCounts(14, now).values());
        allProcessedData.magnitudeDistribution14Days = calculateMagnitudeDistribution([]);
    }

    if (maxPeriod === "24h") {
        // Most are already empty from init or previous blocks.
        // weekly data like earthquakesLast7Days, dailyCounts7Days, etc.
        allProcessedData.earthquakesLast7Days = [];
        allProcessedData.dailyCounts7Days = Array.from(getInitialDailyCounts(7, now).values());
        allProcessedData.magnitudeDistribution7Days = calculateMagnitudeDistribution([]);
        allProcessedData.feelableQuakes7Days_ctx = [];
        allProcessedData.significantQuakes7Days_ctx = [];
        allProcessedData.allEarthquakesMonth = [];
        allProcessedData.earthquakesLast30Days = [];
        allProcessedData.dailyCounts30Days = Array.from(getInitialDailyCounts(30, now).values());
        allProcessedData.magnitudeDistribution30Days = calculateMagnitudeDistribution([]);
        allProcessedData.feelableQuakes30Days_ctx = [];
        allProcessedData.significantQuakes30Days_ctx = [];
        allProcessedData.earthquakesLast14Days = [];
        allProcessedData.dailyCounts14Days = Array.from(getInitialDailyCounts(14, now).values());
        allProcessedData.magnitudeDistribution14Days = calculateMagnitudeDistribution([]);
    }


    // The legacy conditional data part can be largely removed now.
    // The new structure is:
    // 1. Init allProcessedData with empty/default values.
    // 2. Init temp accumulators (maps for counts, distributions, lists for quake sets).
    // 3. Monthly loop (if maxPeriod=30d): populates 30d, 14d, prev14/prev7 temp data.
    // 4. Weekly loop (if maxPeriod=7d/30d): populates 7d, prev24h temp data. Contributes to globe map.
    // 5. Daily loop: populates 24h, 1h, prior1h direct data. Contributes to globe map. Calculates alerts.
    // 6. Consolidate major quakes from allPotentialMajorQuakes.
    // 7. Finalize globe quakes list from map.
    // 8. Assign temp data (like tempEarthquakesLast30Days) to allProcessedData fields.
    // 9. Perform sampling on these lists.
    // 10. Final cleanup based on maxPeriod for fields not covered or needing explicit reset.


    const responseBody = JSON.stringify(allProcessedData);

    // Store in D1
    if (DB) {
      try {
        const currentTimestampSeconds = Math.floor(Date.now() / 1000);
        const sql = `INSERT OR REPLACE INTO processed_data (period, data, timestamp) VALUES (?1, ?2, ?3)`;
        const stmt = DB.prepare(sql).bind(currentDataPeriodKey, responseBody, currentTimestampSeconds);
        context.waitUntil(
          stmt.run()
            .then(() => console.log(`[${sourceName}] Successfully stored processed data in D1 for period: ${currentDataPeriodKey}.`))
            .catch(e => console.error(`[${sourceName}] D1 INSERT/REPLACE error for period ${currentDataPeriodKey}: ${e.message}`, e))
        );
      } catch (e) {
        console.error(`[${sourceName}] Error initiating D1 WRITE for period ${currentDataPeriodKey}: ${e.message}`, e);
      }
    }

    return new Response(responseBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Cache-Status": "miss-d1", // Changed from "miss"
        "Cache-Control": "public, max-age=60"
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
