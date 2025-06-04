export async function onRequest(context) {
  // Get the apiUrl from the query parameters
  const url = new URL(context.request.url);
  const apiUrl = url.searchParams.get("apiUrl");

  if (!apiUrl) {
    return new Response("Missing apiUrl query parameter", { status: 400 });
  }

  try {
    // Fetch data from the USGS API
    const response = await fetch(apiUrl);

    // Check if the request was successful
    if (!response.ok) {
      console.error(`Error fetching data from USGS API: ${response.status} ${response.statusText}`);
      return new Response(`Error fetching data from USGS API: ${response.status} ${response.statusText}`, { status: response.status });
    }

    // Return the JSON data from the USGS API
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching data from USGS API:", error);
    return new Response("Error fetching data from USGS API", { status: 500 });
  }
}
