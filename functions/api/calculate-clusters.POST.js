// functions/api/calculate-clusters.js

/**
 * @file Cloudflare Pages Function for calculating earthquake clusters.
 * @module functions/api/calculate-clusters
 *
 * @description
 * This function handles POST requests to `/api/calculate-clusters`. It receives a list of
 * earthquakes and clustering parameters, then calculates geographical clusters of these earthquakes.
 *
 * The primary responsibilities of this module are:
 * 1.  **Receive and Validate Input**: Accepts a JSON payload containing an array of earthquake
 *     features and clustering parameters (`maxDistanceKm`, `minQuakes`). It performs
 *     rigorous validation on this input.
 * 2.  **Calculate Clusters**: Uses one of two algorithms to group earthquakes into clusters
 *     based on their proximity:
 *     - A standard, brute-force algorithm for smaller datasets.
 *     - A spatially optimized algorithm (`findActiveClustersOptimized`) for larger datasets to
 *       improve performance.
 * 3.  **Background Processing for Significant Clusters**: After calculating clusters, it
 *     initiates a background task (`ctx.waitUntil`) to process "significant" clusters.
 *     A cluster is deemed significant if it meets criteria for the number of quakes and
 *     the magnitude of its strongest event (defined in `appConstants.js`).
 * 4.  **Store Cluster Definitions**: The background task identifies significant clusters,
 *     generates a stable, unique key for each, and then stores or updates their definitions
 *     in a D1 database (`ClusterDefinitions` table). This creates a persistent record of
 *     notable seismic activity.
 * 5.  **Return Calculated Clusters**: The function immediately returns the array of calculated
 *     clusters to the client, without waiting for the background D1 storage to complete.
 *
 * This endpoint does **not** use caching for the cluster calculation results itself, but it
 * is a critical part of the data pipeline for identifying and persisting important seismic events.
 *
 * @see {@link findActiveClusters} for the standard clustering algorithm.
 * @see {@link findActiveClustersOptimized} for the performance-optimized clustering algorithm.
 * @see {@link storeClusterDefinitionsInBackground} for the background D1 storage logic.
 * @see {@link '../../src/constants/appConstants.js'} for cluster significance criteria.
 */
import { calculateDistance } from '../utils/mathUtils.js';
import { storeClusterDefinition } from '../utils/d1ClusterUtils.js';
import { randomUUID } from 'node:crypto';
import { CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE } from '../../src/constants/appConstants.js';
import { findActiveClustersOptimized } from '../utils/spatialClusterUtils.js';

// Constants for defining significant clusters -- REMOVED
// const MIN_QUAKES_FOR_DEFINITION = 5; // No longer needed, using CLUSTER_MIN_QUAKES from appConstants
// const MIN_MAG_FOR_DEFINITION = 3.0; // No longer needed, using DEFINED_CLUSTER_MIN_MAGNITUDE from appConstants

/**
 * @name Helper Functions for Cluster Definition
 * @description A collection of utility functions used to extract specific metrics and generate
 * metadata for a given cluster of earthquakes. These are primarily used when creating
 * or updating a cluster's definition in the D1 database.
 */

/**
 * Finds and returns the earthquake with the highest magnitude from a given cluster.
 *
 * @function getStrongestQuake
 * @param {Array<object>} cluster - An array of GeoJSON Feature objects, where each object represents an earthquake.
 * @returns {object|null} The GeoJSON Feature object for the earthquake with the highest magnitude.
 *                        Returns `null` if the cluster is empty or invalid.
 */
function getStrongestQuake(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((maxQuake, currentQuake) =>
    (currentQuake.properties.mag > maxQuake.properties.mag) ? currentQuake : maxQuake, cluster[0]);
}

/**
 * Gets the minimum magnitude from a cluster of earthquakes.
 * @param {Array<Object>} cluster - An array of earthquake objects.
 * @returns {number|null} The minimum magnitude, or null if cluster is empty.
 */
function getMinMagnitude(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((min, q) => Math.min(min, q.properties.mag), cluster[0].properties.mag);
}

/**
 * Calculates the mean (average) magnitude of earthquakes in a cluster.
 * @param {Array<Object>} cluster - An array of earthquake objects.
 * @returns {number|null} The mean magnitude, or null if cluster is empty.
 */
function getMeanMagnitude(cluster) {
  if (!cluster || cluster.length === 0) return null;
  const sum = cluster.reduce((acc, q) => acc + q.properties.mag, 0);
  return sum / cluster.length;
}

/**
 * Gets the earliest start time from a cluster of earthquakes.
 * @param {Array<Object>} cluster - An array of earthquake objects.
 * @returns {number|null} The earliest timestamp (milliseconds), or null if cluster is empty.
 */
function getStartTime(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((min, q) => Math.min(min, q.properties.time), cluster[0].properties.time);
}

/**
 * Gets the latest end time from a cluster of earthquakes.
 * @param {Array<Object>} cluster - An array of earthquake objects.
 * @returns {number|null} The latest timestamp (milliseconds), or null if cluster is empty.
 */
function getEndTime(cluster) {
  if (!cluster || cluster.length === 0) return null;
  return cluster.reduce((max, q) => Math.max(max, q.properties.time), cluster[0].properties.time);
}

/**
 * Calculates and formats the depth range of earthquakes in a cluster.
 * @param {Array<Object>} cluster - An array of earthquake objects.
 * @returns {string} A string representing the depth range (e.g., "10.0-25.5km"), or "Unknown".
 */
function getDepthRangeString(cluster) {
  if (!cluster || cluster.length === 0) return "Unknown";
  const depths = cluster
    .map(q => q.geometry?.coordinates?.[2])
    .filter(d => d !== undefined && d !== null && typeof d === 'number');
  if (depths.length === 0) return "Unknown";
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  return `${minDepth.toFixed(1)}-${maxDepth.toFixed(1)}km`;
}

/**
 * Generates a URL-friendly and descriptive slug for a cluster definition.
 * The slug incorporates the number of quakes, location, maximum magnitude, and a unique
 * identifier derived from the cluster's stable key to ensure uniqueness and prevent collisions.
 *
 * @function generateSlug
 * @param {number} quakeCount - The total number of earthquakes in the cluster.
 * @param {string} locationName - The geographical name associated with the cluster (e.g., "near Anytown").
 * @param {number} maxMagnitude - The magnitude of the strongest earthquake in the cluster.
 * @param {string} stableKey - The unique, stable identifier for the cluster. This key is parsed
 *                           to extract a time and geo component for the slug.
 * @returns {string} A URL-friendly slug (e.g., "5-quakes-near-anytown-m4.5-123456-34d5-118d2").
 */
function generateSlug(quakeCount, locationName, maxMagnitude, stableKey) {
  const safeLocationBase = (locationName || "unknown-location")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Allow letters, numbers, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single

  // Extract components from stableKey. Example stableKey: "v1_anytown_123456_34.5-118.2"
  const keyParts = stableKey.split('_');
  let stableKeyIdentifier = "";
  if (keyParts.length >= 4) {
    // Use timeComponent and a sanitized geoComponent
    // keyParts[0] is version, keyParts[1] is location (not used directly here),
    // keyParts[2] is time, keyParts[3] is geo
    const timePart = keyParts[2];
    // Sanitize geoPart: replace dots, ensure it's not too long.
    const geoPart = keyParts[3].replace(/\./g, 'd').replace(/[^a-z0-9-]/g, '').substring(0, 15);
    stableKeyIdentifier = `${timePart}-${geoPart}`;
  } else {
    // Fallback: generate a short hash of the stableKey if parsing fails
    let hash = 0;
    for (let i = 0; i < stableKey.length; i++) {
      const char = stableKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    // Use a prefix "skh" (stable key hash) to denote this fallback was used.
    stableKeyIdentifier = `skh${Math.abs(hash).toString(36).substring(0, 6)}`;
  }

  const magStr = typeof maxMagnitude === 'number' ? maxMagnitude.toFixed(1) : 'unknown';
  const countStr = Number.isFinite(quakeCount) ? quakeCount : 'multiple';
  const locationSlugPart = safeLocationBase.slice(0, 30).replace(/^-+|-+$/g, '');

  return `${countStr}-quakes-near-${locationSlugPart}-m${magStr}-${stableKeyIdentifier}`;
}

/**
 * Generates a title for a cluster.
 * @param {number} quakeCount - Number of earthquakes in the cluster.
 * @param {string} locationName - Name of the location of the cluster.
 * @param {number} maxMagnitude - Maximum magnitude in the cluster.
 * @returns {string} A title string for the cluster.
 */
function generateTitle(quakeCount, locationName, maxMagnitude) {
  const safeLocation = locationName || "Unknown Location";
  return `Cluster: ${quakeCount} events near ${safeLocation}, max M${maxMagnitude.toFixed(1)}`;
}

/**
 * Generates a description for a cluster.
 * @param {number} quakeCount - Number of earthquakes in the cluster.
 * @param {string} locationName - Name of the location of the cluster.
 * @param {number} maxMagnitude - Maximum magnitude in the cluster.
 * @param {number} durationHours - Duration of the cluster in hours.
 * @returns {string} A description string for the cluster.
 */
function generateDescription(quakeCount, locationName, maxMagnitude, durationHours) {
  const durationStr = durationHours > 0 ? `approx ${durationHours.toFixed(1)} hours` : "a short period";
  return `A cluster of ${quakeCount} earthquakes occurred near ${locationName}. Strongest: M${maxMagnitude.toFixed(1)}. Duration: ${durationStr}.`;
}


// NOTE: This version of findActiveClusters is adapted for backend use.
// It differs from the frontend version in src/utils/clusterUtils.js primarily in:
//    - Includes a check to prevent adding duplicate clusters based on quake IDs.
//    - Logging is adjusted for a backend environment.
// It uses calculateDistance imported from '../utils/mathUtils.js' (synced from /common/mathUtils.js).
// Algorithmic changes to core clustering logic should be synchronized with the frontend version where applicable.

// New helper function to generate a stable key for a cluster
function generateStableClusterKey(calculatedCluster, strongestQuakeInCalcCluster) {
  const D_STABLE_KEY_VERSION = "v1"; // To allow for future changes in key generation logic

  let locationComponent = "unknown-location";
  if (strongestQuakeInCalcCluster && strongestQuakeInCalcCluster.properties && strongestQuakeInCalcCluster.properties.place) {
    const place = strongestQuakeInCalcCluster.properties.place;
    const parts = place.split(" of ");
    const generalPlace = parts.length > 1 ? parts[parts.length - 1] : place;
    locationComponent = generalPlace.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 30);
    if (!locationComponent) locationComponent = "unknown-location"; // Ensure not empty
  }

  const startTime = getStartTime(calculatedCluster); // Assuming getStartTime is available
  const sixHoursInMillis = 6 * 60 * 60 * 1000;
  const timeComponent = Math.floor(startTime / sixHoursInMillis);

  let geoComponent = "0.0-0.0";
  if (strongestQuakeInCalcCluster && strongestQuakeInCalcCluster.geometry && strongestQuakeInCalcCluster.geometry.coordinates) {
    const lon = strongestQuakeInCalcCluster.geometry.coordinates[0];
    const lat = strongestQuakeInCalcCluster.geometry.coordinates[1];
    if (typeof lon === 'number' && typeof lat === 'number') {
      geoComponent = `${lat.toFixed(1)}-${lon.toFixed(1)}`;
    }
  }
  return `${D_STABLE_KEY_VERSION}_${locationComponent}_${timeComponent}_${geoComponent}`;
}


/**
 * Asynchronously stores or updates definitions for significant earthquake clusters in the D1 database.
 * This function is designed to be executed as a background task via `ctx.waitUntil`, ensuring it
 * does not delay the response to the client.
 *
 * A cluster is deemed "significant" if it meets the minimum quake count and maximum magnitude
 * thresholds defined in the application's constants.
 *
 * For each significant cluster, the function:
 * 1.  Generates a `stableKey`, a unique identifier based on the cluster's location, start time, and version.
 * 2.  Checks if a cluster with this `stableKey` already exists in the `ClusterDefinitions` table.
 * 3.  **If it exists**, the function updates the existing record with the latest data from the
 *     current calculation (e.g., new quake count, updated end time, new earthquake IDs).
 * 4.  **If it does not exist**, it creates a new record for the cluster, generating a new UUID,
 *     slug, and other metadata.
 *
 * The function logs its progress, including the number of significant clusters found, the number
 * of definitions successfully stored or updated, and any errors that occur during the process.
 *
 * @async
 * @function storeClusterDefinitionsInBackground
 * @param {D1Database} db - The D1 database instance from the Cloudflare environment (`env.DB`).
 * @param {Array<Array<object>>} clusters - An array of calculated clusters. Each cluster is an array of GeoJSON Feature objects.
 * @param {number} CLUSTER_MIN_QUAKES_CONST - The minimum number of quakes required for a cluster to be considered significant.
 * @param {number} DEFINED_CLUSTER_MIN_MAGNITUDE_CONST - The minimum magnitude of the strongest quake required for a cluster to be significant.
 * @returns {Promise<void>} A promise that resolves when the processing of all significant clusters is complete.
 */
async function storeClusterDefinitionsInBackground(db, clusters, CLUSTER_MIN_QUAKES_CONST, DEFINED_CLUSTER_MIN_MAGNITUDE_CONST) {
  if (!db || !clusters || clusters.length === 0) {
    console.log("storeClusterDefinitionsInBackground: DB not available or no clusters to process.");
    return;
  }

  console.log(`storeClusterDefinitionsInBackground: Starting processing of ${clusters.length} clusters for potential definition storage.`);
  let significantClusterCount = 0;
  let processedCount = 0; // Renamed from storedCount to reflect updates too
  let errorCount = 0;

  for (const calculatedCluster of clusters) {
    if (!calculatedCluster || calculatedCluster.length === 0) continue;

    const strongestQuakeInCalcCluster = getStrongestQuake(calculatedCluster);
    if (!strongestQuakeInCalcCluster || !strongestQuakeInCalcCluster.properties || !strongestQuakeInCalcCluster.id) {
        console.warn("storeClusterDefinitionsInBackground: Skipping cluster definition due to missing strongest quake, properties, or ID.");
        continue;
    }

    const clusterMaxMag = strongestQuakeInCalcCluster.properties.mag;

    if (calculatedCluster.length >= CLUSTER_MIN_QUAKES_CONST && clusterMaxMag >= DEFINED_CLUSTER_MIN_MAGNITUDE_CONST) {
      significantClusterCount++;

      const stableKey = generateStableClusterKey(calculatedCluster, strongestQuakeInCalcCluster);
      const quakeCount = calculatedCluster.length;
      const startTime = getStartTime(calculatedCluster);
      const endTime = getEndTime(calculatedCluster);
      const durationHours = (endTime > startTime) ? (endTime - startTime) / (1000 * 60 * 60) : 0;
      const locationName = strongestQuakeInCalcCluster.properties.place || "Unknown Location";
      const maxMagnitude = clusterMaxMag;
      const newEarthquakeIds = calculatedCluster.map(q => q.id);
      const newStrongestQuakeId = strongestQuakeInCalcCluster.id;
      const newMinMagnitude = getMinMagnitude(calculatedCluster);
      const newMeanMagnitude = getMeanMagnitude(calculatedCluster);
      const newDepthRange = getDepthRangeString(calculatedCluster);
      const newCentroidLat = strongestQuakeInCalcCluster.geometry.coordinates[1] || 0;
      const newCentroidLon = strongestQuakeInCalcCluster.geometry.coordinates[0] || 0;
      const newTitle = generateTitle(quakeCount, locationName, maxMagnitude);
      const newDescription = generateDescription(quakeCount, locationName, maxMagnitude, durationHours);
      const newSignificanceScore = quakeCount > 0 ? maxMagnitude * Math.log10(quakeCount) : 0;

      try {
        const existingStmt = db.prepare("SELECT id, slug, version FROM ClusterDefinitions WHERE stableKey = ?").bind(stableKey);
        const existingDefinition = await existingStmt.first();

        if (existingDefinition) {
          // Update existing definition
          const updatedVersion = (existingDefinition.version || 1) + 1;
          const updateSql = `
            UPDATE ClusterDefinitions
            SET earthquakeIds = ?, quakeCount = ?, strongestQuakeId = ?, maxMagnitude = ?,
                minMagnitude = ?, meanMagnitude = ?, endTime = ?, durationHours = ?,
                locationName = ?, centroidLat = ?, centroidLon = ?, depthRange = ?,
                title = ?, description = ?, significanceScore = ?, version = ?,
                updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?`;
          // Note: `updatedAt` is explicitly set here. If a DB trigger also sets it, ensure they don't conflict.
          // The d1ClusterUtils.js storeClusterDefinition also sets it, but we are bypassing that for updates here.
          // If the DB trigger is robust, explicit setting here might be redundant.

          await db.prepare(updateSql).bind(
            JSON.stringify(newEarthquakeIds), quakeCount, newStrongestQuakeId, maxMagnitude,
            newMinMagnitude, newMeanMagnitude, endTime, durationHours,
            locationName, newCentroidLat, newCentroidLon, newDepthRange,
            newTitle, newDescription, newSignificanceScore, updatedVersion,
            existingDefinition.id // Use the existing primary key 'id'
          ).run();
          console.log(`storeClusterDefinitionsInBackground: Successfully updated definition for cluster with stableKey ${stableKey} (ID: ${existingDefinition.id})`);
          processedCount++;
        } else {
          // Create new definition
          const newClusterId = randomUUID(); // Primary key for the table
          // generateSlug now takes stableKey to make initial slug creation more deterministic
          const newSlug = generateSlug(quakeCount, locationName, maxMagnitude, stableKey);

          const clusterDataForStoreUtil = {
            id: newClusterId,
            stableKey: stableKey, // Store the stableKey
            earthquakeIds: newEarthquakeIds, // Already an array
            quakeCount: quakeCount,
            strongestQuakeId: newStrongestQuakeId,
            maxMagnitude: maxMagnitude,
            minMagnitude: newMinMagnitude,
            meanMagnitude: newMeanMagnitude,
            startTime: startTime, // Initial start time
            endTime: endTime,
            durationHours: durationHours,
            locationName: locationName,
            centroidLat: newCentroidLat,
            centroidLon: newCentroidLon,
            radiusKm: 0,
            depthRange: newDepthRange,
            slug: newSlug,
            title: newTitle,
            description: newDescription,
            significanceScore: newSignificanceScore,
            version: 1, // Initial version
          };

          // Use the existing storeClusterDefinition utility, which handles JSON stringification of earthquakeIds
          // and sets createdAt/updatedAt. We might need to adjust storeClusterDefinition if it
          // doesn't expect stableKey or if its behavior for updatedAt conflicts.
          // For now, assume storeClusterDefinition can take `stableKey` as an extra param or it's added to its schema.
          // The `storeClusterDefinition` in `d1ClusterUtils.js` will need to be adapted to accept `stableKey`.
          const result = await storeClusterDefinition(db, clusterDataForStoreUtil);

          if (result.success) {
            console.log(`storeClusterDefinitionsInBackground: Successfully stored new definition for cluster ${newClusterId} with stableKey ${stableKey}`);
            processedCount++;
          } else {
            console.error(`storeClusterDefinitionsInBackground: Failed to store new definition for cluster ${newClusterId} (stableKey ${stableKey}): ${result.error}`);
            errorCount++;
          }
        }
      } catch (e) {
        console.error(`storeClusterDefinitionsInBackground: Exception while processing cluster with stableKey ${stableKey}: ${e.message}`, e.stack);
        errorCount++;
      }
    }
  }

  if (significantClusterCount === 0) {
    console.log("storeClusterDefinitionsInBackground: No significant clusters met criteria for definition storage.");
  }
  console.log(`storeClusterDefinitionsInBackground: Finished processing. Found ${significantClusterCount} significant clusters. Processed (stored/updated): ${processedCount}, Errors: ${errorCount}.`);
}

/**
 * Finds clusters of earthquakes based on proximity.
 * (Duplicated from `src/utils/clusterUtils.js` - keep synchronized)
 * @param {Array<Object>} earthquakes - Array of earthquake objects. Each object is expected to have an `id`,
 *   `properties.mag` (magnitude), and `geometry.coordinates`.
 * @param {number} maxDistanceKm - Maximum geographic distance (in kilometers) for clustering.
 * @param {number} minQuakes - Minimum number of earthquakes required to form a valid cluster.
 * @returns {Array<Array<Object>>} An array of clusters, where each cluster is an array of earthquake objects.
 */
export function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
    const clusters = [];
    const processedQuakeIds = new Set();

    // Filter out null or undefined earthquake objects first.
    const validEarthquakes = earthquakes.filter(q => {
        if (!q) {
            // Not logging here for null/undefined as this is an API context,
            // and the primary input validation in onRequestPost should catch this.
            // If direct calls to findActiveClusters need this, it can be added.
            return false;
        }
        return true;
    });

    const sortedEarthquakes = [...validEarthquakes].sort((a, b) => (b.properties?.mag || 0) - (a.properties?.mag || 0));

    for (const quake of sortedEarthquakes) {
        if (!quake.id || processedQuakeIds.has(quake.id)) {
            if (!quake.id && !processedQuakeIds.has(quake.id)) {
                console.warn(`Skipping quake with missing ID or invalid object in findActiveClusters.`);
            }
            continue;
        }

        const baseCoords = quake.geometry?.coordinates;
        if (!Array.isArray(baseCoords) || baseCoords.length < 2) {
            console.warn(`Skipping quake ${quake.id} due to invalid coordinates in findActiveClusters.`);
            continue;
        }
        const baseLat = baseCoords[1];
        const baseLon = baseCoords[0];

        const newCluster = [quake]; // Initialize cluster with the current quake
        processedQuakeIds.add(quake.id);


        for (const otherQuake of sortedEarthquakes) {
            if (otherQuake.id === quake.id || processedQuakeIds.has(otherQuake.id)) { // Check if same quake or already processed
                continue;
            }
             if (!otherQuake.id ) { // Check for missing ID on otherQuake
                console.warn(`Skipping potential cluster member with missing ID or invalid object.`);
                continue;
            }


            const otherCoords = otherQuake.geometry?.coordinates;
            if (!Array.isArray(otherCoords) || otherCoords.length < 2) {
                console.warn(`Skipping potential cluster member ${otherQuake.id} due to invalid coordinates.`);
                continue;
            }
            const dist = calculateDistance(baseLat, baseLon, otherCoords[1], otherCoords[0]);
            if (dist <= maxDistanceKm) {
                newCluster.push(otherQuake);
                processedQuakeIds.add(otherQuake.id);
            }
        }
        if (newCluster.length >= minQuakes) {
             // Check if this new cluster is essentially a duplicate of an existing one (e.g. same set of quake IDs)
            const newClusterQuakeIds = new Set(newCluster.map(q => q.id));
            let isDuplicate = false;
            for (const existingCluster of clusters) {
                const existingClusterQuakeIds = new Set(existingCluster.map(q => q.id));
                if (newClusterQuakeIds.size === existingClusterQuakeIds.size) {
                    let allSame = true;
                    for (const id of newClusterQuakeIds) {
                        if (!existingClusterQuakeIds.has(id)) {
                            allSame = false;
                            break;
                        }
                    }
                    if (allSame) {
                        isDuplicate = true;
                        break;
                    }
                }
            }
            if (!isDuplicate) {
                clusters.push(newCluster);
            }
        }
    }
    return clusters;
}

/**
 * Handles POST requests to the `/api/calculate-clusters` endpoint.
 *
 * This function orchestrates the entire cluster calculation process. It expects a JSON
 * payload containing `earthquakes` (an array of GeoJSON features), `maxDistanceKm` (number),
 * and `minQuakes` (number).
 *
 * The process is as follows:
 * 1.  **Parses and Validates Input**: It first parses the JSON from the request body and performs
 *     strict validation on all expected parameters, including the structure of each earthquake object.
 *     If validation fails, it returns a `400 Bad Request` response with a descriptive error.
 * 2.  **Selects Clustering Algorithm**: Based on the number of earthquakes in the payload, it
 *     chooses the most appropriate clustering algorithm. For large datasets (>= 100 quakes),
 *     it uses the `findActiveClustersOptimized` function for better performance. Otherwise, it
 *     uses the standard `findActiveClusters` function.
 * 3.  **Initiates Background Processing**: If the calculation produces any clusters and a D1
 *     database (`env.DB`) is available, it schedules the `storeClusterDefinitionsInBackground`
 *     function to run as a background task using `context.ctx.waitUntil`. This allows the
 *     response to be sent to the client without waiting for the database operations to complete.
 * 4.  **Returns Results**: It returns a `200 OK` response with the array of calculated clusters
 *     in the body.
 *
 * Error handling is in place for JSON parsing errors, validation failures, and other unexpected
 * exceptions, returning appropriate `400` or `500` status codes.
 *
 * @async
 * @function onRequestPost
 * @param {object} context - The Cloudflare Pages Function context object.
 * @param {Request} context.request - The incoming HTTP request, which should be a POST request with a JSON body.
 * @param {object} context.env - The environment object containing bindings, including the D1 database (`DB`).
 * @param {object} context.ctx - The execution context, providing `waitUntil` for background tasks.
 * @returns {Promise<Response>} A `Response` object containing the calculated clusters as a JSON array,
 *   or a JSON error object in case of failure.
 */
export async function onRequestPost(context) {
  // Method check removed as this file will be specifically routed for POST requests.

  try {
    const { env, request } = context; // Destructure request from context
    const { earthquakes, maxDistanceKm, minQuakes } = await request.json();

    // Input Validation
    if (!Array.isArray(earthquakes)) {
      return new Response(JSON.stringify({ error: 'Invalid earthquakes payload: not an array.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (earthquakes.length === 0) { // Moved up
      return new Response(JSON.stringify({ error: 'Earthquakes array is empty, no clusters to calculate.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    // Restored detailed validation loop
    for (let i = 0; i < earthquakes.length; i++) {
        const quake = earthquakes[i];
        if (!quake || typeof quake !== 'object') {
            return new Response(JSON.stringify({ error: `Invalid earthquake object at index ${i}: not an object.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!quake.geometry || typeof quake.geometry !== 'object') {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): missing or invalid 'geometry' object.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!Array.isArray(quake.geometry.coordinates) || quake.geometry.coordinates.length < 2 ||
            typeof quake.geometry.coordinates[0] !== 'number' || typeof quake.geometry.coordinates[1] !== 'number') {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): 'geometry.coordinates' must be an array of at least 2 numbers.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!quake.properties || typeof quake.properties !== 'object') {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): missing or invalid 'properties' object.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (typeof quake.properties.time !== 'number') {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): 'properties.time' must be a number.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (!quake.id) {
            return new Response(JSON.stringify({ error: `Invalid earthquake at index ${i}: missing 'id' property.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    if (typeof maxDistanceKm !== 'number' || maxDistanceKm <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid maxDistanceKm' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (typeof minQuakes !== 'number' || minQuakes <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid minQuakes' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const responseHeaders = { 'Content-Type': 'application/json' };
    let clusters; // Declare clusters here to be accessible for definition storage

    // Calculate clusters using spatial optimization (no caching)
    try {
      if (earthquakes.length >= 100) { // Use spatial optimization for larger datasets
        console.log(`[cluster-calculation] Using spatial optimization for ${earthquakes.length} earthquakes`);
        clusters = findActiveClustersOptimized(earthquakes, maxDistanceKm, minQuakes);
      } else {
        console.log(`[cluster-calculation] Using original algorithm for ${earthquakes.length} earthquakes`);
        clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
      }
    } catch (optimizationError) {
      console.warn('[cluster-calculation] Spatial optimization failed, falling back to original algorithm:', optimizationError.message);
      clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    }

    // Store cluster definitions in background if DB is available
    if (env.DB && clusters && clusters.length > 0) {
        // Using context.ctx.waitUntil as 'context' here is { request, env, ctx }
        // CLUSTER_MIN_QUAKES and DEFINED_CLUSTER_MIN_MAGNITUDE are imported and available in the module scope.
        if (context.ctx && typeof context.ctx.waitUntil === 'function') {
          context.ctx.waitUntil(storeClusterDefinitionsInBackground(env.DB, clusters, CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE));
        } else {
          console.error("calculate-clusters.POST.js: context.ctx.waitUntil is not available. Background tasks might not complete.");
          // Fallback or alternative handling if needed, though this indicates a deeper issue if ctx isn't passed correctly.
          // For now, just log, as the primary issue is the incorrect access path.
          storeClusterDefinitionsInBackground(env.DB, clusters, CLUSTER_MIN_QUAKES, DEFINED_CLUSTER_MIN_MAGNITUDE)
            .catch(err => console.error("Error in fallback execution of storeClusterDefinitionsInBackground:", err));
        }
    }

    return new Response(JSON.stringify(clusters), { status: 200, headers: responseHeaders });

  } catch (error) {
    // Handle JSON parsing errors specifically for the main request body
    if (error instanceof SyntaxError && error.message.includes("JSON") && error.message.includes("await context.request.json()")) {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload for the request.', details: error.message }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }
    // General error handler for other issues
    console.error('Unhandled error in onRequest:', error.message, error.stack); // Changed onRequestPost to onRequest
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
