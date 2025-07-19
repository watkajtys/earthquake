// functions/api/cluster-detail-with-quakes.js

/**
 * @file Cloudflare Function for retrieving a detailed cluster definition along with its associated earthquakes.
 * @module functions/api/cluster-detail-with-quakes
 *
 * @description
 * This API endpoint is responsible for fetching a complete, detailed view of a specific
 * earthquake cluster. It serves as a data source for detailed cluster view pages.
 *
 * The function takes a cluster identifier from the URL and performs a two-step data retrieval process:
 * 1.  **Fetch Cluster Definition**: It retrieves the main definition of the cluster from the
 *     `ClusterDefinitions` D1 table. The lookup is primarily performed using the `strongestQuakeId`
 *     to align with user-facing URLs, with a fallback to the canonical `id` for robustness.
 * 2.  **Fetch Associated Earthquakes**: It then takes the array of earthquake IDs stored in the
 *     cluster definition and fetches the full GeoJSON data for each of those earthquakes from the
 *     `EarthquakeEvents` D1 table.
 *
 * The final output is a single JSON object that combines the cluster's metadata with an array
 * of its constituent earthquake features. The response is cached at the edge to improve
 * performance for repeated requests for the same cluster.
 */
/**
 * Handles GET requests to retrieve a cluster definition and its associated earthquake GeoJSON data.
 *
 * This function orchestrates the retrieval of a cluster's full details. It expects a single
 * URL query parameter, `id`, which is used to identify the cluster. The lookup logic first
 * attempts to find the cluster by treating the `id` as the `strongestQuakeId` and, if that
 * fails, as a fallback, it tries the canonical `id` of the cluster.
 *
 * Once the cluster definition is found, it parses the `earthquakeIds` array and executes a
 * second query to fetch the GeoJSON features for all associated quakes from the `EarthquakeEvents`
 * table. These features are then embedded into the response object under the `quakes` key.
 *
 * The combined data is returned as a single JSON object. The response is configured with a
 * `Cache-Control` header to be cached at the Cloudflare edge for 5 minutes.
 *
 * @async
 * @function onRequestGet
 * @param {object} context - The Cloudflare Pages Function context.
 * @param {Request} context.request - The incoming HTTP request object.
 * @param {object} context.env - The environment object containing the D1 database binding (`DB`).
 * @returns {Promise<Response>} A `Response` object containing the combined cluster and earthquake
 *   data as a JSON payload, or a JSON error object if the cluster is not found or an error occurs.
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

/**
 * Provides a flexible request handler for Cloudflare Pages, supporting various routing configurations.
 *
 * This function acts as a wrapper that ensures the endpoint correctly handles GET requests
 * by delegating to `onRequestGet`. It returns a `405 Method Not Allowed` for any other
 * HTTP method, making the endpoint's behavior explicit.
 *
 * @async
 * @function onRequest
 * @param {object} context - The Cloudflare Pages Function context.
 * @returns {Promise<Response>} A `Response` object.
 */
export async function onRequest(context) {
    if (context.request.method === 'GET') {
        return onRequestGet(context);
    }
    return new Response('Method Not Allowed', { status: 405 });
}
