// Helper functions for data transformation
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

const getMagnitudeColor = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return '#94A3B8'; // slate-400
    if (magnitude < 1.0) return '#67E8F9'; // cyan-300
    if (magnitude < 2.5) return '#22D3EE'; // cyan-400
    if (magnitude < 4.0) return '#34D399'; // green-400
    if (magnitude < 5.0) return '#FACC15'; // yellow-400
    if (magnitude < 6.0) return '#FB923C'; // orange-400
    if (magnitude < 7.0) return '#F97316'; // orange-500
    if (magnitude < 8.0) return '#EF4444'; // red-500
    return '#B91C1C'; // red-700
};

const formatDateForTimeline = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getInitialDailyCounts = (numDays, baseTime) => {
    const counts = [];
    for (let i = 0; i < numDays; i++) {
        const date = new Date(baseTime);
        date.setUTCDate(date.getUTCDate() - i); // Use UTC for date calculations
        counts.push({ dateString: formatDateForTimeline(date.getTime()), count: 0 });
    }
    return counts.reverse();
};

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

// Adapted filterByTime for worker: filters features within a given hour range from 'now'
const filterByTime = (features, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(features)) return [];
    const startTime = now - hoursAgoStart * 36e5; // 36e5 is milliseconds in an hour
    const endTime = now - hoursAgoEnd * 36e5;
    return features.filter(q => {
      const featureTime = q.properties.time;
      return featureTime >= startTime && featureTime <= endTime;
    });
};

// New helper function to fetch from origin and process data (transform if needed)
async function fetchAndProcessData(apiUrl, transformParam) { // Removed context from here, not needed for fetch/transform
  let rawUsgsResponse;
  try {
    rawUsgsResponse = await fetch(apiUrl);
  } catch (e) {
    console.error(`Origin fetch failed for ${apiUrl}: ${e.message}`, e);
    return { error: `USGS API fetch failed: ${e.message}`, status: 500, statusText: 'Origin Fetch Error' };
  }

  if (!rawUsgsResponse.ok) {
    console.error(`Error fetching raw data from USGS API (${apiUrl}): ${rawUsgsResponse.status} ${rawUsgsResponse.statusText}`);
    return {
      error: `Error fetching raw data from USGS API: ${rawUsgsResponse.status} ${rawUsgsResponse.statusText}`,
      status: rawUsgsResponse.status,
      statusText: rawUsgsResponse.statusText,
      // upstreamStatus: rawUsgsResponse.status // This was for jsonErrorResponse, not directly returned here
    };
  }

  let rawData;
  try {
    rawData = await rawUsgsResponse.json();
  } catch (e) {
    console.error(`Failed to parse JSON from USGS API (${apiUrl}): ${e.message}`, e);
    return { error: `Failed to parse JSON from USGS API: ${e.message}`, status: 500, statusText: 'Origin JSON Parse Error' };
  }

  if (transformParam === "stats_7day") {
    // --- Transformation Logic ---
    const fetchTime = rawData.metadata?.generated || Date.now();
    const sevenDaysInHours = 7 * 24;
    const featuresLast7Days = filterByTime(rawData.features, sevenDaysInHours, 0, fetchTime);

    const dailyCounts7Days = getInitialDailyCounts(7, fetchTime);
    featuresLast7Days.forEach(feature => {
        const featureDateStr = formatDateForTimeline(feature.properties.time);
        const dayEntry = dailyCounts7Days.find(d => d.dateString === featureDateStr);
        if (dayEntry) {
            dayEntry.count++;
        }
    });

    const magnitudeDistribution7Days = calculateMagnitudeDistribution(featuresLast7Days);

    const transformedData = {
      metadata: rawData.metadata,
      transformed_stats: {
        dailyCounts7Days: dailyCounts7Days,
        magnitudeDistribution7Days: magnitudeDistribution7Days,
      },
      features: rawData.features, // Include original features
    };
    // --- End Transformation Logic ---
    return { responseData: transformedData, status: 200, statusText: "OK" };
  } else {
    // No transformation, return raw data
    // Use status/statusText from the actual upstream response for accuracy when proxying
    return { responseData: rawData, status: rawUsgsResponse.status, statusText: rawUsgsResponse.statusText };
  }
}

// New function to update cache in the background for SWR
async function updateCacheInBackground(context, apiUrl, transformParam, cacheKey, commonResponseHeaders) {
  const cache = caches.default; // Get cache instance here
  console.log(`SWR: Updating cache in background for ${cacheKey.url}...`);

  const { responseData, status, statusText, error } = await fetchAndProcessData(apiUrl, transformParam);

  if (!error && status < 400) {
    const freshResponse = new Response(JSON.stringify(responseData), {
      status,
      statusText,
      headers: commonResponseHeaders
    });
    try {
      await cache.put(cacheKey, freshResponse);
      console.log(`SWR: Cache updated in background for ${cacheKey.url}.`);
    } catch (e) {
      console.error(`SWR: Failed to put updated response into cache for ${cacheKey.url}: ${e.message}`, e);
    }
  } else {
    console.error(`SWR: Failed to fetch or process data to update cache in background for ${cacheKey.url}. Status: ${status}, Message: ${error || responseData?.message || statusText}`);
    // Do not delete stale cache here; let it expire or be overwritten by a future successful update.
  }
}


export async function onRequest(context) {
  const sourceName = "usgs-proxy-worker";

  // Helper to create JSON error responses
  const jsonErrorResponse = (message, status, upstreamStatus = undefined) => {
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

  const url = new URL(context.request.url);
  const apiUrl = url.searchParams.get("apiUrl");
  const transformParam = url.searchParams.get("transform"); // Will be null if not present

  if (!apiUrl) {
    return jsonErrorResponse("Missing apiUrl query parameter", 400);
  }

  const cache = caches.default;

  // Determine cache duration (this logic remains the same)
  const DEFAULT_CACHE_DURATION_SECONDS = 600; // 10 minutes
  let durationInSeconds = DEFAULT_CACHE_DURATION_SECONDS;
  const envCacheDuration = context.env && context.env.WORKER_CACHE_DURATION_SECONDS;
  if (envCacheDuration) {
    const parsedDuration = parseInt(envCacheDuration, 10);
    if (!isNaN(parsedDuration) && parsedDuration > 0) {
      durationInSeconds = parsedDuration;
    } else {
      console.warn(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${envCacheDuration}". Using default: ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
    }
  }
  const commonResponseHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": `s-maxage=${durationInSeconds}`, // For browser and CDN cache
    // "X-SWR-Status": "pending", // Example custom header, might be useful for debugging
  };

  // Determine cache key based on whether transformation is applied
  let cacheKey;
  if (transformParam === "stats_7day") { // Check for specific transformParam
    cacheKey = new Request(context.request.url, context.request); // Full URL for transformed data
    console.log(`Using transformed cache key: ${cacheKey.url}`);
  } else {
    cacheKey = new Request(apiUrl, context.request); // apiUrl for raw data
    console.log(`Using raw data cache key: ${cacheKey.url}`);
  }

  try {
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      console.log(`SWR: Cache hit for ${cacheKey.url}. Serving from cache.`);
      // Serve from cache and update in background
      context.waitUntil(updateCacheInBackground(context, apiUrl, transformParam, cacheKey, commonResponseHeaders));

      // Add a header to indicate SWR revalidation is happening (optional)
      // const responseHeadersWithSwr = { ...cachedResponse.headers, "X-SWR-Status": "revalidating" };
      // return new Response(cachedResponse.body, { ...cachedResponse, headers: responseHeadersWithSwr });
      return cachedResponse;
    }

    // Cache miss: fetch from origin, serve, and cache
    console.log(`SWR: Cache miss for ${cacheKey.url}. Fetching from origin.`);
    const { responseData, status, statusText, error } = await fetchAndProcessData(apiUrl, transformParam);

    if (error || status >= 400) {
      console.error(`Error in fetchAndProcessData for ${cacheKey.url}: Status ${status}, Msg: ${error || statusText}`);
      // Note: jsonErrorResponse expects upstreamStatus as 3rd param if it's an upstream issue.
      // fetchAndProcessData returns 'status' which could be an upstream status.
      return jsonErrorResponse(error || responseData?.message || statusText, status || 500, status);
    }

    // const responseHeadersWithSwr = { ...commonResponseHeaders, "X-SWR-Status": "fetched" };
    const newResponse = new Response(JSON.stringify(responseData), {
      status: status,
      statusText: statusText,
      headers: commonResponseHeaders, // Use commonResponseHeaders
    });

    context.waitUntil(
      cache.put(cacheKey, newResponse.clone()).then(() => {
        console.log(`SWR: Successfully cached new response for: ${cacheKey.url} (duration: ${durationInSeconds}s)`);
      }).catch(err => {
        console.error(`SWR: Failed to cache new response for ${cacheKey.url}: ${err.message}`, err);
      })
    );

    return newResponse;

  } catch (error) {
    console.error(`SWR: General error processing request for ${cacheKey ? cacheKey.url : apiUrl}: ${error.message}`, error);
    return jsonErrorResponse(`SWR: Error processing request: ${error.message}`, 500);
  }
}
