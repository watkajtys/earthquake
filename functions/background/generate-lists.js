async function fetchInitialEarthquakeDataFromD1(db, timeWindow) {
  console.log(`[generate-lists] Bootstrapping '${timeWindow}' list from D1.`);
  let startTime;
  const now = /* @__PURE__ */ new Date();
  if (timeWindow === "week") {
    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
  } else if (timeWindow === "month") {
    startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
  } else {
    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
  }
  const startTimeMilliseconds = startTime.getTime();
  const query = `
    SELECT id, magnitude, place, event_time, latitude, longitude, depth
    FROM EarthquakeEvents
    WHERE event_time >= ?
    ORDER BY event_time DESC;
  `;
  try {
    const stmt = db.prepare(query).bind(startTimeMilliseconds);
    const result = await stmt.all();
    if (result?.success !== true || !Array.isArray(result?.results)) {
      throw new Error("D1 bootstrap did not return a successful list");
    }
    return result.results;
  } catch (error) {
    console.error(
      `[generate-lists] D1 bootstrap query failed for '${timeWindow}':`,
      error,
    );
    throw error;
  }
}
var transformFeatureToListObject = (feature) => {
  if (
    !feature ||
    !feature.properties ||
    !feature.geometry ||
    !feature.geometry.coordinates
  ) {
    return null;
  }
  return {
    id: feature.id,
    magnitude: feature.properties.mag,
    place: feature.properties.place,
    event_time: feature.properties.time,
    latitude: feature.geometry.coordinates[1],
    longitude: feature.geometry.coordinates[0],
    depth: feature.geometry.coordinates[2],
    // Keep the upstream summary contract for alerts, felt reports and rankings.
    // Older cached/D1 rows stay sparse until refreshed by an upstream feature.
    properties: { ...feature.properties },
    summary_updated_at: Date.now(),
  };
};
async function handleGenerateLists({ env, newFeatures }) {
  const { DB, GEOJSON_BUCKET } = env;
  if (!GEOJSON_BUCKET) {
    throw new Error(
      "[generate-lists] Missing required GEOJSON_BUCKET binding.",
    );
  }
  if (!newFeatures || !Array.isArray(newFeatures) || newFeatures.length === 0) {
    console.log(
      "[generate-lists] No new features to process. Skipping list generation.",
    );
    return;
  }
  const newEarthquakes = newFeatures
    .map(transformFeatureToListObject)
    .filter(Boolean);
  if (newEarthquakes.length === 0) {
    console.log(
      "[generate-lists] New features were invalid or empty after transformation. Skipping.",
    );
    return;
  }
  const timeWindows = ["day", "week", "month"];
  const now = /* @__PURE__ */ new Date();
  const replacements = [];
  for (const timeWindow of timeWindows) {
    const fileName = `list-${timeWindow}.json`;
    let existingData = [];
    try {
      const r2Object = await GEOJSON_BUCKET.get(fileName);
      if (r2Object !== null) {
        existingData = await r2Object.json();
      } else {
        console.log(
          `[generate-lists] R2 object '${fileName}' not found. Attempting to bootstrap from D1.`,
        );
        if (!DB) throw new Error(`Cannot bootstrap '${fileName}': DB binding is missing`);
        existingData = await fetchInitialEarthquakeDataFromD1(DB, timeWindow);
      }
    } catch (e) {
      console.error(
        `[generate-lists] Could not safely load '${fileName}'. Retaining existing lists.`,
        e,
      );
      throw e;
    }
    if (!Array.isArray(existingData) || existingData.some(eq =>
      !eq || typeof eq.id !== "string" || !eq.id || !Number.isFinite(eq.event_time))) {
      throw new Error(`Invalid cached earthquake list '${fileName}'; retaining existing lists`);
    }
    const earthquakeMap = new Map(existingData.map((eq) => [eq.id, eq]));
    newEarthquakes.forEach((eq) => earthquakeMap.set(eq.id, eq));
    let startTimeMs;
    if (timeWindow === "week") {
      startTimeMs = now.getTime() - 7 * 24 * 60 * 60 * 1e3;
    } else if (timeWindow === "month") {
      startTimeMs = now.getTime() - 30 * 24 * 60 * 60 * 1e3;
    } else {
      startTimeMs = now.getTime() - 24 * 60 * 60 * 1e3;
    }
    const trimmedList = Array.from(earthquakeMap.values()).filter(
      (eq) => eq.event_time >= startTimeMs,
    );
    trimmedList.sort((a, b) => b.event_time - a.event_time);
    replacements.push({ fileName, trimmedList });
  }
  // Read and validate every input before replacing any period. In particular,
  // a failed month bootstrap must not follow successful day/week replacements.
  // These R2 writes are still separate operations, not an atomic publication.
  for (const { fileName, trimmedList } of replacements) {
    await GEOJSON_BUCKET.put(fileName, JSON.stringify(trimmedList), {
      httpMetadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=300",
        // 5-minute browser cache
      },
    });
    console.log(
      `[generate-lists] Successfully updated '${fileName}' with ${trimmedList.length} total events.`,
    );
  }
}

export { handleGenerateLists };
