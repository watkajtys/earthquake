// src/services/usgsApiService.js

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
    return {
      error: {
        message: "Could not retrieve earthquake data. Please try again later.",
        status: error.status || null
      }
    };
  }
};
