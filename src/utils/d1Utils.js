async function upsertEarthquakeFeaturesToD1(db, features) {
  if (!db) {
    console.error("[d1Utils-upsert] D1 Database (DB) binding not provided.");
    return { successCount: 0, errorCount: features ? features.length : 0 };
  }
  if (!features || !Array.isArray(features) || features.length === 0) {
    console.log("[d1Utils-upsert] No features provided to upsert.");
    return { successCount: 0, errorCount: 0 };
  }
  console.log(
    `[d1Utils-upsert] Starting D1 upsert for ${features.length} features.`,
  );
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
        retrieved_at = excluded.retrieved_at
    WHERE excluded.event_time IS NOT EarthquakeEvents.event_time
       OR excluded.magnitude IS NOT EarthquakeEvents.magnitude
       OR excluded.place IS NOT EarthquakeEvents.place;
  `;
  const stmt = db.prepare(upsertStmtText);
  let totalSuccessCount = 0;
  let totalErrorCount = 0;
  const batchSize = 90;
  let totalOperationsAttempted = 0;
  for (let i = 0; i < features.length; i += batchSize) {
    const batchFeatures = features.slice(i, i + batchSize);
    const operations = [];
    for (const feature of batchFeatures) {
      if (
        !feature ||
        !feature.id ||
        !feature.properties ||
        !feature.geometry ||
        !feature.geometry.coordinates ||
        feature.geometry.coordinates.length < 3
      ) {
        console.warn(
          "[d1Utils-upsert] Skipping feature due to missing critical data:",
          feature?.id || "ID missing",
        );
        totalErrorCount++;
        continue;
      }
      const id = feature.id;
      const event_time = feature.properties.time;
      const latitude = feature.geometry.coordinates[1];
      const longitude = feature.geometry.coordinates[0];
      const depth = feature.geometry.coordinates[2];
      const magnitude = feature.properties.mag;
      const place = feature.properties.place;
      const usgs_detail_url =
        feature.properties.detail ||
        `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${feature.id}.geojson`;
      const geojson_feature_string = "";
      const retrieved_at = Date.now();
      const next_detail_fetch_attempt = retrieved_at + 45 * 60 * 1e3;
      if (
        id == null ||
        event_time == null ||
        latitude == null ||
        longitude == null ||
        depth == null ||
        magnitude == null ||
        place == null
      ) {
        console.warn(
          `[d1Utils-upsert] Skipping feature ${id} due to null value in one of the required fields.`,
        );
        totalErrorCount++;
        continue;
      }
      operations.push(
        stmt.bind(
          id,
          event_time,
          latitude,
          longitude,
          depth,
          magnitude,
          place,
          usgs_detail_url,
          retrieved_at,
          next_detail_fetch_attempt,
        ),
      );
    }
    if (operations.length > 0) {
      totalOperationsAttempted += operations.length;
      try {
        console.log(
          `[d1Utils-upsert] Executing batch starting at index ${i} with ${operations.length} operations.`,
        );
        await db.batch(operations);
        totalSuccessCount += operations.length;
        console.log(
          `[d1Utils-upsert] Batch upsert successful for ${operations.length} operations.`,
        );
      } catch (batchError) {
        console.error(
          `[d1Utils-upsert] Error during batch D1 upsert for slice starting at index ${i}: ${batchError.message}`,
          batchError,
        );
        totalErrorCount += operations.length;
      }
    }
  }
  console.log(
    `[d1Utils-upsert] D1 upsert processing complete. Total features: ${features.length}, Attempted: ${totalOperationsAttempted}, Success: ${totalSuccessCount}, Errors: ${totalErrorCount}`,
  );
  return { successCount: totalSuccessCount, errorCount: totalErrorCount };
}

export { upsertEarthquakeFeaturesToD1 };
