/**
 * @file Cloudflare Pages Function entry point for handling all requests.
 * This acts as a main router, delegating requests to specific handlers based on the URL path.
 * It also re-exports several utility and handler functions, primarily for testing purposes.
 */

import { isCrawler as importedIsCrawler } from './utils/crawler-utils.js';
import { escapeXml as importedEscapeXml } from './utils/xml-utils.js';
import { handleClustersSitemapRequest as importedHandleClustersSitemapRequest } from './routes/sitemaps/clusters-sitemap.js';
import { handlePrerenderCluster as importedHandlePrerenderCluster } from './routes/prerender/cluster-detail.js';
import { handleUsgsProxy } from './routes/api/usgs-proxy.js';
import { handleIndexSitemap } from './routes/sitemaps/index-sitemap.js';
import { handleStaticPagesSitemap } from './routes/sitemaps/static-pages-sitemap.js';
import { handleEarthquakesSitemap } from './routes/sitemaps/earthquakes-sitemap.js';
import { handleQuakeDetailPrerender } from './routes/prerender/quake-detail.js';

/**
 * Main request handler for Cloudflare Pages functions.
 * It routes incoming requests to appropriate handlers based on the pathname.
 * Handles API proxying, sitemap generation, and prerendering for crawlers.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {Request} context.request - The incoming HTTP request.
 * @param {Function} [context.next] - The function to call to invoke the next middleware or asset serving.
 * @param {object} context.env - Environment variables and bindings (e.g., D1 database, KV stores).
 * @returns {Promise<Response|undefined>} A promise that resolves to a Response object, or undefined if handled by `next()` or specific test conditions.
 */
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  console.log(`[onRequest DEBUG] Pathname: ${pathname}`); // Added for debugging test failures

  if (pathname === "/api/usgs-proxy") {
    return handleUsgsProxy(context);
  }

  if (pathname === "/sitemap-index.xml") {
    return handleIndexSitemap(context);
  }

  if (pathname === "/sitemap-static-pages.xml") {
    return handleStaticPagesSitemap(context);
  }

  // Updated routing for paginated earthquake sitemaps (now at root level)
  if (pathname === "/earthquakes-sitemap-index.xml" || pathname.startsWith("/earthquakes-sitemap-")) {
    return handleEarthquakesSitemap(context); // This correctly points to the refactored handler
  }

  if (pathname === "/sitemap-clusters.xml") {
    return importedHandleClustersSitemapRequest(context);
  }

  const quakeMatch = pathname.match(/^\/quake\/([a-zA-Z0-9_.-]+)$/);
  if (quakeMatch && importedIsCrawler(request)) {
    const eventId = quakeMatch[1];
    if (eventId) {
        return handleQuakeDetailPrerender(context, eventId);
    }
  }

  const clusterMatch = pathname.match(/^\/cluster\/([a-zA-Z0-9_.-]+)$/);
  if (clusterMatch && importedIsCrawler(request)) {
    const clusterSlug = clusterMatch[1];
    if (clusterSlug) {
        return importedHandlePrerenderCluster(context, clusterSlug);
    }
  }

  if (searchParams.has("apiUrl") && typeof next !== 'function') {
      console.warn(`Unhandled path "${pathname}" with apiUrl, but no next() function. Attempting proxy.`);
      return handleUsgsProxy(context);
  }

  if (typeof next === 'function') {
    return next();
  } else {
    if (pathname === "/very/unknown/path") {
        console.log(`[worker-router] Path ${pathname} not handled by explicit routing in worker. Will attempt to serve from static assets (env.ASSETS) or SPA index.html.`);
        return context.env.ASSETS.fetch(request);
    }
    console.warn(`No route matched for "${pathname}" and no next() function available. Returning 404.`);
    return new Response("Not Found", { status: 404 });
  }
}

// Re-exports for testing or direct import if needed by other functions/modules.

/**
 * Checks if the current request is from a known web crawler.
 * Re-exported from `./utils/crawler-utils.js`.
 * @function
 * @param {Request} request The incoming HTTP Request object.
 * @returns {boolean} True if crawler, false otherwise.
 */
export const isCrawler = importedIsCrawler;

/**
 * Escapes special characters in a string for use in XML content.
 * Re-exported from `./utils/xml-utils.js`.
 * @function
 * @param {*} unsafe The input value to escape.
 * @returns {string} The escaped string.
 */
export const escapeXml = importedEscapeXml;

/**
 * Handles requests for the earthquake cluster sitemap.
 * Re-exported from `./routes/sitemaps/clusters-sitemap.js`.
 * @function
 * @param {object} context - The Cloudflare Pages function context.
 * @returns {Promise<Response>} An XML response for the cluster sitemap.
 */
export const handleClustersSitemapRequest = importedHandleClustersSitemapRequest;

/**
 * Generates an HTML page for a specific earthquake cluster for crawlers.
 * Re-exported from `./routes/prerender/cluster-detail.js`.
 * @function
 * @param {object} context - The Cloudflare Pages function context.
 * @param {string} clusterSlug - The URL slug identifying the cluster.
 * @returns {Promise<Response>} An HTML response for the cluster page.
 */
export const handlePrerenderCluster = importedHandlePrerenderCluster;
