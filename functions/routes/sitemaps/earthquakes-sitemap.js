import { escapeXml } from '../../utils/xml-utils.js';
import { isEventSignificant } from '../../../src/utils/significanceUtils.js';

var SITEMAP_PAGE_SIZE2 = 4e4;
var BASE_URL2 = "https://earthquakeslive.com";
var slugify = (text) => {
  if (!text) return "unknown-location";
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
};
async function generatePaginatedEarthquakeSitemap(db, pageNumber) {
  const offset = (pageNumber - 1) * SITEMAP_PAGE_SIZE2;
  try {
    const d1Results = await db
      .prepare(
        `SELECT id, magnitude, place, event_time, has_moment_tensor, has_focal_mechanism, has_finite_fault, has_shakemap, has_losspager
       FROM EarthquakeEvents
       WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= ?
       AND (
         COALESCE(has_moment_tensor, 0) +
         COALESCE(has_focal_mechanism, 0) +
         COALESCE(has_finite_fault, 0) +
         COALESCE(has_shakemap, 0) +
         COALESCE(has_losspager, 0)
       ) >= 3
       ORDER BY event_time DESC LIMIT ? OFFSET ?`,
      )
      .bind(2.5, SITEMAP_PAGE_SIZE2, offset)
      .all();
    const earthquakeEvents = d1Results.results;
    if (!earthquakeEvents || earthquakeEvents.length === 0) {
      console.log(`No valid earthquake events found for page ${pageNumber}.`);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- No events for page ${pageNumber} --></urlset>`,
        { headers: { "Content-Type": "application/xml" } },
      );
    }
    const significantEvents = earthquakeEvents.filter(isEventSignificant);
    if (significantEvents.length === 0) {
      console.log(
        `No significant earthquake events found for sitemap on page ${pageNumber}.`,
      );
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- No significant events for page ${pageNumber} --></urlset>`,
        { headers: { "Content-Type": "application/xml" } },
      );
    }
    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    for (const event of significantEvents) {
      const eventId = event.id;
      const originalPlace = event.place;
      if (!eventId || !originalPlace) {
        console.warn(
          `Skipping event due to missing id or original place from D1 on page ${pageNumber}:`,
          event,
        );
        continue;
      }
      const mag =
        typeof event.magnitude === "number"
          ? event.magnitude.toFixed(1)
          : "unknown";
      const place = originalPlace;
      let lastmodTimestamp;
      if (typeof event.event_time === "number") {
        if (event.event_time < 2e10) {
          lastmodTimestamp = event.event_time * 1e3;
        } else {
          lastmodTimestamp = event.event_time;
        }
      }
      if (!eventId || typeof lastmodTimestamp !== "number") {
        console.warn(
          `Skipping event due to missing id or invalid/missing lastmodTimestamp on page ${pageNumber}:`,
          event,
        );
        continue;
      }
      const locationSlug = slugify(place);
      const sitemapPath = `m${mag}-${locationSlug}-${eventId}`;
      const locUrl = `${BASE_URL2}/quake/${sitemapPath}`;
      try {
        const lastmodDate = new Date(lastmodTimestamp);
        if (isNaN(lastmodDate.getTime())) {
          console.warn(
            `Invalid lastmod date for event ${eventId} on page ${pageNumber} with timestamp ${lastmodTimestamp}`,
          );
          continue;
        }
        const lastmod = lastmodDate.toISOString();
        xml += `<url><loc>${escapeXml(locUrl)}</loc><lastmod>${lastmod}</lastmod></url>`;
      } catch (dateError) {
        console.error(
          `Error processing date for event ${eventId} on page ${pageNumber}: ${dateError.message}`,
        );
        continue;
      }
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
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error processing page ${pageNumber}: ${escapeXml(error.message)} --></urlset>`,
      { headers: { "Content-Type": "application/xml" }, status: 500 },
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
      headers: { "Content-Type": "application/xml" },
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
