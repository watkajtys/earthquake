/**
 * @file Utility functions for determining the significance of an earthquake event.
 * This is used by both the sitemap generation and the frontend components to ensure
 * consistent application of significance rules.
 */

// Minimum magnitude for an earthquake to be considered "significant" for sitemap inclusion and indexing.
export const MIN_SIGNIFICANT_MAGNITUDE = 4.5;

/**
 * Determines if an earthquake event is significant enough for sitemap inclusion and indexing.
 * An event is significant if it meets EITHER of the following criteria:
 *  A) It has a magnitude of MIN_SIGNIFICANT_MAGNITUDE or greater.
 *  B) It has rich scientific data (i.e., a "moment-tensor" or "focal-mechanism" product).
 *
 * @param {object} event - The earthquake event object.
 * @returns {boolean} - True if the event is significant, false otherwise.
 */
export const isEventSignificant = (event) => {
  if (!event) return false;

  // Criterion A: Significant Magnitude
  if (event.magnitude >= MIN_SIGNIFICANT_MAGNITUDE) {
    return true;
  }

  // Criterion B: Rich Scientific Data (Faulting Data)
  // Check boolean flags first (preferred)
  if (event.has_moment_tensor || event.has_focal_mechanism) {
    return true;
  }

  // Fallback: Check geojson_feature if provided (legacy/frontend usage where full object is passed)
  if (event.geojson_feature) {
    try {
      const feature = typeof event.geojson_feature === 'string'
        ? JSON.parse(event.geojson_feature)
        : event.geojson_feature;

      const products = feature.properties?.products;
      if (products) {
         // Check if products is an object with keys (USGS style)
         if (products['moment-tensor'] || products['focal-mechanism']) {
            return true;
         }
      }
    } catch (e) {
      console.warn(`[isEventSignificant] Failed to parse geojson_feature for event ${event.id}: ${e.message}`);
    }
  }

  return false;
};
