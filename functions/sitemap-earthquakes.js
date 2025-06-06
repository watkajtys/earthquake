// functions/sitemap-earthquakes.js
import { handleEarthquakesSitemapRequest } from './api/usgs-proxy.js';

export async function onRequest(context) {
  return handleEarthquakesSitemapRequest(context);
}
