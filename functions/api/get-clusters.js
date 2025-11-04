// functions/api/get-clusters.js

/**
 * @file functions/api/get-clusters.js
 * @description Cloudflare Worker module for retrieving cached earthquake clusters.
 * This function fetches the active clusters data directly from a KV store.
 */

export async function onRequestGet(context) {
  const {
    env
  } = context;
  const cacheKey = "active_clusters";

  try {
    const cachedClusters = await env.CLUSTER_KV.get(cacheKey, "json");

    if (cachedClusters === null) {
      // Return a 200 OK with an empty array if the cache is empty.
      // This is a valid state, not an error.
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache-Status': 'Miss'
        },
      });
    }

    // Return the cached data
    return new Response(JSON.stringify(cachedClusters), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache-Status': 'Hit'
      },
    });

  } catch (error) {
    console.error('Error fetching clusters from KV:', error.message, error.stack);
    return new Response(JSON.stringify({
      error: 'Internal Server Error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      },
    });
  }
}