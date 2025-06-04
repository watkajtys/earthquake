// src/services/usgsApiService.js

export const fetchUsgsData = async (apiUrl, transformParams = {}) => {
  try {
    let proxyUrl = `/api/usgs-proxy?apiUrl=${encodeURIComponent(apiUrl)}`;

    // Append transformParams if any
    const params = new URLSearchParams();
    for (const key in transformParams) {
      if (Object.prototype.hasOwnProperty.call(transformParams, key)) {
        params.append(key, transformParams[key]);
      }
    }
    const additionalParams = params.toString();
    if (additionalParams) {
      proxyUrl += `&${additionalParams}`;
    }

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
