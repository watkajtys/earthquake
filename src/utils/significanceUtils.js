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
 * @param {object} event - The earthquake event object, typically from the D1 database.
 *                         It should have `magnitude` and `geojson_feature` properties.
 * @returns {boolean} - True if the event is significant, false otherwise.
 */
export const isEventSignificant = (event) => {
  if (!event) return false;

  // Criterion A: Significant Magnitude
  if (event.magnitude >= MIN_SIGNIFICANT_MAGNITUDE) {
    return true;
  }

  // Criterion B: Rich Scientific Data (Faulting Data)
  if (event.geojson_feature) {
    try {
      // geojson_feature can be a string or an object depending on the context
      const feature = typeof event.geojson_feature === 'string'
        ? JSON.parse(event.geojson_feature)
        : event.geojson_feature;

      const products = feature.properties?.products;
      if (products && (products['moment-tensor'] || products['focal-mechanism'])) {
        return true;
      }
    } catch (e) {
      // Ignore parsing errors for this check
      console.warn(`[isEventSignificant] Failed to parse geojson_feature for event ${event.id}: ${e.message}`);
    }
  }

  return false;
};

/**
 * Checks if an earthquake has advanced scientific data products.
 * This is a stricter check than isEventSignificant, intended for filtering sitemaps
 * to only include the most high-value seismic events.
 *
 * An event has advanced data if it has ANY of the following products:
 * - shakemap (instrumental intensity map)
 * - moment-tensor (fault plane solution)
 * - focal-mechanism (older fault plane solution)
 *
 * @param {object} event - The earthquake event object from the D1 database.
 * @returns {boolean} - True if the event has at least one advanced data product.
 */
export const hasAdvancedScientificData = (event) => {
  if (!event || !event.geojson_feature) {
    return false;
  }

  try {
    const feature = typeof event.geojson_feature === 'string'
      ? JSON.parse(event.geojson_feature)
      : event.geojson_feature;

    const products = feature.properties?.products;

    if (products && (products['shakemap'] || products['moment-tensor'] || products['focal-mechanism'])) {
      return true;
    }
  } catch (e) {
    console.warn(`[hasAdvancedScientificData] Failed to parse geojson_feature for event ${event.id}: ${e.message}`);
    // If parsing fails, it doesn't have the data.
  }

  return false;
};
