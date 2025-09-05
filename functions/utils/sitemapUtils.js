/**
 * @file Utility functions for sitemap generation.
 */

/**
 * Determines if an earthquake event has advanced scientific data, specifically a "shakemap".
 * This is used for sitemap generation to include only events with rich data.
 *
 * @param {object} event - The earthquake event object, typically from the D1 database.
 *                         It should have a `geojson_feature` property.
 * @returns {boolean} - True if the event has a shakemap, false otherwise.
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
    if (products && products.shakemap) {
      return true;
    }
  } catch (e) {
    console.warn(`[isEventWithAdvancedData] Failed to parse geojson_feature for event ${event.id}: ${e.message}`);
  }

  return false;
};
