// Outcomes count input features, including duplicate IDs if a caller supplies
// them. A failed/unknown batch is safe to retry, but never safe to checkpoint.
function persistenceOutcome(persistedIds, unchangedIds, supersededIds, failedIds, rejectedIds) {
  const successCount = persistedIds.length + unchangedIds.length + supersededIds.length;
  const errorCount = failedIds.length + rejectedIds.length;
  return {
    successCount,
    errorCount,
    complete: errorCount === 0,
    persistedIds,
    unchangedIds,
    supersededIds,
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
    Number.isSafeInteger(properties.updated) && Math.abs(properties.updated) <= 8640000000000000 &&
    (properties.mag === null || Number.isFinite(properties.mag)) &&
    (properties.place === null || typeof properties.place === "string") &&
    (properties.detail == null || typeof properties.detail === "string") &&
    Array.isArray(coordinates) && coordinates.length >= 3 &&
    coordinates.slice(0, 3).every(Number.isFinite)
  );
}

function summaryValues(feature) {
  const { properties, geometry } = feature;
  return {
    id: feature.id,
    event_time: properties.time,
    latitude: geometry.coordinates[1],
    longitude: geometry.coordinates[0],
    depth: geometry.coordinates[2],
    magnitude: properties.mag,
    place: properties.place,
    usgs_detail_url: properties.detail || `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${feature.id}.geojson`,
    source_updated_at_ms: properties.updated,
  };
}

const summaryColumns = ['event_time', 'latitude', 'longitude', 'depth', 'magnitude', 'place', 'usgs_detail_url'];

function classifyNoChange(feature, row) {
  const incoming = summaryValues(feature);
  if (!row || !Number.isSafeInteger(row.source_updated_at_ms)) return 'failed';
  if (row.source_updated_at_ms > incoming.source_updated_at_ms) return 'superseded';
  if (row.source_updated_at_ms < incoming.source_updated_at_ms) return 'failed';
  return summaryColumns.every(column => row[column] === incoming[column]) ? 'unchanged' : 'rejected';
}

async function upsertEarthquakeFeaturesToD1(db, features) {
  const persistedIds = [];
  const unchangedIds = [];
  const supersededIds = [];
  const failedIds = [];
  const rejectedIds = [];
  const outcome = () => persistenceOutcome(persistedIds, unchangedIds, supersededIds, failedIds, rejectedIds);
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
    INSERT INTO EarthquakeEvents (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, source_updated_at_ms, retrieved_at, next_detail_fetch_attempt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        event_time = excluded.event_time,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        depth = excluded.depth,
        magnitude = excluded.magnitude,
        place = excluded.place,
        usgs_detail_url = excluded.usgs_detail_url,
        source_updated_at_ms = excluded.source_updated_at_ms,
        retrieved_at = excluded.retrieved_at,
        -- A new source revision invalidates the previous detail products and
        -- committed archive pointer. The detail job can republish them only
        -- after its immutable object is stored and the revision still wins.
        has_shakemap = 0, has_moment_tensor = 0, has_focal_mechanism = 0,
        has_dyfi = 0, has_losspager = 0, has_finite_fault = 0,
        has_enhanced_data = 0, products_json = NULL,
        detail_fetched = 0, detail_fetch_time = NULL,
        detail_fetch_attempts = 0, last_detail_fetch_attempt = NULL,
        next_detail_fetch_attempt = excluded.next_detail_fetch_attempt,
        detail_archive_key = NULL, detail_archive_revision_ms = NULL,
        detail_metadata_revision_ms = NULL
    WHERE EarthquakeEvents.source_updated_at_ms IS NULL
       OR excluded.source_updated_at_ms > EarthquakeEvents.source_updated_at_ms;
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
        const values = summaryValues(feature);
        const retrievedAt = Date.now();
        return stmt.bind(
          values.id,
          values.event_time,
          values.latitude,
          values.longitude,
          values.depth,
          values.magnitude,
          values.place,
          values.usgs_detail_url,
          values.source_updated_at_ms,
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
      const noChanges = [];
      results.forEach((result, index) => {
        if (result.meta.changes === 0) noChanges.push(batchFeatures[index]);
        else persistedIds.push(batchFeatures[index].id);
      });
      if (noChanges.length) {
        // A guarded no-op can mean identical, superseded, or an equal-clock
        // conflict. Read it back before declaring this batch checkpointable.
        const ids = [...new Set(noChanges.map(feature => feature.id))];
        try {
          const query = `SELECT id, ${summaryColumns.join(', ')}, source_updated_at_ms FROM EarthquakeEvents WHERE id IN (${ids.map(() => '?').join(', ')})`;
          const readback = await db.prepare(query).bind(...ids).all();
          if (readback?.success !== true || !Array.isArray(readback.results)) throw new Error('D1 summary readback was incomplete');
          const byId = new Map(readback.results.map(row => [row.id, row]));
          for (const feature of noChanges) {
            const category = classifyNoChange(feature, byId.get(feature.id));
            if (category === 'unchanged') unchangedIds.push(feature.id);
            else if (category === 'superseded') supersededIds.push(feature.id);
            else if (category === 'rejected') rejectedIds.push(feature.id);
            else failedIds.push(feature.id);
          }
        } catch (error) {
          failedIds.push(...noChanges.map(feature => feature.id));
          console.error(`[d1Utils-upsert] Batch starting at index ${i} readback failed:`, error);
        }
      }
    } catch (error) {
      failedIds.push(...batchFeatures.map(feature => feature.id));
      console.error(`[d1Utils-upsert] Batch starting at index ${i} failed:`, error);
    }
  }
  return outcome();
}

export { upsertEarthquakeFeaturesToD1 };
