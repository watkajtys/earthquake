// Helper to create JSON error responses
const jsonErrorResponse = (message, status, sourceName, upstreamStatus = undefined) => {
  const errorBody = {
    status: "error",
    message: message,
    source: sourceName,
  };
  if (upstreamStatus !== undefined) {
    errorBody.upstream_status = upstreamStatus;
  }
  return new Response(JSON.stringify(errorBody), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
};

async function handleClusterDefinitionRequest(context, url) {
  const sourceName = "cluster-definition-handler";
  const { request, env } = context;
  const CLUSTER_KV = env.CLUSTER_KV;

  if (!CLUSTER_KV) {
    return jsonErrorResponse("KV store not configured", 500, sourceName);
  }

  let ttl_seconds = 6 * 60 * 60; // 6 hours (21600 seconds)
  if (env.CLUSTER_DEFINITION_TTL_SECONDS) {
    const parsed = parseInt(env.CLUSTER_DEFINITION_TTL_SECONDS, 10);
    if (!isNaN(parsed) && parsed > 0) {
      ttl_seconds = parsed;
    } else {
      console.warn(`Invalid CLUSTER_DEFINITION_TTL_SECONDS value: "${env.CLUSTER_DEFINITION_TTL_SECONDS}". Using default: ${ttl_seconds}s.`);
    }
  }

  if (request.method === "POST") {
    try {
      const { clusterId, earthquakeIds, strongestQuakeId } = await request.json();
      if (!clusterId || !earthquakeIds || !Array.isArray(earthquakeIds) || earthquakeIds.length === 0 || !strongestQuakeId) {
        return jsonErrorResponse("Missing or invalid parameters for POST", 400, sourceName);
      }
      const kvValue = JSON.stringify({ earthquakeIds, strongestQuakeId });
      await CLUSTER_KV.put(clusterId, kvValue, { expirationTtl: ttl_seconds });
      return new Response(JSON.stringify({ status: "success", message: "Cluster definition stored." }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Error processing POST for cluster definition:", e);
      return jsonErrorResponse(`Error processing request: ${e.message}`, 500, sourceName);
    }
  } else if (request.method === "GET") {
    const clusterId = url.searchParams.get("id");
    if (!clusterId) {
      return jsonErrorResponse("Missing 'id' query parameter for GET", 400, sourceName);
    }
    try {
      const kvValue = await CLUSTER_KV.get(clusterId);
      if (kvValue === null) {
        return jsonErrorResponse("Cluster definition not found.", 404, sourceName);
      }
      return new Response(kvValue, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Error processing GET for cluster definition:", e);
      return jsonErrorResponse(`Error processing request: ${e.message}`, 500, sourceName);
    }
  } else {
    return jsonErrorResponse("Method not allowed", 405, sourceName);
  }
}

async function handleUsgsProxyRequest(context, apiUrl) {
  const sourceName = "usgs-proxy-handler";
  const cacheKey = new Request(apiUrl, context.request);
  const cache = caches.default;

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log(`Cache hit for: ${apiUrl}`);
      return cachedResponse;
    }

    console.log(`Cache miss for: ${apiUrl}. Fetching from origin.`);
    let response;
    try {
      response = await fetch(apiUrl);
    } catch (error) {
      console.error(`USGS API fetch failed for ${apiUrl}: ${error.message}`, error);
      return jsonErrorResponse(`USGS API fetch failed: ${error.message}`, 500, sourceName);
    }

    if (!response.ok) {
      console.error(`Error fetching data from USGS API (${apiUrl}): ${response.status} ${response.statusText}`);
      return jsonErrorResponse(
        `Error fetching data from USGS API: ${response.status} ${response.statusText}`,
        response.status,
        sourceName,
        response.status
      );
    }

    const data = await response.json();

    const DEFAULT_CACHE_DURATION_SECONDS = 600; // 10 minutes
    let durationInSeconds = DEFAULT_CACHE_DURATION_SECONDS;

    const envCacheDuration = context.env && context.env.WORKER_CACHE_DURATION_SECONDS;
    if (envCacheDuration) {
      const parsedDuration = parseInt(envCacheDuration, 10);
      if (!isNaN(parsedDuration) && parsedDuration > 0) {
        durationInSeconds = parsedDuration;
      } else {
        console.warn(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${envCacheDuration}". Using default: ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
      }
    }

    const newResponseHeaders = {
      "Content-Type": "application/json",
      "Cache-Control": `s-maxage=${durationInSeconds}`,
    };

    let newResponse = new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers: newResponseHeaders,
    });

    context.waitUntil(
      cache.put(cacheKey, newResponse.clone()).then(() => {
        console.log(`Successfully cached response for: ${apiUrl} (duration: ${durationInSeconds}s)`);
      }).catch(err => {
        console.error(`Failed to cache response for ${apiUrl}: ${err.message}`, err);
      })
    );

    return newResponse;

  } catch (error) {
    console.error(`Error processing request for ${apiUrl}: ${error.message}`, error);
    return jsonErrorResponse(`Error processing request: ${error.message}`, 500, sourceName);
  }
}

export async function onRequest(context) {
  const mainSourceName = "worker-router"; // For errors originating from the router itself
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  if (pathname === "/api/cluster-definition") {
    return handleClusterDefinitionRequest(context, url);
  } else if (pathname === "/api/usgs-proxy") {
    const apiUrl = url.searchParams.get("apiUrl");
    if (!apiUrl) {
      return jsonErrorResponse("Missing apiUrl query parameter for proxy request", 400, "usgs-proxy-router");
    }
    return handleUsgsProxyRequest(context, apiUrl);
  } else {
    // Fallback for original behavior if any other path was implicitly handled by the proxy
    // For example, if requests to "/" or "/api/" were expected to proxy if apiUrl was present
    const apiUrl = url.searchParams.get("apiUrl");
    if (apiUrl) {
        console.warn(`Request to unspecific path ${pathname} with apiUrl, proceeding with proxy. Consider using /api/usgs-proxy explicitly.`);
        return handleUsgsProxyRequest(context, apiUrl);
    }
    return jsonErrorResponse("Unknown API path", 404, mainSourceName);
  }
}
