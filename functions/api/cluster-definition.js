// functions/api/cluster-definition.js

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
