/**
 * Cloudflare Pages Function handler for GET requests to /api/get-nearby-faults
 * 
 * @description This function finds active faults near a given location with human-readable
 * descriptions suitable for museum displays. It prioritizes accessibility while preserving
 * scientific accuracy. Includes KV caching for improved performance.
 * 
 * Query Parameters:
 *  - `lat` (number): Latitude of the location (required)
 *  - `lon` (number): Longitude of the location (required)
 *  - `radius` (number): Search radius in kilometers (default: 50km)
 *  - `limit` (number): Maximum number of faults to return (default: 10)
 *  - `activity_level` (string): Filter by activity level (optional)
 *  - `slip_type` (string): Filter by slip type (optional)
 * 
 * Response Format:
 *  - `faults`: Array of fault objects with human-readable descriptions
 *  - `search_params`: Echo of search parameters
 *  - `total_found`: Number of faults found
 */

// KV cache configuration
const FAULT_CACHE_TTL_SECONDS = 3600; // 1 hour cache duration
const CACHE_KEY_PREFIX = 'faults_nearby';

/**
 * Generate cache key for fault queries
 */
function generateCacheKey(lat, lon, radius, limit, activityLevel, slipType) {
  const params = [
    `lat${lat.toFixed(3)}`,
    `lon${lon.toFixed(3)}`,
    `r${radius}`,
    `l${limit}`,
    activityLevel || 'any',
    slipType || 'any'
  ];
  return `${CACHE_KEY_PREFIX}_${params.join('_')}`;
}

export async function onRequestGet(context) {
  try {
    const { env, request, executionContext } = context;
    const db = env.DB;
    const faultKvNamespace = env.FAULT_CACHE_KV;

    if (!db) {
      return new Response("Database not available", {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const url = new URL(request.url);
    
    // Parse and validate parameters
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    const radius = parseFloat(url.searchParams.get("radius")) || 50;
    const limit = parseInt(url.searchParams.get("limit")) || 10;
    const activityLevel = url.searchParams.get("activity_level");
    const slipType = url.searchParams.get("slip_type");

    // Validate required parameters
    if (isNaN(lat) || isNaN(lon)) {
      return new Response(JSON.stringify({
        error: "Invalid or missing latitude/longitude parameters",
        message: "Please provide valid 'lat' and 'lon' parameters"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Validate ranges
    if (lat < -90 || lat > 90) {
      return new Response(JSON.stringify({
        error: "Invalid latitude",
        message: "Latitude must be between -90 and 90"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (lon < -180 || lon > 180) {
      return new Response(JSON.stringify({
        error: "Invalid longitude", 
        message: "Longitude must be between -180 and 180"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Check KV cache first
    let cacheKey = null;
    let cachedResult = null;
    
    if (faultKvNamespace) {
      cacheKey = generateCacheKey(lat, lon, radius, limit, activityLevel, slipType);
      
      try {
        const cachedData = await faultKvNamespace.get(cacheKey);
        if (cachedData) {
          cachedResult = JSON.parse(cachedData);
          console.log(`Cache hit for fault query: ${cacheKey}`);
          
          return new Response(JSON.stringify(cachedResult), {
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              "X-Data-Source": "D1-ActiveFaults-Cached",
              "X-Cache": "HIT"
            }
          });
        }
      } catch (cacheError) {
        console.error('Error reading from fault cache:', cacheError);
        // Continue with database query if cache fails
      }
    }

    // Calculate approximate bounding box for efficient pre-filtering
    // 1 degree latitude ≈ 111km, longitude varies by latitude
    const latDelta = radius / 111;
    const lonDelta = radius / (111 * Math.cos(lat * Math.PI / 180));

    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLon = lon - lonDelta;
    const maxLon = lon + lonDelta;

    // Build query with optional filters
    let query = `
      SELECT 
        fault_id,
        catalog_id,
        catalog_name,
        name,
        display_name,
        movement_description,
        activity_level,
        speed_description,
        depth_description,
        hazard_description,
        slip_type,
        average_dip,
        average_rake,
        dip_dir,
        net_slip_rate_min,
        net_slip_rate_best,
        net_slip_rate_max,
        upper_seis_depth,
        lower_seis_depth,
        geom_linestring,
        length_km,
        bbox_min_lat,
        bbox_max_lat,
        bbox_min_lon,
        bbox_max_lon
      FROM ActiveFaults
      WHERE bbox_min_lat <= ? AND bbox_max_lat >= ?
        AND bbox_min_lon <= ? AND bbox_max_lon >= ?
    `;

    const params = [maxLat, minLat, maxLon, minLon];

    // Add optional filters
    if (activityLevel) {
      query += ` AND activity_level = ?`;
      params.push(activityLevel);
    }

    if (slipType) {
      query += ` AND slip_type = ?`;
      params.push(slipType);
    }

    query += ` ORDER BY length_km DESC LIMIT ?`;
    params.push(limit * 2); // Get more results for distance filtering

    // Execute query
    const results = await db.prepare(query).bind(...params).all();

    if (!results.success) {
      throw new Error("Database query failed");
    }

    // Calculate actual distances and filter by radius
    const faultsWithDistance = [];
    
    for (const fault of results.results) {
      const distance = calculateDistanceToFault(lat, lon, fault);
      
      if (distance <= radius) {
        faultsWithDistance.push({
          ...fault,
          distance_km: Math.round(distance * 10) / 10, // Round to 1 decimal
          proximity_description: generateProximityDescription(distance)
        });
      }
    }

    // Sort by distance and apply final limit
    faultsWithDistance.sort((a, b) => a.distance_km - b.distance_km);
    const finalFaults = faultsWithDistance.slice(0, limit);

    // Format response with human-readable focus
    const response = {
      faults: finalFaults.map(fault => ({
        fault_id: fault.fault_id,
        name: fault.name,
        display_name: fault.display_name,
        distance_km: fault.distance_km,
        proximity_description: fault.proximity_description,
        
        // Human-readable primary content
        movement_description: fault.movement_description,
        activity_level: fault.activity_level,
        speed_description: fault.speed_description,
        depth_description: fault.depth_description,
        hazard_description: fault.hazard_description,
        
        // Scientific details (secondary)
        scientific_details: {
          slip_type: fault.slip_type,
          average_dip: fault.average_dip,
          average_rake: fault.average_rake,
          dip_dir: fault.dip_dir,
          net_slip_rate_min: fault.net_slip_rate_min,
          net_slip_rate_best: fault.net_slip_rate_best,
          net_slip_rate_max: fault.net_slip_rate_max,
          upper_seis_depth: fault.upper_seis_depth,
          lower_seis_depth: fault.lower_seis_depth,
          length_km: fault.length_km,
          catalog_id: fault.catalog_id,
          catalog_name: fault.catalog_name
        }
      })),
      search_params: {
        lat,
        lon,
        radius,
        limit,
        activity_level: activityLevel,
        slip_type: slipType
      },
      total_found: faultsWithDistance.length
    };

    // Cache the result if KV is available
    if (faultKvNamespace && cacheKey && executionContext) {
      try {
        const cachePromise = faultKvNamespace.put(
          cacheKey, 
          JSON.stringify(response), 
          { expirationTtl: FAULT_CACHE_TTL_SECONDS }
        ).then(() => {
          console.log(`Cached fault query result: ${cacheKey}`);
        }).catch(error => {
          console.error('Error caching fault query result:', error);
        });
        
        executionContext.waitUntil(cachePromise);
      } catch (cacheError) {
        console.error('Error setting up fault cache:', cacheError);
      }
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "X-Data-Source": "D1-ActiveFaults",
        "X-Cache": "MISS"
      }
    });

  } catch (error) {
    console.error("Error in get-nearby-faults:", error);
    
    return new Response(JSON.stringify({
      error: "Internal server error",
      message: "Failed to retrieve nearby faults"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Calculate distance from a point to the nearest point on a fault line
 * @param {number} lat - Point latitude
 * @param {number} lon - Point longitude
 * @param {Object} fault - Fault object with geom_linestring
 * @returns {number} Distance in kilometers
 */
function calculateDistanceToFault(lat, lon, fault) {
  try {
    const geometry = JSON.parse(fault.geom_linestring);
    const coordinates = geometry.coordinates;
    
    let minDistance = Infinity;
    
    // Calculate distance to each segment of the fault line
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];
      
      const segmentDistance = distanceToLineSegment(lat, lon, lat1, lon1, lat2, lon2);
      minDistance = Math.min(minDistance, segmentDistance);
    }
    
    return minDistance;
  } catch (error) {
    console.error("Error calculating fault distance:", error);
    // Fallback to bounding box center distance
    const centerLat = (fault.bbox_min_lat + fault.bbox_max_lat) / 2;
    const centerLon = (fault.bbox_min_lon + fault.bbox_max_lon) / 2;
    return haversineDistance(lat, lon, centerLat, centerLon);
  }
}

/**
 * Calculate distance from a point to a line segment
 * @param {number} px - Point x (longitude)
 * @param {number} py - Point y (latitude)
 * @param {number} x1 - Line start x
 * @param {number} y1 - Line start y
 * @param {number} x2 - Line end x
 * @param {number} y2 - Line end y
 * @returns {number} Distance in kilometers
 */
function distanceToLineSegment(py, px, y1, x1, y2, x2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) {
    // Line segment is a point
    return haversineDistance(py, px, y1, x1);
  }
  
  const param = dot / lenSq;
  
  let closestX, closestY;
  
  if (param < 0) {
    closestX = x1;
    closestY = y1;
  } else if (param > 1) {
    closestX = x2;
    closestY = y2;
  } else {
    closestX = x1 + param * C;
    closestY = y1 + param * D;
  }
  
  return haversineDistance(py, px, closestY, closestX);
}

/**
 * Haversine distance calculation
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Generate human-readable proximity description
 * @param {number} distance - Distance in kilometers
 * @returns {string} Human-readable description
 */
function generateProximityDescription(distance) {
  if (distance < 1) {
    return "Right on the fault";
  } else if (distance < 5) {
    return `Very close (${distance.toFixed(1)}km away)`;
  } else if (distance < 20) {
    return `Close (${distance.toFixed(1)}km away)`;
  } else if (distance < 50) {
    return `Moderate distance (${distance.toFixed(0)}km away)`;
  } else {
    return `Far (${distance.toFixed(0)}km away)`;
  }
}