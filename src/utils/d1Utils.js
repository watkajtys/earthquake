// Outcomes count input features, including duplicate IDs if a caller supplies
// them. A failed/unknown batch is safe to retry, but never safe to checkpoint.
function persistenceOutcome(persistedIds, unchangedIds, failedIds, rejectedIds) {
  const successCount = persistedIds.length + unchangedIds.length;
  const errorCount = failedIds.length + rejectedIds.length;
  return {
    successCount,
    errorCount,
    complete: errorCount === 0,
    persistedIds,
    unchangedIds,
    failedIds,
    rejectedIds,
  };
}

function isPersistableFeature(feature) {
  const properties = feature?.properties;
  const coordinates = feature?.geometry?.coordinates;
  return (
    typeof feature?.id === "string" && feature.id.length > 0 &&
    properties && Number.isFinite(properties.time) &&
    (properties.mag === null || Number.isFinite(properties.mag)) &&
    (properties.place === null || typeof properties.place === "string") &&
    (properties.detail == null || typeof properties.detail === "string") &&
    Array.isArray(coordinates) && coordinates.length >= 3 &&
    coordinates.slice(0, 3).every(Number.isFinite)
  );
}

async function upsertEarthquakeFeaturesToD1(db, features) {
  const persistedIds = [];
  const unchangedIds = [];
  const failedIds = [];
  const rejectedIds = [];
  const outcome = () => persistenceOutcome(persistedIds, unchangedIds, failedIds, rejectedIds);
  if (!Array.isArray(features)) {
    rejectedIds.push(null);
    return outcome();
  }

  const validFeatures = features.filter((feature) => {
    if (isPersistableFeature(feature)) return true;
    const id = typeof feature?.id === "string" ? feature.id : null;
    rejectedIds.push(id);
    console.warn("[d1Utils-upsert] Rejecting feature with invalid summary fields:", id);
    return false;
  });
  if (validFeatures.length === 0) return outcome();
  if (!db) {
    console.error("[d1Utils-upsert] D1 Database (DB) binding not provided.");
    failedIds.push(...validFeatures.map(feature => feature.id));
    return outcome();
  }

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
       OR excluded.latitude IS NOT EarthquakeEvents.latitude
       OR excluded.longitude IS NOT EarthquakeEvents.longitude
       OR excluded.depth IS NOT EarthquakeEvents.depth
       OR excluded.magnitude IS NOT EarthquakeEvents.magnitude
       OR excluded.place IS NOT EarthquakeEvents.place
       OR excluded.usgs_detail_url IS NOT EarthquakeEvents.usgs_detail_url;
  `;
  let stmt;
  try {
    stmt = db.prepare(upsertStmtText);
  } catch (error) {
    console.error("[d1Utils-upsert] Could not prepare summary upsert:", error);
    failedIds.push(...validFeatures.map(feature => feature.id));
    return outcome();
  }

  const batchSize = 90;
  for (let i = 0; i < validFeatures.length; i += batchSize) {
    const batchFeatures = validFeatures.slice(i, i + batchSize);
    try {
      const operations = batchFeatures.map((feature) => {
        const { properties, geometry } = feature;
        const retrievedAt = Date.now();
        return stmt.bind(
          feature.id,
          properties.time,
          geometry.coordinates[1],
          geometry.coordinates[0],
          geometry.coordinates[2],
          properties.mag,
          properties.place,
          properties.detail || `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${feature.id}.geojson`,
          retrievedAt,
          retrievedAt + 45 * 60 * 1000,
        );
      });
      const results = await db.batch(operations);
      // D1 returns one result per statement. Missing or unsuccessful results
      // cannot establish persistence, even if the call itself resolved.
      if (!Array.isArray(results) || results.length !== operations.length ||
          results.some(result => result?.success !== true ||
            !Number.isInteger(result.meta?.changes) || result.meta.changes < 0)) {
        throw new Error("D1 batch returned incomplete persistence results");
      }
      results.forEach((result, index) => {
        const ids = result.meta.changes === 0 ? unchangedIds : persistedIds;
        ids.push(batchFeatures[index].id);
      });
    } catch (error) {
      failedIds.push(...batchFeatures.map(feature => feature.id));
      console.error(`[d1Utils-upsert] Batch starting at index ${i} failed:`, error);
    }
  }
  return outcome();
}

export { upsertEarthquakeFeaturesToD1 };
