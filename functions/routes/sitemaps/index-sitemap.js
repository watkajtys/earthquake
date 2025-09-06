/**
 * @file Generates the main sitemap index file (sitemap-index.xml).
 * This sitemap lists all individual sitemap files, including paginated earthquake sitemaps.
 */
import { escapeXml } from '../../utils/xml-utils.js'; // For error messages

const SITEMAP_PAGE_SIZE = 40000;
const BASE_URL = "https://earthquakeslive.com";

/**
 * Handles requests for the sitemap index file.
 * This sitemap lists static page sitemap, cluster sitemap, and all paginated earthquake sitemaps.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @returns {Promise<Response>} An XML response containing the sitemap index.
 */
export async function handleIndexSitemap(context) {
  const { env } = context;
  let earthquakeSitemapEntries = '';
  // Use a consistent, recent date for all dynamic sitemaps for simplicity and to encourage re-crawling.
  const lastMod = new Date().toISOString();

  if (env.DB) {
    try {
      // Fetch the count of events with enhanced data directly from the database.
      const d1Result = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM EarthquakeEvents WHERE has_enhanced_data = TRUE"
      ).first();
      const totalSignificantEvents = d1Result ? d1Result.count : 0;


      if (totalSignificantEvents > 0) {
        const totalPages = Math.ceil(totalSignificantEvents / SITEMAP_PAGE_SIZE);
        for (let i = 1; i <= totalPages; i++) {
          earthquakeSitemapEntries += `  <sitemap>\n    <loc>${BASE_URL}/sitemaps/earthquakes-${i}.xml</loc>\n    <lastmod>${lastMod}</lastmod>\n  </sitemap>\n`;
        }
      }
    } catch (error) {
      console.error("Error generating dynamic earthquake sitemap entries for index-sitemap:", error.message);
      earthquakeSitemapEntries = `  <!-- Error generating earthquake sitemap list: ${escapeXml(error.message)} -->\n`;
    }
  } else {
    console.warn("DB not available for index-sitemap generation. Earthquake sitemaps will be omitted.");
    earthquakeSitemapEntries = "  <!-- Database not available: Earthquake sitemap list omitted. -->\n";
  }

  const staticAndClusterLastMod = lastMod.split('T')[0];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap-static-pages.xml</loc>
    <lastmod>${staticAndClusterLastMod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${BASE_URL}/sitemap-clusters.xml</loc>
    <lastmod>${staticAndClusterLastMod}</lastmod>
  </sitemap>
${earthquakeSitemapEntries.trimEnd()}
</sitemapindex>`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
