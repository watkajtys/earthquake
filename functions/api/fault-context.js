/**
 * Cloudflare Pages Function handler for GET requests to /api/fault-context/:earthquakeId
 * 
 * @description This function provides fault context for a specific earthquake, including
 * nearby faults and their relationship to the earthquake. Prioritizes museum-friendly
 * explanations while preserving scientific accuracy. Includes KV caching for improved performance.
 * 
 * Route Parameters:
 *  - `earthquakeId` (string): The earthquake ID to get fault context for
 * 
 * Query Parameters:
 *  - `radius` (number): Search radius in kilometers (default: 100km)
 *  - `limit` (number): Maximum number of faults to return (default: 5)
 * 
 * Response Format:
 *  - `earthquake`: Basic earthquake information
 *  - `nearby_faults`: Array of nearby faults with relationship explanations
 *  - `regional_context`: Summary of the fault environment
 *  - `educational_content`: Museum-friendly explanations
 */

// KV cache configuration
const FAULT_CONTEXT_CACHE_TTL_SECONDS = 7200; // 2 hours cache duration (fault context changes less frequently)
const CONTEXT_CACHE_KEY_PREFIX = 'fault_context';

/**
 * Generate cache key for fault context queries
 */
function generateContextCacheKey(earthquakeId, radius, limit) {
  return `${CONTEXT_CACHE_KEY_PREFIX}_${earthquakeId}_r${radius}_l${limit}`;
}

export async function onRequestGet(context) {
  try {
    const { env, request, params, executionContext } = context;
    const db = env.DB;
    const faultKvNamespace = env.FAULT_CACHE_KV;

    if (!db) {
      return new Response("Database not available", {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const earthquakeId = params.earthquakeId;
    const url = new URL(request.url);
    const radius = parseFloat(url.searchParams.get("radius")) || 100;
    const limit = parseInt(url.searchParams.get("limit")) || 5;

    if (!earthquakeId) {
      return new Response(JSON.stringify({
        error: "Missing earthquake ID",
        message: "Please provide a valid earthquake ID"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get earthquake information
    const earthquakeQuery = `
      SELECT id, latitude, longitude, magnitude, place, event_time, depth
      FROM EarthquakeEvents
      WHERE id = ?
    `;

    const earthquakeResult = await db.prepare(earthquakeQuery).bind(earthquakeId).first();

    if (!earthquakeResult) {
      return new Response(JSON.stringify({
        error: "Earthquake not found",
        message: `No earthquake found with ID: ${earthquakeId}`
      }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const earthquake = earthquakeResult;

    // Check KV cache first
    let cacheKey = null;
    
    if (faultKvNamespace) {
      cacheKey = generateContextCacheKey(earthquakeId, radius, limit);
      
      try {
        const cachedData = await faultKvNamespace.get(cacheKey);
        if (cachedData) {
          const cachedResult = JSON.parse(cachedData);
          console.log(`Cache hit for fault context: ${cacheKey}`);
          
          return new Response(JSON.stringify(cachedResult), {
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              "X-Data-Source": "D1-FaultContext-Cached",
              "X-Cache": "HIT"
            }
          });
        }
      } catch (cacheError) {
        console.error('Error reading from fault context cache:', cacheError);
        // Continue with database query if cache fails
      }
    }

    // Check if associations already exist
    const associationQuery = `
      SELECT 
        efa.fault_id,
        efa.distance_km,
        efa.relationship_description,
        efa.proximity_description,
        efa.relevance_explanation,
        efa.relevance_score,
        efa.association_type,
        af.display_name,
        af.movement_description,
        af.activity_level,
        af.speed_description,
        af.depth_description,
        af.hazard_description,
        af.slip_type,
        af.net_slip_rate_best,
        af.length_km
      FROM EarthquakeFaultAssociations efa
      JOIN ActiveFaults af ON efa.fault_id = af.fault_id
      WHERE efa.earthquake_id = ?
      ORDER BY efa.relevance_score DESC, efa.distance_km ASC
      LIMIT ?
    `;

    let associationResults = await db.prepare(associationQuery).bind(earthquakeId, limit).all();

    // If no associations exist, create them on-demand
    if (!associationResults.success || associationResults.results.length === 0) {
      await createEarthquakeFaultAssociations(db, earthquake, radius);
      
      // Re-query associations
      associationResults = await db.prepare(associationQuery).bind(earthquakeId, limit).all();
    }

    const nearbyFaults = associationResults.success ? associationResults.results : [];

    // Generate regional context
    const regionalContext = generateRegionalContext(earthquake, nearbyFaults);

    // Generate educational content
    const educationalContent = generateEducationalContent(earthquake, nearbyFaults);

    const response = {
      earthquake: {
        id: earthquake.id,
        magnitude: earthquake.magnitude,
        place: earthquake.place,
        latitude: earthquake.latitude,
        longitude: earthquake.longitude,
        depth: earthquake.depth,
        event_time: earthquake.event_time
      },
      nearby_faults: nearbyFaults.map(fault => ({
        fault_id: fault.fault_id,
        display_name: fault.display_name,
        distance_km: fault.distance_km,
        proximity_description: fault.proximity_description,
        relationship_description: fault.relationship_description,
        relevance_explanation: fault.relevance_explanation,
        relevance_score: fault.relevance_score,
        association_type: fault.association_type,
        
        // Human-readable fault information
        movement_description: fault.movement_description,
        activity_level: fault.activity_level,
        speed_description: fault.speed_description,
        depth_description: fault.depth_description,
        hazard_description: fault.hazard_description,
        
        // Scientific details
        slip_type: fault.slip_type,
        net_slip_rate_best: fault.net_slip_rate_best,
        length_km: fault.length_km
      })),
      regional_context: regionalContext,
      educational_content: educationalContent,
      search_params: {
        earthquake_id: earthquakeId,
        radius,
        limit
      }
    };

    // Cache the result if KV is available
    if (faultKvNamespace && cacheKey && executionContext) {
      try {
        const cachePromise = faultKvNamespace.put(
          cacheKey, 
          JSON.stringify(response), 
          { expirationTtl: FAULT_CONTEXT_CACHE_TTL_SECONDS }
        ).then(() => {
          console.log(`Cached fault context result: ${cacheKey}`);
        }).catch(error => {
          console.error('Error caching fault context result:', error);
        });
        
        executionContext.waitUntil(cachePromise);
      } catch (cacheError) {
        console.error('Error setting up fault context cache:', cacheError);
      }
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "X-Data-Source": "D1-FaultContext",
        "X-Cache": "MISS"
      }
    });

  } catch (error) {
    console.error("Error in fault-context:", error);
    
    return new Response(JSON.stringify({
      error: "Internal server error",
      message: "Failed to retrieve fault context"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Create earthquake-fault associations on-demand
 * @param {Object} db - Database connection
 * @param {Object} earthquake - Earthquake data
 * @param {number} radius - Search radius in km
 */
async function createEarthquakeFaultAssociations(db, earthquake, radius) {
  const { latitude, longitude, id: earthquakeId } = earthquake;
  
  // Calculate bounding box
  const latDelta = radius / 111;
  const lonDelta = radius / (111 * Math.cos(latitude * Math.PI / 180));
  
  const minLat = latitude - latDelta;
  const maxLat = latitude + latDelta;
  const minLon = longitude - lonDelta;
  const maxLon = longitude + lonDelta;
  
  // Get nearby faults
  const faultsQuery = `
    SELECT fault_id, display_name, movement_description, activity_level, 
           speed_description, slip_type, net_slip_rate_best, length_km,
           geom_linestring, bbox_min_lat, bbox_max_lat, bbox_min_lon, bbox_max_lon
    FROM ActiveFaults
    WHERE bbox_min_lat <= ? AND bbox_max_lat >= ?
      AND bbox_min_lon <= ? AND bbox_max_lon >= ?
  `;
  
  const faultsResult = await db.prepare(faultsQuery).bind(maxLat, minLat, maxLon, minLon).all();
  
  if (!faultsResult.success) return;
  
  const associations = [];
  
  for (const fault of faultsResult.results) {
    const distance = calculateDistanceToFault(latitude, longitude, fault);
    
    if (distance <= radius) {
      const relevanceScore = calculateRelevanceScore(distance, fault, earthquake);
      const associationType = getAssociationType(distance, relevanceScore);
      
      associations.push({
        earthquake_id: earthquakeId,
        fault_id: fault.fault_id,
        distance_km: distance,
        relationship_description: generateRelationshipDescription(distance, fault, earthquake),
        proximity_description: generateProximityDescription(distance),
        relevance_explanation: generateRelevanceExplanation(distance, fault, earthquake),
        relevance_score: relevanceScore,
        association_type: associationType
      });
    }
  }
  
  // Insert associations
  for (const association of associations) {
    const insertQuery = `
      INSERT OR REPLACE INTO EarthquakeFaultAssociations (
        earthquake_id, fault_id, distance_km, relationship_description,
        proximity_description, relevance_explanation, relevance_score, association_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await db.prepare(insertQuery).bind(
      association.earthquake_id,
      association.fault_id,
      association.distance_km,
      association.relationship_description,
      association.proximity_description,
      association.relevance_explanation,
      association.relevance_score,
      association.association_type
    ).run();
  }
}

/**
 * Calculate relevance score for earthquake-fault association
 * @param {number} distance - Distance in km
 * @param {Object} fault - Fault data
 * @param {Object} earthquake - Earthquake data
 * @returns {number} Relevance score (0-1)
 */
function calculateRelevanceScore(distance, fault, _earthquake) {
  // Distance component (closer = higher score)
  const distanceScore = Math.max(0, 1 - (distance / 100));
  
  // Activity component (more active = higher score)
  const slipRate = fault.net_slip_rate_best || 0;
  const activityScore = Math.min(1, slipRate / 50);
  
  // Size component (larger fault = higher score for larger earthquake)
  const sizeScore = Math.min(1, (fault.length_km || 0) / 100);
  
  // Combine scores with weights
  return (distanceScore * 0.5) + (activityScore * 0.3) + (sizeScore * 0.2);
}

/**
 * Determine association type based on distance and relevance
 * @param {number} distance - Distance in km
 * @param {number} relevanceScore - Relevance score (0-1)
 * @returns {string} Association type
 */
function getAssociationType(distance, relevanceScore) {
  if (distance < 5 && relevanceScore > 0.7) {
    return "primary";
  } else if (distance < 20 && relevanceScore > 0.5) {
    return "secondary";
  } else {
    return "regional_context";
  }
}

/**
 * Generate relationship description
 * @param {number} distance - Distance in km
 * @param {Object} fault - Fault data
 * @param {Object} earthquake - Earthquake data
 * @returns {string} Relationship description
 */
function generateRelationshipDescription(distance, _fault, _earthquake) {
  if (distance < 1) {
    return "This earthquake happened directly on the fault";
  } else if (distance < 5) {
    return "This earthquake happened very close to the fault";
  } else if (distance < 20) {
    return "This earthquake happened near the fault";
  } else {
    return "This earthquake happened in the same region as the fault";
  }
}

/**
 * Generate relevance explanation
 * @param {number} distance - Distance in km
 * @param {Object} fault - Fault data
 * @param {Object} earthquake - Earthquake data
 * @returns {string} Relevance explanation
 */
function generateRelevanceExplanation(distance, fault, _earthquake) {
  const slipRate = fault.net_slip_rate_best || 0;
  
  if (distance < 5 && slipRate > 10) {
    return "Very likely caused by this fault - close distance and high activity";
  } else if (distance < 5) {
    return "Likely related to this fault - very close distance";
  } else if (distance < 20 && slipRate > 5) {
    return "Possibly related to this fault - nearby and active";
  } else {
    return "Provides regional geological context";
  }
}

/**
 * Generate regional context summary
 * @param {Object} earthquake - Earthquake data
 * @param {Array} nearbyFaults - Array of nearby fault data
 * @returns {Object} Regional context information
 */
function generateRegionalContext(_earthquake, nearbyFaults) {
  const _primaryFaults = nearbyFaults.filter(f => f.association_type === "primary");
  const _secondaryFaults = nearbyFaults.filter(f => f.association_type === "secondary");
  
  return {
    summary: generateRegionalSummary(_earthquake, nearbyFaults),
    fault_environment: generateFaultEnvironment(nearbyFaults),
    hazard_context: generateHazardContext(nearbyFaults),
    dominant_fault_type: getDominantFaultType(nearbyFaults)
  };
}

/**
 * Generate educational content for museum display
 * @param {Object} earthquake - Earthquake data
 * @param {Array} nearbyFaults - Array of nearby fault data
 * @returns {Object} Educational content
 */
function generateEducationalContent(earthquake, nearbyFaults) {
  return {
    earthquake_story: generateEarthquakeStory(earthquake, nearbyFaults),
    fault_explanation: generateFaultExplanation(nearbyFaults),
    what_this_means: generateWhatThisMeans(earthquake, nearbyFaults),
    for_visitors: generateVisitorContent(earthquake, nearbyFaults)
  };
}

// Helper functions for context generation
function generateRegionalSummary(earthquake, nearbyFaults) {
  const count = nearbyFaults.length;
  if (count === 0) {
    return "This earthquake occurred in an area with no major mapped faults nearby";
  } else if (count === 1) {
    return `This earthquake occurred near the ${nearbyFaults[0].display_name}`;
  } else {
    return `This earthquake occurred in an area with ${count} mapped faults nearby`;
  }
}

function generateFaultEnvironment(nearbyFaults) {
  const types = [...new Set(nearbyFaults.map(f => f.slip_type))];
  return `Fault environment includes ${types.join(', ')} faults`;
}

function generateHazardContext(nearbyFaults) {
  const activeFaults = nearbyFaults.filter(f => f.activity_level === "Active" || f.activity_level === "Very Active");
  if (activeFaults.length === 0) {
    return "Low seismic hazard area with mostly slow-moving faults";
  } else {
    return `Moderate to high seismic hazard area with ${activeFaults.length} active fault(s)`;
  }
}

function getDominantFaultType(nearbyFaults) {
  const types = nearbyFaults.map(f => f.slip_type);
  const typeCount = types.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  
  return Object.keys(typeCount).reduce((a, b) => typeCount[a] > typeCount[b] ? a : b, "Unknown");
}

function generateEarthquakeStory(earthquake, nearbyFaults) {
  if (nearbyFaults.length === 0) {
    return "This earthquake occurred in an area without major mapped faults, possibly on a small unmapped fault";
  }
  
  const closest = nearbyFaults[0];
  return `This magnitude ${earthquake.magnitude} earthquake occurred ${closest.proximity_description} the ${closest.display_name}, which ${closest.movement_description.toLowerCase()}`;
}

function generateFaultExplanation(nearbyFaults) {
  if (nearbyFaults.length === 0) {
    return "No major faults are mapped in this area";
  }
  
  const explanations = nearbyFaults.slice(0, 3).map(fault => 
    `${fault.display_name}: ${fault.movement_description} and is ${fault.activity_level.toLowerCase()}`
  );
  
  return explanations.join('; ');
}

function generateWhatThisMeans(earthquake, nearbyFaults) {
  if (nearbyFaults.length === 0) {
    return "This earthquake shows that seismic activity can occur even in areas without major mapped faults";
  }
  
  const closest = nearbyFaults[0];
  return `This earthquake demonstrates the ongoing activity of the ${closest.display_name} fault system`;
}

function generateVisitorContent(earthquake, nearbyFaults) {
  return {
    simple_explanation: nearbyFaults.length === 0 ? 
      "Sometimes earthquakes happen on small faults we haven't mapped yet" :
      `This earthquake happened because the ${nearbyFaults[0].display_name} is slowly moving`,
    key_takeaway: nearbyFaults.length === 0 ?
      "Earthquakes can surprise us in unexpected places" :
      `The ${nearbyFaults[0].display_name} is ${nearbyFaults[0].activity_level.toLowerCase()} and can cause earthquakes`,
    size_comparison: `This M${earthquake.magnitude} earthquake is ${getMagnitudeComparison(earthquake.magnitude)}`
  };
}

function getMagnitudeComparison(magnitude) {
  if (magnitude < 3) return "barely felt by most people";
  if (magnitude < 4) return "felt by many people but rarely causes damage";
  if (magnitude < 5) return "felt by everyone and may cause minor damage";
  if (magnitude < 6) return "can cause significant damage in populated areas";
  if (magnitude < 7) return "can cause serious damage over large areas";
  return "can cause widespread devastation";
}

// Import shared utility functions
function calculateDistanceToFault(lat, lon, fault) {
  try {
    const geometry = JSON.parse(fault.geom_linestring);
    const coordinates = geometry.coordinates;
    
    let minDistance = Infinity;
    
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];
      
      const segmentDistance = distanceToLineSegment(lat, lon, lat1, lon1, lat2, lon2);
      minDistance = Math.min(minDistance, segmentDistance);
    }
    
    return minDistance;
  } catch (error) {
    console.error("Error calculating fault distance:", error);
    return Infinity;
  }
}

function distanceToLineSegment(py, px, y1, x1, y2, x2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) {
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

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

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