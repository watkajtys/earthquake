/**
 * @file Utility functions for sitemap generation.
 */

/**
 * Determines if an earthquake event has advanced scientific data.
 * This is used for sitemap generation to include only events with rich data.
 * An event is considered to have advanced data if it has a "shakemap", "moment-tensor", or "focal-mechanism" product.
 *
 * @param {object} event - The earthquake event object, typically from the D1 database.
 *                         It should have a `geojson_feature` property.
 * @returns {boolean} - True if the event has advanced data, false otherwise.
 */
export const isEventWithAdvancedData = (event) => {
  if (!event || !event.geojson_feature) {
    return false;
  }

  try {
    const feature = typeof event.geojson_feature === 'string'
      ? JSON.parse(event.geojson_feature)
      : event.geojson_feature;

    const products = feature.properties?.products;
    if (products && (products.shakemap || products['moment-tensor'] || products['focal-mechanism'])) {
      return true;
    }
  } catch (e) {
    console.warn(`[isEventWithAdvancedData] Failed to parse geojson_feature for event ${event.id}: ${e.message}`);
  }

  return false;
};
