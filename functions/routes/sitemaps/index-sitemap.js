import {
  EARTHQUAKE_SITEMAP_BINDINGS,
  EARTHQUAKE_SITEMAP_PAGE_SIZE,
  EARTHQUAKE_SITEMAP_WHERE,
} from './earthquake-sitemap-eligibility.js';

var BASE_URL = "https://earthquakeslive.com";
async function handleIndexSitemap(context) {
  const { env } = context;
  let earthquakeSitemapEntries = "";
  if (!env.DB) return new Response('Sitemap database unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM EarthquakeEvents WHERE ${EARTHQUAKE_SITEMAP_WHERE}`,
    ).bind(...EARTHQUAKE_SITEMAP_BINDINGS).all();
    if (countResult?.success !== true || !Array.isArray(countResult.results)) throw new Error('Sitemap count query failed');
    const total = countResult.results?.[0]?.total;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid sitemap event count');
    const totalPages = Math.ceil(total / EARTHQUAKE_SITEMAP_PAGE_SIZE);
    for (let i = 1; i <= totalPages; i++) {
      earthquakeSitemapEntries += `  <sitemap><loc>${BASE_URL}/sitemaps/earthquakes-${i}.xml</loc></sitemap>\n`;
    }
  } catch (error) {
    console.error('Error counting earthquake sitemap entries:', error);
    return new Response('Sitemap database unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap-static-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${BASE_URL}/sitemap-clusters.xml</loc>
  </sitemap>
${earthquakeSitemapEntries.trimEnd()}
</sitemapindex>`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}

export { handleIndexSitemap };
