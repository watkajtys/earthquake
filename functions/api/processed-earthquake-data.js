// functions/api/processed-earthquake-data.js

// Function to generate the KV store key for processed data
const getProcessedDataKvKey = (period) => `latest_processed_data_v1_${period}`;

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

// --- Main Handler ---
export async function onRequestGet(context) {
  const sourceName = "processed-earthquake-data-api"; // Updated source name
  const { request, env } = context;
  const { PROCESSED_DATA_KV, DB } = env;

  const url = new URL(request.url);
  const requestedPeriod = url.searchParams.get("maxPeriod") || "30d";
  const validPeriods = ["24h", "7d", "30d"];
  const maxPeriod = validPeriods.includes(requestedPeriod) ? requestedPeriod : "30d";
  const currentDataPeriodKvKey = getProcessedDataKvKey(maxPeriod);

  // 1. Primary Data Source: KV Store
  if (PROCESSED_DATA_KV) {
    try {
      const kvData = await PROCESSED_DATA_KV.get(currentDataPeriodKvKey);
      if (kvData) {
        console.log(`[${sourceName}] KV Cache hit for processed data (period: ${maxPeriod}).`);
        return new Response(kvData, {
          headers: {
            "Content-Type": "application/json",
            "X-Cache-Status": "hit-kv",
            "Cache-Control": "public, max-age=60" // Client-side cache for KV data
          },
        });
      } else {
        console.log(`[${sourceName}] KV Cache miss for period: ${maxPeriod}. Falling back to D1.`);
      }
    } catch (e) {
      console.error(`[${sourceName}] Error fetching from KV for period ${currentDataPeriodKvKey}: ${e.message}`, e);
      // Non-fatal, proceed to D1 fallback
    }
  } else {
    console.warn(`[${sourceName}] PROCESSED_DATA_KV binding not available. Falling back to D1 if configured.`);
  }

  // 2. Secondary Fallback: D1 Database
  // D1_CACHE_TTL_SECONDS should ideally align with how frequently the worker runs and updates D1.
  // For example, if worker runs every 5 minutes, TTL could be similar.
  const D1_CACHE_TTL_SECONDS = 300; // 5 minutes

  if (DB) {
    try {
      const sql = `SELECT data, timestamp FROM processed_data WHERE period = ?1`;
      const stmt = DB.prepare(sql).bind(currentDataPeriodKvKey);
      const result = await stmt.first();

      if (result && result.data && result.timestamp) {
        const currentTimeSeconds = Math.floor(Date.now() / 1000);
        if ((currentTimeSeconds - result.timestamp) < D1_CACHE_TTL_SECONDS) {
          console.log(`[${sourceName}] D1 Cache hit for processed data (period: ${maxPeriod}).`);
          // Optionally, could re-populate KV here if it was missing, but primary goal is to return data.
          // context.waitUntil(PROCESSED_DATA_KV.put(currentDataPeriodKvKey, result.data));
          return new Response(result.data, {
            headers: {
              "Content-Type": "application/json",
              "X-Cache-Status": "hit-d1",
              "Cache-Control": "public, max-age=60" // Client-side cache for D1 data
            },
          });
        } else {
          console.log(`[${sourceName}] D1 Cache stale for period: ${maxPeriod}. Data considered unavailable.`);
        }
      } else {
        console.log(`[${sourceName}] D1 Cache miss for period: ${maxPeriod}.`);
      }
    } catch (e) {
      console.error(`[${sourceName}] D1 SELECT error for period ${currentDataPeriodKvKey}: ${e.message}`, e);
      // Non-fatal, proceed to "data not available" response
    }
  } else {
    console.warn(`[${sourceName}] D1 database binding (env.DB) not available.`);
  }

  // 3. Data Not Available / Error Response
  // If data is not found in KV and is also not fresh/found in D1
  console.warn(`[${sourceName}] Processed data for period ${maxPeriod} not available in KV or fresh in D1.`);
  return jsonErrorResponse(
    `Processed data for period ${maxPeriod} not yet available. Please try again later.`,
    503, // Service Unavailable
    sourceName
  );
}

// --- Router for GET requests ---
export async function onRequest(context) {
  if (context.request.method === "GET") {
    return onRequestGet(context);
  }
  // Respond with 405 Method Not Allowed for other methods
  return new Response(
    JSON.stringify({
      status: "error",
      message: "Method not allowed. Only GET is supported.",
      source: "processed-earthquake-data-api-router" // More specific source for router
    }), {
    status: 405,
    headers: {
      "Allow": "GET",
      "Content-Type": "application/json"
    },
  });
}
