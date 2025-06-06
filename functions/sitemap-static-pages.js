// functions/sitemap-static-pages.js
import { handleStaticPagesSitemapRequest } from './api/usgs-proxy.js';

export async function onRequest(context) {
  return handleStaticPagesSitemapRequest(context);
}
