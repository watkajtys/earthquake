import { createScheduledTaskLogger } from '../../src/utils/scheduledTaskLogger.js';

/**
 * @summary Scheduled task to pre-generate earthquake lists and save them to R2.
 * @description This function is designed to be triggered by a cron schedule. It queries
 * the D1 database for earthquake events within three time windows ("day", "week", "month"),
 * generates JSON lists for each, and uploads them to an R2 bucket.
 */

/**
 * Fetches earthquake data for a specific time window from the D1 database.
 * @param {D1Database} db - The D1 database binding.
 * @param {string} timeWindow - The time window ('day', 'week', 'month').
 * @returns {Promise<Array<object>>} A promise that resolves to an array of earthquake records.
 */
async function fetchEarthquakeData(db, timeWindow) {
  let startTime;
  const now = new Date();

  if (timeWindow === "week") {
    startTime = new Date(now.setDate(now.getDate() - 7));
  } else if (timeWindow === "month") {
    startTime = new Date(now.setMonth(now.getMonth() - 1));
  } else { // Default to "day"
    startTime = new Date(now.setDate(now.getDate() - 1));
  }

  const startTimeMilliseconds = startTime.getTime();

  const query = `
    SELECT
      id,
      magnitude,
      place,
      event_time,
      latitude,
      longitude,
      depth
    FROM EarthquakeEvents
    WHERE event_time >= ?
    ORDER BY event_time DESC;
  `;

  const stmt = db.prepare(query).bind(startTimeMilliseconds);
  const { results } = await stmt.all();
  return results || [];
}

/**
 * The main handler for the scheduled list generation task.
 * @param {object} env - The environment object with bindings.
 * @param {D1Database} env.DB - The D1 database binding.
 * @param {R2Bucket} env.GEOJSON_BUCKET - The R2 bucket for storing lists.
 */
async function handleGenerateLists({ env }) {
  const { DB, GEOJSON_BUCKET } = env;

  if (!DB || !GEOJSON_BUCKET) {
    throw new Error("[generate-lists] Missing required DB or GEOJSON_BUCKET bindings.");
  }

  const timeWindows = ["day", "week", "month"];
  for (const timeWindow of timeWindows) {
    const data = await fetchEarthquakeData(DB, timeWindow);
    const fileName = `list-${timeWindow}.json`;
    const jsonData = JSON.stringify(data);

    await GEOJSON_BUCKET.put(fileName, jsonData, {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=300', // 5-minute cache
      },
    });
  }
}

export default {
  async scheduled(controller, env, ctx) {
    const logger = createScheduledTaskLogger("generate-lists", controller.scheduledTime);
    try {
      await handleGenerateLists({ env });
      logger.logTaskCompletion(true, { message: "Successfully generated all lists." });
    } catch (e) {
      logger.logError("generate-lists-failed", e, {}, true);
      logger.logTaskCompletion(false, { error: e.message });
    }
  }
}
