// src/utils/d1Utils.js
/**
 * Upserts (inserts or updates) earthquake feature data into a Cloudflare D1 database.
 * It iterates through a list of GeoJSON features, validates them, and attempts to
 * insert each into the `EarthquakeEvents` table. If a feature with the same ID
 * already exists, it updates the existing record. This function is designed to be
 * robust, skipping features with invalid or missing critical data and logging
 * appropriate warnings. It uses a batched approach to efficiently handle multiple
 * upserts in a single transaction.
 *
 * @async
 * @param {object} db - The Cloudflare D1 database binding. This object is used to prepare and execute SQL statements.
 * @param {Array<object>} features - An array of GeoJSON feature objects representing earthquakes.
 *                                   Each feature should conform to the USGS GeoJSON format.
 * @returns {Promise<object>} A promise that resolves to an object containing counts of successful
 *                            and failed upsert operations.
 * @property {number} return.successCount - The number of features successfully upserted.
 * @property {number} return.errorCount - The number of features that failed to upsert due to errors or invalid data.
 * @throws {Error} Throws an error if the `db.batch()` operation fails for reasons other than data validation (e.g., database connection issues, malformed SQL in the statement).
 */
export async function upsertEarthquakeFeaturesToD1(db, features) {
  if (!db) {
    console.error("[d1Utils-upsert] D1 Database (DB) binding not provided.");
    return { successCount: 0, errorCount: features ? features.length : 0 };
  }
  if (!features || !Array.isArray(features) || features.length === 0) {
    console.log("[d1Utils-upsert] No features provided to upsert.");
    return { successCount: 0, errorCount: 0 };
  }

  console.log(`[d1Utils-upsert] Starting D1 upsert for ${features.length} features.`);
  const upsertStmtText = `
    INSERT INTO EarthquakeEvents (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, geojson_feature, retrieved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        event_time = excluded.event_time,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        depth = excluded.depth,
        magnitude = excluded.magnitude,
        place = excluded.place,
        usgs_detail_url = excluded.usgs_detail_url,
        geojson_feature = excluded.geojson_feature,
        retrieved_at = excluded.retrieved_at;
  `;
  // In a real worker environment, db.prepare() is synchronous.
  // If this code were to run outside a CF Worker (e.g. Node.js with a D1 client), it might be async.
  // For now, assuming CF Worker environment.
  const stmt = db.prepare(upsertStmtText);
  let successCount = 0;
  let errorCount = 0;
  const operations = [];

  for (const feature of features) {
    // Basic validation to ensure feature and its critical properties exist
    if (!feature || !feature.id || !feature.properties || !feature.geometry || !feature.geometry.coordinates || feature.geometry.coordinates.length < 3) {
      console.warn("[d1Utils-upsert] Skipping feature due to missing critical data:", feature?.id || "ID missing");
      errorCount++;
      continue;
    }

    const id = feature.id;
    const event_time = feature.properties.time;
    const latitude = feature.geometry.coordinates[1];
    const longitude = feature.geometry.coordinates[0];
    const depth = feature.geometry.coordinates[2];
    const magnitude = feature.properties.mag;
    const place = feature.properties.place;
    const usgs_detail_url = feature.properties.detail || `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${feature.id}.geojson`;
    const geojson_feature_string = JSON.stringify(feature);
    const retrieved_at = Date.now();

    // Ensure no null values for required fields before adding to batch
    if (id == null || event_time == null || latitude == null || longitude == null || depth == null || magnitude == null || place == null) {
        console.warn(`[d1Utils-upsert] Skipping feature ${id} due to null value in one of the required fields.`);
        errorCount++; // Count as an error if critical data is missing for a feature
        continue;
    }

    operations.push(stmt.bind(id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, geojson_feature_string, retrieved_at));
  }

  if (operations.length > 0) {
    try {
      // Execute all operations in a single batch
      await db.batch(operations);
      // If db.batch does not throw, assume all operations in the batch were successful.
      // This is a simplification; D1's batch might have more nuanced results,
      // but for ON CONFLICT DO UPDATE, it often doesn't return individual outcomes.
      successCount = operations.length;
      console.log(`[d1Utils-upsert] Batch upsert successful for ${operations.length} operations.`);
    } catch (batchError) {
      console.error(`[d1Utils-upsert] Error during batch D1 upsert: ${batchError.message}`, batchError);
      // If the batch fails, assume all operations in it failed.
      errorCount += operations.length; // Add to existing errors from validation phase
      // successCount remains 0 or its value from prior successful batches if implemented (not in this version).
      // For this implementation, if a batch fails, all its operations are counted as errors.
    }
  }

  console.log(`[d1Utils-upsert] D1 upsert processing complete. Attempted: ${operations.length}, Success: ${successCount}, Errors: ${errorCount}`);
  return { successCount, errorCount };
}
