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
    SELECT id, magnitude, place, event_time, latitude, longitude, depth,
      source_updated_at_ms
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
    // Keep the legacy sparse shape for rows without a trusted revision. A
    // migrated revision is retained in the public array as an additive scalar
    // so a later list writer cannot mistake it for an unversioned bootstrap.
    return result.results.map(({ source_updated_at_ms: revision, ...row }) =>
      Number.isSafeInteger(revision) ? { ...row, source_updated_at_ms: revision } : row);
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

const LIST_WINDOWS = ['day', 'week', 'month'];
const MAX_PUBLICATION_ATTEMPTS = 3;

function sourceRevision(row) {
  const value = row?.properties?.updated ?? row?.source_updated_at_ms;
  return Number.isSafeInteger(value) && Math.abs(value) <= 8640000000000000 ? value : null;
}

function validateExistingList(rows, fileName) {
  const ids = new Set();
  if (!Array.isArray(rows) || rows.some(row => {
    if (!row || typeof row.id !== 'string' || !row.id || !Number.isFinite(row.event_time) ||
        (row.properties?.updated != null && sourceRevision(row) === null) ||
        (row.source_updated_at_ms != null && (!Number.isSafeInteger(row.source_updated_at_ms) ||
          (row.properties?.updated != null && row.source_updated_at_ms !== row.properties.updated))) ||
        ids.has(row.id)) return true;
    ids.add(row.id);
    return false;
  })) throw new Error(`Invalid cached earthquake list '${fileName}'; retaining existing lists`);
}

async function readListSnapshot(db, bucket, timeWindow) {
  const fileName = `list-${timeWindow}.json`;
  let rows;
  let etag = null;
  try {
    const object = await bucket.get(fileName);
    if (object !== null) {
      if (typeof object.etag !== 'string' || !object.etag) {
        throw new Error(`R2 list '${fileName}' has no conditional-write ETag`);
      }
      etag = object.etag;
      rows = await object.json();
    } else {
      console.log(`[generate-lists] R2 object '${fileName}' not found. Attempting to bootstrap from D1.`);
      if (!db) throw new Error(`Cannot bootstrap '${fileName}': DB binding is missing`);
      rows = await fetchInitialEarthquakeDataFromD1(db, timeWindow);
    }
  } catch (error) {
    console.error(`[generate-lists] Could not safely load '${fileName}'. Retaining existing lists.`, error);
    throw error;
  }
  validateExistingList(rows, fileName);
  return { fileName, timeWindow, rows, etag };
}

function mergeList(existing, incoming, cutoff) {
  const byId = new Map(existing.map(row => [row.id, row]));
  for (const row of incoming) {
    const previous = byId.get(row.id);
    // A D1 bootstrap row can be sparse; a validated source revision upgrades
    // it. Equal revisions retain the existing snapshot to avoid resolving an
    // equal-clock conflict by invocation order.
    const previousRevision = sourceRevision(previous);
    const incomingRevision = sourceRevision(row);
    const enrichSameSparseRevision = previous && !previous.properties &&
      previousRevision === incomingRevision &&
      ['magnitude', 'place', 'event_time', 'latitude', 'longitude', 'depth']
        .every(field => previous[field] === row[field]);
    if (!previous || previousRevision === null || incomingRevision > previousRevision || enrichSameSparseRevision) {
      byId.set(row.id, row);
    }
  }
  const rows = Array.from(byId.values()).filter(row => row.event_time >= cutoff);
  rows.sort((a, b) => b.event_time - a.event_time);
  return rows;
}

async function publishListSnapshot(env, initial, incoming, initialCutoff, durationMs) {
  let snapshot = initial;
  for (let attempt = 1; attempt <= MAX_PUBLICATION_ATTEMPTS; attempt++) {
    const cutoff = Math.max(initialCutoff, Date.now() - durationMs);
    const rows = mergeList(snapshot.rows, incoming, cutoff);
    const committed = await env.GEOJSON_BUCKET.put(snapshot.fileName, JSON.stringify(rows), {
      onlyIf: snapshot.etag === null ? { etagDoesNotMatch: '*' } : { etagMatches: snapshot.etag },
      httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=300' },
    });
    if (committed) {
      console.log(`[generate-lists] Successfully updated '${snapshot.fileName}' with ${rows.length} total events.`);
      return;
    }
    if (attempt === MAX_PUBLICATION_ATTEMPTS) break;
    snapshot = await readListSnapshot(env.DB, env.GEOJSON_BUCKET, snapshot.timeWindow);
  }
  throw new Error(`R2 conditional publication lost ${MAX_PUBLICATION_ATTEMPTS} races for '${snapshot.fileName}'`);
}

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
  if (newEarthquakes.some(row => sourceRevision(row) === null) ||
      new Set(newEarthquakes.map(row => row.id)).size !== newEarthquakes.length) {
    throw new Error('Incoming earthquake summaries need unique IDs and trusted source revisions');
  }
  const now = /* @__PURE__ */ new Date();
  // Preflight all three reads before any replacement. A later read error must
  // not follow a successful write for an earlier period.
  const snapshots = [];
  for (const window of LIST_WINDOWS) snapshots.push(await readListSnapshot(DB, GEOJSON_BUCKET, window));
  // Read and validate every input before replacing any period. In particular,
  // a failed month bootstrap must not follow successful day/week replacements.
  // R2 has no multi-object transaction. Each key instead retries a lost CAS
  // against its newly observed contents, retaining newer event revisions.
  for (const snapshot of snapshots) {
    const days = snapshot.timeWindow === 'day' ? 1 : snapshot.timeWindow === 'week' ? 7 : 30;
    const durationMs = days * 24 * 60 * 60 * 1000;
    await publishListSnapshot(env, snapshot, newEarthquakes, now.getTime() - durationMs, durationMs);
  }
}

export { handleGenerateLists };
