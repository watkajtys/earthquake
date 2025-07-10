/**
 * @file Generates the main sitemap index file (sitemap-index.xml).
 * This sitemap lists all individual sitemap files, including paginated earthquake sitemaps.
 */
import { escapeXml } from '../utils/xml-utils.js'; // For error messages

// Constants adapted from earthquakes-sitemap.js
const SITEMAP_PAGE_SIZE = 40000;
const BASE_URL = "https://earthquakeslive.com";
const MIN_FEELABLE_MAGNITUDE = 2.5;


/**
 * Handles requests for the sitemap index file.
 * This sitemap lists static page sitemap, cluster sitemap, and all paginated earthquake sitemaps.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {Request} context.request - The incoming HTTP request. Not directly used but part of context.
 * @param {object} context.env - Environment variables, including context.env.DB for D1 database.
 * @returns {Promise<Response>} An XML response containing the sitemap index.
 */
export async function handleIndexSitemap(context) {
  const { env } = context;
  let earthquakeSitemapEntries = '';
  let overallEarthquakeLastMod = new Date().toISOString(); // Default lastmod

  if (env.DB) {
    try {
      const countResult = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= ?"
      ).bind(MIN_FEELABLE_MAGNITUDE).first();
      const totalEvents = countResult?.total || 0;

      if (totalEvents > 0) {
        const totalPages = Math.ceil(totalEvents / SITEMAP_PAGE_SIZE);

        // Fetch the latest modification time for feelable earthquakes
        try {
            const latestEvent = await env.DB.prepare(
                "SELECT MAX(CASE WHEN geojson_feature IS NOT NULL THEN JSON_EXTRACT(geojson_feature, '$.properties.updated') ELSE event_time * 1000 END) as latest_mod_ts FROM EarthquakeEvents WHERE magnitude >= ?"
            ).bind(MIN_FEELABLE_MAGNITUDE).first();
            if (latestEvent && latestEvent.latest_mod_ts) {
                overallEarthquakeLastMod = new Date(latestEvent.latest_mod_ts).toISOString();
            }
        } catch (e) {
            console.error("Error fetching latest modification time for earthquake sitemaps in index-sitemap:", e.message);
            // Use default overallEarthquakeLastMod in case of error
        }

        for (let i = 1; i <= totalPages; i++) {
          earthquakeSitemapEntries += `  <sitemap>\n    <loc>${BASE_URL}/sitemaps/earthquakes-${i}.xml</loc>\n    <lastmod>${overallEarthquakeLastMod}</lastmod>\n  </sitemap>\n`;
        }
      }
    } catch (error) {
      console.error("Error generating dynamic earthquake sitemap entries for index-sitemap:", error.message);
      // In case of DB error, we'll just have an empty string for earthquakeSitemapEntries,
      // and the main sitemap index will be generated without them.
      // A more robust solution might return a 500 error or a specific error message in the sitemap.
      // For now, let it proceed to generate the rest of the sitemap.
      earthquakeSitemapEntries = `  <!-- Error generating earthquake sitemap list: ${escapeXml(error.message)} -->\n`;
    }
  } else {
    console.warn("DB not available for index-sitemap generation. Earthquake sitemaps will be omitted.");
    earthquakeSitemapEntries = "  <!-- Database not available: Earthquake sitemap list omitted. -->\n";
  }

  // Get current date for static and cluster sitemaps <lastmod>
  // Ideally, these would also fetch their true last modification dates.
  // For static pages, it's less critical. For clusters, it could be fetched from ClusterDefinitions.
  // For simplicity in this focused fix, using current date for these two.
  const staticAndClusterLastMod = new Date().toISOString().split('T')[0];


  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap-static-pages.xml</loc>
    <lastmod>${staticAndClusterLastMod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${BASE_URL}/sitemap-clusters.xml</loc>
    <lastmod>${staticAndClusterLastMod}</lastmod> {/* Consider fetching actual lastmod for clusters */}
  </sitemap>
${earthquakeSitemapEntries.trimEnd()}
</sitemapindex>`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
