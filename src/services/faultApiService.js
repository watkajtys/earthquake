/**
 * @file faultApiService.js
 * @description Service layer for fault database API calls with caching and error handling
 * Provides clean interface for EarthquakeMap and other components to access fault data
 */

/**
 * In-memory cache for fault data to avoid repeated API calls
 * Cache keys are based on query parameters
 */
const faultCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Generate cache key from query parameters
 * @param {Object} params - Query parameters
 * @returns {string} Cache key
 */
function generateCacheKey(params) {
  return JSON.stringify(params);
}

/**
 * Check if cached data is still valid
 * @param {Object} cachedItem - Cached item with timestamp
 * @returns {boolean} True if cache is valid
 */
function isCacheValid(cachedItem) {
  return cachedItem && (Date.now() - cachedItem.timestamp) < CACHE_DURATION;
}

/**
 * Fetch nearby faults from the database API
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radius - Search radius in kilometers (default: 100)
 * @param {number} limit - Maximum number of faults to return (default: 50)
 * @param {string} activityLevel - Filter by activity level (optional)
 * @param {string} slipType - Filter by slip type (optional)
 * @returns {Promise<Object>} API response with fault data
 */
export async function getNearbyFaults(lat, lon, radius = 100, limit = 50, activityLevel = null, slipType = null) {
  // Input validation
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('Invalid coordinates: lat and lon must be numbers');
  }
  
  if (lat < -90 || lat > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }
  
  if (lon < -180 || lon > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }

  // Build query parameters
  const params = {
    lat: lat.toString(),
    lon: lon.toString(),
    radius: radius.toString(),
    limit: limit.toString()
  };

  if (activityLevel) {
    params.activity_level = activityLevel;
  }
  
  if (slipType) {
    params.slip_type = slipType;
  }

  // Check cache first
  const cacheKey = generateCacheKey(params);
  const cachedResult = faultCache.get(cacheKey);
  
  if (isCacheValid(cachedResult)) {
    return cachedResult.data;
  }

  try {
    // Build query string
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`/api/get-nearby-faults?${queryString}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache the result
    faultCache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    return data;
    
  } catch (error) {
    console.error('Error fetching nearby faults:', error);
    throw new Error(`Failed to fetch nearby faults: ${error.message}`);
  }
}

/**
 * Fetch fault context for a specific earthquake
 * @param {string} earthquakeId - Earthquake ID
 * @param {number} radius - Search radius in kilometers (default: 100)
 * @param {number} limit - Maximum number of faults to return (default: 5)
 * @returns {Promise<Object>} API response with fault context
 */
export async function getFaultContext(earthquakeId, radius = 100, limit = 5) {
  if (!earthquakeId) {
    throw new Error('Earthquake ID is required');
  }

  // Build query parameters
  const params = {
    radius: radius.toString(),
    limit: limit.toString()
  };

  // Check cache first
  const cacheKey = generateCacheKey({ earthquakeId, ...params });
  const cachedResult = faultCache.get(cacheKey);
  
  if (isCacheValid(cachedResult)) {
    return cachedResult.data;
  }

  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`/api/fault-context/${earthquakeId}?${queryString}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Earthquake not found');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache the result
    faultCache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    return data;
    
  } catch (error) {
    console.error('Error fetching fault context:', error);
    throw new Error(`Failed to fetch fault context: ${error.message}`);
  }
}

/**
 * Convert fault data to GeoJSON format for map display
 * @param {Array} faults - Array of fault objects from API
 * @returns {Object} GeoJSON FeatureCollection
 */
export function faultsToGeoJSON(faults) {
  if (!Array.isArray(faults)) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features = faults.map(fault => {
    try {
      // Parse the geometry from the database
      const geometry = JSON.parse(fault.geom_linestring || '{}');
      
      return {
        type: 'Feature',
        geometry: geometry,
        properties: {
          fault_id: fault.fault_id,
          name: fault.name,
          display_name: fault.display_name,
          slip_type: fault.slip_type,
          activity_level: fault.activity_level,
          movement_description: fault.movement_description,
          speed_description: fault.speed_description,
          hazard_description: fault.hazard_description,
          distance_km: fault.distance_km,
          proximity_description: fault.proximity_description,
          scientific_details: fault.scientific_details
        }
      };
    } catch (error) {
      console.error('Error parsing fault geometry:', error);
      return null;
    }
  }).filter(feature => feature !== null);

  return {
    type: 'FeatureCollection',
    features: features
  };
}

/**
 * Get fault style based on slip type and activity level
 * @param {Object} fault - Fault object with properties
 * @returns {Object} Leaflet style object
 */
export function getFaultStyle(fault) {
  const baseStyle = {
    weight: 2,
    opacity: 0.8,
    fillOpacity: 0.3
  };

  // Color based on slip type
  let color = '#666666'; // default gray
  
  const slipType = fault.slip_type?.toLowerCase();
  switch (slipType) {
    case 'normal':
      color = '#4CAF50'; // Green for normal faults
      break;
    case 'reverse':
    case 'thrust':
      color = '#F44336'; // Red for reverse/thrust faults
      break;
    case 'dextral':
    case 'sinistral':
      color = '#2196F3'; // Blue for strike-slip faults
      break;
    case 'dextral-normal':
    case 'sinistral-normal':
      color = '#FF9800'; // Orange for oblique normal
      break;
    case 'dextral-reverse':
    case 'sinistral-reverse':
      color = '#9C27B0'; // Purple for oblique reverse
      break;
  }

  // Adjust opacity based on activity level
  let opacity = 0.8;
  const activityLevel = fault.activity_level?.toLowerCase();
  switch (activityLevel) {
    case 'very active':
      opacity = 1.0;
      baseStyle.weight = 3;
      break;
    case 'active':
      opacity = 0.9;
      baseStyle.weight = 2.5;
      break;
    case 'moderate':
      opacity = 0.7;
      break;
    case 'slow':
      opacity = 0.6;
      break;
    case 'very slow':
    case 'inactive':
      opacity = 0.4;
      break;
  }

  return {
    ...baseStyle,
    color: color,
    opacity: opacity
  };
}

/**
 * Clear the fault cache (useful for testing or memory management)
 */
export function clearFaultCache() {
  faultCache.clear();
}

/**
 * Get cache statistics (useful for debugging)
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  return {
    size: faultCache.size,
    keys: Array.from(faultCache.keys()),
    validEntries: Array.from(faultCache.values()).filter(item => isCacheValid(item)).length
  };
}

/**
 * Batch fetch multiple nearby fault queries
 * @param {Array} locations - Array of {lat, lon, radius, limit} objects
 * @returns {Promise<Array>} Array of fault data responses
 */
export async function batchGetNearbyFaults(locations) {
  if (!Array.isArray(locations)) {
    throw new Error('Locations must be an array');
  }

  const promises = locations.map(location => 
    getNearbyFaults(
      location.lat,
      location.lon,
      location.radius || 100,
      location.limit || 50,
      location.activityLevel,
      location.slipType
    ).catch(error => {
      console.error(`Error fetching faults for location ${location.lat}, ${location.lon}:`, error);
      return { faults: [], error: error.message };
    })
  );

  return Promise.all(promises);
}

/**
 * Preload fault data for a given area (useful for performance optimization)
 * @param {number} centerLat - Center latitude
 * @param {number} centerLon - Center longitude
 * @param {number} radius - Radius in kilometers
 * @returns {Promise<void>} Promise that resolves when preloading is complete
 */
export async function preloadFaultData(centerLat, centerLon, radius = 100) {
  try {
    await getNearbyFaults(centerLat, centerLon, radius, 100);
  } catch (error) {
    console.error('Error preloading fault data:', error);
  }
}