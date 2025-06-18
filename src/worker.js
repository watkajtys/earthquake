// Import D1 utility functions
// Note: Adjusted path assuming worker.js is in src/ and d1Utils.js is in src/utils/
import { upsertEarthquakeFeaturesToD1 } from './utils/d1Utils.js';

// Import API Handlers
import { onRequestGet as handleGetEarthquakes } from '../functions/api/get-earthquakes.js';
import { onRequestPost as handleCalculateClusters } from '../functions/api/calculate-clusters.js';
import { onRequest as handleClusterDefinition } from '../functions/api/cluster-definition.js';

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

function slugify(text) {
  if (!text) return 'unknown-location';
  const slug = text
    .toString()
    .toLowerCase()
    .replace(/[\s,()/]+/g, '-') // Removed unnecessary escapes
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return slug || 'unknown-location';
}

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

async function handleUsgsProxyRequest(request, env, ctx, apiUrl) {
  const sourceName = "usgs-proxy-handler";
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = '/cache/usgs-proxy';
  cacheUrl.searchParams.set("actualApiUrl", apiUrl);
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log(`Cache hit for: ${apiUrl}`);
      return cachedResponse;
    }

    console.log(`Cache miss for: ${apiUrl}. Fetching from origin.`);
    let externalResponse;
    try {
      externalResponse = await fetch(apiUrl);
    } catch (error) {
      console.error(`USGS API fetch failed for ${apiUrl}: ${error.message}`, error);
      return jsonErrorResponse(`USGS API fetch failed: ${error.message}`, 500, sourceName);
    }

    if (!externalResponse.ok) {
      console.error(`Error fetching data from USGS API (${apiUrl}): ${externalResponse.status} ${externalResponse.statusText}`);
      return jsonErrorResponse(
        `Error fetching data from USGS API: ${externalResponse.status} ${externalResponse.statusText}`,
        externalResponse.status,
        sourceName,
        externalResponse.status
      );
    }

    const data = await externalResponse.json();
    const DB = env.DB;

    if (DB && data && Array.isArray(data.features) && data.features.length > 0) {
      console.log(`[${sourceName}] Proactively upserting ${data.features.length} features from proxied feed into D1.`);
      ctx.waitUntil(upsertEarthquakeFeaturesToD1(DB, data.features).catch(err => {
        console.error(`[${sourceName}] Error during background D1 upsert from proxied feed: ${err.message}`, err);
      }));
    }

    const DEFAULT_CACHE_DURATION_SECONDS = 60;
    let durationInSeconds = DEFAULT_CACHE_DURATION_SECONDS;
    const envCacheDuration = env.WORKER_CACHE_DURATION_SECONDS;
    if (envCacheDuration) {
      const parsedDuration = parseInt(envCacheDuration, 10);
      if (!isNaN(parsedDuration) && parsedDuration > 0) {
        durationInSeconds = parsedDuration;
      } else {
        console.warn(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${envCacheDuration}". Using default: ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
      }
    }

    const newResponseHeaders = new Headers(externalResponse.headers);
    newResponseHeaders.set("Content-Type", "application/json");
    newResponseHeaders.set("Cache-Control", `s-maxage=${durationInSeconds}`);
    newResponseHeaders.delete("Set-Cookie");

    let newResponse = new Response(JSON.stringify(data), {
      status: externalResponse.status,
      statusText: externalResponse.statusText,
      headers: newResponseHeaders,
    });

    ctx.waitUntil(
      cache.put(cacheKey, newResponse.clone()).then(() => {
        console.log(`Successfully cached response for: ${apiUrl} (duration: ${durationInSeconds}s)`);
      }).catch(err => {
        console.error(`Failed to cache response for ${apiUrl}: ${err.message}`, err);
      })
    );
    return newResponse;
  } catch (error) {
    console.error(`Error processing request for ${apiUrl}: ${error.message}`, error);
    return jsonErrorResponse(`Error processing request: ${error.message}`, 500, sourceName);
  }
}

// eslint-disable-next-line no-unused-vars
async function handleSitemapIndexRequest(request, env, ctx) {
  const sitemapIndexXML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-static-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-earthquakes.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://earthquakeslive.com/sitemap-clusters.xml</loc>
  </sitemap>
</sitemapindex>`;
  return new Response(sitemapIndexXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=21600" }});
}

// eslint-disable-next-line no-unused-vars
async function handleStaticPagesSitemapRequest(request, env, ctx) {
  const staticPages = [
    { loc: "https://earthquakeslive.com/", priority: "1.0", changefreq: "hourly" },
    { loc: "https://earthquakeslive.com/overview", priority: "0.9", changefreq: "hourly" },
    { loc: "https://earthquakeslive.com/feeds", priority: "0.9", changefreq: "hourly" },
  ];
  const feedPeriods = [
    { period: "last_hour", priority: "0.9", changefreq: "hourly" },
    { period: "last_24_hours", priority: "0.9", changefreq: "hourly" },
    { period: "last_7_days", priority: "0.9", changefreq: "daily" },
    { period: "last_30_days", priority: "0.7", changefreq: "daily" },
  ];
  let urlsXml = "";
  staticPages.forEach(page => { urlsXml += `\n  <url><loc>${page.loc}</loc><priority>${page.priority}</priority><changefreq>${page.changefreq}</changefreq></url>`; });
  feedPeriods.forEach(feed => { urlsXml += `\n  <url><loc>https://earthquakeslive.com/feeds?activeFeedPeriod=${feed.period}</loc><priority>${feed.priority}</priority><changefreq>${feed.changefreq}</changefreq></url>`; });
  urlsXml += `
  <url><loc>https://earthquakeslive.com/learn</loc><priority>0.5</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/magnitude-vs-intensity</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/measuring-earthquakes</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/plate-tectonics</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>`;
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlsXml}\n</urlset>`;
  return new Response(sitemapXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=86400" }});
}

// eslint-disable-next-line no-unused-vars
async function handleEarthquakesSitemapRequest(request, env, ctx) {
  const sourceName = "earthquakes-sitemap-handler";
  const usgsFeedUrl = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
  let earthquakesXml = "";
  try {
    console.log(`[${sourceName}] Fetching earthquake data from: ${usgsFeedUrl}`);
    const response = await fetch(usgsFeedUrl);
    if (!response.ok) {
      console.error(`[${sourceName}] Error fetching earthquake data: ${response.status} ${response.statusText}`);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Error fetching earthquake data -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
    }
    const data = await response.json();
    if (data && data.features) {
      data.features.forEach(quake => {
        if (quake && quake.id && quake.properties) {
          const usgs_id = quake.id;
          let formattedMagnitude = 'Munknown';
          if (typeof quake.properties.mag === 'number' && !isNaN(quake.properties.mag)) { formattedMagnitude = `m${quake.properties.mag.toFixed(1)}`; }
          else { console.warn(`[${sourceName}] Invalid or missing magnitude for quake ${usgs_id}: ${quake.properties.mag}. Using '${formattedMagnitude}'.`); }
          const place = quake.properties.place || "Unknown Place";
          const locationSlug = slugify(place);
          const loc = `https://earthquakeslive.com/quake/${formattedMagnitude}-${locationSlug}-${usgs_id}`;
          const lastmod = new Date(quake.properties.updated || quake.properties.time).toISOString();
          earthquakesXml += `\n  <url><loc>${escapeXml(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`;
        } else { console.warn(`[${sourceName}] Skipping quake in sitemap due to missing id or properties:`, quake); }
      });
    }
  } catch (error) {
    console.error(`[${sourceName}] Exception fetching or processing earthquake data: ${error.message}`, error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Exception processing earthquake data: ${escapeXml(error.message)} -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
  }
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${earthquakesXml}\n</urlset>`;
  return new Response(sitemapXML, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
}

// eslint-disable-next-line no-unused-vars
async function handleClustersSitemapRequest(request, env, ctx) {
  const sourceName = "clusters-sitemap-handler";
  const DB = env.DB;
  let clustersXml = "";
  const currentDate = new Date().toISOString();
  if (!DB) {
    console.error(`[${sourceName}] D1 Database (DB) not available`);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- D1 Database not available -->\n</urlset>`, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }});
  }
  try {
    const stmt = DB.prepare("SELECT clusterId, updatedAt FROM ClusterDefinitions ORDER BY updatedAt DESC LIMIT 500");
    const { results } = await stmt.all();
    if (results && results.length > 0) {
      for (const row of results) {
        const d1ClusterId = row.clusterId;
        const lastmod = row.updatedAt ? new Date(row.updatedAt).toISOString() : currentDate;
        const d1IdRegex = /^overview_cluster_([a-zA-Z0-9]+)_(\d+)$/;
        const d1Match = d1ClusterId.match(d1IdRegex);
        if (!d1Match) { console.warn(`[${sourceName}] Failed to parse D1 clusterId: ${d1ClusterId}. Skipping.`); continue; }
        const strongestQuakeIdFromDb = d1Match[1];
        const quakeCountFromDb = d1Match[2];
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
    const keywords = `earthquake, ${place ? place.split(', ').join(', ') : ''}, M${mag}, seismic event, earthquake report`;
    const jsonLd = {"@context": "https://schema.org", "@type": "Event", name: `M ${mag} - ${place}`, description, startDate: isoTime, location: {"@type": "Place", geo: {"@type": "GeoCoordinates", latitude: lat, longitude: lon, elevation: -depth * 1000 }, name: place }, identifier: quakeData.id, url: canonicalUrl, keywords: keywords.toLowerCase()};
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
    const stmt = env.DB.prepare("SELECT earthquakeIds, strongestQuakeId, updatedAt FROM ClusterDefinitions WHERE clusterId = ?").bind(clusterIdForD1Query);
    const clusterInfo = await stmt.first();
    if (!clusterInfo) {
      console.warn(`[${sourceName}] Cluster definition not found in D1 for D1 Query ID: ${clusterIdForD1Query} (derived from slug: ${urlSlug})`);
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
    if (pathname === "/sitemap-earthquakes.xml") return handleEarthquakesSitemapRequest(request, env, ctx);
    if (pathname === "/sitemap-clusters.xml") return handleClustersSitemapRequest(request, env, ctx);

    // API routes
    if (pathname === "/api/usgs-proxy") {
      const apiUrl = url.searchParams.get("apiUrl");
      if (!apiUrl) return jsonErrorResponse("Missing apiUrl query parameter", 400, "worker-router-usgs-proxy");
      return handleUsgsProxyRequest(request, env, ctx, apiUrl);
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

    // New API Routes
    if (pathname === "/api/get-earthquakes") {
      return handleGetEarthquakes({ request, env, ctx });
    } else if (pathname === "/api/calculate-clusters") {
      if (request.method === 'POST') {
        return handleCalculateClusters({ request, env, ctx });
      } else {
        return new Response('Method Not Allowed', { status: 405 });
      }
    } else if (pathname === "/api/cluster-definition") {
      return handleClusterDefinition({ request, env, ctx });
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
    console.log(`[worker-scheduled] Cron Triggered at ${new Date(event.scheduledTime).toISOString()}`);

    if (!env.DB) {
      console.error("[worker-scheduled] D1 Database (DB) binding not found.");
      return;
    }

    const USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

    try {
      console.log(`[worker-scheduled] Fetching earthquake data from ${USGS_FEED_URL}`);
      const response = await fetch(USGS_FEED_URL, {
        headers: { 'User-Agent': 'CloudflareWorker-EarthquakeFetcher/1.0' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[worker-scheduled] Error fetching data from USGS: ${response.status} ${response.statusText} - ${errorText}`);
        return;
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.features) || data.features.length === 0) {
        console.log("[worker-scheduled] No earthquake features found in the response or data is invalid.");
        return;
      }

      console.log(`[worker-scheduled] Fetched ${data.features.length} earthquake features. Starting D1 upsert.`);

      ctx.waitUntil(
        upsertEarthquakeFeaturesToD1(env.DB, data.features)
          .then(({ successCount, errorCount }) => {
            console.log(`[worker-scheduled] D1 upsert complete. Success: ${successCount}, Errors: ${errorCount}`);
          })
          .catch(err => {
            console.error(`[worker-scheduled] Error during D1 upsert process: ${err.message}`, err);
          })
      );

    } catch (error) {
      console.error(`[worker-scheduled] Unhandled error in scheduled function: ${error.message}`, error);
    }
  }
};
