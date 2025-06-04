export async function onRequest(context) {
  // Get the apiUrl from the query parameters
  const url = new URL(context.request.url);
  const apiUrl = url.searchParams.get("apiUrl");

  if (!apiUrl) {
    return new Response("Missing apiUrl query parameter", { status: 400 });
  }

  // Use the apiUrl as the cache key
  const cacheKey = new Request(apiUrl, context.request);
  const cache = caches.default;

  try {
    // Try to find the response in cache
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // If found, return it
      return cachedResponse;
    }

    // If not in cache, fetch data from the USGS API
    const response = await fetch(apiUrl);

    // Check if the request was successful
    if (!response.ok) {
      console.error(`Error fetching data from USGS API: ${response.status} ${response.statusText}`);
      // Do not cache error responses
      return new Response(`Error fetching data from USGS API: ${response.status} ${response.statusText}`, { status: response.status });
    }

    // For successful responses, prepare a new response for caching
    // Clone the original response to be able to modify headers and cache it
    // The body needs to be read to be able to construct a new Response with it if we want to set headers.
    // Or, more simply, we can create a new Response with the original body and new headers.
    const data = await response.json(); // Assuming the response is always JSON from USGS

    // Create a new response with cache-control headers
    let newResponse = new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=600", // Cache for 10 minutes in Cloudflare edge
      }
    });

    // Store the new response in cache
    // context.waitUntil ensures this happens even after the response is sent
    context.waitUntil(cache.put(cacheKey, newResponse.clone()));

    // Return the new response to the client
    return newResponse;

  } catch (error) {
    // Handle errors from fetch or cache operations
    console.error("Error in proxy function:", error);
    return new Response("Error processing request", { status: 500 });
  }
}
