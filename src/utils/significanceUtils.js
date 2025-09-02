/**
 * @file Utility functions for determining the significance of an earthquake event.
 * This is used by both the sitemap generation and the frontend components to ensure
 * consistent application of significance rules.
 */

/**
 * Determines if an earthquake event is significant enough for sitemap inclusion.
 * An event is significant if it has a shakemap product, indicating it was impactful
 * enough to warrant a detailed shake intensity map.
 *
 * @param {object} event - The earthquake event object, typically from the D1 database.
 *                         It should have a `geojson_feature` property.
 * @returns {boolean} - True if the event is significant (has a shakemap), false otherwise.
 */
export const isEventSignificant = (event) => {
  if (!event) return false;

  // Significance is now determined SOLELY by the presence of a shakemap.
  if (event.geojson_feature) {
    try {
      // geojson_feature can be a string or an object depending on the context
      const feature = typeof event.geojson_feature === 'string'
        ? JSON.parse(event.geojson_feature)
        : event.geojson_feature;

      const products = feature.properties?.products;
      // The presence of a "shakemap" product is the key criterion.
      if (products && products.shakemap) {
        return true;
      }
    } catch (e) {
      // Ignore parsing errors for this check
      console.warn(`[isEventSignificant] Failed to parse geojson_feature for event ${event.id}: ${e.message}`);
    }
  }

  return false;
};
