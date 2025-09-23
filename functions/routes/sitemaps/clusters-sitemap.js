/**
 * @file Generates the sitemap for earthquake cluster pages (sitemap-clusters.xml).
 */
import { escapeXml } from '../../utils/xml-utils.js';

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
    // Fetch all cluster definitions with a slug.
    const clusterDefinitionsResults = await env.DB.prepare(
      "SELECT id, slug, updatedAt, earthquakeIds FROM ClusterDefinitions WHERE slug IS NOT NULL AND slug <> ''"
    ).all();

    const clusterDefinitions = clusterDefinitionsResults.results;

    if (!clusterDefinitions || clusterDefinitions.length === 0) {
      console.log("No valid cluster definitions with slugs found.");
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    // Get all earthquake IDs from the clusters.
    const allEarthquakeIds = new Set();
    const clusterIdToQuakeIds = new Map();

    for (const definition of clusterDefinitions) {
      try {
        const quakeIds = JSON.parse(definition.earthquakeIds || '[]');
        if (Array.isArray(quakeIds) && quakeIds.length > 0) {
          clusterIdToQuakeIds.set(definition.id, new Set(quakeIds));
          quakeIds.forEach(id => allEarthquakeIds.add(id));
        }
      } catch (e) {
        console.warn(`Failed to parse earthquakeIds for cluster ${definition.id}: ${e.message}`);
      }
    }

    if (allEarthquakeIds.size === 0) {
        console.log("No earthquake IDs found in any clusters.");
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    // Find all significant earthquakes from the list of IDs.
    const significantQuakeIds = new Set();
    const queryPlaceholders = Array.from(allEarthquakeIds).map(() => '?').join(',');
    const significantQuakesResults = await env.DB.prepare(
        `SELECT id FROM EarthquakeEvents WHERE id IN (${queryPlaceholders}) AND (
            COALESCE(has_shakemap, 0) +
            COALESCE(has_moment_tensor, 0) +
            COALESCE(has_focal_mechanism, 0) +
            COALESCE(has_dyfi, 0) +
            COALESCE(has_losspager, 0) +
            COALESCE(has_finite_fault, 0)
        ) >= 3`
    ).bind(...allEarthquakeIds).all();

    if (significantQuakesResults.results) {
        significantQuakesResults.results.forEach(row => significantQuakeIds.add(row.id));
    }

    // Filter clusters to only those containing at least one significant quake.
    const significantClusterDefs = clusterDefinitions.filter(def => {
        const quakeIdsForCluster = clusterIdToQuakeIds.get(def.id);
        if (!quakeIdsForCluster) return false;
        for (const quakeId of quakeIdsForCluster) {
            if (significantQuakeIds.has(quakeId)) {
                return true; // Found a significant quake in this cluster
            }
        }
        return false;
    });

    if (significantClusterDefs.length === 0) {
        console.log("No clusters with significant earthquakes found.");
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    for (const definition of significantClusterDefs) {
      const updatedTimestamp = definition.updatedAt || definition.updated;
      if (!definition.slug || typeof updatedTimestamp === 'undefined') {
        continue;
      }
      try {
        const lastmodDate = new Date(updatedTimestamp);
        if (isNaN(lastmodDate.getTime())) {
            console.warn(`Invalid 'updatedAt' date format for slug ${definition.slug}: ${updatedTimestamp}`);
            continue;
        }
        const lastmod = lastmodDate.toISOString();
        const sitemapUrlPath = definition.slug.startsWith('/') ? definition.slug.substring(1) : definition.slug;
        const sitemapUrl = `https://earthquakeslive.com/cluster/${sitemapUrlPath}`;
        xml += `<url><loc>${escapeXml(sitemapUrl)}</loc><lastmod>${lastmod}</lastmod></url>`;
      } catch (processError) {
        console.error(`Error processing definition for slug ${definition.slug}: ${processError.message}`);
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
