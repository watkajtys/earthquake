import { escapeXml } from '../../utils/xml-utils.js';
import { isEventSignificant } from '../../../src/utils/significanceUtils.js';

var SITEMAP_PAGE_SIZE = 4e4;
var BASE_URL = "https://earthquakeslive.com";
async function handleIndexSitemap(context) {
  const { env } = context;
  let earthquakeSitemapEntries = "";
  const lastMod = /* @__PURE__ */ new Date().toISOString();
  if (env.DB) {
    try {
      const allPotentiallySignificantEvents = await env.DB.prepare(
        "SELECT magnitude, has_moment_tensor, has_focal_mechanism FROM EarthquakeEvents WHERE id IS NOT NULL AND place IS NOT NULL AND magnitude >= ?",
      )
        .bind(2.5)
        .all();
      const significantEvents =
        allPotentiallySignificantEvents.results.filter(isEventSignificant);
      const totalSignificantEvents = significantEvents.length;
      if (totalSignificantEvents > 0) {
        const totalPages = Math.ceil(
          totalSignificantEvents / SITEMAP_PAGE_SIZE,
        );
        for (let i = 1; i <= totalPages; i++) {
          earthquakeSitemapEntries += `  <sitemap>
    <loc>${BASE_URL}/sitemaps/earthquakes-${i}.xml</loc>
    <lastmod>${lastMod}</lastmod>
  </sitemap>
`;
        }
      }
    } catch (error) {
      console.error(
        "Error generating dynamic earthquake sitemap entries for index-sitemap:",
        error.message,
      );
      earthquakeSitemapEntries = `  <!-- Error generating earthquake sitemap list: ${escapeXml(error.message)} -->
`;
    }
  } else {
    console.warn(
      "DB not available for index-sitemap generation. Earthquake sitemaps will be omitted.",
    );
    earthquakeSitemapEntries =
      "  <!-- Database not available: Earthquake sitemap list omitted. -->\n";
  }
  const staticAndClusterLastMod = lastMod.split("T")[0];
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

export { handleIndexSitemap };
