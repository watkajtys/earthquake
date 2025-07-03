/**
 * @file Generates the sitemap for static pages (sitemap-static-pages.xml).
 */

/**
 * Handles requests for the static pages sitemap.
 * This sitemap lists URLs for the main static informational pages of the website.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {Request} context.request - The incoming HTTP request. Not directly used but part of context.
 * @returns {Response} An XML response containing the static pages sitemap.
 */
export function handleStaticPagesSitemap(_context) { // context renamed to _context
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://earthquakeslive.com/</loc></url>
  <url><loc>https://earthquakeslive.com/overview</loc></url>
  <url><loc>https://earthquakeslive.com/about</loc></url>
  <url><loc>https://earthquakeslive.com/privacy</loc></url>
</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
