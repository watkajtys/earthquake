/**
 * @file Generates the main sitemap index file (sitemap-index.xml).
 */

/**
 * Handles requests for the sitemap index file.
 * This sitemap lists other sitemap files.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {Request} context.request - The incoming HTTP request. Not directly used but part of context.
 * @returns {Response} An XML response containing the sitemap index.
 */
export function handleIndexSitemap(_context) { // context renamed to _context
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-static-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-earthquakes.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-clusters.xml</loc>
  </sitemap>
</sitemapindex>`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
