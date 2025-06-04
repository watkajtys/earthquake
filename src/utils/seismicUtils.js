import { calculateDistance } from './utils'; // Assuming calculateDistance is exported from utils.js

/**
 * Determines a likely fault animation type for a given earthquake based on its properties
 * or proximity to tectonic plate boundaries.
 *
 * @param {object} earthquake - The GeoJSON feature object for an earthquake.
 *   Expected to have `earthquake.geometry.coordinates` and potentially `earthquake.properties.products['focal-mechanism']`.
 * @param {Array<object>} tectonicPlatesFeatures - An array of GeoJSON features representing tectonic plate boundaries.
 *   Each feature is expected to have `feature.geometry.coordinates` (for LineStrings) and `feature.properties.Boundary_Type`.
 * @returns {string|null} The animation type ('normal', 'reverse', 'strikeSlip') or null if no type can be determined.
 */
export const getFaultAnimationTypeForEarthquake = (earthquake, tectonicPlatesFeatures) => {
  if (!earthquake?.geometry?.coordinates || !tectonicPlatesFeatures) {
    return null;
  }

  // 1. Placeholder for Focal Mechanism Check (Future Enhancement)
  // const focalMechanismProduct = earthquake.properties?.products?.['focal-mechanism']?.[0];
  // if (focalMechanismProduct?.properties?.type) {
  //   const fmType = focalMechanismProduct.properties.type.toLowerCase();
  //   if (fmType.includes('normal')) return 'normal';
  //   if (fmType.includes('reverse') || fmType.includes('thrust')) return 'reverse';
  //   if (fmType.includes('strike-slip') || fmType.includes('strike slip')) return 'strikeSlip';
  // }
  // More advanced focal mechanism interpretation (from strike/dip/rake) would go here.
  // For example, based on rake angle:
  // if (focalMechanismProduct?.properties?.rake1) { // Assuming rake1 is available
  //    const rake = parseFloat(focalMechanismProduct.properties.rake1);
  //    if (rake >= -135 && rake <= -45) return 'normal';  // Normal faulting
  //    if (rake >= 45 && rake <= 135) return 'reverse'; // Reverse faulting
  //    if ((rake >= -45 && rake <= 45) || (rake >= 135 || rake <= -135)) return 'strikeSlip'; // Strike-slip
  // }


  // 2. Proximity to Plate Boundary Logic
  const eqLon = earthquake.geometry.coordinates[0];
  const eqLat = earthquake.geometry.coordinates[1];
  let closestBoundary = null;
  let minDistance = Infinity;

  const DISTANCE_THRESHOLD_KM = 300; // 300 km threshold for association

  for (const boundaryFeature of tectonicPlatesFeatures) {
    if (boundaryFeature?.geometry?.type === 'LineString' && boundaryFeature.geometry.coordinates) {
      // SIMPLIFICATION: Calculate distance to the closest vertex of the boundary line.
      // A more accurate approach would be point-to-line-segment distance for the entire boundary.
      for (const vertex of boundaryFeature.geometry.coordinates) {
        const [vertexLon, vertexLat] = vertex;
        const distance = calculateDistance(eqLat, eqLon, vertexLat, vertexLon);
        if (distance < minDistance) {
          minDistance = distance;
          closestBoundary = boundaryFeature.properties;
        }
      }
    } else if (boundaryFeature?.geometry?.type === 'MultiLineString' && boundaryFeature.geometry.coordinates) {
        // Handle MultiLineString by iterating through each LineString
        for (const lineString of boundaryFeature.geometry.coordinates) {
            for (const vertex of lineString) {
                const [vertexLon, vertexLat] = vertex;
                const distance = calculateDistance(eqLat, eqLon, vertexLat, vertexLon);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestBoundary = boundaryFeature.properties;
                }
            }
        }
    }
  }

  if (closestBoundary && minDistance <= DISTANCE_THRESHOLD_KM) {
    switch (closestBoundary.Boundary_Type) {
      case 'Convergent':
        return 'reverse';
      case 'Divergent':
        return 'normal';
      case 'Transform':
        return 'strikeSlip';
      default:
        // If closest boundary type is unknown, we can't infer fault type from it.
        console.warn(`Earthquake ${earthquake.id} is close to a boundary of unknown type: ${closestBoundary.Boundary_Type}`);
        return null;
    }
  }

  return null; // No type determined
};

// Example of a more robust (but more complex) point-to-line segment distance
// This would require more math and careful implementation.
// function getMinDistanceToLineString(pointLat, pointLon, lineStringCoords) {
//   let minDistance = Infinity;
//   for (let i = 0; i < lineStringCoords.length - 1; i++) {
//     const segStart = lineStringCoords[i];
//     const segEnd = lineStringCoords[i+1];
//     // ... calculate distance from (pointLat, pointLon) to segment [segStart, segEnd] ...
//     // const distToSegment = calculateDistanceToSegment(pointLat, pointLon, segStart[1], segStart[0], segEnd[1], segEnd[0]);
//     // minDistance = Math.min(minDistance, distToSegment);
//   }
//   return minDistance;
// }
//
// function calculateDistanceToSegment(pLat, pLon, s1Lat, s1Lon, s2Lat, s2Lon) {
//   // Haversine or other distance formula, adapted for point-to-segment projection.
//   // This involves vector math to find the closest point on the segment to the given point.
//   // For simplicity, this is not fully implemented here.
//   return Infinity;
// }
