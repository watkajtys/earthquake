/**
 * @file Generates the sitemap for earthquake cluster pages (sitemap-clusters.xml).
 */
import { escapeXml } from '../../utils/xml-utils.js';
import { isEventDataEnhanced } from '../../../src/utils/dataEnhancementUtils.js';

/**
 * Handles requests for the earthquake cluster sitemap.
 * This sitemap lists URLs for cluster pages, which group multiple earthquakes.
 * URLs are generated based on cluster definitions stored in a D1 database.
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
    // Fetch cluster definitions with slugs and strongest quake IDs.
    const d1Results = await env.DB.prepare(
      "SELECT slug, updatedAt, strongestQuakeId FROM ClusterDefinitions WHERE slug IS NOT NULL AND slug <> '' AND strongestQuakeId IS NOT NULL"
    ).all();

    const clusterDefinitions = d1Results.results;

    if (!clusterDefinitions || clusterDefinitions.length === 0) {
      console.log("No valid cluster definitions found.");
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    // Extract strongest quake IDs to fetch their data in a single batch.
    const strongestQuakeIds = [...new Set(clusterDefinitions.map(def => def.strongestQuakeId))];

    // Fetch the geojson_feature for all strongest quakes.
    const placeholders = strongestQuakeIds.map(() => '?').join(',');
    const quakesQuery = `SELECT id, geojson_feature FROM EarthquakeEvents WHERE id IN (${placeholders})`;
    const quakesStmt = env.DB.prepare(quakesQuery).bind(...strongestQuakeIds);
    const { results: strongestQuakes } = await quakesStmt.all();

    // Create a map for quick lookup of quake data.
    const quakeDataMap = new Map(strongestQuakes.map(q => [q.id, q]));

    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    for (const definition of clusterDefinitions) {
      const strongestQuake = quakeDataMap.get(definition.strongestQuakeId);

      // Only include clusters where the largest quake has a shakemap (is data-enhanced).
      if (strongestQuake && isEventDataEnhanced(strongestQuake)) {
        const updatedTimestamp = definition.updatedAt;
        if (!definition.slug || typeof updatedTimestamp === 'undefined') {
          console.warn(`Skipping cluster due to missing slug or updatedAt:`, definition);
          continue;
        }

        try {
          const lastmodDate = new Date(updatedTimestamp);
          if (isNaN(lastmodDate.getTime())) {
              console.warn(`Invalid 'updatedAt' for slug ${definition.slug}: ${updatedTimestamp}`);
              continue;
          }
          const lastmod = lastmodDate.toISOString();
          const sitemapUrl = `https://earthquakeslive.com/cluster/${definition.slug}`;
          xml += `<url><loc>${escapeXml(sitemapUrl)}</loc><lastmod>${lastmod}</lastmod></url>`;
        } catch (processError) {
          console.error(`Error processing cluster slug ${definition.slug}: ${processError.message}`);
          continue;
        }
      }
    }

    xml += `</urlset>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });

  } catch (error) {
    console.error("Error in handleClustersSitemapRequest (D1 query or general):", error.message);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- Exception processing cluster data from D1: ${escapeXml(error.message)} --></urlset>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
  }
}
