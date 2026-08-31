async function onRequestGet3(context) {
  const { env } = context;
  const cacheKey = "active_clusters";
  try {
    const cachedClusters = await env.CLUSTER_KV.get(cacheKey, "json");
    if (cachedClusters === null) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache-Status": "Miss",
        },
      });
    }
    return new Response(JSON.stringify(cachedClusters), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache-Status": "Hit",
        "Cache-Control":
          "public, max-age=120, s-maxage=120, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error(
      "Error fetching clusters from KV:",
      error.message,
      error.stack,
    );
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}

export { onRequestGet3 as onRequestGet };
