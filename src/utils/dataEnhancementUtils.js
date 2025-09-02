/**
 * @file Utility functions for determining if an earthquake event has enhanced data.
 */

/**
 * Checks if an earthquake event has a shakemap, indicating it is a data-enhanced event.
 *
 * @param {object} event - The earthquake event object, typically from the D1 database.
 *                         It should have a `geojson_feature` property.
 * @returns {boolean} - True if the event has a shakemap, false otherwise.
 */
export const isEventDataEnhanced = (event) => {
  if (!event || !event.geojson_feature) {
    return false;
  }

  try {
    // geojson_feature can be a string or an object depending on the context
    const feature = typeof event.geojson_feature === 'string'
      ? JSON.parse(event.geojson_feature)
      : event.geojson_feature;

    const products = feature.properties?.products;
    if (products && products.shakemap) {
      return true;
    }
  } catch (e) {
    // Ignore parsing errors for this check
    console.warn(`[isEventDataEnhanced] Failed to parse geojson_feature for event ${event.id}: ${e.message}`);
  }

  return false;
};
