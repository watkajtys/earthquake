/**
 * @file functions/background/process-clusters.js
 * @description Background worker task to calculate and store significant cluster definitions in D1.
 * This is a scheduled task, decoupled from the live user-facing API.
 */

import { findActiveClustersOptimized } from '../utils/spatialClusterUtils.js';
import { julesTask } from './jules-task.js';
import { CLUSTER_MIN_QUAKES } from '../../src/constants/appConstants.js';

// --- Main Processing Logic ---

export async function processAndStoreSignificantClusters(env) {
  console.log("BACKGROUND_PROCESS: Starting significant cluster processing.");

  const { DB } = env;
  if (!DB) {
    console.error("BACKGROUND_PROCESS: D1 Database (DB) binding not found. Aborting.");
    return;
  }

  // 1. Fetch the latest, comprehensive earthquake data from our own API.
  // This ensures we are processing the same data that users see.
  let earthquakes = [];
  try {
    // We call the get-earthquakes endpoint to get all recent quakes from D1.
    // This is more reliable than hitting the USGS proxy directly.
    const response = await fetch("https://earthquakeslive.com/api/get-earthquakes?timeWindow=last_30_days&minMag=1");
    if (!response.ok) {
      throw new Error(`Failed to fetch earthquakes: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    earthquakes = data.features;
    console.log(`BACKGROUND_PROCESS: Fetched ${earthquakes.length} earthquakes for processing.`);
  } catch (error) {
    console.error("BACKGROUND_PROCESS: Failed to fetch earthquake data.", error);
    return;
  }

  if (earthquakes.length === 0) {
    console.log("BACKGROUND_PROCESS: No earthquakes to process. Exiting.");
    return;
  }

  // 2. Calculate clusters using the most robust algorithm.
  const clusters = findActiveClustersOptimized(earthquakes, 100, CLUSTER_MIN_QUAKES);
  console.log(`BACKGROUND_PROCESS: Calculated ${clusters.length} potential clusters.`);

  // 3. Process and store only the significant ones in D1.
  await julesTask(env, clusters);
}
