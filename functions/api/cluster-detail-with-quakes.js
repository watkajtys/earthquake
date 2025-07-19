// functions/api/cluster-detail-with-quakes.js

/**
 * @file functions/api/cluster-detail-with-quakes.js
 * @description Cloudflare Worker module for retrieving a specific cluster definition
 * along with the GeoJSON feature data for all its associated earthquakes.
 */

/**
 * Handles GET requests to retrieve a cluster definition and its constituent earthquake GeoJSON data.
 * Expects a URL query parameter `id`. This `id` is first treated as a `strongestQuakeId`
 * for lookup. If no match is found, it falls back to checking against the canonical `id`
 * of the cluster definition. This dual-lookup approach supports both human-friendly URLs
 * (using a significant quake ID) and direct references.
 *
 * - Fetches the cluster definition from `ClusterDefinitions`.
 * - Fetches the GeoJSON features for each earthquake ID listed in the cluster definition
 *   from the `EarthquakeEvents` table.
 * - Combines this data and returns it as a single JSON object.
 *
 * @async
 * @param {object} context - The Cloudflare Worker request context.
 * @param {Request} context.request - The incoming HTTP request.
 * @param {object} context.env - Environment variables, expected to contain `DB` (D1 Database binding).
 * @returns {Promise<Response>} A `Response` object containing the combined cluster and earthquake data,
 *                            or an error response.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const clusterId = url.searchParams.get('id');

  if (!clusterId) {
    return new Response(JSON.stringify({ error: 'Missing clusterId query parameter.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.DB) {
    console.error('D1 Database (env.DB) not available.');
    return new Response(JSON.stringify({ error: 'Database service not available.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Fetch Cluster Definition
    // As per discussion, the 'clusterId' from the URL path is treated as the 'strongestQuakeId'.
    // The 'strongestQuakeId' column is not unique, so we order by updatedAt DESC to get the most recent definition.
    console.log(`Attempting to fetch cluster definition by strongestQuakeId: ${clusterId}`);
    const clusterStmt = env.DB.prepare(
      `SELECT id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
              maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
              radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
              version, createdAt, updatedAt
       FROM ClusterDefinitions WHERE strongestQuakeId = ? ORDER BY updatedAt DESC LIMIT 1`
    ).bind(clusterId);
    let clusterDefinition = await clusterStmt.first();

    if (!clusterDefinition) {
      // Fallback: For diagnostic purposes, or if some URLs might still use the canonical cluster 'id',
      // let's check if the provided clusterId matches a canonical 'id'.
      // This could be removed later if it's confirmed that all lookups should strictly be by strongestQuakeId.
      console.log(`Cluster not found by strongestQuakeId: ${clusterId}. Checking by canonical id as a fallback.`);
      const clusterByIdStmt = env.DB.prepare(
        `SELECT id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
                maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
                radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
                version, createdAt, updatedAt
         FROM ClusterDefinitions WHERE id = ?`
      ).bind(clusterId);
      clusterDefinition = await clusterByIdStmt.first();

      if (!clusterDefinition) {
        console.log(`Cluster definition also not found by canonical id: ${clusterId}. Returning 404.`);
        return new Response(JSON.stringify({ error: `Cluster definition for id ${clusterId} (interpreted as strongestQuakeId or canonical id) not found.` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        console.log(`Cluster definition found by canonical id: ${clusterId} after failing to find by strongestQuakeId.`);
      }
    } else {
      console.log(`Cluster definition found by strongestQuakeId: ${clusterId}. ID of retrieved definition: ${clusterDefinition.id}, Slug: ${clusterDefinition.slug}`);
    }

    // Parse earthquakeIds from JSON string to an array
    try {
      clusterDefinition.earthquakeIds = JSON.parse(clusterDefinition.earthquakeIds || '[]');
    } catch (e) {
      console.error(`Error parsing earthquakeIds for cluster ${clusterId}: ${e.message}`);
      // Return a 500 or treat as an invalid definition that can't fetch quakes
      return new Response(JSON.stringify({ error: `Invalid earthquakeIds format in cluster definition ${clusterId}.` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch Associated Earthquake GeoJSON Data
    clusterDefinition.quakes = []; // Initialize with empty array

    if (Array.isArray(clusterDefinition.earthquakeIds) && clusterDefinition.earthquakeIds.length > 0) {
      const uniqueEarthquakeIds = [...new Set(clusterDefinition.earthquakeIds)]; // Ensure unique IDs

      if (uniqueEarthquakeIds.length > 0) {
        const placeholders = uniqueEarthquakeIds.map(() => '?').join(',');
        const quakesQuery = `SELECT id, geojson_feature FROM EarthquakeEvents WHERE id IN (${placeholders})`;

        const quakesStmt = env.DB.prepare(quakesQuery).bind(...uniqueEarthquakeIds);
        const { results: quakeFeaturesData } = await quakesStmt.all();

        if (quakeFeaturesData) {
          for (const row of quakeFeaturesData) {
            try {
              const geojsonFeature = JSON.parse(row.geojson_feature);
              clusterDefinition.quakes.push(geojsonFeature);
            } catch (e) {
              console.error(`Error parsing geojson_feature for earthquake ${row.id} in cluster ${clusterId}: ${e.message}`);
              // Optionally, add an error placeholder or skip
              // clusterDefinition.quakes.push({ id: row.id, error: "Failed to parse GeoJSON" });
            }
          }
        }
      }
    }

    // 3. Return Combined Data
    return new Response(JSON.stringify(clusterDefinition), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300', // Added Cache-Control header (5 minutes)
      },
    });

  } catch (e) {
    console.error(`Error processing request for cluster ${clusterId}: ${e.message}`, e.stack);
    return new Response(JSON.stringify({ error: 'Failed to process request.', details: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Allow both onRequest and onRequestGet for flexibility with Cloudflare Pages/Functions routing
export async function onRequest(context) {
    if (context.request.method === 'GET') {
        return onRequestGet(context);
    }
    return new Response('Method Not Allowed', { status: 405 });
}
