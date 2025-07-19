// functions/api/cluster-definition.js

/**
 * @file Cloudflare Function for managing earthquake cluster definitions.
 * @module functions/api/cluster-definition
 *
 * @description
 * This module provides an API endpoint for creating, updating, and retrieving detailed
 * definitions of earthquake clusters. It interacts directly with the `ClusterDefinitions`
 * D1 database table, which stores persistent, curated information about significant
 * seismic events.
 *
 * The endpoint supports two primary HTTP methods:
 * - `POST`: For creating a new cluster definition or updating an existing one. This method
 *   expects a comprehensive JSON payload and performs detailed validation before calling
 *   a utility function to interact with the database.
 * - `GET`: For retrieving a single, complete cluster definition by its unique ID.
 *
 * This API is a key component of the system's administrative and data management capabilities,
 * allowing for the explicit control and curation of cluster data.
 *
 * @see {@link ../utils/d1ClusterUtils.js} for the underlying database storage logic.
 */
/**
 * Handles HTTP requests for the `/api/cluster-definition` endpoint, routing based on the method.
 *
 * - **POST**: Creates or updates a cluster definition. It expects a detailed JSON payload
 *   representing a single cluster. The function performs rigorous validation on all required
 *   and optional fields before passing the data to `storeClusterDefinition` for database
 *   persistence. It returns a `201 Created` status on success.
 *
 * - **GET**: Retrieves a specific cluster definition by its primary key `id`, which must be
 *   provided as a URL query parameter. It queries the `ClusterDefinitions` table and returns
 *   the full record, parsing the `earthquakeIds` JSON string into an array. It returns
 *   a `200 OK` with the data if found, or a `404 Not Found` if the ID does not exist.
 *
 * Any other HTTP method will result in a `405 Method Not Allowed` response.
 *
 * @async
 * @function onRequest
 * @param {object} context - The Cloudflare Pages Function context.
 * @param {Request} context.request - The incoming HTTP request object.
 * @param {object} context.env - The environment object containing the D1 database binding (`DB`).
 * @returns {Promise<Response>} A `Response` object, either with the requested data for a GET,
 *   a success message for a POST, or an error response.
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
