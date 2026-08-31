async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const clusterId = url.searchParams.get("id");
  if (!clusterId) {
    return new Response(
      JSON.stringify({ error: "Missing clusterId query parameter." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (!env.DB) {
    console.error("D1 Database (env.DB) not available.");
    return new Response(
      JSON.stringify({ error: "Database service not available." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  try {
    console.log(
      `Attempting to fetch cluster definition by strongestQuakeId: ${clusterId}`,
    );
    const clusterStmt = env.DB.prepare(
      `SELECT id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
              maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
              radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
              version, createdAt, updatedAt
       FROM ClusterDefinitions WHERE strongestQuakeId = ? ORDER BY updatedAt DESC LIMIT 1`,
    ).bind(clusterId);
    let clusterDefinition = await clusterStmt.first();
    if (!clusterDefinition) {
      console.log(
        `Cluster not found by strongestQuakeId: ${clusterId}. Checking by canonical id as a fallback.`,
      );
      const clusterByIdStmt = env.DB.prepare(
        `SELECT id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
                maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
                radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
                version, createdAt, updatedAt
         FROM ClusterDefinitions WHERE id = ?`,
      ).bind(clusterId);
      clusterDefinition = await clusterByIdStmt.first();
      if (!clusterDefinition) {
        console.log(
          `Cluster definition also not found by canonical id: ${clusterId}. Returning 404.`,
        );
        return new Response(
          JSON.stringify({
            error: `Cluster definition for id ${clusterId} (interpreted as strongestQuakeId or canonical id) not found.`,
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      } else {
        console.log(
          `Cluster definition found by canonical id: ${clusterId} after failing to find by strongestQuakeId.`,
        );
      }
    } else {
      console.log(
        `Cluster definition found by strongestQuakeId: ${clusterId}. ID of retrieved definition: ${clusterDefinition.id}, Slug: ${clusterDefinition.slug}`,
      );
    }
    try {
      clusterDefinition.earthquakeIds = JSON.parse(
        clusterDefinition.earthquakeIds || "[]",
      );
    } catch (e) {
      console.error(
        `Error parsing earthquakeIds for cluster ${clusterId}: ${e.message}`,
      );
      return new Response(
        JSON.stringify({
          error: `Invalid earthquakeIds format in cluster definition ${clusterId}.`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    clusterDefinition.quakes = [];
    if (
      Array.isArray(clusterDefinition.earthquakeIds) &&
      clusterDefinition.earthquakeIds.length > 0
    ) {
      const uniqueEarthquakeIds = [...new Set(clusterDefinition.earthquakeIds)];
      if (uniqueEarthquakeIds.length > 0) {
        const placeholders = uniqueEarthquakeIds.map(() => "?").join(",");
        const quakesQuery = `SELECT id, geojson_feature FROM EarthquakeEvents WHERE id IN (${placeholders})`;
        const quakesStmt = env.DB.prepare(quakesQuery).bind(
          ...uniqueEarthquakeIds,
        );
        const { results: quakeFeaturesData } = await quakesStmt.all();
        if (quakeFeaturesData) {
          for (const row of quakeFeaturesData) {
            try {
              const geojsonFeature = JSON.parse(row.geojson_feature);
              clusterDefinition.quakes.push(geojsonFeature);
            } catch (e) {
              console.error(
                `Error parsing geojson_feature for earthquake ${row.id} in cluster ${clusterId}: ${e.message}`,
              );
            }
          }
        }
      }
    }
    return new Response(JSON.stringify(clusterDefinition), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300",
        // Added Cache-Control header (5 minutes)
      },
    });
  } catch (e) {
    console.error(
      `Error processing request for cluster ${clusterId}: ${e.message}`,
      e.stack,
    );
    return new Response(
      JSON.stringify({
        error: "Failed to process request.",
        details: e.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export { onRequestGet };
