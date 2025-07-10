/**
 * @file Generates sitemaps for earthquake events, including a sitemap index and paginated sitemap files.
 */
import { escapeXml } from '../../utils/xml-utils.js';

const SITEMAP_PAGE_SIZE = 40000; // Number of URLs per paginated sitemap file
const BASE_URL = "https://earthquakeslive.com";
export const MIN_FEELABLE_MAGNITUDE = 2.5; // Minimum magnitude for an earthquake to be considered "feelable"

const slugify = (text) => {
  if (!text) return 'unknown-location';
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '') // remove non-alphanumeric characters except hyphen
    .replace(/--+/g, '-')    // replace multiple hyphens with single
    .replace(/^-+/, '')     // trim leading hyphen
    .replace(/-+$/, '');    // trim trailing hyphen
};

// Removed generateEarthquakeSitemapIndex function as it's no longer used.
// The main sitemap index now directly lists paginated earthquake sitemaps.

async function generatePaginatedEarthquakeSitemap(db, pageNumber) {
  const offset = (pageNumber - 1) * SITEMAP_PAGE_SIZE;
  try {
    const d1Results = await db.prepare(
      "SELECT id, magnitude, place, event_time, geojson_feature FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= ? ORDER BY event_time DESC LIMIT ? OFFSET ?"
    ).bind(MIN_FEELABLE_MAGNITUDE, SITEMAP_PAGE_SIZE, offset).all();

    const earthquakeEvents = d1Results.results;

    if (!earthquakeEvents || earthquakeEvents.length === 0) {
      console.log(`No valid feelable earthquake events found for page ${pageNumber}.`);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- No feelable events for page ${pageNumber} --></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    for (const event of earthquakeEvents) {
      const eventId = event.id;
      const originalPlace = event.place;
      if (!eventId || !originalPlace) {
        console.warn(`Skipping event due to missing id or original place from D1 on page ${pageNumber}:`, event);
        continue;
      }
      const mag = typeof event.magnitude === 'number' ? event.magnitude.toFixed(1) : 'unknown';
      const place = originalPlace;
      let lastmodTimestamp;

      if (event.geojson_feature) {
        try {
          const feature = JSON.parse(event.geojson_feature);
          if (feature.properties && typeof feature.properties.updated === 'number') {
            lastmodTimestamp = feature.properties.updated;
          }
        } catch (e) {
          console.warn(`Failed to parse geojson_feature for event ${eventId} on page ${pageNumber}: ${e.message}`);
        }
      }
      if (typeof lastmodTimestamp !== 'number' && typeof event.event_time === 'number') {
        lastmodTimestamp = event.event_time * 1000;
      }
      if (!eventId || typeof lastmodTimestamp !== 'number') {
        console.warn(`Skipping event due to missing id or invalid/missing lastmodTimestamp on page ${pageNumber}:`, event);
        continue;
      }
      const locationSlug = slugify(place);
      const sitemapPath = `m${mag}-${locationSlug}-${eventId}`;
      const locUrl = `${BASE_URL}/quake/${sitemapPath}`;
      try {
        const lastmodDate = new Date(lastmodTimestamp);
        if (isNaN(lastmodDate.getTime())) {
            console.warn(`Invalid lastmod date for event ${eventId} on page ${pageNumber} with timestamp ${lastmodTimestamp}`);
            continue;
        }
        const lastmod = lastmodDate.toISOString();
        xml += `<url><loc>${escapeXml(locUrl)}</loc><lastmod>${lastmod}</lastmod></url>`;
      } catch(dateError) {
         console.error(`Error processing date for event ${eventId} on page ${pageNumber}: ${dateError.message}`);
         continue;
      }
    }
    xml += `</urlset>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });

  } catch (error) {
    console.error(`Error generating paginated earthquake sitemap for page ${pageNumber}:`, error.message);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error processing page ${pageNumber}: ${escapeXml(error.message)} --></urlset>`, { headers: { "Content-Type": "application/xml" }, status: 500 });
  }
}


/**
 * Handles requests for earthquake sitemaps.
 * If the path is '/sitemaps/earthquakes-index.xml', it generates the sitemap index.
 * If the path matches '/sitemaps/earthquakes-(\\d+).xml', it generates a paginated sitemap.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {object} context.env - Environment variables.
 * @param {object} context.env.DB - The D1 database binding.
 * @param {Request} context.request - The incoming HTTP request.
 * @returns {Promise<Response>} An XML response.
 */
export async function handleEarthquakesSitemap(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (!env.DB) {
    console.error("Database not configured in handleEarthquakesSitemap");
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?><error><message>Database not configured</message></error>`;
    return new Response(errorXml, { headers: { "Content-Type": "application/xml" }, status: 500 });
  }

  // Removed the block for handling '/sitemaps/earthquakes-index.xml'
  // as this functionality is now part of the main index-sitemap.js

  const pageMatch = pathname.match(/\/sitemaps\/earthquakes-(\d+)\.xml$/); // Reverted to /sitemaps/ prefix

  if (pageMatch && pageMatch[1]) {
    const pageNumber = parseInt(pageMatch[1], 10);
    if (isNaN(pageNumber) || pageNumber < 1) {
      return new Response("Invalid page number", { status: 400 });
    }
    return generatePaginatedEarthquakeSitemap(env.DB, pageNumber);
  }

  // Fallback or error for unexpected paths to this handler
  return new Response("Sitemap not found", { status: 404 });
}
