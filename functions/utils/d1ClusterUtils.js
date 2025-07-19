// functions/utils/d1ClusterUtils.js

/**
 * @file Utility functions for interacting with the `ClusterDefinitions` D1 database table.
 * @module functions/utils/d1ClusterUtils
 *
 * @description
 * This module centralizes the logic for creating and updating cluster definitions in the
 * D1 database. It provides a robust, validated interface for database interactions,
 * ensuring that all data written to the `ClusterDefinitions` table is well-formed.
 *
 * The primary function, `storeClusterDefinition`, handles the `INSERT OR REPLACE` logic,
 * making it the single point of entry for persisting cluster data.
 */
/**
 * Stores (inserts or replaces) a complete cluster definition in the D1 database.
 *
 * This function takes a comprehensive `clusterData` object, performs validation on all
 * required fields and their types, and then executes an `INSERT OR REPLACE` SQL query
 * against the `ClusterDefinitions` table. This "upsert" behavior ensures that if a
 * definition with the given `id` already exists, it will be updated with the new data;
 * otherwise, a new record will be created.
 *
 * It is designed to be a safe and reliable way to manage cluster data, abstracting the
 * raw SQL and validation logic away from the calling functions.
 *
 * @async
 * @function storeClusterDefinition
 * @param {D1Database} db - The D1 database binding from the Cloudflare environment.
 * @param {object} clusterData - An object containing all the fields for the cluster definition.
 *   This object must conform to the schema of the `ClusterDefinitions` table.
 * @param {string} clusterData.id - The unique identifier (primary key) for the cluster.
 * @param {string} [clusterData.stableKey] - A stable identifier for the cluster used for lookups.
 * @param {string} clusterData.slug - A URL-friendly slug for the cluster.
 * @param {Array<string>} clusterData.earthquakeIds - An array of earthquake IDs belonging to the cluster.
 * @param {number} clusterData.maxMagnitude - The magnitude of the strongest quake in the cluster.
 * @param {number} clusterData.startTime - The timestamp of the earliest quake in the cluster.
 * @param {number} clusterData.endTime - The timestamp of the latest quake in the cluster.
 * @param {number} clusterData.quakeCount - The total number of quakes in the cluster.
 * @param {string} clusterData.strongestQuakeId - The ID of the strongest quake.
 * @param {string} [clusterData.title] - An optional SEO-friendly title.
 * @param {string} [clusterData.description] - An optional meta description.
 * // ... other optional fields from the schema ...
 * @returns {Promise<object>} A promise that resolves to an object indicating the outcome.
 *   On success, it returns `{ success: true, id: clusterData.id }`.
 *   On failure, it returns `{ success: false, error: 'Error message' }`.
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
