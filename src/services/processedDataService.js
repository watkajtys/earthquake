// src/services/processedDataService.js

/**
 * Fetches the comprehensively processed earthquake data from the server-side worker.
 * @returns {Promise<object>} A promise that resolves to an object containing either 'data' or 'error'.
 *                            On success: { data: processedData, error: null }
 *                            On failure: { data: null, error: { message: string, status?: number } }
 */
export const fetchProcessedEarthquakeData = async (maxPeriod) => {
  let endpoint = '/api/processed-earthquake-data'; // The new worker endpoint
  if (maxPeriod && ["24h", "7d", "30d"].includes(maxPeriod)) {
    endpoint += `?maxPeriod=${maxPeriod}`;
  }

  try {
    const response = await fetch(endpoint);

    if (!response.ok) {
      let errorMessage = `HTTP error! Status: ${response.status}`;
      try {
        // Try to get more specific error message from response body if available
        const errorData = await response.json();
        errorMessage = errorData?.message || errorData?.error || errorMessage;
      } catch (e) {
        // Ignore if response body is not JSON or other error during parsing
      }
      console.error(`[processedDataService] Fetch error from ${endpoint}:`, errorMessage);
      return { data: null, error: { message: errorMessage, status: response.status } };
    }

    const data = await response.json();
    return { data, error: null };

  } catch (error) {
    // This catches network errors, or errors from response.json() if response wasn't valid JSON (though !response.ok should catch most non-JSON error responses)
    console.error(`[processedDataService] Network or parsing error fetching from ${endpoint}:`, error);
    return { data: null, error: { message: error.message || 'A network or parsing error occurred.' } };
  }
};
