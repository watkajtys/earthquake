// functions/sitemap-index.js
import { handleSitemapIndexRequest } from './api/usgs-proxy.js';

export async function onRequest(context) {
  return handleSitemapIndexRequest(context);
}
