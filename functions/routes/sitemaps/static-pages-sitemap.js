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
export function handleStaticPagesSitemap(context) {
  // Get current date in YYYY-MM-DD format
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(today.getDate()).padStart(2, '0');
  const lastModified = `${year}-${month}-${day}`;

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://earthquakeslive.com/</loc><lastmod>${lastModified}</lastmod></url>
  <url><loc>https://earthquakeslive.com/overview</loc><lastmod>${lastModified}</lastmod></url>
  <url><loc>https://earthquakeslive.com/about</loc><lastmod>${lastModified}</lastmod></url>
  <url><loc>https://earthquakeslive.com/privacy</loc><lastmod>${lastModified}</lastmod></url>
</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
