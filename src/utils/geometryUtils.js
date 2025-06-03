/**
 * @file geometryUtils.js
 * Utility functions for geometric calculations, especially for geospatial data.
 */

/**
 * Converts degrees to radians.
 * @param {number} degrees Angle in degrees.
 * @returns {number} Angle in radians.
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calculates the distance between two geographical points using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} Distance in kilometers.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the closest distance from a point to a line segment.
 * @param {number} pLat Latitude of the point.
 * @param {number} pLon Longitude of thepoint.
 * @param {number} s1Lat Latitude of the start of the segment.
 * @param {number} s1Lon Longitude of the start of the segment.
 * @param {number} s2Lat Latitude of the end of the segment.
 * @param {number} s2Lon Longitude of the end of the segment.
 * @returns {number} The shortest distance in kilometers from the point to the segment.
 */
function distanceToSegment(pLat, pLon, s1Lat, s1Lon, s2Lat, s2Lon) {
  const l2 = haversineDistance(s1Lat, s1Lon, s2Lat, s2Lon) ** 2;
  if (l2 === 0) return haversineDistance(pLat, pLon, s1Lat, s1Lon);

  // Consider the line extending the segment, parameterized as s1 + t (s2 - s1).
  // We find projection of point p onto the line.
  // t = [(p-s1) . (s2-s1)] / |s2-s1|^2
  // This dot product is complex with lat/lon, so we simplify by projecting to a plane locally.
  // A more accurate approach for geodesics is non-trivial.
  // For this application, a simplification is acceptable for performance.

  // Simplified approach: project point onto the line segment.
  // Convert to a common reference for somewhat of a planar projection (not strictly accurate but often used)
  const pX = pLon;
  const pY = pLat;
  const s1X = s1Lon;
  const s1Y = s1Lat;
  const s2X = s2Lon;
  const s2Y = s2Lat;

  const segmentLengthSq = (s2X - s1X) ** 2 + (s2Y - s1Y) ** 2;

  let t = ((pX - s1X) * (s2X - s1X) + (pY - s1Y) * (s2Y - s1Y)) / segmentLengthSq;
  t = Math.max(0, Math.min(1, t)); // Clamp t to be between 0 and 1 to stay on the segment

  const closestX = s1X + t * (s2X - s1X);
  const closestY = s1Y + t * (s2Y - s1Y);

  return haversineDistance(pLat, pLon, closestY, closestX);
}

/**
 * Finds the closest tectonic boundary feature to a given earthquake epicenter.
 * @param {{lat: number, lon: number}} epicenter The earthquake's epicenter coordinates.
 * @param {Array<object>} boundaryFeatures Array of GeoJSON LineString features representing tectonic boundaries.
 * @returns {{feature: object, distance: number, type: string, name: string} | null}
 *          The closest boundary feature and distance, or null if no features are provided.
 */
export function findClosestTectonicBoundary(epicenter, boundaryFeatures) {
  if (!boundaryFeatures || boundaryFeatures.length === 0) {
    return null;
  }

  let closestBoundary = null;
  let minDistance = Infinity;

  boundaryFeatures.forEach(feature => {
    if (feature.geometry && feature.geometry.type === 'LineString' && feature.geometry.coordinates) {
      const coordinates = feature.geometry.coordinates;
      for (let i = 0; i < coordinates.length - 1; i++) {
        const s1Lon = coordinates[i][0];
        const s1Lat = coordinates[i][1];
        const s2Lon = coordinates[i+1][0];
        const s2Lat = coordinates[i+1][1];

        const distance = distanceToSegment(epicenter.lat, epicenter.lon, s1Lat, s1Lon, s2Lat, s2Lon);

        if (distance < minDistance) {
          minDistance = distance;
          closestBoundary = {
            featureProperties: feature.properties, // Store all properties
            distance: minDistance,
            type: feature.properties.Boundary_Type || 'Unknown Type',
            // Attempt to get a name or default to OBJECTID
            name: feature.properties.Name || feature.properties.PlateA && feature.properties.PlateB ? `${feature.properties.PlateA}-${feature.properties.PlateB} Boundary` : `Boundary ID ${feature.properties.OBJECTID || i}`
          };
        }
      }
    }
  });

  return closestBoundary;
}
