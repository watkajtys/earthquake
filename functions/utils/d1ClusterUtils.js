// functions/utils/d1ClusterUtils.js

/**
 * @file functions/utils/d1ClusterUtils.js
 * @description Utility functions for interacting with ClusterDefinitions in D1.
 */

/**
 * Stores (inserts or replaces) a cluster definition in the D1 database.
 *
 * @async
 * @param {object} db - The D1 database binding.
 * @param {object} clusterData - An object containing all the fields for a cluster definition.
 * @param {string} clusterData.id - Unique identifier for the cluster (primary key).
 * @param {string} [clusterData.stableKey] - Stable identifier for the cluster, used for lookups.
 * @param {string} clusterData.slug - SEO-friendly slug.
 * @param {string} clusterData.strongestQuakeId - ID of the most significant quake.
 * @param {Array<string>} clusterData.earthquakeIds - Array of earthquake IDs.
 * @param {string} [clusterData.title] - SEO-friendly title.
 * @param {string} [clusterData.description] - Meta description for SEO.
 * @param {string} [clusterData.locationName] - General location name.
 * @param {number} clusterData.maxMagnitude - Maximum magnitude in the cluster.
 * @param {number} [clusterData.meanMagnitude] - Mean magnitude of quakes in the cluster.
 * @param {number} [clusterData.minMagnitude] - Minimum magnitude of quakes in the cluster.
 * @param {string} [clusterData.depthRange] - E.g., "5-15km".
 * @param {number} [clusterData.centroidLat] - Latitude of the cluster's centroid.
 * @param {number} [clusterData.centroidLon] - Longitude of the cluster's centroid.
 * @param {number} [clusterData.radiusKm] - Approximate radius of the cluster.
 * @param {number} clusterData.startTime - Timestamp of the earliest quake.
 * @param {number} clusterData.endTime - Timestamp of the latest quake.
 * @param {number} [clusterData.durationHours] - Duration of the cluster in hours.
 * @param {number} clusterData.quakeCount - Number of earthquakes in the cluster.
 * @param {number} [clusterData.significanceScore] - Significance score of the cluster.
 * @param {number} [clusterData.version=1] - Version number of the cluster definition.
 * @returns {Promise<object>} An object indicating success (e.g., `{ success: true, id: clusterData.id }`)
 *                            or failure (e.g., `{ success: false, error: message }`).
 */
export async function storeClusterDefinition(db, clusterData) {
  if (!db || !db.prepare) {
    return { success: false, error: 'Invalid D1 database binding provided.' };
  }

  if (!clusterData) {
    return { success: false, error: 'clusterData cannot be null or undefined.' };
  }

  // Validate mandatory fields
  const requiredFields = ['id', 'slug', 'strongestQuakeId', 'earthquakeIds', 'maxMagnitude', 'startTime', 'endTime', 'quakeCount'];
  for (const field of requiredFields) {
    if (clusterData[field] === undefined || clusterData[field] === null) {
      return { success: false, error: `Missing required field in clusterData: ${field}.` };
    }
  }

  // Basic type validation (can be extended)
  if (typeof clusterData.id !== 'string') return { success: false, error: 'Invalid type for id: must be a string.' };
  if (typeof clusterData.slug !== 'string') return { success: false, error: 'Invalid type for slug: must be a string.' };
  if (typeof clusterData.strongestQuakeId !== 'string') return { success: false, error: 'Invalid type for strongestQuakeId: must be a string.' };
  if (!Array.isArray(clusterData.earthquakeIds)) return { success: false, error: 'Invalid type for earthquakeIds: must be an array.' };
  if (typeof clusterData.maxMagnitude !== 'number') return { success: false, error: 'Invalid type for maxMagnitude: must be a number.' };
  if (typeof clusterData.startTime !== 'number') return { success: false, error: 'Invalid type for startTime: must be a number.' };
  if (typeof clusterData.endTime !== 'number') return { success: false, error: 'Invalid type for endTime: must be a number.' };
  if (typeof clusterData.quakeCount !== 'number') return { success: false, error: 'Invalid type for quakeCount: must be a number.' };

  // Set updatedAt timestamp at the application layer
  clusterData.updatedAt = Date.now(); // Milliseconds Unix epoch

  // Log received clusterData (after validation and before try...catch)
  console.log('[storeClusterDefinition] Received clusterData:', JSON.stringify(clusterData, null, 2)); // Added null, 2 for pretty print

  try {
    // Destructure all expected fields, including the new stableKey
    const {
      id, stableKey, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
      maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
      radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
      version,
      createdAt,
      updatedAt
    } = clusterData;

    // Add stableKey to the SQL query and parameters
    const sqlQuery = `
      INSERT OR REPLACE INTO ClusterDefinitions
       (id, stableKey, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
        maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
        radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore, version,
        createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `; // Added one more ? for stableKey, total 23
    console.log('[storeClusterDefinition] Preparing SQL Query:', sqlQuery);
    const stmt = db.prepare(sqlQuery);

    const params = [
      id,
      stableKey === undefined ? null : stableKey, // Add stableKey to params
      slug,
      strongestQuakeId,
      JSON.stringify(earthquakeIds || []),
      title === undefined ? null : title,
      description === undefined ? null : description,
      locationName === undefined ? null : locationName,
      maxMagnitude,
      meanMagnitude === undefined ? null : meanMagnitude,
      minMagnitude === undefined ? null : minMagnitude,
      depthRange === undefined ? null : depthRange,
      centroidLat === undefined ? null : centroidLat,
      centroidLon === undefined ? null : centroidLon,
      radiusKm === undefined ? null : radiusKm,
      startTime,
      endTime,
      durationHours === undefined ? null : durationHours,
      quakeCount,
      significanceScore === undefined ? null : significanceScore,
      version === undefined ? null : version,
      createdAt === undefined ? null : createdAt,
      updatedAt
    ];

    // Log parameters before binding
    console.log('[storeClusterDefinition] Binding parameters:', JSON.stringify(params, null, 2)); // Added null, 2 for pretty print

    await stmt.bind(...params).run();

    return { success: true, id: id };
  } catch (e) {
    console.error('Error storing cluster definition in D1:', e);
    return { success: false, error: `Failed to store cluster definition: ${e.message}` };
  }
}
