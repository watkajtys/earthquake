// Cloudflare Worker entry point
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const { request, waitUntil } = event;
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/feed')) {
      return await handleFeedRequest(url, waitUntil);
    } else if (pathname.startsWith('/api/overview')) {
      return await handleOverviewDataRequest(url, waitUntil);
    } else {
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Constants (ported from client-side)
const USGS_API_URL_WEEK = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson";
const USGS_API_URL_MONTH = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson";

const REGIONS = [
  { name: "Alaska", lat: 64.2008, lon: -149.4937, zoom: 4, radius: 500000 },
  { name: "California", lat: 36.7783, lon: -119.4179, zoom: 5, radius: 300000 },
  { name: "Hawaii", lat: 19.8968, lon: -155.5828, zoom: 6, radius: 100000 },
  { name: "Japan", lat: 36.2048, lon: 138.2529, zoom: 5, radius: 400000 },
  { name: "Indonesia", lat: -0.7893, lon: 113.9213, zoom: 4, radius: 700000 },
  { name: "Chile", lat: -35.6751, lon: -71.5430, zoom: 4, radius: 600000 },
  { name: "Mediterranean", lat: 38.0, lon: 15.0, zoom: 5, radius: 500000 },
  { name: "Oceania", lat: -22.0, lon: 145.0, zoom: 3, radius: 1000000 },
  // More specific regions can be added
];

const CLUSTER_MAX_DISTANCE_KM = 100; // Max distance for an earthquake to be part of a cluster
const CLUSTER_MIN_QUAKES = 3; // Min number of earthquakes to form a cluster
const FEELABLE_QUAKE_THRESHOLD = 2.5; // Minimum magnitude to be considered "feelable"
const MAJOR_QUAKE_THRESHOLD = 5.0; // Minimum magnitude for "major" or "significant"
const TOP_N_CLUSTERS_OVERVIEW = 5; // Number of top clusters to show in the overview

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;


// Utility Functions (ported and adapted for worker)

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
  const clusters = [];
  let visited = new Array(earthquakes.length).fill(false);

  for (let i = 0; i < earthquakes.length; i++) {
    if (visited[i]) continue;

    let currentCluster = [earthquakes[i]];
    visited[i] = true;
    let queue = [earthquakes[i]];
    let head = 0;

    while(head < queue.length) {
      const currentQuake = queue[head++];
      for (let j = i + 1; j < earthquakes.length; j++) {
        if (visited[j]) continue;

        const dist = calculateDistance(
          currentQuake.geometry.coordinates[1],
          currentQuake.geometry.coordinates[0],
          earthquakes[j].geometry.coordinates[1],
          earthquakes[j].geometry.coordinates[0]
        );

        if (dist <= maxDistanceKm) {
          visited[j] = true;
          currentCluster.push(earthquakes[j]);
          queue.push(earthquakes[j]);
        }
      }
    }

    if (currentCluster.length >= minQuakes) {
      // Calculate cluster properties
      let sumLat = 0, sumLon = 0, maxMag = 0, minTime = currentCluster[0].properties.time, maxTime = currentCluster[0].properties.time;
      let clusterTitle = `Cluster near ${currentCluster[0].properties.place}`;

      currentCluster.forEach(quake => {
        sumLat += quake.geometry.coordinates[1];
        sumLon += quake.geometry.coordinates[0];
        if (quake.properties.mag > maxMag) maxMag = quake.properties.mag;
        if (quake.properties.time < minTime) minTime = quake.properties.time;
        if (quake.properties.time > maxTime) maxTime = quake.properties.time;
      });

      clusters.push({
        id: `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}`,
        centerLat: sumLat / currentCluster.length,
        centerLon: sumLon / currentCluster.length,
        quakeCount: currentCluster.length,
        maxMagnitude: maxMag,
        minTime: minTime,
        maxTime: maxTime,
        title: clusterTitle, // Simplified title
        earthquakes: currentCluster.sort((a, b) => b.properties.time - a.properties.time) // Store original quakes
      });
    }
  }
  return clusters.sort((a, b) => b.quakeCount - a.quakeCount);
}


function calculateStats(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return {
      count: 0,
      averageMagnitude: 0,
      maxMagnitude: 0,
      strongestQuake: null,
      deepestQuake: null,
      shallowestQuake: null,
    };
  }

  let totalMagnitude = 0;
  let maxMagnitude = -Infinity;
  let strongestQuake = null;
  let deepestDepth = -Infinity;
  let deepestQuake = null;
  let shallowestDepth = Infinity;
  let shallowestQuake = null;

  earthquakes.forEach(quake => {
    const mag = quake.properties.mag;
    const depth = quake.geometry.coordinates[2];

    totalMagnitude += mag;

    if (mag > maxMagnitude) {
      maxMagnitude = mag;
      strongestQuake = quake;
    }

    if (depth > deepestDepth) {
      deepestDepth = depth;
      deepestQuake = quake;
    }

    if (depth < shallowestDepth) {
      shallowestDepth = depth;
      shallowestQuake = quake;
    }
  });

  return {
    count: earthquakes.length,
    averageMagnitude: parseFloat((totalMagnitude / earthquakes.length).toFixed(2)),
    maxMagnitude: parseFloat(maxMagnitude.toFixed(2)),
    strongestQuake: strongestQuake ? { title: strongestQuake.properties.place, mag: strongestQuake.properties.mag, time: strongestQuake.properties.time, depth: strongestQuake.geometry.coordinates[2], url: strongestQuake.properties.url } : null,
    deepestQuake: deepestQuake ? { title: deepestQuake.properties.place, mag: deepestQuake.properties.mag, time: deepestQuake.properties.time, depth: deepestQuake.geometry.coordinates[2] } : null,
    shallowestQuake: shallowestQuake ? { title: shallowestQuake.properties.place, mag: shallowestQuake.properties.mag, time: shallowestQuake.properties.time, depth: shallowestQuake.geometry.coordinates[2] } : null,
  };
}

function getRegionForEarthquake(quake, regions) {
    const quakeLat = quake.geometry.coordinates[1];
    const quakeLon = quake.geometry.coordinates[0];

    for (const region of regions) {
        const distance = calculateDistance(quakeLat, quakeLon, region.lat, region.lon);
        if (distance * 1000 <= region.radius) { // region.radius is in meters
            return region.name;
        }
    }
    // Fallback logic if no specific region is matched
    if (quakeLat > 24.396308 && quakeLat < 49.384358 && quakeLon > -125.000000 && quakeLon < -66.934570) return "USA (Mainland)";
    if (quakeLat > 50 && quakeLon > -169 && quakeLon < -129) return "Alaska";
    if (quakeLat > 18 && quakeLat < 23 && quakeLon > -161 && quakeLon < -154) return "Hawaii";
    if (quakeLat > 30 && quakeLat < 46 && quakeLon > 129 && quakeLon < 146) return "Japan";
    // Add more broad fallbacks if necessary
    return "Other";
}


function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeAgo(milliseconds) {
    if (milliseconds < 0) milliseconds = 0;
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
}

function formatTimeDuration(milliseconds) {
    if (milliseconds < 0) milliseconds = 0;
    const seconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    hours = hours % 24;
    minutes = minutes % 60;

    let durationString = "";
    if (days > 0) durationString += `${days}d `;
    if (hours > 0) durationString += `${hours}h `;
    if (minutes > 0 && days === 0) durationString += `${minutes}m`; // Only show minutes if less than a day and some minutes exist
    if (durationString.trim() === "") return "<1m"; // If very short duration
    return durationString.trim();
}

// Endpoint Logic (Implementations will go here)

async function fetchUsgsDataWithCache(usgsUrl, waitUntil) {
  const cache = caches.default;
  let response = await cache.match(usgsUrl);

  if (!response) {
    console.log(`Cache miss for ${usgsUrl}. Fetching from origin.`);
    const originResponse = await fetch(usgsUrl);
    if (!originResponse.ok) {
      throw new Error(`Failed to fetch from USGS: ${originResponse.status} ${originResponse.statusText}`);
    }
    // Clone the response to be able to read its body and still cache it
    response = originResponse.clone();
    // Cache the response with a TTL of 300 seconds (5 minutes)
    waitUntil(cache.put(usgsUrl, originResponse.clone(), { expirationTtl: 300 }));
    return response.json();
  } else {
    console.log(`Cache hit for ${usgsUrl}.`);
    return response.json();
  }
}


async function handleFeedRequest(url, waitUntil) {
  const searchParams = new URL(url).searchParams;
  const period = searchParams.get('period') || 'last_24_hours'; // Default to last_24_hours

  let baseUsgsUrl;
  // Determine which base URL to use based on the period requested
  if (period === 'last_14_days' || period === 'last_30_days' || period.endsWith('_quakes_30_days')) {
    baseUsgsUrl = USGS_API_URL_MONTH;
  } else {
    baseUsgsUrl = USGS_API_URL_WEEK; // Covers up to 7 days
  }

  const sourceData = await fetchUsgsDataWithCache(baseUsgsUrl, waitUntil);
  let allEarthquakes = sourceData.features;
  let filtered_earthquakes = [];
  const now = Date.now();

  switch (period) {
    case 'last_hour':
      filtered_earthquakes = allEarthquakes.filter(q => (now - q.properties.time) < MILLISECONDS_PER_HOUR);
      break;
    case 'last_24_hours':
      filtered_earthquakes = allEarthquakes.filter(q => (now - q.properties.time) < MILLISECONDS_PER_DAY);
      break;
    case 'last_7_days': // Data from week feed is already within 7 days
      filtered_earthquakes = allEarthquakes.filter(q => (now - q.properties.time) < 7 * MILLISECONDS_PER_DAY);
      break;
    case 'last_14_days': // Data from month feed
      filtered_earthquakes = allEarthquakes.filter(q => (now - q.properties.time) < 14 * MILLISECONDS_PER_DAY);
      break;
    case 'last_30_days': // Data from month feed is already within 30 days
      filtered_earthquakes = allEarthquakes; // Month feed is inherently last 30 days
      break;
    case 'feelable_quakes_7_days':
      filtered_earthquakes = allEarthquakes.filter(q =>
        (now - q.properties.time) < 7 * MILLISECONDS_PER_DAY && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD
      );
      break;
    case 'significant_quakes_7_days':
      filtered_earthquakes = allEarthquakes.filter(q =>
        (now - q.properties.time) < 7 * MILLISECONDS_PER_DAY && q.properties.mag >= MAJOR_QUAKE_THRESHOLD
      );
      break;
    case 'feelable_quakes_30_days':
      filtered_earthquakes = allEarthquakes.filter(q => q.properties.mag >= FEELABLE_QUAKE_THRESHOLD); // Month feed is inherently last 30 days
      break;
    case 'significant_quakes_30_days':
      filtered_earthquakes = allEarthquakes.filter(q => q.properties.mag >= MAJOR_QUAKE_THRESHOLD); // Month feed is inherently last 30 days
      break;
    default:
      // Default to last_24_hours if an unknown period is provided
      filtered_earthquakes = allEarthquakes.filter(q => (now - q.properties.time) < MILLISECONDS_PER_DAY);
  }

  // Sort by time descending for most views
  filtered_earthquakes.sort((a,b) => b.properties.time - a.properties.time);

  const statistics = calculateStats(filtered_earthquakes);

  const responseData = {
    period,
    lastUpdated: sourceData.metadata.generated,
    earthquakes: filtered_earthquakes,
    statistics,
    sourceFeed: baseUsgsUrl === USGS_API_URL_WEEK ? 'USGS All Week' : 'USGS All Month',
  };

  return new Response(JSON.stringify(responseData), {
    headers: { 'Content-Type': 'application/json' },
  });
}


async function handleOverviewDataRequest(url, waitUntil) {
  const sourceData7Day = await fetchUsgsDataWithCache(USGS_API_URL_WEEK, waitUntil);
  const allQuakes7Day = sourceData7Day.features;
  const now = Date.now();

  // keyStatsForGlobe
  const quakesLast1hr = allQuakes7Day.filter(q => (now - q.properties.time) < MILLISECONDS_PER_HOUR);
  const quakesLast24hr = allQuakes7Day.filter(q => (now - q.properties.time) < MILLISECONDS_PER_DAY);
  const quakesLast72hr = allQuakes7Day.filter(q => (now - q.properties.time) < 3 * MILLISECONDS_PER_DAY);

  const stats24h = calculateStats(quakesLast24hr);
  const strongest24h = stats24h.strongestQuake ?
    { mag: stats24h.strongestQuake.mag, title: stats24h.strongestQuake.title, time: stats24h.strongestQuake.time } :
    { mag: 0, title: "N/A" };

  const keyStatsForGlobe = {
    lastHourCount: quakesLast1hr.length,
    count24h: quakesLast24hr.length,
    count72h: quakesLast72hr.length,
    strongest24h: strongest24h,
  };

  // topActiveRegionsOverview
  const regionCounts = {};
  quakesLast24hr.forEach(quake => {
    const regionName = getRegionForEarthquake(quake, REGIONS);
    regionCounts[regionName] = (regionCounts[regionName] || 0) + 1;
  });
  const topActiveRegionsOverview = Object.entries(regionCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 3) // Top 3 regions
    .map(([name, count]) => ({ name, count }));


  // latestFeelableQuakesSnippet
  const latestFeelableQuakesSnippet = allQuakes7Day
    .filter(q => (now - q.properties.time) < MILLISECONDS_PER_DAY && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD)
    .sort((a, b) => b.properties.time - a.properties.time)
    .slice(0, 3)
    .map(q => ({
      id: q.id,
      title: q.properties.place,
      mag: q.properties.mag,
      time: q.properties.time,
      timeAgo: formatTimeAgo(now - q.properties.time),
      url: q.properties.url,
    }));

  // recentSignificantQuakesForOverview
  const recentSignificantQuakesForOverview = allQuakes7Day
    .filter(q => q.properties.mag >= MAJOR_QUAKE_THRESHOLD)
    .sort((a, b) => b.properties.time - a.properties.time)
    // No slice, show all significant in last 7 days for overview
    .map(q => ({
      id: q.id,
      title: q.properties.place,
      mag: q.properties.mag,
      time: q.properties.time,
      timeAgo: formatTimeAgo(now - q.properties.time),
      depth: q.geometry.coordinates[2],
      url: q.properties.url,
    }));

  // overviewClusters
  const quakesForClusters = allQuakes7Day.filter(q => (now - q.properties.time) < 3 * MILLISECONDS_PER_DAY); // Use last 72 hours for clusters
  const activeClustersRaw = findActiveClusters(quakesForClusters, CLUSTER_MAX_DISTANCE_KM, CLUSTER_MIN_QUAKES);

  const overviewClusters = activeClustersRaw
    .slice(0, TOP_N_CLUSTERS_OVERVIEW)
    .map(cluster => ({
      id: cluster.id,
      locationName: cluster.title, // Simplified, might need better naming from original quake place names
      quakeCount: cluster.quakeCount,
      maxMagnitude: cluster.maxMagnitude,
      timeRange: `${formatTimeAgo(now - cluster.maxTime)} - ${formatTimeAgo(now - cluster.minTime)}`,
      duration: formatTimeDuration(cluster.maxTime - cluster.minTime),
      centerLat: cluster.centerLat,
      centerLon: cluster.centerLon,
      // Optionally, include a few key quakes or all of them if payload size allows
      // originalQuakes: cluster.earthquakes.slice(0,3).map(q => ({mag: q.properties.mag, title: q.properties.place, time: q.properties.time}))
    }));


  const responseData = {
    lastUpdated: sourceData7Day.metadata.generated,
    keyStatsForGlobe,
    topActiveRegionsOverview,
    latestFeelableQuakesSnippet,
    recentSignificantQuakesForOverview,
    overviewClusters,
    sourceFeed: 'USGS All Week',
  };

  return new Response(JSON.stringify(responseData), {
    headers: { 'Content-Type': 'application/json' },
  });
}
