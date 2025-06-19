// Import D1 utility functions
// Note: Adjusted path assuming worker.js is in src/ and d1Utils.js is in src/utils/
import { upsertEarthquakeFeaturesToD1 } from './utils/d1Utils.js';
// Import common math utilities
import { calculateDistance } from '../common/mathUtils.js';

// === Helper Functions (originally from [[catchall]].js or new) ===
const jsonErrorResponse = (message, status, sourceName, details = undefined) => {
  const errorBody = {
    status: "error",
    message: message,
    source: sourceName,
  };
  if (details !== undefined) {
    errorBody.details = details;
  }
  return new Response(JSON.stringify(errorBody), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
};

function slugify(text) {
  if (!text) return 'unknown-location';
  const slug = text
    .toString()
    .toLowerCase()
    .replace(/[\s,()/]+/g, '-') // Removed unnecessary escapes
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return slug || 'unknown-location';
}

function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') {
    return '';
  }
  return unsafe.replace(/[<>&"']/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

function isCrawler(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  const crawlerRegex = /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot/i;
  return crawlerRegex.test(userAgent);
}

// === Clustering Logic (adapted from functions/api/calculate-clusters.js) ===

/**
 * Finds clusters of earthquakes based on proximity.
 * (Originally from `functions/api/calculate-clusters.js` which was adapted from `src/utils/clusterUtils.js`)
 * @param {Array<Object>} earthquakes - Array of earthquake objects. Each object is expected to have an `id`,
 *   `properties.mag` (magnitude), and `geometry.coordinates`.
 * @param {number} maxDistanceKm - Maximum geographic distance (in kilometers) for clustering.
 * @param {number} minQuakes - Minimum number of earthquakes required to form a valid cluster.
 * @returns {Array<Array<Object>>} An array of clusters, where each cluster is an array of earthquake objects.
 */
function findActiveClusters(earthquakes, maxDistanceKm, minQuakes) {
    const clusters = [];
    const processedQuakeIds = new Set();

    const validEarthquakes = earthquakes.filter(q => {
        if (!q) return false;
        return true;
    });

    const sortedEarthquakes = [...validEarthquakes].sort((a, b) => (b.properties?.mag || 0) - (a.properties?.mag || 0));

    for (const quake of sortedEarthquakes) {
        if (!quake.id || processedQuakeIds.has(quake.id)) {
            if (!quake.id && !processedQuakeIds.has(quake.id)) {
                console.warn(`[findActiveClusters] Skipping quake with missing ID or invalid object.`);
            }
            continue;
        }

        const baseCoords = quake.geometry?.coordinates;
        if (!Array.isArray(baseCoords) || baseCoords.length < 2) {
            console.warn(`[findActiveClusters] Skipping quake ${quake.id} due to invalid coordinates.`);
            continue;
        }
        const baseLat = baseCoords[1];
        const baseLon = baseCoords[0];

        const newCluster = [quake];
        processedQuakeIds.add(quake.id);

        for (const otherQuake of sortedEarthquakes) {
            if (otherQuake.id === quake.id || processedQuakeIds.has(otherQuake.id)) {
                continue;
            }
            if (!otherQuake.id ) {
                console.warn(`[findActiveClusters] Skipping potential cluster member with missing ID or invalid object.`);
                continue;
            }

            const otherCoords = otherQuake.geometry?.coordinates;
            if (!Array.isArray(otherCoords) || otherCoords.length < 2) {
                console.warn(`[findActiveClusters] Skipping potential cluster member ${otherQuake.id} due to invalid coordinates.`);
                continue;
            }
            const dist = calculateDistance(baseLat, baseLon, otherCoords[1], otherCoords[0]);
            if (dist <= maxDistanceKm) {
                newCluster.push(otherQuake);
                processedQuakeIds.add(otherQuake.id);
            }
        }
        if (newCluster.length >= minQuakes) {
            const newClusterQuakeIds = new Set(newCluster.map(q => q.id));
            let isDuplicate = false;
            for (const existingCluster of clusters) {
                const existingClusterQuakeIds = new Set(existingCluster.map(q => q.id));
                if (newClusterQuakeIds.size === existingClusterQuakeIds.size) {
                    let allSame = true;
                    for (const id of newClusterQuakeIds) {
                        if (!existingClusterQuakeIds.has(id)) {
                            allSame = false;
                            break;
                        }
                    }
                    if (allSame) {
                        isDuplicate = true;
                        break;
                    }
                }
            }
            if (!isDuplicate) {
                clusters.push(newCluster);
            }
        }
    }
    return clusters;
}


// === Request Handler Functions ===

async function handleUsgsProxyRequest(request, env, ctx, apiUrl) {
  const sourceName = "usgs-proxy-handler";
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = '/cache/usgs-proxy';
  cacheUrl.searchParams.set("actualApiUrl", apiUrl);
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log(`Cache hit for: ${apiUrl}`);
      return cachedResponse;
    }

    console.log(`Cache miss for: ${apiUrl}. Fetching from origin.`);
    let externalResponse;
    try {
      externalResponse = await fetch(apiUrl);
    } catch (error) {
      console.error(`USGS API fetch failed for ${apiUrl}: ${error.message}`, error);
      return jsonErrorResponse(`USGS API fetch failed: ${error.message}`, 500, sourceName);
    }

    if (!externalResponse.ok) {
      console.error(`Error fetching data from USGS API (${apiUrl}): ${externalResponse.status} ${externalResponse.statusText}`);
      return jsonErrorResponse(
        `Error fetching data from USGS API: ${externalResponse.status} ${externalResponse.statusText}`,
        externalResponse.status,
        sourceName,
        externalResponse.status
      );
    }

    const data = await externalResponse.json();
    const DB = env.DB; // D1 binding from wrangler.toml

    if (DB && data && Array.isArray(data.features) && data.features.length > 0) {
      console.log(`[${sourceName}] Proactively upserting ${data.features.length} features from proxied feed into D1.`);
      ctx.waitUntil(upsertEarthquakeFeaturesToD1(DB, data.features).catch(err => {
        console.error(`[${sourceName}] Error during background D1 upsert from proxied feed: ${err.message}`, err);
      }));
    }

    const DEFAULT_CACHE_DURATION_SECONDS = 60;
    let durationInSeconds = DEFAULT_CACHE_DURATION_SECONDS;
    const envCacheDuration = env.WORKER_CACHE_DURATION_SECONDS;
    if (envCacheDuration) {
      const parsedDuration = parseInt(envCacheDuration, 10);
      if (!isNaN(parsedDuration) && parsedDuration > 0) {
        durationInSeconds = parsedDuration;
      } else {
        console.warn(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${envCacheDuration}". Using default: ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
      }
    }

    const newResponseHeaders = new Headers(externalResponse.headers);
    newResponseHeaders.set("Content-Type", "application/json");
    newResponseHeaders.set("Cache-Control", `s-maxage=${durationInSeconds}`);
    newResponseHeaders.delete("Set-Cookie");

    let newResponse = new Response(JSON.stringify(data), {
      status: externalResponse.status,
      statusText: externalResponse.statusText,
      headers: newResponseHeaders,
    });

    ctx.waitUntil(
      cache.put(cacheKey, newResponse.clone()).then(() => {
        console.log(`Successfully cached response for: ${apiUrl} (duration: ${durationInSeconds}s)`);
      }).catch(err => {
        console.error(`Failed to cache response for ${apiUrl}: ${err.message}`, err);
      })
    );
    return newResponse;
  } catch (error) {
    console.error(`Error processing request for ${apiUrl}: ${error.message}`, error);
    return jsonErrorResponse(`Error processing request: ${error.message}`, 500, sourceName);
  }
}

async function handleCalculateClustersRequest(request, env, ctx) {
  const sourceName = "calculate-clusters-handler";
  try {
    const { earthquakes, maxDistanceKm, minQuakes, lastFetchTime, timeWindowHours } = await request.json();

    if (!Array.isArray(earthquakes)) {
      return jsonErrorResponse('Invalid earthquakes payload: not an array.', 400, sourceName);
    }
    if (earthquakes.length === 0) {
      return jsonErrorResponse('Earthquakes array is empty, no clusters to calculate.', 400, sourceName);
    }
    for (let i = 0; i < earthquakes.length; i++) {
        const quake = earthquakes[i];
        if (!quake || typeof quake !== 'object') {
            return jsonErrorResponse(`Invalid earthquake object at index ${i}: not an object.`, 400, sourceName);
        }
        if (!quake.geometry || typeof quake.geometry !== 'object') {
            return jsonErrorResponse(`Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): missing or invalid 'geometry' object.`, 400, sourceName);
        }
        if (!Array.isArray(quake.geometry.coordinates) || quake.geometry.coordinates.length < 2 ||
            typeof quake.geometry.coordinates[0] !== 'number' || typeof quake.geometry.coordinates[1] !== 'number') {
            return jsonErrorResponse(`Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): 'geometry.coordinates' must be an array of at least 2 numbers.`, 400, sourceName);
        }
        if (!quake.properties || typeof quake.properties !== 'object') {
            return jsonErrorResponse(`Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): missing or invalid 'properties' object.`, 400, sourceName);
        }
        if (typeof quake.properties.time !== 'number') {
            return jsonErrorResponse(`Invalid earthquake at index ${i} (id: ${quake.id || 'N/A'}): 'properties.time' must be a number.`, 400, sourceName);
        }
        if (!quake.id) {
            return jsonErrorResponse(`Invalid earthquake at index ${i}: missing 'id' property.`, 400, sourceName);
        }
    }
    if (typeof maxDistanceKm !== 'number' || maxDistanceKm <= 0) {
      return jsonErrorResponse('Invalid maxDistanceKm', 400, sourceName);
    }
    if (typeof minQuakes !== 'number' || minQuakes <= 0) {
      return jsonErrorResponse('Invalid minQuakes', 400, sourceName);
    }

    const requestParams = { numQuakes: earthquakes.length, maxDistanceKm, minQuakes, lastFetchTime, timeWindowHours };
    const cacheKey = `clusters-${JSON.stringify(requestParams)}`;
    const responseHeaders = { 'Content-Type': 'application/json' };
    const DB = env.DB;

    if (!DB) {
      console.warn(`[${sourceName}] D1 Database (DB) not available. Proceeding without cache.`);
      const clustersNoDB = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
      responseHeaders['X-Cache-Hit'] = 'false';
      responseHeaders['X-Cache-Info'] = 'DB not configured';
      return new Response(JSON.stringify(clustersNoDB), { status: 200, headers: responseHeaders });
    }

    const cacheQuery = "SELECT clusterData FROM ClusterCache WHERE cacheKey = ? AND createdAt > datetime('now', '-1 hour')";
    const insertQuery = "INSERT OR REPLACE INTO ClusterCache (cacheKey, clusterData, requestParams) VALUES (?, ?, ?)";

    try {
      const selectStmt = DB.prepare(cacheQuery).bind(cacheKey);
      const cachedResult = await selectStmt.first();
      if (cachedResult && cachedResult.clusterData) {
        try {
          const parsedData = JSON.parse(cachedResult.clusterData);
          responseHeaders['X-Cache-Hit'] = 'true';
          console.log(`[${sourceName}] Cache hit for key: ${cacheKey}`);
          return new Response(JSON.stringify(parsedData), { status: 200, headers: responseHeaders });
        } catch (parseError) {
          console.error(`[${sourceName}] D1 Cache: Error parsing cached JSON for key ${cacheKey}: ${parseError.message}`);
        }
      }
       console.log(`[${sourceName}] Cache miss for key: ${cacheKey}`);
    } catch (dbGetError) {
      console.error(`[${sourceName}] D1 GET error for cacheKey ${cacheKey}: ${dbGetError.message}`, dbGetError.cause);
    }

    const clusters = findActiveClusters(earthquakes, maxDistanceKm, minQuakes);
    const clusterDataString = JSON.stringify(clusters);

    try {
      const insertStmt = DB.prepare(insertQuery).bind(cacheKey, clusterDataString, JSON.stringify(requestParams));
      ctx.waitUntil(insertStmt.run().catch(dbPutError => {
         console.error(`[${sourceName}] D1 PUT error for cacheKey ${cacheKey}: ${dbPutError.message}`, dbPutError.cause);
      }));
    } catch (dbPrepareError) {
        console.error(`[${sourceName}] D1 PUT statement preparation error for cacheKey ${cacheKey}: ${dbPrepareError.message}`, dbPrepareError.cause);
    }

    responseHeaders['X-Cache-Hit'] = 'false';
    return new Response(clusterDataString, { status: 200, headers: responseHeaders });

  } catch (error) {
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        return jsonErrorResponse('Invalid JSON payload', 400, sourceName, error.message);
    }
    console.error(`[${sourceName}] Unhandled error: ${error.message}`, error.stack);
    return jsonErrorResponse('Internal server error', 500, sourceName, error.message);
  }
}

async function handleClusterDefinitionRequest(request, env, ctx) {
  const sourceName = "cluster-definition-handler";
  const method = request.method;
  const DB = env.DB;

  if (!DB) {
    return jsonErrorResponse("Database not configured.", 500, sourceName);
  }

  if (method === 'POST') {
    try {
      const clusterData = await request.json();

      if (!clusterData || typeof clusterData.clusterId !== 'string' || !Array.isArray(clusterData.earthquakeIds) || typeof clusterData.strongestQuakeId !== 'string') {
        return jsonErrorResponse('Invalid cluster data. Missing or invalid type for required fields: clusterId (string), earthquakeIds (array), strongestQuakeId (string).', 400, sourceName);
      }

      const { clusterId, earthquakeIds, strongestQuakeId } = clusterData;

      const stmt = DB.prepare(
        'INSERT OR REPLACE INTO ClusterDefinitions (clusterId, earthquakeIds, strongestQuakeId, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
      ).bind(clusterId, JSON.stringify(earthquakeIds), strongestQuakeId);

      await stmt.run();
      console.log(`[${sourceName}] Cluster definition for ${clusterId} registered/updated successfully.`);
      return new Response(JSON.stringify({ status: "success", message: `Cluster definition for ${clusterId} registered/updated.`, clusterId: clusterId }), { status: 201, headers: { 'Content-Type': 'application/json' } });

    } catch (e) {
      if (e instanceof SyntaxError) { // JSON parsing error
        return jsonErrorResponse('Invalid JSON payload.', 400, sourceName, e.message);
      }
      console.error(`[${sourceName}] Error processing POST request: ${e.message}`, e.cause);
      return jsonErrorResponse('Failed to process cluster definition POST request.', 500, sourceName, e.message);
    }
  } else if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const clusterId = url.searchParams.get('id');

      if (!clusterId) {
        return jsonErrorResponse('Missing clusterId query parameter.', 400, sourceName);
      }

      const stmt = DB.prepare(
        'SELECT clusterId, earthquakeIds, strongestQuakeId, createdAt, updatedAt FROM ClusterDefinitions WHERE clusterId = ?'
      ).bind(clusterId);
      const result = await stmt.first();

      if (!result) {
        return jsonErrorResponse(`Cluster definition for ${clusterId} not found.`, 404, sourceName);
      }

      const responsePayload = {
        ...result,
        earthquakeIds: JSON.parse(result.earthquakeIds || '[]'),
      };

      console.log(`[${sourceName}] Successfully retrieved cluster definition for ${clusterId}.`);
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error(`[${sourceName}] Error processing GET request: ${e.message}`, e.cause);
      return jsonErrorResponse('Failed to process cluster definition GET request.', 500, sourceName, e.message);
    }
  } else {
    return jsonErrorResponse(`Method ${method} Not Allowed for /api/cluster-definition`, 405, sourceName, `Allowed methods: GET, POST`);
  }
}


// eslint-disable-next-line no-unused-vars
async function handleSitemapIndexRequest(request, env, ctx) {
  const sitemapIndexXML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-static-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-earthquakes.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-clusters.xml</loc>
  </sitemap>
</sitemapindex>`;
  return new Response(sitemapIndexXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=21600" }});
}

// eslint-disable-next-line no-unused-vars
async function handleStaticPagesSitemapRequest(request, env, ctx) {
  const staticPages = [
    { loc: "https://earthquakeslive.com/", priority: "1.0", changefreq: "hourly" },
    { loc: "https://earthquakeslive.com/overview", priority: "0.9", changefreq: "hourly" },
    { loc: "https://earthquakeslive.com/feeds", priority: "0.9", changefreq: "hourly" },
  ];
  const feedPeriods = [
    { period: "last_hour", priority: "0.9", changefreq: "hourly" },
    { period: "last_24_hours", priority: "0.9", changefreq: "hourly" },
    { period: "last_7_days", priority: "0.9", changefreq: "daily" },
    { period: "last_30_days", priority: "0.7", changefreq: "daily" },
  ];
  let urlsXml = "";
  staticPages.forEach(page => { urlsXml += `\n  <url><loc>${page.loc}</loc><priority>${page.priority}</priority><changefreq>${page.changefreq}</changefreq></url>`; });
  feedPeriods.forEach(feed => { urlsXml += `\n  <url><loc>https://earthquakeslive.com/feeds?activeFeedPeriod=${feed.period}</loc><priority>${feed.priority}</priority><changefreq>${feed.changefreq}</changefreq></url>`; });
  urlsXml += `
  <url><loc>https://earthquakeslive.com/learn</loc><priority>0.5</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/magnitude-vs-intensity</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/measuring-earthquakes</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/plate-tectonics</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>`;
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlsXml}\n</urlset>`;
  return new Response(sitemapXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=86400" }});
}

// eslint-disable-next-line no-unused-vars
async function handleEarthquakesSitemapRequest(request, env, ctx) {
  const sourceName = "earthquakes-sitemap-handler";
  const usgsFeedUrl = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
  let earthquakesXml = "";
  try {
    console.log(`[${sourceName}] Fetching earthquake data from: ${usgsFeedUrl}`);
    const response = await fetch(usgsFeedUrl);
    if (!response.ok) {
      console.error(`[${sourceName}] Error fetching earthquake data: ${response.status} ${response.statusText}`);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Error fetching earthquake data -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
    }
    const data = await response.json();
    if (data && data.features) {
      data.features.forEach(quake => {
        if (quake && quake.id && quake.properties) {
          const usgs_id = quake.id;
          let formattedMagnitude = 'Munknown';
          if (typeof quake.properties.mag === 'number' && !isNaN(quake.properties.mag)) { formattedMagnitude = `m${quake.properties.mag.toFixed(1)}`; }
          else { console.warn(`[${sourceName}] Invalid or missing magnitude for quake ${usgs_id}: ${quake.properties.mag}. Using '${formattedMagnitude}'.`); }
          const place = quake.properties.place || "Unknown Place";
          const locationSlug = slugify(place);
          const loc = `https://earthquakeslive.com/quake/${formattedMagnitude}-${locationSlug}-${usgs_id}`;
          const lastmod = new Date(quake.properties.updated || quake.properties.time).toISOString();
          earthquakesXml += `\n  <url><loc>${escapeXml(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`;
        } else { console.warn(`[${sourceName}] Skipping quake in sitemap due to missing id or properties:`, quake); }
      });
    }
  } catch (error) {
    console.error(`[${sourceName}] Exception fetching or processing earthquake data: ${error.message}`, error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Exception processing earthquake data: ${escapeXml(error.message)} -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
  }
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${earthquakesXml}\n</urlset>`;
  return new Response(sitemapXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
}

// eslint-disable-next-line no-unused-vars
async function handleClustersSitemapRequest(request, env, ctx) {
  const sourceName = "clusters-sitemap-handler";
  const DB = env.DB;
  let clustersXml = "";
  const currentDate = new Date().toISOString();
  if (!DB) {
    console.error(`[${sourceName}] D1 Database (DB) not available`);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- D1 Database not available -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
  }
  try {
    const stmt = DB.prepare("SELECT clusterId, updatedAt FROM ClusterDefinitions ORDER BY updatedAt DESC LIMIT 500");
    const { results } = await stmt.all();
    if (results && results.length > 0) {
      for (const row of results) {
        const d1ClusterId = row.clusterId;
        const lastmod = row.updatedAt ? new Date(row.updatedAt).toISOString() : currentDate;
        const d1IdRegex = /^overview_cluster_([a-zA-Z0-9]+)_(\d+)$/;
        const d1Match = d1ClusterId.match(d1IdRegex);
        if (!d1Match) { console.warn(`[${sourceName}] Failed to parse D1 clusterId: ${d1ClusterId}. Skipping.`); continue; }
        const strongestQuakeIdFromDb = d1Match[1];
        const quakeCountFromDb = d1Match[2];
        let quakeData;
        try {
          const usgsUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${strongestQuakeIdFromDb}.geojson`;
          const response = await fetch(usgsUrl);
          if (!response.ok) { console.warn(`[${sourceName}] USGS fetch failed for ${strongestQuakeIdFromDb}: ${response.status} ${response.statusText}. Skipping.`); continue; }
          quakeData = await response.json();
        } catch (fetchError) { console.error(`[${sourceName}] Error fetching USGS data for ${strongestQuakeIdFromDb}: ${fetchError.message}. Skipping.`); continue; }
        if (!quakeData || !quakeData.properties) { console.warn(`[${sourceName}] Invalid or missing properties in USGS data for ${strongestQuakeIdFromDb}. Skipping.`); continue; }
        const locationName = quakeData.properties.place;
        const maxMagnitude = quakeData.properties.mag;
        if (!locationName || typeof locationName !== 'string') { console.warn(`[${sourceName}] Missing or invalid locationName for ${strongestQuakeIdFromDb}. Skipping.`); continue; }
        if (maxMagnitude === null || maxMagnitude === undefined || typeof maxMagnitude !== 'number') { console.warn(`[${sourceName}] Missing or invalid maxMagnitude for ${strongestQuakeIdFromDb}. Skipping.`); continue; }
        const locationSlug = locationName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const newUrl = `https://earthquakeslive.com/cluster/${quakeCountFromDb}-quakes-near-${locationSlug}-up-to-m${maxMagnitude.toFixed(1)}-${strongestQuakeIdFromDb}`;
        clustersXml += `\n  <url><loc>${escapeXml(newUrl)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
      }
    } else { console.log(`[${sourceName}] No cluster definitions found in D1 table ClusterDefinitions.`); }
  } catch (error) {
    console.error(`[${sourceName}] Exception querying or processing cluster data from D1: ${error.message}`, error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Exception processing cluster data from D1: ${escapeXml(error.message)} -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
  }
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${clustersXml}\n</urlset>`;
  return new Response(sitemapXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=10800" }});
}

async function handlePrerenderEarthquake(request, env, ctx, quakeIdPathSegment) {
  const sourceName = "prerender-earthquake";
  const siteUrl = "https://earthquakeslive.com";
  try {
    const parts = quakeIdPathSegment ? quakeIdPathSegment.split('-') : [];
    const usgsId = parts.length > 1 ? parts[parts.length - 1] : null;
    if (!usgsId) {
      console.error(`[${sourceName}] Could not extract usgs-id from quakeIdPathSegment: ${quakeIdPathSegment}`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Invalid earthquake identifier.</body></html>`, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
    }
    const detailUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${usgsId}.geojson`;
    const response = await fetch(detailUrl);
    if (!response.ok) {
      console.error(`[${sourceName}] Failed to fetch earthquake data from ${detailUrl} (USGS ID: ${usgsId}): ${response.status}`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Earthquake data not found.</body></html>`, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
    }
    const quakeData = await response.json();
    if (!quakeData || !quakeData.properties || !quakeData.geometry) {
      console.error(`[${sourceName}] Invalid earthquake data structure from ${detailUrl} (USGS ID: ${usgsId})`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Invalid earthquake data.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
    }
    const {mag, place, time} = quakeData.properties;
    const dateObj = new Date(time);
    const readableTime = dateObj.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' });
    const isoTime = dateObj.toISOString();
    const depth = quakeData.geometry.coordinates[2];
    const lat = quakeData.geometry.coordinates[1];
    const lon = quakeData.geometry.coordinates[0];
    const canonicalUrl = `${siteUrl}/quake/${quakeIdPathSegment}`;
    const usgsEventUrl = quakeData.properties.detail;
    const titleDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const pageTitle = `M ${mag} Earthquake - ${place} - ${titleDate} | Earthquakes Live`;
    const description = `Detailed report of the M ${mag} earthquake that struck near ${place} on ${titleDate} at ${dateObj.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'})} (UTC). Magnitude: ${mag}, Depth: ${depth} km. Location: ${lat.toFixed(2)}, ${lon.toFixed(2)}. Stay updated with Earthquakes Live.`;
    let significanceSentence = `This earthquake occurred at a depth of ${depth} km.`;
    if (depth < 70) significanceSentence = `This shallow earthquake (depth: ${depth} km) may have been felt by many people in the area.`;
    else if (depth > 300) significanceSentence = `This earthquake occurred very deep (depth: ${depth} km).`;
    const keywords = `earthquake, ${place ? place.split(', ').join(', ') : ''}, M${mag}, seismic event, earthquake report`;
    const jsonLd = {"@context": "https://schema.org", "@type": "Event", name: `M ${mag} - ${place}`, description, startDate: isoTime, location: {"@type": "Place", geo: {"@type": "GeoCoordinates", latitude: lat, longitude: lon, elevation: -depth * 1000 }, name: place }, identifier: quakeData.id, url: canonicalUrl, keywords: keywords.toLowerCase()};
    if (usgsEventUrl) jsonLd.sameAs = usgsEventUrl;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeXml(pageTitle)}</title><meta name="description" content="${escapeXml(description)}"><meta name="keywords" content="${escapeXml(keywords.toLowerCase())}"><link rel="canonical" href="${escapeXml(canonicalUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@builtbyvibes"><meta property="og:title" content="${escapeXml(pageTitle)}"><meta property="og:description" content="${escapeXml(description)}"><meta property="og:url" content="${escapeXml(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png"><script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script></head><body><h1>${escapeXml(pageTitle)}</h1><p><strong>Time:</strong> ${escapeXml(readableTime)}</p><p><strong>Location:</strong> ${escapeXml(place)}</p><p><strong>Coordinates:</strong> ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</p><p><strong>Magnitude:</strong> M ${mag}</p><p><strong>Depth:</strong> ${depth} km</p><p>${escapeXml(significanceSentence)}</p>${usgsEventUrl ? `<p><a href="${escapeXml(usgsEventUrl)}" target="_blank" rel="noopener noreferrer">View on USGS Event Page</a></p>` : ''}<div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  } catch (error) {
    console.error(`[${sourceName}] Error: ${error.message}`, error);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering earthquake page.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  }
}

async function handlePrerenderCluster(request, env, ctx, urlSlugParam) {
  const sourceName = "prerender-cluster";
  const siteUrl = "https://earthquakeslive.com";
  const urlSlug = urlSlugParam;
  const slugRegex = /^(\d+)-quakes-near-.*?([a-zA-Z0-9]+)$/;
  const match = urlSlug.match(slugRegex);
  if (!match) {
    console.warn(`[${sourceName}] Invalid cluster URL slug format: ${urlSlug}`);
    return new Response(`<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Invalid cluster URL format.</body></html>`, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  }
  const extractedCount = match[1];
  const extractedStrongestQuakeId = match[2];
  const clusterIdForD1Query = `overview_cluster_${extractedStrongestQuakeId}_${extractedCount}`;
  if (!env.DB) {
    console.error(`[${sourceName}] D1 Database (env.DB) not configured for prerendering cluster.`);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Service configuration error.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  }
  try {
    const stmt = env.DB.prepare("SELECT earthquakeIds, strongestQuakeId, updatedAt FROM ClusterDefinitions WHERE clusterId = ?").bind(clusterIdForD1Query);
    const clusterInfo = await stmt.first();
    if (!clusterInfo) {
      console.warn(`[${sourceName}] Cluster definition not found in D1 for D1 Query ID: ${clusterIdForD1Query} (derived from slug: ${urlSlug})`);
      return new Response(`<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Cluster not found.</body></html>`, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
    }
    let earthquakeIds;
    try { earthquakeIds = typeof clusterInfo.earthquakeIds === 'string' ? JSON.parse(clusterInfo.earthquakeIds) : clusterInfo.earthquakeIds; }
    catch (e) { console.error(`[${sourceName}] Error parsing earthquakeIds for D1 Query ID ${clusterIdForD1Query}: ${e.message}`); return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error processing cluster data.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }}); }
    const d1StrongestQuakeId = clusterInfo.strongestQuakeId;
    const { updatedAt } = clusterInfo;
    const numEvents = earthquakeIds ? earthquakeIds.length : 0;
    const canonicalUrl = `${siteUrl}/cluster/${urlSlug}`;
    const formattedUpdatedAt = new Date(updatedAt).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' });
    let strongestQuakeDetails = null, pageTitle, description, bodyContent, keywords;
    if (d1StrongestQuakeId) {
      try {
        const quakeDetailUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${d1StrongestQuakeId}.geojson`;
        const res = await fetch(quakeDetailUrl);
        if (res.ok) {
          const quakeData = await res.json();
          if (quakeData && quakeData.properties) { strongestQuakeDetails = { mag: quakeData.properties.mag, place: quakeData.properties.place, time: new Date(quakeData.properties.time).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' }), id: quakeData.id, url: quakeData.properties.detail, latitude: quakeData.geometry?.coordinates?.[1], longitude: quakeData.geometry?.coordinates?.[0] }; }
        } else { console.warn(`[${sourceName}] Failed to fetch strongest quake details for ${d1StrongestQuakeId}: ${res.status}`); }
      } catch (e) { console.error(`[${sourceName}] Error fetching strongest quake details for ${d1StrongestQuakeId}: ${e.message}`); }
    }
    if (strongestQuakeDetails) {
      pageTitle = `Earthquake Cluster near ${strongestQuakeDetails.place} | Earthquakes Live`;
      description = `Explore an active earthquake cluster near ${strongestQuakeDetails.place}, featuring ${numEvents} seismic events. The largest event in this sequence is a M ${strongestQuakeDetails.mag}. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${strongestQuakeDetails.place ? strongestQuakeDetails.place.split(', ').join(', ') : ''}, tectonic activity, M${strongestQuakeDetails.mag}`;
      bodyContent = `<p>This page provides details about an earthquake cluster located near <strong>${escapeXml(strongestQuakeDetails.place)}</strong>.</p><p>This cluster contains <strong>${numEvents}</strong> individual seismic events.</p><p>The most significant earthquake in this cluster is a <strong>M ${strongestQuakeDetails.mag}</strong>, which occurred on ${escapeXml(strongestQuakeDetails.time)}.</p>${strongestQuakeDetails.url ? `<p><a href="${escapeXml(strongestQuakeDetails.url)}" target="_blank" rel="noopener noreferrer">View details for the largest event on USGS</a></p>` : ''}<p><em>Cluster information last updated: ${escapeXml(formattedUpdatedAt)}.</em></p>`;
    } else {
      pageTitle = `Earthquake Cluster Summary (${numEvents} Events) | Earthquakes Live`;
      description = `Details of an earthquake cluster containing ${numEvents} seismic events. This cluster is identified by the strongest quake ID: ${extractedStrongestQuakeId}. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${extractedStrongestQuakeId}, tectonic activity`;
      bodyContent = `<p>This page provides details about an earthquake cluster associated with the primary event ID <strong>${escapeXml(extractedStrongestQuakeId)}</strong>.</p><p>This cluster contains <strong>${numEvents}</strong> individual seismic events.</p><p><em>Cluster information last updated: ${escapeXml(formattedUpdatedAt)}.</em></p><p><em>Further details about the most significant event in this cluster are currently unavailable.</em></p>`;
    }
    const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: pageTitle, description, url: canonicalUrl, dateModified: new Date(updatedAt).toISOString(), keywords: keywords.toLowerCase() };
    if (strongestQuakeDetails) {
      jsonLd.about = { "@type": "Event", name: `M ${strongestQuakeDetails.mag} - ${strongestQuakeDetails.place}`, identifier: strongestQuakeDetails.id, ... (strongestQuakeDetails.url && { url: strongestQuakeDetails.url }) };
      if (typeof strongestQuakeDetails.latitude === 'number' && typeof strongestQuakeDetails.longitude === 'number') { jsonLd.location = { "@type": "Place", name: strongestQuakeDetails.place, geo: { "@type": "GeoCoordinates", latitude: strongestQuakeDetails.latitude, longitude: strongestQuakeDetails.longitude }}; }
    }
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeXml(pageTitle)}</title><meta name="description" content="${escapeXml(description)}"><meta name="keywords" content="${escapeXml(keywords.toLowerCase())}"><link rel="canonical" href="${escapeXml(canonicalUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@builtbyvibes"><meta property="og:title" content="${escapeXml(pageTitle)}"><meta property="og:description" content="${escapeXml(description)}"><meta property="og:url" content="${escapeXml(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png"><script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script></head><body><h1>${escapeXml(pageTitle)}</h1>${bodyContent}<p>Explore the live map and detailed list of events in this cluster on our interactive platform.</p><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=1800" }});
  } catch (error) {
    console.error(`[${sourceName}] Error processing cluster slug ${urlSlug} (D1 ID: ${clusterIdForD1Query || 'not_constructed'}): ${error.message}`, error);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering cluster page.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  }
}

async function handleEarthquakeDetailRequest(request, env, ctx, event_id) {
  const sourceName = "earthquake-detail-handler";
  const DATA_FRESHNESS_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
  const DB = env.DB;

  if (!DB) {
    console.error(`[${sourceName}] D1 Database (DB) not configured for event: ${event_id}. Proceeding to USGS fetch only.`);
  } else {
    try {
      console.log(`[${sourceName}] Querying D1 for event: ${event_id}`);
      const stmt = DB.prepare("SELECT geojson_feature, retrieved_at FROM EarthquakeEvents WHERE id = ?").bind(event_id);
      const result = await stmt.first();
      if (result && result.retrieved_at && (Date.now() - new Date(result.retrieved_at).getTime() < DATA_FRESHNESS_THRESHOLD_MS)) {
        console.log(`[${sourceName}] Fresh data found in D1 for event: ${event_id}. Freshness: ${Date.now() - new Date(result.retrieved_at).getTime()}ms.`);
        return new Response(result.geojson_feature, { headers: { 'Content-Type': 'application/json', 'X-Data-Source': 'D1-Cache' }});
      }
      if (result) console.log(`[${sourceName}] Data for event ${event_id} found in D1 but is stale (retrieved_at: ${result.retrieved_at}). Proceeding to USGS fetch.`);
      else console.log(`[${sourceName}] Event ${event_id} not found in D1. Proceeding to USGS fetch.`);
    } catch (d1Error) {
      console.error(`[${sourceName}] D1 query error for event ${event_id}: ${d1Error.message}. Falling back to USGS.`, d1Error);
    }
  }

  try {
    const usgsUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${event_id}.geojson`;
    console.log(`[${sourceName}] Fetching event ${event_id} from USGS: ${usgsUrl}`);
    let usgsResponse;
    try { usgsResponse = await fetch(usgsUrl); }
    catch (fetchError) { console.error(`[${sourceName}] USGS API fetch failed for ${usgsUrl}: ${fetchError.message}`, fetchError); return jsonErrorResponse(`USGS API fetch failed: ${fetchError.message}`, 502, sourceName); }

    if (!usgsResponse.ok) {
      console.error(`[${sourceName}] Error fetching data from USGS API (${usgsUrl}): ${usgsResponse.status} ${usgsResponse.statusText}`);
      return jsonErrorResponse(`Error fetching data from USGS API: ${usgsResponse.status} ${usgsResponse.statusText}`, 502, sourceName, usgsResponse.status);
    }
    const geojsonFeature = await usgsResponse.json();

    if (DB) {
      const retrieved_at_timestamp = Date.now();
      const geojson_feature_string = JSON.stringify(geojsonFeature);
      const id = geojsonFeature.id;
      const event_time_timestamp = geojsonFeature.properties?.time;
      const latitude = geojsonFeature.geometry?.coordinates?.[1];
      const longitude = geojsonFeature.geometry?.coordinates?.[0];
      const depth = geojsonFeature.geometry?.coordinates?.[2];
      const magnitude = geojsonFeature.properties?.mag;
      const place = geojsonFeature.properties?.place;

      if (id == null || event_time_timestamp == null || latitude == null || longitude == null || depth == null || magnitude == null || place == null) {
        console.warn(`[${sourceName}] Skipping D1 upsert for event ${id} due to missing critical GeoJSON properties.`);
      } else {
        const usgs_detail_json_url = usgsUrl;
        const upsertStmt = `INSERT INTO EarthquakeEvents (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, geojson_feature, retrieved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET event_time=excluded.event_time, latitude=excluded.latitude, longitude=excluded.longitude, depth=excluded.depth, magnitude=excluded.magnitude, place=excluded.place, usgs_detail_url=excluded.usgs_detail_url, geojson_feature=excluded.geojson_feature, retrieved_at=excluded.retrieved_at;`;
        const d1WritePromise = DB.prepare(upsertStmt).bind(id, event_time_timestamp, latitude, longitude, depth, magnitude, place, usgs_detail_json_url, geojson_feature_string, retrieved_at_timestamp).run()
          .then(({ success, error }) => {
            if (success) console.log(`[${sourceName}] Successfully upserted event ${id} into D1 from USGS fallback.`);
            else console.error(`[${sourceName}] Failed to upsert event ${id} into D1 from USGS fallback: ${error}`);
          }).catch(err => console.error(`[${sourceName}] Exception during D1 upsert for event ${id} from USGS fallback: ${err.message}`, err));
        ctx.waitUntil(d1WritePromise);
      }
    } else { console.log(`[${sourceName}] DB not available, skipping D1 upsert for event ${event_id} after USGS fetch.`); }
    return new Response(JSON.stringify(geojsonFeature), { headers: { 'Content-Type': 'application/json', 'X-Data-Source': 'USGS-API' }});
  } catch (usgsOrGeneralError) {
    console.error(`[${sourceName}] Error during USGS fetch/processing or other general error for event ${event_id}: ${usgsOrGeneralError.message}`, usgsOrGeneralError);
    return jsonErrorResponse(`Error processing earthquake detail request: ${usgsOrGeneralError.message}`, 500, sourceName);
  }
}


// === Main Exported Worker Object ===

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Prerendering for crawlers
    if (isCrawler(request)) {
      if (pathname.startsWith("/quake/")) {
        const quakeIdPathSegment = pathname.substring("/quake/".length);
        if (quakeIdPathSegment) return handlePrerenderEarthquake(request, env, ctx, quakeIdPathSegment);
      } else if (pathname.startsWith("/cluster/")) {
        const clusterId = pathname.substring("/cluster/".length);
        if (clusterId) return handlePrerenderCluster(request, env, ctx, clusterId);
      }
    }

    // Sitemap routes
    if (pathname === "/sitemap-index.xml") return handleSitemapIndexRequest(request, env, ctx);
    if (pathname === "/sitemap-static-pages.xml") return handleStaticPagesSitemapRequest(request, env, ctx);
    if (pathname === "/sitemap-earthquakes.xml") return handleEarthquakesSitemapRequest(request, env, ctx);
    if (pathname === "/sitemap-clusters.xml") return handleClustersSitemapRequest(request, env, ctx);

    // API routes
    if (pathname === "/api/usgs-proxy") {
      const apiUrl = url.searchParams.get("apiUrl");
      if (!apiUrl) return jsonErrorResponse("Missing apiUrl query parameter", 400, "worker-router-usgs-proxy");
      return handleUsgsProxyRequest(request, env, ctx, apiUrl);
    }
    if (pathname.startsWith("/api/earthquake/")) {
      const parts = pathname.split('/');
      if (parts.length === 4 && parts[3]) {
        try {
          const event_id = decodeURIComponent(parts[3]);
          return handleEarthquakeDetailRequest(request, env, ctx, event_id);
        } catch (e) {
          if (e instanceof URIError) return jsonErrorResponse("Invalid event_id encoding", 400, "worker-router-earthquake-decode");
          console.error(`[worker-fetch-earthquake] Unexpected error: ${e.message}`, e);
          return jsonErrorResponse("Error processing earthquake request", 500, "worker-router-earthquake-unexpected");
        }
      } else {
        return jsonErrorResponse("Invalid earthquake event ID path", 400, "worker-router-earthquake-format");
      }
    }
    if (pathname === "/api/calculate-clusters" && request.method === "POST") {
      return handleCalculateClustersRequest(request, env, ctx);
    }
    if (pathname === "/api/cluster-definition") {
      return handleClusterDefinitionRequest(request, env, ctx);
    }

    // Serve static assets from ASSETS binding
    try {
      if (!env.ASSETS) {
        console.error("[worker-fetch] env.ASSETS binding is not available.");
        return new Response("Static asset serving is not configured.", { status: 500 });
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(`[worker-fetch] Error fetching from ASSETS for ${pathname}: ${e.message}`, e);
      return new Response("An error occurred while serving static assets.", { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    console.log(`[worker-scheduled] Cron Triggered at ${new Date(event.scheduledTime).toISOString()}`);

    if (!env.DB) {
      console.error("[worker-scheduled] D1 Database (DB) binding not found.");
      return;
    }

    const USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

    try {
      console.log(`[worker-scheduled] Fetching earthquake data from ${USGS_FEED_URL}`);
      const response = await fetch(USGS_FEED_URL, {
        headers: { 'User-Agent': 'CloudflareWorker-EarthquakeFetcher/1.0' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[worker-scheduled] Error fetching data from USGS: ${response.status} ${response.statusText} - ${errorText}`);
        return;
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.features) || data.features.length === 0) {
        console.log("[worker-scheduled] No earthquake features found in the response or data is invalid.");
        return;
      }

      console.log(`[worker-scheduled] Fetched ${data.features.length} earthquake features. Starting D1 upsert.`);

      const featuresToUpsert = data.features.map(feature => {
        if (feature.properties && typeof feature.properties.retrieved_at === 'string') {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              retrieved_at: new Date(feature.properties.retrieved_at).getTime(),
            },
          };
        }
        return feature;
      });

      ctx.waitUntil(
        upsertEarthquakeFeaturesToD1(env.DB, featuresToUpsert)
          .then(({ successCount, errorCount }) => {
            console.log(`[worker-scheduled] D1 upsert complete. Success: ${successCount}, Errors: ${errorCount}`);
          })
          .catch(err => {
            console.error(`[worker-scheduled] Error during D1 upsert process: ${err.message}`, err);
          })
      );

    } catch (error) {
      console.error(`[worker-scheduled] Unhandled error in scheduled function: ${error.message}`, error);
    }
  }
};
