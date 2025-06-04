// src/services/usgsApiService.js

// This function is no longer directly used by the client-side application.
// All data fetching is now routed through the Cloudflare Worker endpoints.
// The worker itself handles direct calls to the USGS API.
// Commenting out to avoid dead code. Future cleanup could remove the file.

/*
export const fetchUsgsData = async (apiUrl) => {
  try {
    const response = await fetch(apiUrl);
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
*/
