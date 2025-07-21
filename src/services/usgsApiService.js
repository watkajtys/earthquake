// src/services/usgsApiService.js

/**
 * @file usgsApiService.js
 * @description Service function for fetching data from USGS earthquake APIs via a server-side proxy.
 */

/**
 * Fetches data from the specified USGS API URL using a server-side proxy endpoint (`/api/usgs-proxy`).
 * This approach helps in bypassing CORS issues that might arise from direct client-side requests to the USGS API.
 *
 * @async
 * @param {string} apiUrl - The full URL of the USGS GeoJSON API endpoint to fetch data from.
 * @returns {Promise<Object>} A promise that resolves to the JSON data from the USGS API if successful.
 *   If the fetch fails or the response is not OK, it resolves to an object containing an `error` property,
 *   which itself is an object with `message` (string) and optionally `status` (number).
 *   Example of error object: `{ error: { message: "HTTP error! status: 404", status: 404 } }`
 */
export const fetchUsgsData = async (apiUrl) => {
  try {
    const proxyUrl = `/api/usgs-proxy?apiUrl=${encodeURIComponent(apiUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw { message: `HTTP error! status: ${response.status}`, status: response.status };
    }
    const data = await response.json();
    return data; // Or { data: data } if you prefer to wrap successful responses
  } catch (error) {
    console.error("USGS API Service Error:", error);
    return { 
      error: { 
        message: error.message || 'Failed to fetch data. Network error or invalid JSON.', 
        status: error.status || null 
      } 
    };
  }
};

/**
 * Fetches earthquake data from the USGS API for a specific date range.
 *
 * @async
 * @param {Date} startDate - The start date of the date range.
 * @param {Date} endDate - The end date of the date range.
 * @returns {Promise<Object>} A promise that resolves to the JSON data from the USGS API if successful.
 */
export const fetchUsgsDataByDate = async (startDate, endDate) => {
  const apiUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startDate.toISOString()}&endtime=${endDate.toISOString()}`;
  return fetchUsgsData(apiUrl);
};
