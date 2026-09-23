import { buildEarthquakePath } from '../../../src/utils/entityRoutes.js';
import {
  EARTHQUAKE_SITEMAP_BINDINGS,
  EARTHQUAKE_SITEMAP_PAGE_SIZE,
  EARTHQUAKE_SITEMAP_WHERE,
} from './earthquake-sitemap-eligibility.js';

var BASE_URL2 = "https://earthquakeslive.com";
async function generatePaginatedEarthquakeSitemap(db, pageNumber) {
  const offset = (pageNumber - 1) * EARTHQUAKE_SITEMAP_PAGE_SIZE;
  try {
    const d1Results = await db
      .prepare(
        `SELECT id FROM EarthquakeEvents WHERE ${EARTHQUAKE_SITEMAP_WHERE}
       ORDER BY event_time DESC, id ASC LIMIT ? OFFSET ?`,
      )
      .bind(...EARTHQUAKE_SITEMAP_BINDINGS, EARTHQUAKE_SITEMAP_PAGE_SIZE, offset)
      .all();
    if (d1Results?.success !== true || !Array.isArray(d1Results.results)) throw new Error('Sitemap page query failed');
    const earthquakeEvents = d1Results.results;
    if (!earthquakeEvents || earthquakeEvents.length === 0) {
      console.log(`No valid earthquake events found for page ${pageNumber}.`);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- No events for page ${pageNumber} --></urlset>`,
        { headers: { "Content-Type": "application/xml" } },
      );
    }
    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    for (const event of earthquakeEvents) {
      const canonicalPath = buildEarthquakePath(event.id);
      if (!canonicalPath) throw new Error('Sitemap query returned an invalid event ID');
      // Event occurrence time is not the page's modification time. Omit
      // lastmod until a reliable scientific revision timestamp is stored.
      xml += `<url><loc>${BASE_URL2}${canonicalPath}</loc></url>`;
    }
    xml += `</urlset>`;
    return new Response(xml, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error(
      `Error generating paginated earthquake sitemap for page ${pageNumber}:`,
      error.message,
    );
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error><message>Earthquake sitemap unavailable</message></error>`,
      { headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" }, status: 500 },
    );
  }
}
async function handleEarthquakesSitemap(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (!env.DB) {
    console.error("Database not configured in handleEarthquakesSitemap");
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?><error><message>Database not configured</message></error>`;
    return new Response(errorXml, {
      headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" },
      status: 500,
    });
  }
  const pageMatch = pathname.match(/\/sitemaps\/earthquakes-(\d+)\.xml$/);
  if (pageMatch && pageMatch[1]) {
    const pageNumber = parseInt(pageMatch[1], 10);
    if (isNaN(pageNumber) || pageNumber < 1) {
      return new Response("Invalid page number", { status: 400 });
    }
    return generatePaginatedEarthquakeSitemap(env.DB, pageNumber);
  }
  return new Response("Sitemap not found", { status: 404 });
}

export { handleEarthquakesSitemap };
