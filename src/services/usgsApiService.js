// src/services/usgsApiService.js

export const fetchUsgsData = async (apiUrl) => {
  let response;
  try {
    const proxyUrl = `/api/usgs-proxy?apiUrl=${encodeURIComponent(apiUrl)}`;
    response = await fetch(proxyUrl);

    if (!response.ok) {
      let errorDetails = null;
      try {
        // Attempt to get more detailed error info from the proxy's response body
        errorDetails = await response.json();
      } catch (e) {
        // Ignore if the response body is not JSON or empty
      }

      let errorMessage = `Failed to fetch USGS data from proxy. Status: ${response.status}`;
      if (errorDetails && errorDetails.message) {
        errorMessage += ` - Proxy error: ${errorDetails.message}`;
      }
      if (errorDetails && errorDetails.source) {
        errorMessage += ` (Source: ${errorDetails.source})`;
      }
       if (errorDetails && errorDetails.upstream_status !== undefined) {
        errorMessage += ` (Upstream Status: ${errorDetails.upstream_status})`;
      }
      const error = new Error(errorMessage);
      error.status = response.status; // Attach status to the error object
      error.proxyErrorDetails = errorDetails; // Attach full proxy error if available
      throw error;
    }

    return await response.json();
  } catch (error) {
    // Log the error for debugging purposes on the client-side if desired
    // console.error("USGS API Service Error:", error.message, error.status, error.proxyErrorDetails);

    // Re-throw the error to be handled by the caller.
    // This includes network errors (fetch itself failed),
    // errors thrown due to !response.ok, or errors from response.json() parsing on success.
    throw error;
  }
};
