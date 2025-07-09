/**
 * @file Generates the sitemap for individual earthquake event pages (sitemap-earthquakes.xml).
 */
import { escapeXml } from '../../utils/xml-utils.js';

/**
 * Handles requests for the earthquake events sitemap.
 * This sitemap lists URLs for individual earthquake detail pages,
 * generated from data stored in the D1 `EarthquakeEvents` table.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {object} context.env - Environment variables.
 * @param {object} context.env.DB - The D1 database binding.
 * @param {Request} context.request - The incoming HTTP request. Not directly used but part of context.
 * @returns {Promise<Response>} A promise that resolves to an XML response containing the earthquake events sitemap.
 */
export async function handleEarthquakesSitemap(context) {
  const { env } = context;

  if (!env.DB) {
    console.error("Database not configured in handleEarthquakesSitemap");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- D1 Database not available --></urlset>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
  }

  try {
    // Fetch necessary fields from the EarthquakeEvents table.
    // It's generally better to select only the columns you need.
    // geojson_feature is fetched to get feature.properties.updated for lastmod.
    // event_time is a fallback if geojson_feature or its updated property is missing.
    const d1Results = await env.DB.prepare(
      "SELECT id, magnitude, place, event_time, geojson_feature FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL"
    ).all();

    const earthquakeEvents = d1Results.results;

    if (!earthquakeEvents || earthquakeEvents.length === 0) {
      console.log("No valid earthquake events found in D1 table EarthquakeEvents.");
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

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

    for (const event of earthquakeEvents) {
      const eventId = event.id;
      const originalPlace = event.place; // Get original place before any fallback

      // Addresses the failing test's expectation for JS resilience
      // if data somehow bypassed a theoretical SQL `place IS NOT NULL` filter.
      // Also ensures eventId is present.
      if (!eventId || !originalPlace) {
        console.warn(`Skipping event due to missing id or original place from D1:`, event);
        continue;
      }

      const mag = typeof event.magnitude === 'number' ? event.magnitude.toFixed(1) : 'unknown';
      const place = originalPlace; // Use the validated originalPlace
      let lastmodTimestamp;

      if (event.geojson_feature) {
        try {
          const feature = JSON.parse(event.geojson_feature);
          if (feature.properties && typeof feature.properties.updated === 'number') {
            lastmodTimestamp = feature.properties.updated;
          }
        } catch (e) {
          console.warn(`Failed to parse geojson_feature for event ${eventId}: ${e.message}`);
        }
      }

      // Fallback to event_time if updated timestamp is not available or invalid
      if (typeof lastmodTimestamp !== 'number' && typeof event.event_time === 'number') {
        // D1 stores event_time as seconds since epoch, convert to milliseconds for JS Date
        lastmodTimestamp = event.event_time * 1000;
      }


      if (!eventId || typeof lastmodTimestamp !== 'number') {
        console.warn(`Skipping event due to missing id or invalid/missing lastmodTimestamp:`, event);
        continue;
      }

      const locationSlug = slugify(place);
      const sitemapPath = `m${mag}-${locationSlug}-${eventId}`;
      const locUrl = `https://earthquakeslive.com/quake/${sitemapPath}`;

      try {
        const lastmodDate = new Date(lastmodTimestamp);
        if (isNaN(lastmodDate.getTime())) {
            console.warn(`Invalid lastmod date for event ${eventId} with timestamp ${lastmodTimestamp}`);
            continue;
        }
        const lastmod = lastmodDate.toISOString();
        xml += `<url><loc>${escapeXml(locUrl)}</loc><lastmod>${lastmod}</lastmod></url>`;

      } catch(dateError) {
         console.error(`Error processing date for event ${eventId}: ${dateError.message}`);
         continue;
      }
    }
    xml += `</urlset>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });

  } catch (error) {
    console.error("Error in handleEarthquakesSitemap (D1 query or general):", error.message);
    // Log the full error for more details if possible, but be cautious about exposing sensitive info.
    // console.error(error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Exception processing earthquake data from D1: ${escapeXml(error.message)} --></urlset>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
  }
}
