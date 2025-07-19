// functions/api/cluster-definition.js

/**
 * @file functions/api/cluster-definition.js
 * @description Cloudflare Worker module for managing earthquake cluster definitions.
 * This function handles POST requests to create or update cluster definitions
 * and GET requests to retrieve specific cluster definitions from a D1 database,
 * supporting the comprehensive schema of the ClusterDefinitions table.
 */

/**
 * Handles incoming HTTP requests for the /api/cluster-definition endpoint.
 * - **POST**: Creates or replaces a cluster definition in the D1 database.
 *   Expects a JSON payload with fields: `id`*, `stableKey`, `slug`*, `strongestQuakeId`*, `earthquakeIds`* (Array<string>),
 *   `title`, `description`, `locationName`, `maxMagnitude`*, `meanMagnitude`, `minMagnitude`,
 *   `depthRange`, `centroidLat`, `centroidLon`, `radiusKm`, `startTime`*, `endTime`*, `durationHours`,
 *   `quakeCount`*, `significanceScore`, `version` (optional). Fields marked with * are mandatory.
 *   Returns a 201 status on successful creation/update, 400 for invalid input, or 500 for server errors.
 * - **GET**: Retrieves a specific cluster definition from the D1 database.
 *   Expects an `id` URL query parameter specifying the primary key `id`.
 *   Returns JSON data of the full cluster definition (including all fields from the ClusterDefinitions table,
 *   with `earthquakeIds` as an array) with a 200 status if found,
 *   404 if not found, 400 for missing `id` parameter, or 500 for server errors.
 * - Other HTTP methods will result in a 405 Method Not Allowed response.
 *
 * @async
 * @param {object} context - The Cloudflare Worker request context object (commonly includes 'request', 'env', 'ctx').
 * @param {Request} context.request - The incoming HTTP request object.
 * @param {object} context.env - Environment variables, expected to contain `DB` (D1 Database binding).
 * @returns {Promise<Response>} A `Response` object.
 */
import { storeClusterDefinition } from '../utils/d1ClusterUtils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'POST') {
    try {
      const payload = await request.json();

      // Mandatory fields validation
      const requiredFields = ['id', 'slug', 'strongestQuakeId', 'earthquakeIds', 'maxMagnitude', 'startTime', 'endTime', 'quakeCount'];
      for (const field of requiredFields) {
        if (payload[field] === undefined || payload[field] === null) {
          return new Response(`Invalid cluster data provided. Missing required field: ${field}.`, { status: 400 });
        }
      }

      // Type validation for specific fields
      if (typeof payload.id !== 'string') {
        return new Response('Invalid cluster data: id must be a string.', { status: 400 });
      }
      if (typeof payload.slug !== 'string') {
        return new Response('Invalid cluster data: slug must be a string.', { status: 400 });
      }
      if (typeof payload.strongestQuakeId !== 'string') {
        return new Response('Invalid cluster data: strongestQuakeId must be a string.', { status: 400 });
      }
      if (!Array.isArray(payload.earthquakeIds)) {
        return new Response('Invalid cluster data: earthquakeIds must be an array.', { status: 400 });
      }
      if (typeof payload.maxMagnitude !== 'number') {
        return new Response('Invalid cluster data: maxMagnitude must be a number.', { status: 400 });
      }
      if (typeof payload.startTime !== 'number') {
        return new Response('Invalid cluster data: startTime must be a number (timestamp).', { status: 400 });
      }
      if (typeof payload.endTime !== 'number') {
        return new Response('Invalid cluster data: endTime must be a number (timestamp).', { status: 400 });
      }
      if (typeof payload.quakeCount !== 'number') {
        return new Response('Invalid cluster data: quakeCount must be a number.', { status: 400 });
      }
      // Optional fields type checks
      if (payload.meanMagnitude !== undefined && typeof payload.meanMagnitude !== 'number') {
        return new Response('Invalid cluster data: meanMagnitude must be a number if provided.', { status: 400 });
      }
      if (payload.minMagnitude !== undefined && typeof payload.minMagnitude !== 'number') {
        return new Response('Invalid cluster data: minMagnitude must be a number if provided.', { status: 400 });
      }
      if (payload.centroidLat !== undefined && typeof payload.centroidLat !== 'number') {
        return new Response('Invalid cluster data: centroidLat must be a number if provided.', { status: 400 });
      }
      if (payload.centroidLon !== undefined && typeof payload.centroidLon !== 'number') {
        return new Response('Invalid cluster data: centroidLon must be a number if provided.', { status: 400 });
      }
      if (payload.radiusKm !== undefined && typeof payload.radiusKm !== 'number') {
        return new Response('Invalid cluster data: radiusKm must be a number if provided.', { status: 400 });
      }
      if (payload.durationHours !== undefined && typeof payload.durationHours !== 'number') {
        return new Response('Invalid cluster data: durationHours must be a number if provided.', { status: 400 });
      }
      if (payload.significanceScore !== undefined && typeof payload.significanceScore !== 'number') {
        return new Response('Invalid cluster data: significanceScore must be a number if provided.', { status: 400 });
      }
      if (payload.version !== undefined && typeof payload.version !== 'number') {
        return new Response('Invalid cluster data: version must be a number if provided.', { status: 400 });
      }

      // At this point, payload is validated according to API requirements.
      // Now, use the utility function to store it.
      const storeResult = await storeClusterDefinition(env.DB, payload);

      if (storeResult.success) {
        return new Response(`Cluster definition for ${payload.id} registered/updated successfully.`, { status: 201 });
      } else {
        // storeClusterDefinition should ideally return specific error messages for data issues
        // if they were not caught by the initial validation.
        // For now, assume 500 for any failure from storeClusterDefinition.
        console.error('Failed to store cluster definition via utility:', storeResult.error);
        return new Response(storeResult.error || 'Failed to store cluster definition in D1.', { status: 500 });
      }
    } catch (e) {
      if (e instanceof SyntaxError) { // Catches errors from await request.json()
        return new Response('Invalid JSON payload.', { status: 400 });
      }
      // Catch any other unexpected errors from validation or pre-processing before storeClusterDefinition
      console.error('Error processing POST request:', e);
      return new Response('Failed to process request: ' + e.message, { status: 500 });
    }
  } else if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');

      if (!id) {
        return new Response('Missing id query parameter.', { status: 400 });
      }

      const stmt = env.DB.prepare(
        `SELECT id, stableKey, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
                maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
                radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
                version, createdAt, updatedAt
         FROM ClusterDefinitions WHERE id = ?`
      ).bind(id);
      const result = await stmt.first();

      if (!result) {
        return new Response(`Cluster definition for id ${id} not found.`, { status: 404 });
      }

      // Parse earthquakeIds from JSON string to an array
      const responsePayload = {
        ...result,
        earthquakeIds: JSON.parse(result.earthquakeIds || '[]'), // Handle null/empty
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('Error processing GET request:', e);
      return new Response('Failed to process request: ' + e.message, { status: 500 });
    }
  } else {
    return new Response(`Method ${method} Not Allowed`, {
      status: 405,
      headers: { Allow: 'POST, GET' }, // Keep Allow header as is, or update if other methods are planned
    });
  }
}
