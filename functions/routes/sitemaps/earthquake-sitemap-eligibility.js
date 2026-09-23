import { isValidUsgsEventId } from '../../utils/usgs-transport.js';
import { MIN_SIGNIFICANT_MAGNITUDE } from '../../../src/utils/significanceUtils.js';

export const EARTHQUAKE_SITEMAP_PAGE_SIZE = 40_000;
export const EARTHQUAKE_SITEMAP_MIN_MAGNITUDE = 2.5;
export const EARTHQUAKE_SITEMAP_BINDINGS = Object.freeze([
  EARTHQUAKE_SITEMAP_MIN_MAGNITUDE,
  MIN_SIGNIFICANT_MAGNITUDE,
]);

// Keep the count and page queries on the same population. The ID clause matches
// the route builder, so every counted row can produce a canonical URL.
export const EARTHQUAKE_SITEMAP_WHERE = `id IS NOT NULL
  AND LENGTH(id) BETWEEN 1 AND 100
  AND id NOT GLOB '*[^A-Za-z0-9_-]*'
  AND place IS NOT NULL AND TRIM(place) <> ''
  AND magnitude >= ?
  AND (magnitude >= ? OR COALESCE(has_moment_tensor, 0) <> 0 OR COALESCE(has_focal_mechanism, 0) <> 0)`;

// A corresponding pure predicate helps check SQL parity at boundary cases.
const hasProduct = value => value === true || (typeof value === 'number' && Number.isFinite(value) && value !== 0);

export function isEarthquakeSitemapEligible(event) {
  return isValidUsgsEventId(event?.id)
    && typeof event.place === 'string' && event.place.trim().length > 0
    && Number.isFinite(event.magnitude)
    && event.magnitude >= EARTHQUAKE_SITEMAP_MIN_MAGNITUDE
    && (event.magnitude >= MIN_SIGNIFICANT_MAGNITUDE
      || hasProduct(event.has_moment_tensor)
      || hasProduct(event.has_focal_mechanism));
}
