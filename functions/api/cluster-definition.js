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
        strongestQuakePlace: null, // Initialize with null
        strongestQuakeMag: null,   // Initialize with null
      };

      // Fetch strongest quake details
      if (result.strongestQuakeId) {
        try {
          const quakeStmt = env.DB.prepare(
            // Assuming 'Earthquakes' table and 'properties' column as JSON string
            'SELECT id, properties FROM Earthquakes WHERE id = ?'
          ).bind(result.strongestQuakeId);
          const quakeResult = await quakeStmt.first();

          if (quakeResult) {
            let quakeProperties = quakeResult.properties;
            if (typeof quakeProperties === 'string') {
              try {
                quakeProperties = JSON.parse(quakeProperties);
              } catch (parseError) {
                console.error(`Error parsing properties for quake ${result.strongestQuakeId}:`, parseError);
                quakeProperties = null; // Set to null if parsing fails
              }
            }

            if (quakeProperties && typeof quakeProperties === 'object') {
              responsePayload.strongestQuakePlace = quakeProperties.place || null;
              responsePayload.strongestQuakeMag = typeof quakeProperties.mag === 'number' ? quakeProperties.mag : null;
            } else {
               console.warn(`Quake ${result.strongestQuakeId} found, but its properties are not a valid object or could not be parsed.`);
            }
          } else {
            console.warn(`Strongest quake with ID ${result.strongestQuakeId} not found in Earthquakes table.`);
          }
        } catch (dbError) {
          console.error(`Database error fetching strongest quake ${result.strongestQuakeId}:`, dbError);
          // Do not let this error fail the main cluster definition response; proceed with nulls.
        }
      }

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
