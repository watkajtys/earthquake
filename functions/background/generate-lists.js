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
    const { results } = await stmt.all();
    return results || [];
  } catch (error) {
    console.error(
      `[generate-lists] D1 bootstrap query failed for '${timeWindow}':`,
      error,
    );
    return [];
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
        if (DB) {
          existingData = await fetchInitialEarthquakeDataFromD1(DB, timeWindow);
        } else {
          console.warn(
            `[generate-lists] Cannot bootstrap '${fileName}': DB binding is missing. Starting with an empty list.`,
          );
        }
      }
    } catch (e) {
      console.error(
        `[generate-lists] Error reading or parsing R2 object '${fileName}'. Attempting to bootstrap from D1.`,
        e,
      );
      if (DB) {
        existingData = await fetchInitialEarthquakeDataFromD1(DB, timeWindow);
      } else {
        console.warn(
          `[generate-lists] Cannot bootstrap '${fileName}' after parse error: DB binding is missing. Starting fresh.`,
        );
      }
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
