/**
 * @file Magnitude thresholds shared with sitemap eligibility, plus a legacy
 * significance helper for event features. Use isEarthquakeSitemapEligible when
 * deciding whether a detail URL is indexable.
 */

// Minimum magnitude for an earthquake to be considered "significant" for sitemap inclusion and indexing.
export const MIN_SIGNIFICANT_MAGNITUDE = 4.5;
export const MIN_INDEXABLE_MAGNITUDE = 2.5;

/**
 * Determines whether an earthquake event meets the magnitude/science portion
 * of the indexing rule. The sitemap predicate also validates ID and place.
 * An event is significant if it meets EITHER of the following criteria:
 *  A) It has a magnitude of MIN_SIGNIFICANT_MAGNITUDE or greater.
 *  B) It has rich scientific data (i.e., a "moment-tensor" or "focal-mechanism" product).
 *
 * @param {object} event - The earthquake event object.
 * @returns {boolean} - True if the event is significant, false otherwise.
 */
export const isEventSignificant = (event) => {
  if (!Number.isFinite(event?.magnitude) || event.magnitude < MIN_INDEXABLE_MAGNITUDE) return false;

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
