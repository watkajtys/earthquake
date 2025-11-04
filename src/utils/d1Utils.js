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
    INSERT INTO EarthquakeEvents (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, retrieved_at, next_detail_fetch_attempt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        event_time = excluded.event_time,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        depth = excluded.depth,
        magnitude = excluded.magnitude,
        place = excluded.place,
        usgs_detail_url = excluded.usgs_detail_url,
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
    const geojson_feature_string = ""; // Phase 2: Stop writing GeoJSON to D1
    const retrieved_at = Date.now();
    const next_detail_fetch_attempt = retrieved_at + 45 * 60 * 1000; // Proactively schedule first fetch for 45 mins from now

    // Ensure no null values for required fields before adding to batch
    if (id == null || event_time == null || latitude == null || longitude == null || depth == null || magnitude == null || place == null) {
        console.warn(`[d1Utils-upsert] Skipping feature ${id} due to null value in one of the required fields.`);
        errorCount++; // Count as an error if critical data is missing for a feature
        continue;
    }

    operations.push(stmt.bind(id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, retrieved_at, next_detail_fetch_attempt));
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

/**
 * Fetches and updates earthquake detail data from USGS
 * This function is called after inserting new earthquakes to enrich them with product data
 * @param {D1Database} db - The D1 database instance
 * @param {number} minMagnitude - Minimum magnitude to fetch details for (default 3.0)
 * @param {number} limit - Maximum number of earthquakes to process (default 10)
 * @returns {Promise<{processed: number, errors: number}>}
 */
export async function enrichNewEarthquakesWithDetails(db, minMagnitude = 3.0, limit = 10) {
  console.log(`[d1Utils-enrich] Starting enrichment for new earthquakes (M${minMagnitude}+, limit: ${limit})`);
  
  try {
    // Query for recent earthquakes without detail data
    const query = `
      SELECT id, magnitude, place, event_time, usgs_detail_url
      FROM EarthquakeEvents
      WHERE detail_fetched = FALSE
        AND magnitude >= ?
      ORDER BY event_time DESC, magnitude DESC
      LIMIT ?
    `;
    
    const stmt = db.prepare(query).bind(minMagnitude, limit);
    const result = await stmt.all();
    
    if (!result.results || result.results.length === 0) {
      console.log('[d1Utils-enrich] No new earthquakes to enrich');
      return { processed: 0, errors: 0 };
    }
    
    let processed = 0;
    let errors = 0;
    
    for (const earthquake of result.results) {
      try {
        const detailUrl = earthquake.usgs_detail_url || 
          `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${earthquake.id}.geojson`;
        
        console.log(`[d1Utils-enrich] Fetching details for ${earthquake.id} (M${earthquake.magnitude})`);
        
        const response = await fetch(detailUrl, {
          headers: {
            "User-Agent": "EarthquakesLive-Enrichment/1.0 (+https://earthquakeslive.com)"
          }
        });
        
        if (!response.ok) {
          throw new Error(`USGS API returned ${response.status}`);
        }
        
        const detailData = await response.json();
        const products = detailData?.properties?.products || {};
        
        // Extract product flags
        const has_shakemap = !!(products.shakemap && products.shakemap.length > 0);
        const has_moment_tensor = !!(products['moment-tensor'] && products['moment-tensor'].length > 0);
        const has_focal_mechanism = !!(products['focal-mechanism'] && products['focal-mechanism'].length > 0);
        const has_dyfi = !!(products.dyfi && products.dyfi.length > 0);
        const has_losspager = !!(products.losspager && products.losspager.length > 0);
        const has_finite_fault = !!(products['finite-fault'] && products['finite-fault'].length > 0);
        
        // Compute the enhanced data flag
        const has_enhanced_data = has_shakemap || 
                                 has_moment_tensor || 
                                 has_focal_mechanism || 
                                 has_finite_fault || 
                                 has_losspager ||
                                 has_dyfi;
        
        const products_json = JSON.stringify(Object.keys(products));
        
        // Update database
        const updateStmt = db.prepare(`
          UPDATE EarthquakeEvents
          SET has_shakemap = ?,
              has_moment_tensor = ?,
              has_focal_mechanism = ?,
              has_dyfi = ?,
              has_losspager = ?,
              has_finite_fault = ?,
              has_enhanced_data = ?,
              products_json = ?,
              detail_fetched = TRUE,
              detail_fetch_time = ?
          WHERE id = ?
        `).bind(
          has_shakemap,
          has_moment_tensor,
          has_focal_mechanism,
          has_dyfi,
          has_losspager,
          has_finite_fault,
          has_enhanced_data,
          products_json,
          Date.now(),
          earthquake.id
        );
        
        await updateStmt.run();
        processed++;
        
        console.log(`[d1Utils-enrich] Updated ${earthquake.id} with products: ${products_json}`);
        
        // Rate limiting: wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`[d1Utils-enrich] Error processing ${earthquake.id}: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`[d1Utils-enrich] Enrichment complete. Processed: ${processed}, Errors: ${errors}`);
    return { processed, errors };
    
  } catch (error) {
    console.error(`[d1Utils-enrich] Fatal error during enrichment: ${error.message}`, error);
    return { processed: 0, errors: 1 };
  }
}
