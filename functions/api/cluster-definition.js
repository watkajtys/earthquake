// functions/api/cluster-definition.js

/**
 * @file functions/api/cluster-definition.js
 * @description Cloudflare Worker endpoint for managing earthquake cluster definitions.
 * This function handles POST requests to create or update cluster definitions
 * and GET requests to retrieve specific cluster definitions from a D1 database.
 */

/**
 * Handles incoming HTTP requests for the /api/cluster-definition endpoint.
 * - **POST**: Creates or replaces a cluster definition in the D1 database.
 *   Expects a JSON payload with `clusterId` (string), `earthquakeIds` (Array<string>),
 *   and `strongestQuakeId` (string).
 *   Returns a 201 status on successful creation/update, 400 for invalid input, or 500 for server errors.
 * - **GET**: Retrieves a specific cluster definition from the D1 database.
 *   Expects a `id` URL query parameter specifying the `clusterId`.
 *   Returns JSON data of the cluster definition with a 200 status if found,
 *   404 if not found, 400 for missing `id` parameter, or 500 for server errors.
 * - Other HTTP methods will result in a 405 Method Not Allowed response.
 *
 * @async
 * @param {object} context - The Cloudflare Worker context object.
 * @param {Request} context.request - The incoming HTTP request object.
 * @param {object} context.env - Environment variables, expected to contain `DB` (D1 Database binding).
 * @returns {Promise<Response>} A `Response` object.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'POST') {
    try {
      const clusterData = await request.json();

      if (!clusterData || !clusterData.clusterId || !clusterData.earthquakeIds || !clusterData.strongestQuakeId) {
        return new Response('Invalid cluster data provided. Missing required fields.', { status: 400 });
      }
      if (!Array.isArray(clusterData.earthquakeIds)) {
        return new Response('Invalid cluster data: earthquakeIds must be an array.', { status: 400 });
      }
      if (typeof clusterData.clusterId !== 'string' || typeof clusterData.strongestQuakeId !== 'string') {
          return new Response('Invalid cluster data: clusterId and strongestQuakeId must be strings.', { status: 400 });
      }

      const { clusterId, earthquakeIds, strongestQuakeId } = clusterData;

      const stmt = env.DB.prepare(
        'INSERT OR REPLACE INTO ClusterDefinitions (clusterId, earthquakeIds, strongestQuakeId, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
      ).bind(clusterId, JSON.stringify(earthquakeIds), strongestQuakeId);
      await stmt.run();

      return new Response(`Cluster definition for ${clusterId} registered/updated successfully in D1.`, { status: 201 });
    } catch (e) {
      if (e instanceof SyntaxError) {
        return new Response('Invalid JSON payload.', { status: 400 });
      }
      console.error('Error processing POST request to D1:', e);
      return new Response('Failed to process D1 request: ' + e.message, { status: 500 });
    }
  } else if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const clusterId = url.searchParams.get('id');

      if (!clusterId) {
        return new Response('Missing clusterId query parameter.', { status: 400 });
      }

      const stmt = env.DB.prepare(
        'SELECT clusterId, earthquakeIds, strongestQuakeId, createdAt, updatedAt FROM ClusterDefinitions WHERE clusterId = ?'
      ).bind(clusterId);
      const result = await stmt.first();

      if (!result) {
        return new Response(`Cluster definition for ${clusterId} not found in D1.`, { status: 404 });
      }

      // Parse earthquakeIds from JSON string to an array
      const responsePayload = {
        ...result,
        earthquakeIds: JSON.parse(result.earthquakeIds || '[]'), // Handle null/empty if necessary
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('Error processing GET request from D1:', e);
      return new Response('Failed to process D1 request: ' + e.message, { status: 500 });
    }
  } else {
    return new Response(`Method ${method} Not Allowed`, {
      status: 405,
      headers: { Allow: 'POST, GET' },
    });
  }
}
