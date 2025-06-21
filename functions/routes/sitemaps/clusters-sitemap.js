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
    // Fetch the canonical slug and updatedAt timestamp for each cluster definition.
    // The slug is the part of the URL path after '/cluster/'.
    // Ensures that only entries with valid slugs are included.
    const d1Results = await env.DB.prepare(
      "SELECT slug, updatedAt FROM ClusterDefinitions WHERE slug IS NOT NULL AND slug <> ''"
    ).all();

    const clusterDefinitions = d1Results.results;

    if (!clusterDefinitions || clusterDefinitions.length === 0) {
      console.log("No valid cluster definitions with slugs found in D1 table ClusterDefinitions.");
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: { "Content-Type": "application/xml" } });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    for (const definition of clusterDefinitions) {
      // Prioritize definition.updatedAt as it's directly selected. Fallback for 'updated' can be removed if 'updatedAt' is standard.
      const updatedTimestamp = definition.updatedAt || definition.updated;

      if (!definition.slug || typeof updatedTimestamp === 'undefined') {
        // This check might be redundant due to the SQL WHERE clause, but kept as a safeguard.
        console.warn(`Invalid definition from D1 (missing slug or updatedAt):`, definition);
        continue;
      }

      try {
        const lastmodDate = new Date(updatedTimestamp);
        if (isNaN(lastmodDate.getTime())) {
            console.warn(`Invalid 'updatedAt' date format for slug ${definition.slug}: ${updatedTimestamp}`);
            continue;
        }
        const lastmod = lastmodDate.toISOString();

        // Construct the full sitemap URL using the canonical slug.
        // Ensure no double slashes if slug might start with one (though typically it shouldn't).
        const sitemapUrlPath = definition.slug.startsWith('/') ? definition.slug.substring(1) : definition.slug;
        const sitemapUrl = `https://earthquakeslive.com/cluster/${sitemapUrlPath}`;

        xml += `<url><loc>${escapeXml(sitemapUrl)}</loc><lastmod>${lastmod}</lastmod></url>`;

      } catch (processError) {
        console.error(`Error processing definition for slug ${definition.slug} in cluster sitemap: ${processError.message}`);
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
