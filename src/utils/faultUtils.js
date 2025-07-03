import { calculateDistance } from '../../common/mathUtils.js';

const REGIONAL_FAULT_RADIUS_KM = 200; // 200km radius for fault visibility

// Cache for fault data to avoid repeated file loads
let faultDataCache = null;
let faultDataPromise = null;

// Regional cache for filtered results (avoid re-filtering for nearby locations)
const regionalFaultCache = new Map();
const CACHE_GRID_SIZE = 0.5; // 0.5 degree grid (~55km at equator)

const getCacheKey = (lat, lng, radiusKm) => {
  const gridLat = Math.floor(lat / CACHE_GRID_SIZE) * CACHE_GRID_SIZE;
  const gridLng = Math.floor(lng / CACHE_GRID_SIZE) * CACHE_GRID_SIZE;
  return `${gridLat},${gridLng},${radiusKm}`;
};

export const FAULT_TYPE_COLORS = {
  'Dextral': '#8B5CF6', // Purple
  'Sinistral': '#F59E0B', // Amber
  'Reverse': '#DC2626', // Red  
  'Normal': '#059669', // Emerald
  'Dextral-Normal': '#7C3AED', // Violet
  'Transform': '#2563EB', // Blue
  'Strike-slip': '#9333EA', // Purple variant
  'Thrust': '#B91C1C', // Dark red
  'default': '#6B7280' // Gray
};

export const getFaultTypeColor = (slipType) => {
  if (!slipType || typeof slipType !== 'string') {
    return FAULT_TYPE_COLORS.default;
  }
  
  const normalizedType = slipType.trim();
  return FAULT_TYPE_COLORS[normalizedType] || FAULT_TYPE_COLORS.default;
};

export const calculateFaultDistance = (lat, lng, faultCoordinates) => {
  if (!Array.isArray(faultCoordinates) || faultCoordinates.length === 0) {
    return Infinity;
  }
  
  let minDistance = Infinity;
  
  // Quick bounding box check first (cheaper than distance calculation)
  const DEGREE_BUFFER = 3; // ~333km at equator
  let withinBounds = false;
  
  for (const coord of faultCoordinates) {
    if (Array.isArray(coord) && coord.length >= 2) {
      const faultLng = coord[0];
      const faultLat = coord[1];
      
      if (typeof faultLat === 'number' && typeof faultLng === 'number') {
        // Quick bounding box check
        if (Math.abs(lat - faultLat) <= DEGREE_BUFFER && 
            Math.abs(lng - faultLng) <= DEGREE_BUFFER) {
          withinBounds = true;
          const distance = calculateDistance(lat, lng, faultLat, faultLng);
          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }
    }
  }
  
  return withinBounds ? minDistance : Infinity;
};

// Load fault data with caching
const loadFaultData = async () => {
  if (faultDataCache) {
    return faultDataCache;
  }
  
  if (faultDataPromise) {
    return faultDataPromise;
  }
  
  faultDataPromise = (async () => {
    try {
      const response = await fetch('/src/assets/local_active_faults.json');
      if (!response.ok) {
        throw new Error(`Failed to load fault data: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data?.features || !Array.isArray(data.features)) {
        throw new Error('Invalid fault data structure');
      }
      
      faultDataCache = data;
      return data;
    } catch (error) {
      faultDataPromise = null; // Reset promise on error to allow retry
      throw error;
    }
  })();
  
  return faultDataPromise;
};

export const filterNearbyFaults = async (centerLat, centerLng, radiusKm = REGIONAL_FAULT_RADIUS_KM) => {
  try {
    // Check regional cache first
    const cacheKey = getCacheKey(centerLat, centerLng, radiusKm);
    if (regionalFaultCache.has(cacheKey)) {
      const cached = regionalFaultCache.get(cacheKey);
      console.log(`Cache hit: Found ${cached.length} faults within ${radiusKm}km of ${centerLat}, ${centerLng}`);
      return cached;
    }
    
    const faultData = await loadFaultData();
    
    const nearbyFaults = faultData.features.filter(fault => {
      if (fault?.geometry?.type !== 'LineString' || !Array.isArray(fault.geometry.coordinates)) {
        return false;
      }
      
      const distance = calculateFaultDistance(centerLat, centerLng, fault.geometry.coordinates);
      return distance <= radiusKm;
    });
    
    // Cache the result (limit cache size to prevent memory leaks)
    if (regionalFaultCache.size > 50) {
      const firstKey = regionalFaultCache.keys().next().value;
      regionalFaultCache.delete(firstKey);
    }
    regionalFaultCache.set(cacheKey, nearbyFaults);
    
    console.log(`Found ${nearbyFaults.length} faults within ${radiusKm}km of ${centerLat}, ${centerLng}`);
    return nearbyFaults;
    
  } catch (error) {
    console.error('Error loading fault data:', error);
    return [];
  }
};

export const formatFaultSlipRate = (netSlipRate) => {
  if (!netSlipRate || typeof netSlipRate !== 'string') {
    return 'Unknown';
  }
  
  try {
    const match = netSlipRate.match(/\(([\d.]+),/);
    if (match) {
      const rate = parseFloat(match[1]);
      return `${rate} mm/yr`;
    }
  } catch (error) {
    console.warn('Error parsing slip rate:', netSlipRate);
  }
  
  return 'Unknown';
};

export const getFaultDisplayInfo = (fault) => {
  const properties = fault?.properties || {};
  const slipType = properties.slip_type || 'Unknown';
  const name = properties.name || 'Unnamed Fault';
  const slipRate = formatFaultSlipRate(properties.net_slip_rate);
  const catalog = properties.catalog_name || 'Unknown';
  
  return {
    name,
    slipType,
    slipRate,
    catalog,
    color: getFaultTypeColor(slipType),
    description: `${name} (${slipType}) - ${slipRate}`
  };
};