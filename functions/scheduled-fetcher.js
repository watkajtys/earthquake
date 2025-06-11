// functions/scheduled-fetcher.js
import { upsertEarthquakeFeaturesToD1 } from '../src/utils/d1Utils.js';

export default {
  async scheduled(event, env, ctx) {
    console.log(`[scheduled-fetcher] Triggered at ${new Date(event.scheduledTime).toISOString()}`);

    if (!env.DB) {
      console.error("[scheduled-fetcher] D1 Database (DB) binding not found.");
      return;
    }

    const USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

    try {
      console.log(`[scheduled-fetcher] Fetching earthquake data from ${USGS_FEED_URL}`);
      const response = await fetch(USGS_FEED_URL, {
        headers: { 'User-Agent': 'CloudflareWorker-EarthquakeFetcher/1.0' } // Good practice to set a User-Agent
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[scheduled-fetcher] Error fetching data from USGS: ${response.status} ${response.statusText} - ${errorText}`);
        return;
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.features) || data.features.length === 0) {
        console.log("[scheduled-fetcher] No earthquake features found in the response or data is invalid.");
        return;
      }

      console.log(`[scheduled-fetcher] Fetched ${data.features.length} earthquake features. Starting D1 upsert.`);

      // Use ctx.waitUntil to ensure the async operations complete
      ctx.waitUntil(upsertEarthquakeFeaturesToD1(env.DB, data.features).catch(err => {
        // The utility function already logs errors internally, but we can log a context-specific error here if needed.
        console.error(`[scheduled-fetcher] Error during D1 upsert process initiated by scheduled fetcher: ${err.message}`, err);
      }));

    } catch (error) {
      console.error(`[scheduled-fetcher] Unhandled error in scheduled function: ${error.message}`, error);
    }
  }
};
