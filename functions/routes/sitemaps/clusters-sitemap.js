/**
 * @file Generates the sitemap for earthquake cluster pages (sitemap-clusters.xml).
 */
import { escapeXml } from '../../utils/xml-utils.js';

/**
 * Handles requests for the earthquake cluster sitemap.
 * This sitemap lists URLs for cluster pages, which group multiple earthquakes.
 * URLs are generated based on data from a D1 database and details fetched from USGS.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {object} context.env - Environment variables.
 * @param {object} context.env.DB - The D1 database binding.
 * @param {Request} context.request - The incoming HTTP request. Not directly used but part of context.
 * @returns {Promise<Response>} A promise that resolves to an XML response containing the cluster sitemap.
 */
export async function handleClustersSitemapRequest(context) {
  const { env } = context;

  if (!env.DB) {
    console.error("Database not configured in handleClustersSitemapRequest");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- D1 Database not available --></urlset>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
  }

  try {
    const d1Results = await env.DB.prepare("SELECT clusterId, updatedAt FROM ClusterDefinitions")
      .all();

    const clusterDefinitions = d1Results.results;

    if (!clusterDefinitions || clusterDefinitions.length === 0) {
      console.log("No cluster definitions found in D1 table ClusterDefinitions.");
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    for (const definition of clusterDefinitions) {
      const updatedTimestamp = definition.updated || definition.updatedAt;

      if (!definition.clusterId || typeof updatedTimestamp === 'undefined') {
        console.warn(`Invalid definition from D1 (missing clusterId or updated/updatedAt):`, definition);
        continue;
      }

      const rawD1ClusterId = definition.clusterId;
      const parts = rawD1ClusterId.split('_');

      let eventIdForFetchAndUrl = "";
      let count = NaN;

      if (parts.length >= 2) {
        count = parseInt(parts.pop(), 10);
        eventIdForFetchAndUrl = parts.join('_');
      }

      if (parts.length < 2 || isNaN(count) || !eventIdForFetchAndUrl) {
        console.warn(`Failed to parse D1 clusterId: ${rawD1ClusterId}`);
        continue;
      }

      const overviewPrefix = "overview_cluster_";
      if (eventIdForFetchAndUrl.startsWith(overviewPrefix)) {
        eventIdForFetchAndUrl = eventIdForFetchAndUrl.substring(overviewPrefix.length);
      }

      try {
        const lastmodDate = new Date(updatedTimestamp);
        if (isNaN(lastmodDate.getTime())) {
            console.warn(`Invalid 'updated' date format for eventId ${eventIdForFetchAndUrl} (raw ${rawD1ClusterId}): ${updatedTimestamp}`);
            continue;
        }
        const lastmod = lastmodDate.toISOString();

        const usgsResponse = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${eventIdForFetchAndUrl}`);
        if (!usgsResponse.ok) {
          console.warn(`USGS fetch failed for ${eventIdForFetchAndUrl}: ${usgsResponse.status}`);
          continue;
        }
        const quakeDetails = await usgsResponse.json();

        const place = quakeDetails.properties && quakeDetails.properties.place;
        const mag = quakeDetails.properties && typeof quakeDetails.properties.mag === 'number' ? quakeDetails.properties.mag : null;

        if (!place || mag === null) {
          if (!place) console.warn(`Missing or invalid locationName for ${eventIdForFetchAndUrl}`);
          if (mag === null) console.warn(`Missing or invalid maxMagnitude for ${eventIdForFetchAndUrl}`);
          continue;
        }

        const locationName = place;
        const maxMagnitude = mag;
        const locationNameSlug = locationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        const sitemapUrl = `https://earthquakeslive.com/cluster/${count}-quakes-near-${locationNameSlug}-up-to-m${maxMagnitude.toFixed(1)}-${eventIdForFetchAndUrl}`;
        xml += `<url><loc>${escapeXml(sitemapUrl)}</loc><lastmod>${lastmod}</lastmod></url>`;

      } catch (fetchError) {
        console.error(`Error fetching/processing details for eventId ${eventIdForFetchAndUrl} (raw ${rawD1ClusterId}) in cluster sitemap: ${fetchError.message}`);
        continue;
      }
    }

    xml += `</urlset>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });

  } catch (error) {
    console.error("Error in handleClustersSitemapRequest (D1 query or general):", error.message);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Exception processing cluster data from D1: ${escapeXml(error.message)} --></urlset>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
  }
}
