import { createScheduledTaskLogger } from '../../src/utils/scheduledTaskLogger.js';

/**
 * @summary Bootstraps earthquake lists from D1 if they do not exist in R2.
 * @description This function is a fallback mechanism to populate the initial lists
 * by querying the D1 database. It should only run when an R2 list is missing.
 * @param {D1Database} db - The D1 database binding.
 * @param {string} timeWindow - The time window ('day', 'week', 'month').
 * @returns {Promise<Array<object>>} A promise that resolves to an array of earthquake records.
 */
async function fetchInitialEarthquakeDataFromD1(db, timeWindow) {
  console.log(`[generate-lists] Bootstrapping '${timeWindow}' list from D1.`);
  let startTime;
  const now = new Date();

  // Correctly calculate start times without mutating the 'now' object.
  if (timeWindow === "week") {
    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (timeWindow === "month") {
    // Using 30 days as a consistent approximation for a month.
    startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else { // Default to "day"
    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const startTimeMilliseconds = startTime.getTime();

  const query = `
    SELECT id, magnitude, place, event_time, latitude, longitude, depth
    FROM EarthquakeEvents
    WHERE event_time >= ?
    ORDER BY event_time DESC;
  `;

  try {
    const stmt = db.prepare(query).bind(startTimeMilliseconds);
    const { results } = await stmt.all();
    return results || [];
  } catch (error) {
    console.error(`[generate-lists] D1 bootstrap query failed for '${timeWindow}':`, error);
    // Return an empty array on failure to prevent cascading errors.
    return [];
  }
}

/**
 * Transforms a full GeoJSON feature into the simplified object structure used in the lists.
 * @param {object} feature - The GeoJSON feature object from the USGS feed.
 * @returns {object} A simplified earthquake object.
 */
const transformFeatureToListObject = (feature) => {
  if (!feature || !feature.properties || !feature.geometry || !feature.geometry.coordinates) {
    // Return null for invalid features to be filtered out later.
    return null;
  }
  return {
    id: feature.id,
    magnitude: feature.properties.mag,
    place: feature.properties.place,
    event_time: feature.properties.time,
    latitude: feature.geometry.coordinates[1],
    longitude: feature.geometry.coordinates[0],
    depth: feature.geometry.coordinates[2],
  };
};

/**
 * The main handler for the scheduled list generation task.
 * @param {object} context - The context object.
 * @param {object} context.env - The environment object with bindings.
 * @param {D1Database} [context.env.DB] - The D1 database binding (optional, for bootstrapping).
 * @param {R2Bucket} context.env.GEOJSON_BUCKET - The R2 bucket for storing lists.
 * @param {Array<object>} context.newFeatures - The array of new or updated earthquake GeoJSON features.
 */
export async function handleGenerateLists({ env, newFeatures }) {
  const { DB, GEOJSON_BUCKET } = env;

  if (!GEOJSON_BUCKET) {
    throw new Error("[generate-lists] Missing required GEOJSON_BUCKET binding.");
  }

  if (!newFeatures || !Array.isArray(newFeatures) || newFeatures.length === 0) {
    console.log("[generate-lists] No new features to process. Skipping list generation.");
    return;
  }

  // Transform the new features into the simplified list format and filter out any invalid ones.
  const newEarthquakes = newFeatures.map(transformFeatureToListObject).filter(Boolean);

  if (newEarthquakes.length === 0) {
    console.log("[generate-lists] New features were invalid or empty after transformation. Skipping.");
    return;
  }

  const timeWindows = ["day", "week", "month"];
  const now = new Date();

  for (const timeWindow of timeWindows) {
    const fileName = `list-${timeWindow}.json`;
    let existingData = [];

    try {
      const r2Object = await GEOJSON_BUCKET.get(fileName);
      if (r2Object !== null) {
        existingData = await r2Object.json();
      } else {
        console.log(`[generate-lists] R2 object '${fileName}' not found. Attempting to bootstrap from D1.`);
        if (DB) {
          existingData = await fetchInitialEarthquakeDataFromD1(DB, timeWindow);
        } else {
          console.warn(`[generate-lists] Cannot bootstrap '${fileName}': DB binding is missing. Starting with an empty list.`);
        }
      }
    } catch (e) {
      console.error(`[generate-lists] Error reading or parsing R2 object '${fileName}'. Attempting to bootstrap from D1.`, e);
      if (DB) {
        existingData = await fetchInitialEarthquakeDataFromD1(DB, timeWindow);
      } else {
        console.warn(`[generate-lists] Cannot bootstrap '${fileName}' after parse error: DB binding is missing. Starting fresh.`);
      }
    }

    // Use a Map to efficiently merge the new earthquakes, automatically handling duplicates.
    const earthquakeMap = new Map(existingData.map(eq => [eq.id, eq]));
    newEarthquakes.forEach(eq => earthquakeMap.set(eq.id, eq));

    // Define the time boundaries for trimming the list.
    let startTimeMs;
    if (timeWindow === "week") {
      startTimeMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    } else if (timeWindow === "month") {
      startTimeMs = now.getTime() - 30 * 24 * 60 * 60 * 1000; // 30-day approximation
    } else { // "day"
      startTimeMs = now.getTime() - 24 * 60 * 60 * 1000;
    }

    // Filter the merged list to remove events outside the time window.
    const trimmedList = Array.from(earthquakeMap.values()).filter(eq => eq.event_time >= startTimeMs);

    // Sort the final list by event time, descending.
    trimmedList.sort((a, b) => b.event_time - a.event_time);

    // Write the updated list back to R2.
    await GEOJSON_BUCKET.put(fileName, JSON.stringify(trimmedList), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=300', // 5-minute browser cache
      },
    });

    console.log(`[generate-lists] Successfully updated '${fileName}' with ${trimmedList.length} total events.`);
  }
}
