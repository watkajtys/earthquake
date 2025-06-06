// functions/sitemap-clusters.js
import { handleClustersSitemapRequest } from './api/usgs-proxy.js';

export async function onRequest(context) {
  return handleClustersSitemapRequest(context);
}
