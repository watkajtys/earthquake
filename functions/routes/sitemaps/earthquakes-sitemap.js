/**
 * @file Generates sitemaps for earthquake events, including a sitemap index and paginated sitemap files.
 */
import { escapeXml } from '../../utils/xml-utils.js';

const SITEMAP_PAGE_SIZE = 40000; // Number of URLs per paginated sitemap file
const BASE_URL = "https://earthquakeslive.com";

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

async function generateEarthquakeSitemapIndex(db) {
  try {
    const countResult = await db.prepare("SELECT COUNT(*) as total FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL").first();
    const totalEvents = countResult?.total || 0;

    if (totalEvents === 0) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- No earthquake events found --></sitemapindex>`, { headers: { "Content-Type": "application/xml" } });
    }

    const totalPages = Math.ceil(totalEvents / SITEMAP_PAGE_SIZE);
    let sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // To get a representative lastmod for the sitemap index, we could query the latest event_time or updated geojson_feature time
    // For simplicity here, we'll use the current date, or ideally the lastmod of the most recent sitemap page.
    // Fetching the absolute latest modification time across all events for the index <lastmod>
    let overallLastMod = new Date().toISOString(); // Fallback
    try {
        const latestEvent = await db.prepare(
            "SELECT MAX(CASE WHEN geojson_feature IS NOT NULL THEN JSON_EXTRACT(geojson_feature, '$.properties.updated') ELSE event_time * 1000 END) as latest_mod_ts FROM EarthquakeEvents"
        ).first();
        if (latestEvent && latestEvent.latest_mod_ts) {
            overallLastMod = new Date(latestEvent.latest_mod_ts).toISOString();
        }
    } catch (e) {
        console.error("Error fetching latest modification time for sitemap index:", e.message);
    }


    for (let i = 1; i <= totalPages; i++) {
      sitemapIndexXml += `<sitemap><loc>${BASE_URL}/sitemaps/earthquakes-${i}.xml</loc><lastmod>${overallLastMod}</lastmod></sitemap>`;
    }
    sitemapIndexXml += `</sitemapindex>`;
    return new Response(sitemapIndexXml, { headers: { "Content-Type": "application/xml" } });

  } catch (error) {
    console.error("Error generating earthquake sitemap index:", error.message);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error generating sitemap index: ${escapeXml(error.message)} --></sitemapindex>`, { headers: { "Content-Type": "application/xml" }, status: 500 });
  }
}

async function generatePaginatedEarthquakeSitemap(db, pageNumber) {
  const offset = (pageNumber - 1) * SITEMAP_PAGE_SIZE;
  try {
    const d1Results = await db.prepare(
      "SELECT id, magnitude, place, event_time, geojson_feature FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL ORDER BY event_time DESC LIMIT ? OFFSET ?"
    ).bind(SITEMAP_PAGE_SIZE, offset).all();

    const earthquakeEvents = d1Results.results;

    if (!earthquakeEvents || earthquakeEvents.length === 0) {
      console.log(`No valid earthquake events found for page ${pageNumber}.`);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- No events for page ${pageNumber} --></urlset>`, { headers: { "Content-Type": "application/xml" } });
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

  if (pathname === '/sitemaps/earthquakes-index.xml') { // Reverted to /sitemaps/ prefix
    return generateEarthquakeSitemapIndex(env.DB);
  }

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
