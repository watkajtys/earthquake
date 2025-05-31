// src/utils.js

/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} Distance in kilometers.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

/**
 * Returns a hex color code based on earthquake magnitude.
 * @param {number | null | undefined} magnitude - The earthquake magnitude.
 * @returns {string} A hex color code string.
 */
export const getMagnitudeColor = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return '#94A3B8'; // slate-400
    if (magnitude < 1.0) return '#67E8F9'; // cyan-300
    if (magnitude < 2.5) return '#22D3EE'; // cyan-400
    if (magnitude < 4.0) return '#34D399'; // emerald-400
    if (magnitude < 5.0) return '#FACC15'; // yellow-400
    if (magnitude < 6.0) return '#FB923C'; // orange-400
    if (magnitude < 7.0) return '#F97316'; // orange-500
    if (magnitude < 8.0) return '#EF4444'; // red-500
    return '#B91C1C'; // red-700
};

/**
 * Determines the style for tectonic plate boundary lines on the map.
 * The styling is based on the `Boundary_Type` property of the GeoJSON feature.
 *
 * @param {object} feature - The GeoJSON feature object for a tectonic plate boundary.
 * @param {object} feature.properties - Properties of the feature.
 * @param {string} [feature.properties.Boundary_Type] - The type of plate boundary (e.g., 'Convergent', 'Divergent', 'Transform').
 * @param {object} [options] - Optional styling parameters.
 * @param {number} [options.defaultWeight=1] - Default line weight.
 * @param {number} [options.defaultOpacity=0.8] - Default line opacity.
 * @returns {object} A Leaflet path style object (color, weight, opacity).
 */
export const getTectonicPlateStyle = (feature, options = {}) => {
  const { defaultWeight = 1, defaultOpacity = 0.8 } = options;
  let color = `rgba(255, 165, 0, ${defaultOpacity})`; // Default: Orange

  const type = feature?.properties?.Boundary_Type;

  if (type === 'Convergent') {
    color = `rgba(220, 20, 60, ${defaultOpacity})`; // Crimson
  } else if (type === 'Divergent') {
    color = `rgba(60, 179, 113, ${defaultOpacity})`; // MediumSeaGreen
  } else if (type === 'Transform') {
    color = `rgba(70, 130, 180, ${defaultOpacity})`; // SteelBlue
  }

  return {
    color: color,
    weight: defaultWeight,
    opacity: defaultOpacity, // Opacity is handled by the RGBA color string, but Leaflet also uses this
  };
};

// Add other utility functions here as the app grows
