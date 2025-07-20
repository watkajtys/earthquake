// Import D1 utility functions
// Note: Adjusted path assuming worker.js is in src/ and d1Utils.js is in src/utils/
// import { upsertEarthquakeFeaturesToD1 } from './utils/d1Utils.js'; // Used by the KV-enabled proxy too.
import { onRequestGet as handleGetClusterWithQuakes } from '../functions/api/cluster-detail-with-quakes.js';
import { onRequestPost as handlePostCalculateClusters } from '../functions/api/calculate-clusters.POST.js';

// Import the KV-enabled proxy handler
import { handleUsgsProxy as kvEnabledUsgsProxyHandler } from '../functions/routes/api/usgs-proxy.js';

// Import enhanced logging for scheduled tasks
import { createScheduledTaskLogger } from './utils/scheduledTaskLogger.js';

// Import the get-earthquakes handler
import { onRequestGet as handleGetEarthquakes } from '../functions/api/get-earthquakes.js';

// Import the batch USGS fetch handler
import { handleBatchUsgsFetch } from '../functions/api/batch-usgs-fetch.js';

// Import the new paginated earthquakes sitemap handler
import { handleEarthquakesSitemap as handlePaginatedEarthquakesSitemap } from '../functions/routes/sitemaps/earthquakes-sitemap.js';

// Import the cache stats handler
import { onRequestGet as handleGetCacheStats, onRequestDelete as handleDeleteCacheStats } from '../functions/api/cache-stats.js';

// Import monitoring API handlers
import { onRequestGet as handleGetSystemHealth } from '../functions/api/system-health.js';
import { onRequestGet as handleGetTaskMetrics } from '../functions/api/task-metrics.js';
import { onRequestGet as handleGetSystemLogs } from '../functions/api/system-logs.js';

// === Cache Management Functions ===
// Cache management functions removed - cluster cache has been eliminated

// === Helper Functions (originally from [[catchall]].js) ===
const jsonErrorResponse = (message, status, sourceName, upstreamStatus = undefined) => {
  const errorBody = {
    status: "error",
    message: message,
    source: sourceName,
  };
  if (upstreamStatus !== undefined) {
    errorBody.upstream_status = upstreamStatus;
  }
  return new Response(JSON.stringify(errorBody), {
    status: status,
    headers: { "Content-Type": "application/json" },
  });
};

// function slugify(text) {
//   if (!text) return 'unknown-location';
//   const slug = text
//     .toString()
//     .toLowerCase()
//     .replace(/[\s,()/]+/g, '-') // Removed unnecessary escapes
//     .replace(/[^\w-]+/g, '')
//     .replace(/--+/g, '-')
//     .replace(/^-+/, '')
//     .replace(/-+$/, '');
//   return slug || 'unknown-location';
// }

function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') {
    return '';
  }
  return unsafe.replace(/[<>&"']/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

function isCrawler(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  const crawlerRegex = /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot/i;
  return crawlerRegex.test(userAgent);
}

// === Request Handler Functions (originally from [[catchall]].js) ===

// The original handleUsgsProxyRequest is removed/commented out to ensure the KV-enabled one is used.
/*
async function handleUsgsProxyRequest(request, env, ctx, apiUrl) {
  // ... this is the old implementation without KV logic ...
}
*/

// eslint-disable-next-line no-unused-vars
async function handleSitemapIndexRequest(request, env, ctx) { // This is the main sitemap index /sitemap-index.xml
  const sitemapIndexXML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-static-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://earthquakeslive.com/sitemaps/earthquakes-index.xml</loc> {/* Path to the new earthquake sitemap index */}
  </sitemap>
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-clusters.xml</loc>
  </sitemap>
</sitemapindex>`;
  return new Response(sitemapIndexXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=21600" }});
}

// eslint-disable-next-line no-unused-vars
async function handleStaticPagesSitemapRequest(request, env, ctx) {
  // Get current date in YYYY-MM-DD format for lastmod
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(today.getDate()).padStart(2, '0');
  const lastModified = `${year}-${month}-${day}`;

  const staticPages = [
    { loc: "https://earthquakeslive.com/", priority: "1.0", changefreq: "daily", lastmod: lastModified },
    { loc: "https://earthquakeslive.com/overview", priority: "0.9", changefreq: "daily", lastmod: lastModified },
    { loc: "https://earthquakeslive.com/feeds", priority: "0.9", changefreq: "hourly", lastmod: lastModified }, // Feeds page itself might change if new feed types are added
  ];
  const feedPeriods = [
    { period: "last_hour", priority: "0.9", changefreq: "hourly", lastmod: lastModified },
    { period: "last_24_hours", priority: "0.9", changefreq: "hourly", lastmod: lastModified },
    { period: "last_7_days", priority: "0.9", changefreq: "daily", lastmod: lastModified },
    { period: "last_30_days", priority: "0.7", changefreq: "daily", lastmod: lastModified },
  ];
  let urlsXml = "";
  staticPages.forEach(page => { urlsXml += `\n  <url><loc>${page.loc}</loc><lastmod>${page.lastmod}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`; });
  feedPeriods.forEach(feed => { urlsXml += `\n  <url><loc>https://earthquakeslive.com/feeds?activeFeedPeriod=${feed.period}</loc><lastmod>${feed.lastmod}</lastmod><changefreq>${feed.changefreq}</changefreq><priority>${feed.priority}</priority></url>`; });
  urlsXml += `
  <url><loc>https://earthquakeslive.com/learn</loc><lastmod>${lastModified}</lastmod><priority>0.5</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/magnitude-vs-intensity</loc><lastmod>${lastModified}</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/measuring-earthquakes</loc><lastmod>${lastModified}</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/plate-tectonics</loc><lastmod>${lastModified}</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>`;
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlsXml}\n</urlset>`;
  return new Response(sitemapXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=86400" }});
}

// The original handleEarthquakesSitemapRequest (which fetched 2.5_week.geojson) is now removed.
// Its functionality is replaced by handlePaginatedEarthquakesSitemap,
// which reads from D1 and supports pagination.

// eslint-disable-next-line no-unused-vars
async function handleClustersSitemapRequest(request, env, ctx) { // Renamed from handleClustersSitemapRequest to avoid conflict if we import one with same name
  const sourceName = "clusters-sitemap-handler";
  const DB = env.DB;
  let clustersXml = "";
  const currentDate = new Date().toISOString();
  if (!DB) {
    console.error(`[${sourceName}] D1 Database (DB) not available`);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- D1 Database not available -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
  }
  try {
    // Query for slugs and their update timestamps
    const stmt = DB.prepare("SELECT slug, updatedAt FROM ClusterDefinitions WHERE slug IS NOT NULL AND slug <> '' ORDER BY updatedAt DESC LIMIT 500");
    const { results } = await stmt.all();
    if (results && results.length > 0) {
      for (const row of results) {
        const d1Slug = row.slug; // Use slug from the query result
        const lastmod = row.updatedAt ? new Date(row.updatedAt).toISOString() : currentDate;

        // Regex to parse information from the slug, if needed for URL construction or validation
        // This specific regex seems tailored to a certain slug format "overview_cluster_..."
        const slugPatternRegex = /^overview_cluster_([a-zA-Z0-9]+)_(\d+)$/;
        const slugMatch = d1Slug.match(slugPatternRegex);

        // If the slug is expected to always match this pattern for sitemap inclusion:
        if (!slugMatch) {
          // Option 1: If slugs not matching are an error or unexpected, log and skip.
          // console.warn(`[${sourceName}] Slug format does not match expected pattern: ${d1Slug}. Skipping.`);
          // continue;

          // Option 2: If any valid slug from DB should be included, and the pattern is only for specific handling:
          // Proceed with d1Slug directly if it's the canonical path segment.
          // The example below assumes d1Slug IS the canonical path segment.
          // If the slug is NOT `overview_cluster_...` it might use a different URL structure, or this sitemap is only for those.
          // For now, let's assume any slug fetched is valid for a URL.
          // The original code was trying to reconstruct a URL from parts of the slug.
          // If the 'slug' column already stores the *exact* URL segment (e.g., "10-quakes-near-place-m5.0-xyz123"),
          // then we don't need to reconstruct it. The schema has 'slug TEXT UNIQUE NOT NULL'.
          // The original code was trying to parse the slug to fetch MORE data from USGS to build the URL.
          // This is inefficient for sitemap. The sitemap should use canonical URLs already stored or derivable from stored slugs.

          // Re-evaluating: The original code *was* trying to build a human-readable URL from a structured slug.
          // If `row.slug` is already the canonical, final URL path segment (e.g., "10-quakes-near-foo-m5.0-xyz123"), we use it directly.
          // If `row.slug` is something like "overview_cluster_xyz123_10" and this needs to be *transformed*
          // into "10-quakes-near-foo-m5.0-xyz123" for the sitemap, then the parsing and reconstruction is needed.
          // The error is "no such column: clusterId". The query `SELECT slug, updatedAt...` fixes that.
          // The rest of the logic in the original code was for constructing the <loc> URL.
          // Let's assume the `slug` column *is* the canonical path segment to be used in the sitemap.
          // If it's not, the sitemap generation logic for <loc> would need more significant changes.
          // The schema definition `slug TEXT UNIQUE NOT NULL` suggests it's meant for direct use.

          // Based on the original code's attempt to reconstruct the URL, it implies `d1Slug` (formerly d1ClusterId)
          // was of the format `overview_cluster_...` and this was then used to fetch details to build a *different* URL format.
          // This is complex for a sitemap. A better approach is to ensure `ClusterDefinitions.slug` stores the *actual* canonical URL path segment.
          // For this fix, I will assume `row.slug` IS the correct path segment.

          const sitemapUrlPath = d1Slug.startsWith('/') ? d1Slug.substring(1) : d1Slug;
          const sitemapUrl = `https://earthquakeslive.com/cluster/${sitemapUrlPath}`;
          clustersXml += `\n  <url><loc>${escapeXml(sitemapUrl)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
          continue; // Skip the more complex reconstruction if the simple slug is enough
        }

        // If we must proceed with reconstruction (original logic path):
        const strongestQuakeIdFromDb = slugMatch[1];
        const quakeCountFromDb = slugMatch[2];
        let quakeData;
        try {
          const usgsUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${strongestQuakeIdFromDb}.geojson`;
          const response = await fetch(usgsUrl);
          if (!response.ok) { console.warn(`[${sourceName}] USGS fetch failed for ${strongestQuakeIdFromDb}: ${response.status} ${response.statusText}. Skipping.`); continue; }
          quakeData = await response.json();
        } catch (fetchError) { console.error(`[${sourceName}] Error fetching USGS data for ${strongestQuakeIdFromDb}: ${fetchError.message}. Skipping.`); continue; }
        if (!quakeData || !quakeData.properties) { console.warn(`[${sourceName}] Invalid or missing properties in USGS data for ${strongestQuakeIdFromDb}. Skipping.`); continue; }
        const locationName = quakeData.properties.place;
        const maxMagnitude = quakeData.properties.mag;
        if (!locationName || typeof locationName !== 'string') { console.warn(`[${sourceName}] Missing or invalid locationName for ${strongestQuakeIdFromDb}. Skipping.`); continue; }
        if (maxMagnitude === null || maxMagnitude === undefined || typeof maxMagnitude !== 'number') { console.warn(`[${sourceName}] Missing or invalid maxMagnitude for ${strongestQuakeIdFromDb}. Skipping.`); continue; }
        const locationSlug = locationName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const newUrl = `https://earthquakeslive.com/cluster/${quakeCountFromDb}-quakes-near-${locationSlug}-up-to-m${maxMagnitude.toFixed(1)}-${strongestQuakeIdFromDb}`;
        clustersXml += `\n  <url><loc>${escapeXml(newUrl)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
      }
    } else { console.log(`[${sourceName}] No cluster definitions found in D1 table ClusterDefinitions.`); }
  } catch (error) {
    console.error(`[${sourceName}] Exception querying or processing cluster data from D1: ${error.message}`, error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Exception processing cluster data from D1: ${escapeXml(error.message)} -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
  }
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${clustersXml}\n</urlset>`;
  return new Response(sitemapXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=10800" }});
}

async function handlePrerenderEarthquake(request, env, ctx, quakeIdPathSegment) {
  const sourceName = "prerender-earthquake";
  const siteUrl = "https://earthquakeslive.com";
  try {
    const parts = quakeIdPathSegment ? quakeIdPathSegment.split('-') : [];
    const usgsId = parts.length > 1 ? parts[parts.length - 1] : null;
    if (!usgsId) {
      console.error(`[${sourceName}] Could not extract usgs-id from quakeIdPathSegment: ${quakeIdPathSegment}`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Invalid earthquake identifier.</body></html>`, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
    }
    const detailUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${usgsId}.geojson`;
    const response = await fetch(detailUrl);
    if (!response.ok) {
      console.error(`[${sourceName}] Failed to fetch earthquake data from ${detailUrl} (USGS ID: ${usgsId}): ${response.status}`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Earthquake data not found.</body></html>`, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
    }
    const quakeData = await response.json();
    if (!quakeData || !quakeData.properties || !quakeData.geometry) {
      console.error(`[${sourceName}] Invalid earthquake data structure from ${detailUrl} (USGS ID: ${usgsId})`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Invalid earthquake data.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
    }
    const {mag, place, time} = quakeData.properties;
    const dateObj = new Date(time);
    const readableTime = dateObj.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' });
    const isoTime = dateObj.toISOString();
    const depth = quakeData.geometry.coordinates[2];
    const lat = quakeData.geometry.coordinates[1];
    const lon = quakeData.geometry.coordinates[0];
    const canonicalUrl = `${siteUrl}/quake/${quakeIdPathSegment}`;
    const usgsEventUrl = quakeData.properties.detail;
    const titleDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const pageTitle = `M ${mag} Earthquake - ${place} - ${titleDate} | Earthquakes Live`;
    const description = `Detailed report of the M ${mag} earthquake that struck near ${place} on ${titleDate} at ${dateObj.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'})} (UTC). Magnitude: ${mag}, Depth: ${depth} km. Location: ${lat.toFixed(2)}, ${lon.toFixed(2)}. Stay updated with Earthquakes Live.`;
    let significanceSentence = `This earthquake occurred at a depth of ${depth} km.`;
    if (depth < 70) significanceSentence = `This shallow earthquake (depth: ${depth} km) may have been felt by many people in the area.`;
    else if (depth > 300) significanceSentence = `This earthquake occurred very deep (depth: ${depth} km).`;

    // Format date for keywords: "month day year" e.g., "june 20 2025"
    const keywordDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const keywordDateString = keywordDateFormatter.format(dateObj).toLowerCase();

    const baseKeywords = `earthquake, ${place ? place.split(', ').join(', ') : ''}, M${mag}, seismic event, earthquake report`;
    const keywords = `${baseKeywords}, ${keywordDateString}`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": `M ${mag} - ${place}`,
      "description": description,
      "startDate": isoTime,
      "endDate": isoTime, // Setting endDate same as startDate for simplicity
      "eventStatus": "https://schema.org/EventHappened",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "location": {
        "@type": "Place",
        "name": place,
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": lat,
          "longitude": lon,
          "elevation": -depth * 1000 // Schema.org uses meters for elevation, depth is in km
        }
      },
      "image": [
        "https://earthquakeslive.com/social-default-earthquake.png"
      ],
      "organizer": {
        "@type": "Organization",
        "name": "Earthquakes Live",
        "url": "https://earthquakeslive.com"
      },
      "identifier": quakeData.id,
      "url": canonicalUrl,
      "keywords": keywords.toLowerCase()
    };
    if (usgsEventUrl) jsonLd.sameAs = usgsEventUrl;

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeXml(pageTitle)}</title><meta name="description" content="${escapeXml(description)}"><meta name="keywords" content="${escapeXml(keywords.toLowerCase())}"><link rel="canonical" href="${escapeXml(canonicalUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@builtbyvibes"><meta property="og:title" content="${escapeXml(pageTitle)}"><meta property="og:description" content="${escapeXml(description)}"><meta property="og:url" content="${escapeXml(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png"><script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script></head><body><h1>${escapeXml(pageTitle)}</h1><p><strong>Time:</strong> ${escapeXml(readableTime)}</p><p><strong>Location:</strong> ${escapeXml(place)}</p><p><strong>Coordinates:</strong> ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</p><p><strong>Magnitude:</strong> M ${mag}</p><p><strong>Depth:</strong> ${depth} km</p><p>${escapeXml(significanceSentence)}</p>${usgsEventUrl ? `<p><a href="${escapeXml(usgsEventUrl)}" target="_blank" rel="noopener noreferrer">View on USGS Event Page</a></p>` : ''}<div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  } catch (error) {
    console.error(`[${sourceName}] Error: ${error.message}`, error);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering earthquake page.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  }
}

async function handlePrerenderCluster(request, env, ctx, urlSlugParam) {
  const sourceName = "prerender-cluster";
  const siteUrl = "https://earthquakeslive.com";
  const urlSlug = urlSlugParam;
  const slugRegex = /^(\d+)-quakes-near-.*?([a-zA-Z0-9]+)$/;
  const match = urlSlug.match(slugRegex);
  if (!match) {
    console.warn(`[${sourceName}] Invalid cluster URL slug format: ${urlSlug}`);
    return new Response(`<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Invalid cluster URL format.</body></html>`, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  }
  const extractedCount = match[1];
  const extractedStrongestQuakeId = match[2];
  const clusterIdForD1Query = `overview_cluster_${extractedStrongestQuakeId}_${extractedCount}`;
  if (!env.DB) {
    console.error(`[${sourceName}] D1 Database (env.DB) not configured for prerendering cluster.`);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Service configuration error.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  }
  try {
    // Use 'slug' to query, as clusterIdForD1Query is a slug.
    // Align selected columns with prerender-cluster.integration.test.js expectations
    const stmt = env.DB.prepare("SELECT id, slug, title, description, earthquakeIds, strongestQuakeId, updatedAt, locationName, maxMagnitude, startTime, endTime, quakeCount FROM ClusterDefinitions WHERE slug = ?").bind(clusterIdForD1Query);
    const clusterInfo = await stmt.first();
    if (!clusterInfo) {
      console.warn(`[${sourceName}] Cluster definition not found in D1 for slug: ${clusterIdForD1Query} (derived from URL slug: ${urlSlug})`);
      return new Response(`<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Cluster not found.</body></html>`, { status: 404, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
    }
    let earthquakeIds;
    try { earthquakeIds = typeof clusterInfo.earthquakeIds === 'string' ? JSON.parse(clusterInfo.earthquakeIds) : clusterInfo.earthquakeIds; }
    catch (e) { console.error(`[${sourceName}] Error parsing earthquakeIds for D1 Query ID ${clusterIdForD1Query}: ${e.message}`); return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error processing cluster data.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }}); }
    const d1StrongestQuakeId = clusterInfo.strongestQuakeId;
    const { updatedAt } = clusterInfo;
    const numEvents = earthquakeIds ? earthquakeIds.length : 0;
    const canonicalUrl = `${siteUrl}/cluster/${urlSlug}`;
    const formattedUpdatedAt = new Date(updatedAt).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' });
    let strongestQuakeDetails = null, pageTitle, description, bodyContent, keywords;
    if (d1StrongestQuakeId) {
      try {
        const quakeDetailUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${d1StrongestQuakeId}.geojson`;
        const res = await fetch(quakeDetailUrl);
        if (res.ok) {
          const quakeData = await res.json();
          if (quakeData && quakeData.properties) { strongestQuakeDetails = { mag: quakeData.properties.mag, place: quakeData.properties.place, time: new Date(quakeData.properties.time).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' }), id: quakeData.id, url: quakeData.properties.detail, latitude: quakeData.geometry?.coordinates?.[1], longitude: quakeData.geometry?.coordinates?.[0] }; }
        } else { console.warn(`[${sourceName}] Failed to fetch strongest quake details for ${d1StrongestQuakeId}: ${res.status}`); }
      } catch (e) { console.error(`[${sourceName}] Error fetching strongest quake details for ${d1StrongestQuakeId}: ${e.message}`); }
    }
    if (strongestQuakeDetails) {
      pageTitle = `Earthquake Cluster near ${strongestQuakeDetails.place} | Earthquakes Live`;
      description = `Explore an active earthquake cluster near ${strongestQuakeDetails.place}, featuring ${numEvents} seismic events. The largest event in this sequence is a M ${strongestQuakeDetails.mag}. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${strongestQuakeDetails.place ? strongestQuakeDetails.place.split(', ').join(', ') : ''}, tectonic activity, M${strongestQuakeDetails.mag}`;
      bodyContent = `<p>This page provides details about an earthquake cluster located near <strong>${escapeXml(strongestQuakeDetails.place)}</strong>.</p><p>This cluster contains <strong>${numEvents}</strong> individual seismic events.</p><p>The most significant earthquake in this cluster is a <strong>M ${strongestQuakeDetails.mag}</strong>, which occurred on ${escapeXml(strongestQuakeDetails.time)}.</p>${strongestQuakeDetails.url ? `<p><a href="${escapeXml(strongestQuakeDetails.url)}" target="_blank" rel="noopener noreferrer">View details for the largest event on USGS</a></p>` : ''}<p><em>Cluster information last updated: ${escapeXml(formattedUpdatedAt)}.</em></p>`;
    } else {
      pageTitle = `Earthquake Cluster Summary (${numEvents} Events) | Earthquakes Live`;
      description = `Details of an earthquake cluster containing ${numEvents} seismic events. This cluster is identified by the strongest quake ID: ${extractedStrongestQuakeId}. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${extractedStrongestQuakeId}, tectonic activity`;
      bodyContent = `<p>This page provides details about an earthquake cluster associated with the primary event ID <strong>${escapeXml(extractedStrongestQuakeId)}</strong>.</p><p>This cluster contains <strong>${numEvents}</strong> individual seismic events.</p><p><em>Cluster information last updated: ${escapeXml(formattedUpdatedAt)}.</em></p><p><em>Further details about the most significant event in this cluster are currently unavailable.</em></p>`;
    }
    const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: pageTitle, description, url: canonicalUrl, dateModified: new Date(updatedAt).toISOString(), keywords: keywords.toLowerCase() };
    if (strongestQuakeDetails) {
      jsonLd.about = { "@type": "Event", name: `M ${strongestQuakeDetails.mag} - ${strongestQuakeDetails.place}`, identifier: strongestQuakeDetails.id, ... (strongestQuakeDetails.url && { url: strongestQuakeDetails.url }) };
      if (typeof strongestQuakeDetails.latitude === 'number' && typeof strongestQuakeDetails.longitude === 'number') { jsonLd.location = { "@type": "Place", name: strongestQuakeDetails.place, geo: { "@type": "GeoCoordinates", latitude: strongestQuakeDetails.latitude, longitude: strongestQuakeDetails.longitude }}; }
    }
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeXml(pageTitle)}</title><meta name="description" content="${escapeXml(description)}"><meta name="keywords" content="${escapeXml(keywords.toLowerCase())}"><link rel="canonical" href="${escapeXml(canonicalUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@builtbyvibes"><meta property="og:title" content="${escapeXml(pageTitle)}"><meta property="og:description" content="${escapeXml(description)}"><meta property="og:url" content="${escapeXml(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png"><script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script></head><body><h1>${escapeXml(pageTitle)}</h1>${bodyContent}<p>Explore the live map and detailed list of events in this cluster on our interactive platform.</p><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=1800" }});
  } catch (error) {
    console.error(`[${sourceName}] Error processing cluster slug ${urlSlug} (D1 ID: ${clusterIdForD1Query || 'not_constructed'}): ${error.message}`, error);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering cluster page.</body></html>`, { status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }});
  }
}

async function handleEarthquakeDetailRequest(request, env, ctx, event_id) {
  const sourceName = "earthquake-detail-handler";
  const DATA_FRESHNESS_THRESHOLD_MS = 60 * 60 * 1000;
  const DB = env.DB;

  if (!DB) {
    console.error(`[${sourceName}] D1 Database (DB) not configured for event: ${event_id}. Proceeding to USGS fetch only.`);
  } else {
    try {
      console.log(`[${sourceName}] Querying D1 for event: ${event_id}`);
      const stmt = DB.prepare("SELECT geojson_feature, retrieved_at FROM EarthquakeEvents WHERE id = ?").bind(event_id);
      const result = await stmt.first();
      if (result && result.retrieved_at && (Date.now() - result.retrieved_at < DATA_FRESHNESS_THRESHOLD_MS)) {
        console.log(`[${sourceName}] Fresh data found in D1 for event: ${event_id}. Freshness: ${Date.now() - result.retrieved_at}ms.`);
        return new Response(result.geojson_feature, { headers: { 'Content-Type': 'application/json', 'X-Data-Source': 'D1-Cache' }});
      }
      if (result) console.log(`[${sourceName}] Data for event ${event_id} found in D1 but is stale (retrieved_at: ${result.retrieved_at}). Proceeding to USGS fetch.`);
      else console.log(`[${sourceName}] Event ${event_id} not found in D1. Proceeding to USGS fetch.`);
    } catch (d1Error) {
      console.error(`[${sourceName}] D1 query error for event ${event_id}: ${d1Error.message}. Falling back to USGS.`, d1Error);
    }
  }

  try {
    const usgsUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${event_id}.geojson`;
    console.log(`[${sourceName}] Fetching event ${event_id} from USGS: ${usgsUrl}`);
    let usgsResponse;
    try { usgsResponse = await fetch(usgsUrl); }
    catch (fetchError) { console.error(`[${sourceName}] USGS API fetch failed for ${usgsUrl}: ${fetchError.message}`, fetchError); return jsonErrorResponse(`USGS API fetch failed: ${fetchError.message}`, 502, sourceName); }

    if (!usgsResponse.ok) {
      console.error(`[${sourceName}] Error fetching data from USGS API (${usgsUrl}): ${usgsResponse.status} ${usgsResponse.statusText}`);
      return jsonErrorResponse(`Error fetching data from USGS API: ${usgsResponse.status} ${usgsResponse.statusText}`, 502, sourceName, usgsResponse.status);
    }
    const geojsonFeature = await usgsResponse.json();

    if (DB) {
      const retrieved_at = Date.now();
      const geojson_feature_string = JSON.stringify(geojsonFeature);
      const id = geojsonFeature.id;
      const event_time = geojsonFeature.properties?.time;
      const latitude = geojsonFeature.geometry?.coordinates?.[1];
      const longitude = geojsonFeature.geometry?.coordinates?.[0];
      const depth = geojsonFeature.geometry?.coordinates?.[2];
      const magnitude = geojsonFeature.properties?.mag;
      const place = geojsonFeature.properties?.place;

      if (id == null || event_time == null || latitude == null || longitude == null || depth == null || magnitude == null || place == null) {
        console.warn(`[${sourceName}] Skipping D1 upsert for event ${id} due to missing critical GeoJSON properties.`);
      } else {
        const usgs_detail_json_url = usgsUrl;
        const upsertStmt = `INSERT INTO EarthquakeEvents (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, geojson_feature, retrieved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET event_time=excluded.event_time, latitude=excluded.latitude, longitude=excluded.longitude, depth=excluded.depth, magnitude=excluded.magnitude, place=excluded.place, usgs_detail_url=excluded.usgs_detail_url, geojson_feature=excluded.geojson_feature, retrieved_at=excluded.retrieved_at;`;
        const d1WritePromise = DB.prepare(upsertStmt).bind(id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_json_url, geojson_feature_string, retrieved_at).run()
          .then(({ success, error }) => {
            if (success) console.log(`[${sourceName}] Successfully upserted event ${id} into D1 from USGS fallback.`);
            else console.error(`[${sourceName}] Failed to upsert event ${id} into D1 from USGS fallback: ${error}`);
          }).catch(err => console.error(`[${sourceName}] Exception during D1 upsert for event ${id} from USGS fallback: ${err.message}`, err));
        ctx.waitUntil(d1WritePromise);
      }
    } else { console.log(`[${sourceName}] DB not available, skipping D1 upsert for event ${event_id} after USGS fetch.`); }
    return new Response(JSON.stringify(geojsonFeature), { headers: { 'Content-Type': 'application/json', 'X-Data-Source': 'USGS-API' }});
  } catch (usgsOrGeneralError) {
    console.error(`[${sourceName}] Error during USGS fetch/processing or other general error for event ${event_id}: ${usgsOrGeneralError.message}`, usgsOrGeneralError);
    return jsonErrorResponse(`Error processing earthquake detail request: ${usgsOrGeneralError.message}`, 500, sourceName);
  }
}


// === Main Exported Worker Object ===

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Prerendering for crawlers
    if (isCrawler(request)) {
      if (pathname.startsWith("/quake/")) {
        const quakeIdPathSegment = pathname.substring("/quake/".length);
        if (quakeIdPathSegment) return handlePrerenderEarthquake(request, env, ctx, quakeIdPathSegment);
      } else if (pathname.startsWith("/cluster/")) {
        const clusterId = pathname.substring("/cluster/".length);
        if (clusterId) return handlePrerenderCluster(request, env, ctx, clusterId);
      }
    }

    // Sitemap routes
    if (pathname === "/sitemap-index.xml") return handleSitemapIndexRequest(request, env, ctx);
    if (pathname === "/sitemap-static-pages.xml") return handleStaticPagesSitemapRequest(request, env, ctx);
    // Route for the new earthquake sitemap index and paginated sitemaps (reverted to /sitemaps/ prefix)
    if (pathname === "/sitemaps/earthquakes-index.xml" || pathname.startsWith("/sitemaps/earthquakes-")) {

      return handlePaginatedEarthquakesSitemap({ request, env, ctx });
    }
    if (pathname === "/sitemap-clusters.xml") return handleClustersSitemapRequest(request, env, ctx);

    // API routes
    if (pathname === "/api/usgs-proxy") {
      // Call the imported KV-enabled proxy handler
      // Pass the entire ctx as executionContext, consistent with scheduled handler
      return kvEnabledUsgsProxyHandler({ request, env, executionContext: ctx });
    }
    if (pathname.startsWith("/api/earthquake/")) {
      const parts = pathname.split('/');
      if (parts.length === 4 && parts[3]) {
        try {
          const event_id = decodeURIComponent(parts[3]);
          return handleEarthquakeDetailRequest(request, env, ctx, event_id);
        } catch (e) {
          if (e instanceof URIError) return jsonErrorResponse("Invalid event_id encoding", 400, "worker-router-earthquake-decode");
          console.error(`[worker-fetch-earthquake] Unexpected error: ${e.message}`, e);
          return jsonErrorResponse("Error processing earthquake request", 500, "worker-router-earthquake-unexpected");
        }
      } else {
        return jsonErrorResponse("Invalid earthquake event ID path", 400, "worker-router-earthquake-format");
      }
    }

    if (pathname === '/api/cluster-detail-with-quakes' && request.method === 'GET') {
      return handleGetClusterWithQuakes({ request, env, ctx });
    }

    if (pathname === '/api/calculate-clusters' && request.method === 'POST') {
      return handlePostCalculateClusters({ request, env, ctx });
    }

    if (pathname === '/api/get-earthquakes' && request.method === 'GET') {
      // Note: handleGetEarthquakes is an onRequestGet style handler,
      // so it expects a context object similar to Pages Functions.
      // We pass { request, env, ctx } to provide necessary bindings and execution context.
      return handleGetEarthquakes({ request, env, ctx });
    }

    if (pathname === '/api/batch-usgs-fetch' && request.method === 'GET') {
      // This new endpoint is for manually triggering historical data fetches.
      // It expects 'startDate' and 'endDate' query parameters.
      return handleBatchUsgsFetch({ request, env, ctx });
    }

    if (pathname === '/api/cache-stats') {
      if (request.method === 'GET') {
        return handleGetCacheStats({ request, env, ctx });
      } else if (request.method === 'DELETE') {
        return handleDeleteCacheStats({ request, env, ctx });
      } else {
        return new Response('Method Not Allowed', { 
          status: 405, 
          headers: { 'Allow': 'GET, DELETE' } 
        });
      }
    }

    if (pathname === '/api/system-health' && request.method === 'GET') {
      return handleGetSystemHealth({ request, env, ctx });
    }

    if (pathname === '/api/task-metrics' && request.method === 'GET') {
      return handleGetTaskMetrics({ request, env, ctx });
    }

    if (pathname === '/api/system-logs' && request.method === 'GET') {
      return handleGetSystemLogs({ request, env, ctx });
    }

    // Serve static assets from ASSETS binding
    try {
      if (!env.ASSETS) {
        console.error("[worker-fetch] env.ASSETS binding is not available.");
        return new Response("Static asset serving is not configured.", { status: 500 });
      }
      // Attempt to fetch the request directly from the ASSETS binding.
      // This will serve static files like CSS, JS, images, and also index.html for SPA routes
      // if 'not_found_handling = "single-page-application"' is correctly configured for the [assets] in wrangler.toml.
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(`[worker-fetch] Error fetching from ASSETS for ${pathname}: ${e.message}`, e);
      return new Response("An error occurred while serving static assets.", { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    // Initialize enhanced logging for this scheduled task execution
    const logger = createScheduledTaskLogger('usgs-data-sync', event.scheduledTime);
    
    logger.addContext('environment', {
      hasDB: !!env.DB,
      hasUsgsKV: !!env.USGS_LAST_RESPONSE_KV,
      workerVersion: 'scheduled-v1.0'
    });

    // Check for required environment bindings
    if (!env.DB) {
      logger.logError('MISSING_BINDING', 'D1 Database (DB) binding not found', { binding: 'DB' }, true);
      logger.logTaskCompletion(false, { error: 'Missing required DB binding' });
      return;
    }

    logger.logMilestone('Environment validation passed', { 
      dbAvailable: true, 
      kvAvailable: !!env.USGS_LAST_RESPONSE_KV 
    });

    const USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
    const proxyRequestUrl = `https://dummy-host/api/usgs-proxy?apiUrl=${encodeURIComponent(USGS_FEED_URL)}&isCron=true`;
    
    logger.addContext('apiEndpoint', {
      usgsUrl: USGS_FEED_URL,
      proxyUrl: proxyRequestUrl,
      feedType: 'all_hour'
    });

    logger.logMilestone('Starting USGS data fetch process', { usgsUrl: USGS_FEED_URL });

    try {
      // Create timer for proxy request setup
      const setupTimer = logger.createTimer('proxy-request-setup');
      
      // Construct a Request object as expected by the kvEnabledUsgsProxyHandler
      const scheduledRequest = new Request(proxyRequestUrl, {
        method: "GET",
        headers: {
          "User-Agent": "CloudflareWorker-ScheduledTask/1.0",
          "X-Execution-ID": logger.executionId, // Add execution ID for tracing
        }
      });

      setupTimer({ success: true, requestMethod: 'GET' });
      logger.logMilestone('Request object created', { userAgent: 'CloudflareWorker-ScheduledTask/1.0' });

      // Track proxy call timing
      const proxyStartTime = Date.now();

      // Call the KV-enabled proxy handler directly with enhanced error handling
      ctx.waitUntil(
        kvEnabledUsgsProxyHandler({
          request: scheduledRequest,
          env: env,
          executionContext: ctx,
          logger: logger // Pass logger to proxy handler for enhanced logging
        })
        .then(response => {
          const proxyEndTime = Date.now();

          // Log the proxy API call with detailed metrics
          logger.logApiCall(
            USGS_FEED_URL,
            proxyStartTime,
            proxyEndTime,
            response.status,
            null, // Response size not easily available here
            'GET'
          );

          if (response.ok) {
            logger.logMilestone('USGS proxy call successful', {
              status: response.status,
              duration: proxyEndTime - proxyStartTime
            });

            // Try to extract metrics from response headers if available
            const cacheInfo = response.headers.get('X-Cache-Info');
            const processingInfo = response.headers.get('X-Processing-Info');

            if (cacheInfo || processingInfo) {
              logger.addContext('responseHeaders', { cacheInfo, processingInfo });
            }

            logger.logTaskCompletion(true, {
              proxyStatus: response.status,
              proxyDuration: proxyEndTime - proxyStartTime,
              message: 'USGS data synchronization completed successfully'
            });
          } else {
            // Handle non-200 responses with detailed error logging
            response.text().then(text => {
              logger.logError('PROXY_HTTP_ERROR', `HTTP ${response.status}`, {
                status: response.status,
                statusText: response.statusText,
                responseBody: text,
                duration: proxyEndTime - proxyStartTime
              }, true);
              
              logger.logTaskCompletion(false, { 
                error: `Proxy returned HTTP ${response.status}`,
                responseBody: text
              });
            }).catch(textError => {
              logger.logError('PROXY_HTTP_ERROR', `HTTP ${response.status} (unable to read response)`, {
                status: response.status,
                statusText: response.statusText,
                textError: textError.message,
                duration: proxyEndTime - proxyStartTime
              }, true);

              logger.logTaskCompletion(false, {
                error: `Proxy returned HTTP ${response.status}, unable to read response body`
              });
            });
          }
        })
        .catch(err => {
          const proxyEndTime = Date.now();

          logger.logError('PROXY_EXECUTION_ERROR', err, {
            duration: proxyEndTime - proxyStartTime,
            proxyUrl: proxyRequestUrl,
            usgsUrl: USGS_FEED_URL
          }, true);

          logger.logTaskCompletion(false, {
            error: 'Proxy handler execution failed',
            errorMessage: err.message
          });
        })
      );

    } catch (error) {
      logger.logError('SETUP_ERROR', error, {
        stage: 'request-setup',
        usgsUrl: USGS_FEED_URL
      }, true);
      
      logger.logTaskCompletion(false, { 
        error: 'Failed to setup scheduled proxy call',
        errorMessage: error.message
      });
    }
  }
};
