/**
 * Calculates the distance between two geographic coordinates using the Haversine formula.
 *
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} The distance in kilometers.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Filters GeoJSON features to include only those within a specified radius of a central point.
 *
 * @param {object} geojson The GeoJSON object to filter. Must be a FeatureCollection.
 * @param {object} centerCoordinates An object { latitude: number, longitude: number }.
 * @param {number} radiusKm The radius in kilometers.
 * @returns {object} A new GeoJSON FeatureCollection containing only the features within the radius.
 */
export function filterGeoJSONFeaturesByDistance(geojson, centerCoordinates, radiusKm) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !geojson.features) {
    console.error('Invalid GeoJSON FeatureCollection provided.');
    return { type: 'FeatureCollection', features: [] };
  }

  if (!centerCoordinates || typeof centerCoordinates.latitude !== 'number' || typeof centerCoordinates.longitude !== 'number') {
    console.error('Invalid centerCoordinates provided.');
    return { type: 'FeatureCollection', features: [] };
  }

  if (typeof radiusKm !== 'number' || radiusKm < 0) {
    console.error('Invalid radiusKm provided.');
    return { type: 'FeatureCollection', features: [] };
  }

  const filteredFeatures = geojson.features.filter(feature => {
    if (!feature.geometry || !feature.geometry.coordinates) {
      return false;
    }

    const { type, coordinates } = feature.geometry;

    switch (type) {
      case 'Point':
        // For Point geometry, check if the point itself is within the radius.
        const distanceToPoint = calculateDistance(
          centerCoordinates.latitude,
          centerCoordinates.longitude,
          coordinates[1], // GeoJSON longitude, latitude
          coordinates[0]
        );
        return distanceToPoint <= radiusKm;

      case 'LineString':
        // For LineString geometry
        // First, check if any vertex is within the radius.
        if (coordinates.some(coord => {
            const distanceToVertex = calculateDistance(
                centerCoordinates.latitude,
                centerCoordinates.longitude,
                coord[1], // GeoJSON longitude, latitude
                coord[0]
            );
            return distanceToVertex <= radiusKm;
        })) {
            return true; // A vertex is within radius
        }

        // If no vertex is within radius, check midpoints of segments.
        // A segment is formed by coordinates[i] and coordinates[i+1].
        for (let i = 0; i < coordinates.length - 1; i++) {
            const p1 = coordinates[i];
            const p2 = coordinates[i+1];

            // Calculate midpoint (simple average for lat/lon, an approximation)
            const midLat = (p1[1] + p2[1]) / 2;
            const midLon = (p1[0] + p2[0]) / 2;

            const distanceToMidpoint = calculateDistance(
                centerCoordinates.latitude,
                centerCoordinates.longitude,
                midLat,
                midLon
            );

            if (distanceToMidpoint <= radiusKm) {
                return true; // Midpoint of a segment is within radius
            }
        }
        return false; // No vertex or segment midpoint is within radius

      case 'Polygon':
        // For Polygon geometry, check if any vertex of the outer boundary is within the radius.
        // This is also a simplification. A more robust check might involve checking
        // if the polygon intersects or is contained within the radius.
        // Polygons have an array of rings; the first is the exterior ring.
        if (coordinates.length > 0) {
          return coordinates[0].some(coord => {
            const distanceToVertex = calculateDistance(
              centerCoordinates.latitude,
              centerCoordinates.longitude,
              coord[1],
              coord[0]
            );
            return distanceToVertex <= radiusKm;
          });
        }
        return false;

      // TODO: Add support for MultiPoint, MultiLineString, MultiPolygon, GeometryCollection if needed.
      default:
        // If the geometry type is not recognized or handled, exclude it.
        console.warn(`Unsupported geometry type: ${type}`);
        return false;
    }
  });

  return {
    type: 'FeatureCollection',
    features: filteredFeatures
  };
}
