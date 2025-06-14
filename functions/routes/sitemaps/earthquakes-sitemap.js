/**
 * @file Generates the sitemap for individual earthquake event pages (sitemap-earthquakes.xml).
 */
import { escapeXml } from '../../utils/xml-utils.js';

/**
 * Handles requests for the earthquake events sitemap.
 * This sitemap lists URLs for individual earthquake detail pages,
 * generated from data fetched from the USGS GeoJSON feed.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {object} context.env - Environment variables.
 * @param {string} [context.env.USGS_API_URL] - Optional specific USGS API URL.
 * @param {Request} context.request - The incoming HTTP request. Not directly used but part of context.
 * @returns {Promise<Response>} A promise that resolves to an XML response containing the earthquake events sitemap.
 */
export async function handleEarthquakesSitemap(context) {
  const { env } = context;
  // Defaulting to week, but test can provide env.USGS_API_URL.
  const USGS_API_URL = env.USGS_API_URL || "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";

  try {
    const response = await fetch(USGS_API_URL);
    if (!response.ok) {
      console.error(`Error fetching earthquake data from USGS: ${response.status} ${response.statusText}`);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Error fetching earthquake data --></urlset>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
    }

    const data = await response.json();
    if (!data || !data.features || data.features.length === 0) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    for (const feature of data.features) {
      const locUrl = feature.properties && feature.properties.detail; // 'detail' field often contains the event page URL
      const lastmodTimestamp = feature.properties && feature.properties.updated;

      if (locUrl && typeof lastmodTimestamp === 'number') {
        const lastmod = new Date(lastmodTimestamp).toISOString();
        xml += `<url><loc>${escapeXml(locUrl)}</loc><lastmod>${lastmod}</lastmod></url>`;
      }
    }
    xml += `</urlset>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });

  } catch (error) {
    console.error("Exception in handleEarthquakesSitemap:", error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Exception processing earthquake data: ${escapeXml(error.message)} --></urlset>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
  }
}
