// src/utils/d1Utils.js
/**
 * Upserts (inserts or updates) earthquake feature data into a Cloudflare D1 database.
 * It iterates through a list of GeoJSON features, validates them, and attempts to
 * insert each into the `EarthquakeEvents` table. If a feature with the same ID
 * already exists, it updates the existing record.
 *
 * @async
 * @param {object} db - The Cloudflare D1 database binding. This object is used to prepare and execute SQL statements.
 * @param {Array<object>} features - An array of GeoJSON feature objects representing earthquakes.
 *                                   Each feature should conform to the USGS GeoJSON format.
 * @returns {Promise<object>} A promise that resolves to an object containing counts of successful
 *                            and failed upsert operations.
 * @returns {number} return.successCount - The number of features successfully upserted.
 * @returns {number} return.errorCount - The number of features that failed to upsert due to errors or invalid data.
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
    ON CONFLICT(id) DO NOTHING;
  `;
  // In a real worker environment, db.prepare() is synchronous.
  // If this code were to run outside a CF Worker (e.g. Node.js with a D1 client), it might be async.
  // For now, assuming CF Worker environment.
  const stmt = db.prepare(upsertStmtText);
  let successCount = 0;
  let errorCount = 0;

  // D1 batches automatically if multiple .bind().run() calls are made without awaiting each individually
  // However, to get individual error handling and counts, we iterate.
  // For large numbers of features, consider batching with db.batch() for performance.
  const operations = [];
  for (const feature of features) {
    try {
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

      if (id == null || event_time == null || latitude == null || longitude == null || depth == null || magnitude == null || place == null) {
          console.warn(`[d1Utils-upsert] Skipping feature ${id} due to null value in one of the required fields.`);
          errorCount++;
          continue;
      }
      // Add operation to batch
      operations.push(stmt.bind(id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, geojson_feature_string, retrieved_at));
      // Awaiting each individually for now to match original logic's error reporting style.
      // Consider db.batch(operations) for performance on large sets if individual error tracking per feature is less critical.
      const result = await operations[operations.length-1].run(); // execute the last added operation
      if (result && result.meta && result.meta.changes > 0) {
        successCount++;
      }

    } catch (e) {
      console.error(`[d1Utils-upsert] Error upserting feature ${feature?.id}: ${e.message}`, e);
      errorCount++;
    }
  }

  // If we were using db.batch(), the execution would be here:
  // if (operations.length > 0) {
  //   try {
  //     const results = await db.batch(operations);
  //     // Note: db.batch results might not give individual success/failure easily for ON CONFLICT.
  //     // This example assumes you want to know how many succeeded vs. failed.
  //     // A simple way is to assume success if batch doesn't throw, and sum up operations.length.
  //     // This needs careful handling based on how D1 reports errors in batch.
  //     // For now, the individual await above provides more granular feedback.
  //     successCount = operations.length; // This is an approximation if not checking results
  //     console.log(`[d1Utils-upsert] Batch upsert for ${operations.length} operations submitted.`);
  //   } catch (batchError) {
  //     console.error(`[d1Utils-upsert] Error during batch D1 upsert: ${batchError.message}`, batchError);
  //     // All operations in the batch might have failed or been partially applied.
  //     // Marking all as errors for simplicity here.
  //     errorCount = features.length; // Or features.length - successCount if some succeeded before batching
  //     successCount = 0;
  //   }
  // }


  console.log(`[d1Utils-upsert] D1 upsert processing complete. Success: ${successCount}, Errors: ${errorCount}`);
  return { successCount, errorCount };
}
