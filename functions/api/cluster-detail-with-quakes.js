import { parseClusterSelector, resolveClusterDefinition } from '../utils/clusterResolver.js';

async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  let selector;
  try { selector = parseClusterSelector(url.searchParams); }
  catch (error) { return new Response(JSON.stringify({ error: error.message }), {
    status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  }); }
  const clusterId = selector.value;
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
    const clusterDefinition = await resolveClusterDefinition(env.DB, selector);
    if (!clusterDefinition) return new Response(JSON.stringify({ error: 'Cluster not found.' }), {
      status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
    try {
      clusterDefinition.earthquakeIds = JSON.parse(
        clusterDefinition.earthquakeIds || "[]",
      );
      if (!Array.isArray(clusterDefinition.earthquakeIds) || !clusterDefinition.earthquakeIds.every((id) => typeof id === 'string')) {
        throw new Error('Stored earthquake IDs must be an array of strings');
      }
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
      // D1 allows at most 100 bound parameters per query. Large clusters
      // need multiple reads, after deduplicating IDs across the whole cluster.
      const queryBatchSize = 100;
      for (let offset = 0; offset < uniqueEarthquakeIds.length; offset += queryBatchSize) {
        const batchIds = uniqueEarthquakeIds.slice(offset, offset + queryBatchSize);
        const placeholders = batchIds.map(() => "?").join(",");
        // Full GeoJSON lives in R2 after migration 0014. Cluster views only
        // need the summary fields that remain in D1.
        const quakesQuery = `SELECT id, magnitude, place, event_time, longitude, latitude, depth, usgs_detail_url
          FROM EarthquakeEvents WHERE id IN (${placeholders})`;
        const quakesStmt = env.DB.prepare(quakesQuery).bind(
          ...batchIds,
        );
        const { results: quakeFeaturesData } = await quakesStmt.all();
        if (quakeFeaturesData) {
          clusterDefinition.quakes.push(...quakeFeaturesData.map((row) => ({
            type: "Feature",
            id: row.id,
            geometry: {
              type: "Point",
              coordinates: [row.longitude, row.latitude, row.depth],
            },
            properties: {
              mag: row.magnitude,
              place: row.place,
              time: row.event_time,
              detail: row.usgs_detail_url,
              url: `https://earthquake.usgs.gov/earthquakes/eventpage/${row.id}`,
            },
          })));
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

      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export { onRequestGet };
