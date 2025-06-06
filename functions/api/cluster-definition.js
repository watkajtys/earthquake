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
      const dataToStore = JSON.stringify({ earthquakeIds, strongestQuakeId });
      await env.CLUSTER_KV.put(clusterId, dataToStore);
      return new Response(`Cluster definition for ${clusterId} registered successfully.`, { status: 201 });
    } catch (e) {
      if (e instanceof SyntaxError) {
        return new Response('Invalid JSON payload.', { status: 400 });
      }
      console.error('Error processing POST request:', e);
      return new Response('Failed to process request: ' + e.message, { status: 500 });
    }
  } else if (method === 'GET') {
    try {
      const url = new URL(request.url);
      const clusterId = url.searchParams.get('id');

      if (!clusterId) {
        return new Response('Missing clusterId query parameter.', { status: 400 });
      }

      const storedData = await env.CLUSTER_KV.get(clusterId);

      if (storedData === null) {
        return new Response(`Cluster definition for ${clusterId} not found.`, { status: 404 });
      }

      // Assuming storedData is a JSON string, parse it before sending
      // No need to parse if you stored it as a JSON object directly with KV.put(key, value, {type: 'json'})
      // but we stored as string.
      return new Response(storedData, {
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
      headers: { Allow: 'POST, GET' },
    });
  }
}
