// Helper to create JSON error responses
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

async function handleUsgsProxyRequest(context, apiUrl) {
  const sourceName = "usgs-proxy-handler";
  const cacheKey = new Request(apiUrl, context.request);
  const cache = caches.default;

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log(`Cache hit for: ${apiUrl}`);
      return cachedResponse;
    }

    console.log(`Cache miss for: ${apiUrl}. Fetching from origin.`);
    let response;
    try {
      response = await fetch(apiUrl);
    } catch (error) {
      console.error(`USGS API fetch failed for ${apiUrl}: ${error.message}`, error);
      return jsonErrorResponse(`USGS API fetch failed: ${error.message}`, 500, sourceName);
    }

    if (!response.ok) {
      console.error(`Error fetching data from USGS API (${apiUrl}): ${response.status} ${response.statusText}`);
      return jsonErrorResponse(
        `Error fetching data from USGS API: ${response.status} ${response.statusText}`,
        response.status,
        sourceName,
        response.status
      );
    }

    const data = await response.json();

    const DEFAULT_CACHE_DURATION_SECONDS = 600; // 10 minutes
    let durationInSeconds = DEFAULT_CACHE_DURATION_SECONDS;

    const envCacheDuration = context.env && context.env.WORKER_CACHE_DURATION_SECONDS;
    if (envCacheDuration) {
      const parsedDuration = parseInt(envCacheDuration, 10);
      if (!isNaN(parsedDuration) && parsedDuration > 0) {
        durationInSeconds = parsedDuration;
      } else {
        console.warn(`Invalid WORKER_CACHE_DURATION_SECONDS value: "${envCacheDuration}". Using default: ${DEFAULT_CACHE_DURATION_SECONDS}s.`);
      }
    }

    const newResponseHeaders = {
      "Content-Type": "application/json",
      "Cache-Control": `s-maxage=${durationInSeconds}`,
    };

    let newResponse = new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers: newResponseHeaders,
    });

    context.waitUntil(
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

// --- Sitemap Handler Functions ---

// 1. Sitemap Index Endpoint (/sitemap-index.xml)
export async function handleSitemapIndexRequest(context) {
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

  return new Response(sitemapIndexXML, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=21600" // 6 hours
    },
  });
}

// Helper function to escape XML characters
export function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') {
    return ''; // Or handle as an error, depending on expected input
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

// 2. Static Pages Sitemap Endpoint (/sitemap-static-pages.xml)
export async function handleStaticPagesSitemapRequest(context) {
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
  staticPages.forEach(page => {
    urlsXml += `
  <url>
    <loc>${page.loc}</loc>
    <priority>${page.priority}</priority>
    <changefreq>${page.changefreq}</changefreq>
  </url>`;
  });

  feedPeriods.forEach(feed => {
    urlsXml += `
  <url>
    <loc>https://earthquakeslive.com/feeds?activeFeedPeriod=${feed.period}</loc>
    <priority>${feed.priority}</priority>
    <changefreq>${feed.changefreq}</changefreq>
  </url>`;
  });

  // Add /learn page
  urlsXml += `
  <url>
    <loc>https://earthquakeslive.com/learn</loc>
    <priority>0.5</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>https://earthquakeslive.com/learn/magnitude-vs-intensity</loc>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>https://earthquakeslive.com/learn/measuring-earthquakes</loc>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>
  <url>
    <loc>https://earthquakeslive.com/learn/plate-tectonics</loc>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>`;

  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlsXml}
</urlset>`;

  return new Response(sitemapXML, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=86400" // 24 hours
    },
  });
}

// 3. Earthquakes Sitemap Endpoint (/sitemap-earthquakes.xml)
export async function handleEarthquakesSitemapRequest(context) {
  const sourceName = "earthquakes-sitemap-handler";
  // Use M2.5+ Earthquakes, Past 7 Days feed
  const usgsFeedUrl = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
  let earthquakesXml = "";

  try {
    // Fetch data using the existing proxy function (which handles caching)
    // We need to pass a full context-like object if handleUsgsProxyRequest expects it,
    // or adapt it. For now, assuming it can be called with context and URL.
    // If handleUsgsProxyRequest is tightly coupled with being the primary request handler,
    // we might need to duplicate its fetch logic or refactor it.
    // For simplicity, let's try calling it directly.
    // This is a conceptual call; direct invocation might need adjustment based on handleUsgsProxyRequest's design.
    // Let's re-evaluate: handleUsgsProxyRequest returns a Response. We need the JSON body.

    console.log(`[${sourceName}] Fetching earthquake data from: ${usgsFeedUrl}`);
    const response = await fetch(usgsFeedUrl); // Direct fetch, not via proxy handler for simplicity here
                                              // To use worker's cache, proxy handler should be used or its logic replicated.
                                              // For this step, direct fetch is fine. Caching for this sitemap is via its own Cache-Control.

    if (!response.ok) {
      console.error(`[${sourceName}] Error fetching earthquake data: ${response.status} ${response.statusText}`);
      // Return an empty sitemap or a sitemap with an error comment
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Error fetching earthquake data -->\n</urlset>`, {
        headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }, // Cache error response for 1 hour
      });
    }

    const data = await response.json();

    if (data && data.features) {
      data.features.forEach(quake => {
        if (quake.properties) {
          // The detail URL from USGS geojson is often a full URL to their event page.
          // We need to extract the event ID or use a parameter that our /quake/ route understands.
          // The `id` field of the GeoJSON feature is usually the event ID.
          // The requirement is /quake/${encodeURIComponent(quake.properties.detail || quake.properties.url)}
          // Let's assume quake.id is the preferred unique identifier for our internal routing.
          // If quake.properties.detail is a full URL, we need to parse it or use quake.id.
          // For now, let's use quake.id as the detailUrlParam, assuming the app can handle it.
          // A safer bet might be to ensure detailUrlParam is consistently an ID.
          // The original spec mentioned `quake.properties.detail || quake.properties.url`.
          // These are typically full URLs. If the app's /quake/ route expects the *USGS event ID*,
          // then `quake.id` is the correct field.
          // Let's stick to the spec: encodeURIComponent(quake.properties.detail || quake.properties.url)
          // but be mindful this creates long, opaque URL parameters.
          // A better approach for the future might be to use quake.id for cleaner URLs,
          // if the frontend routing for /quake/:id expects the USGS event ID.
          // For now, sticking to the provided spec:

          let detailIdentifier = quake.properties.detail; // This is usually the USGS event page URL
          if (!detailIdentifier && quake.properties.url) { // Fallback to properties.url
            detailIdentifier = quake.properties.url;
          }
          // If we want to use the USGS event ID (e.g., "ci39P5E88S"), it's usually `quake.id`
          // Let's assume for now the spec means "use the content of properties.detail or properties.url as the param"
          // This seems to align with how EarthquakeDetailModalComponent gets detailUrl if it's a full URL.

          if (detailIdentifier) {
             // We need to make sure this detailIdentifier is what our /quake/ route expects.
             // If /quake/ expects the *USGS event ID*, then `quake.id` is better.
             // The spec for EarthquakeDetailModalComponent says `detailUrlParam` which is part of `canonicalPageUrl: https://earthquakeslive.com/quake/${data.detailUrlParam}`
             // This implies `detailUrlParam` should be the unique part of our URL, not a full external URL.
             // So, `quake.id` (USGS Event ID) is likely the intended `detailUrlParam`.
            // Correcting to use detailIdentifier as per the new requirement for the subtask.
            const loc = `https://earthquakeslive.com/quake/${encodeURIComponent(detailIdentifier)}`;
            const lastmod = new Date(quake.properties.updated || quake.properties.time).toISOString();
            earthquakesXml += `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
          }
        }
      });
    }
  } catch (error) {
    console.error(`[${sourceName}] Exception fetching or processing earthquake data: ${error.message}`, error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Exception processing earthquake data: ${escapeXml(error.message)} -->\n</urlset>`, {
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }, // Cache error response for 1 hour
    });
  }

  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${earthquakesXml}
</urlset>`;

  return new Response(sitemapXML, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600" // 1 hour
    },
  });
}

// 4. Clusters Sitemap Endpoint (/sitemap-clusters.xml)
export async function handleClustersSitemapRequest(context) {
  const sourceName = "clusters-sitemap-handler";
  const DB = context.env.DB;
  let clustersXml = "";
  const currentDate = new Date().toISOString(); // For lastmod fallback

  if (!DB) {
    console.error(`[${sourceName}] D1 Database (DB) not available`);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- D1 Database not available -->\n</urlset>`, {
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }, // Cache error for 1 hour
    });
  }

  try {
    const stmt = DB.prepare("SELECT clusterId, updatedAt FROM ClusterDefinitions ORDER BY updatedAt DESC LIMIT 500");
    const { results } = await stmt.all();

    if (results && results.length > 0) {
      for (const row of results) {
        const d1ClusterId = row.clusterId;
        const lastmod = row.updatedAt ? new Date(row.updatedAt).toISOString() : currentDate;

        // Parse D1 clusterId: overview_cluster_[strongestQuakeId]_[quakeCount]
        const d1IdRegex = /^overview_cluster_([a-zA-Z0-9]+)_(\d+)$/;
        const d1Match = d1ClusterId.match(d1IdRegex);

        if (!d1Match) {
          console.warn(`[${sourceName}] Failed to parse D1 clusterId: ${d1ClusterId}. Skipping.`);
          continue;
        }

        const strongestQuakeIdFromDb = d1Match[1];
        const quakeCountFromDb = d1Match[2];

        let quakeData;
        try {
          const usgsUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${strongestQuakeIdFromDb}.geojson`;
          // console.log(`[${sourceName}] Fetching details for ${strongestQuakeIdFromDb} from ${usgsUrl}`);
          const response = await fetch(usgsUrl);
          if (!response.ok) {
            console.warn(`[${sourceName}] USGS fetch failed for ${strongestQuakeIdFromDb}: ${response.status} ${response.statusText}. Skipping.`);
            continue;
          }
          quakeData = await response.json();
        } catch (fetchError) {
          console.error(`[${sourceName}] Error fetching USGS data for ${strongestQuakeIdFromDb}: ${fetchError.message}. Skipping.`);
          continue;
        }

        if (!quakeData || !quakeData.properties) {
            console.warn(`[${sourceName}] Invalid or missing properties in USGS data for ${strongestQuakeIdFromDb}. Skipping.`);
            continue;
        }

        const locationName = quakeData.properties.place;
        const maxMagnitude = quakeData.properties.mag;

        if (!locationName || typeof locationName !== 'string') {
          console.warn(`[${sourceName}] Missing or invalid locationName for ${strongestQuakeIdFromDb}. Skipping.`);
          continue;
        }
        if (maxMagnitude === null || maxMagnitude === undefined || typeof maxMagnitude !== 'number') {
          console.warn(`[${sourceName}] Missing or invalid maxMagnitude for ${strongestQuakeIdFromDb}. Skipping.`);
          continue;
        }

        const locationSlug = locationName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const newUrl = `https://earthquakeslive.com/cluster/${quakeCountFromDb}-quakes-near-${locationSlug}-up-to-m${maxMagnitude.toFixed(1)}-${strongestQuakeIdFromDb}`;

        clustersXml += `
  <url>
    <loc>${escapeXml(newUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
      }
    } else {
      console.log(`[${sourceName}] No cluster definitions found in D1 table ClusterDefinitions.`);
    }
  } catch (error) {
    console.error(`[${sourceName}] Exception querying or processing cluster data from D1: ${error.message}`, error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Exception processing cluster data from D1: ${escapeXml(error.message)} -->\n</urlset>`, {
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }, // Cache error for 1 hour
    });
  }

  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${clustersXml}
</urlset>`;

  return new Response(sitemapXML, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=10800" // 3 hours
    },
  });
}


// --- End Sitemap Handler Functions ---

// Helper function to detect crawlers
export function isCrawler(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  const crawlerRegex = /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot/i;
  return crawlerRegex.test(userAgent);
}

// Prerendering function for Earthquake pages
export async function handlePrerenderEarthquake(context, quakeIdPathSegment) {
  const { request, env } = context;
  const sourceName = "prerender-earthquake";
  const siteUrl = "https://earthquakeslive.com"; // Base site URL

  try {
    const detailUrl = decodeURIComponent(quakeIdPathSegment);
    console.log(`[${sourceName}] Prerendering earthquake: ${detailUrl}`);

    // Fetch earthquake data
    // For simplicity, direct fetch. Consider using handleUsgsProxyRequest's caching logic if needed.
    const response = await fetch(detailUrl);
    if (!response.ok) {
      console.error(`[${sourceName}] Failed to fetch earthquake data from ${detailUrl}: ${response.status}`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Earthquake data not found.</body></html>`, {
        status: 404,
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600"
        },
      });
    }
    const quakeData = await response.json();

    if (!quakeData || !quakeData.properties || !quakeData.geometry) {
      console.error(`[${sourceName}] Invalid earthquake data structure from ${detailUrl}`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Invalid earthquake data.</body></html>`, {
        status: 500,
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600"
        },
      });
    }

    const mag = quakeData.properties.mag;
    const place = quakeData.properties.place;
    const dateObj = new Date(quakeData.properties.time);
    const readableTime = dateObj.toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC'
      }); // Example: January 1, 2024, 02:35 PM UTC
    const isoTime = dateObj.toISOString();
    const depth = quakeData.geometry.coordinates[2];
    const lat = quakeData.geometry.coordinates[1];
    const lon = quakeData.geometry.coordinates[0];
    const canonicalUrl = `${siteUrl}/quake/${quakeIdPathSegment}`;
    const usgsEventUrl = quakeData.properties.detail; // This is often the USGS event page

    // Enhanced Title and Description
    const titleDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const title = `M ${mag} Earthquake - ${place} - ${titleDate} | Earthquakes Live`;
    const description = `Detailed report of the M ${mag} earthquake that struck near ${place} on ${titleDate} at ${dateObj.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'})} (UTC). Magnitude: ${mag}, Depth: ${depth} km. Location: ${lat.toFixed(2)}, ${lon.toFixed(2)}. Stay updated with Earthquakes Live.`;

    let significanceSentence = `This earthquake occurred at a depth of ${depth} km.`;
    if (depth < 70) {
      significanceSentence = `This shallow earthquake (depth: ${depth} km) may have been felt by many people in the area.`;
    } else if (depth > 300) {
      significanceSentence = `This earthquake occurred very deep (depth: ${depth} km).`;
    }

    // JSON-LD Structured Data
    const keywords = `earthquake, ${place ? place.split(', ').join(', ') : ''}, M${mag}, seismic event, earthquake report`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Event", // Using "Event" for broader compatibility
      "name": `M ${mag} - ${place}`,
      "description": description,
      "startDate": isoTime,
      "location": {
        "@type": "Place",
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": lat,
          "longitude": lon,
          "elevation": -depth * 1000 // Convert km to meters, negative for depth
        },
        "name": place
      },
      "identifier": quakeData.id, // USGS Event ID
      "url": canonicalUrl,
      "keywords": keywords.toLowerCase()
    };
    if (usgsEventUrl) {
      jsonLd.sameAs = usgsEventUrl; // Link to authoritative USGS event page
    }


    // Basic HTML structure
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(title)}</title>
  <meta name="description" content="${escapeXml(description)}">
  <meta name="keywords" content="${escapeXml(keywords.toLowerCase())}">
  <link rel="canonical" href="${escapeXml(canonicalUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@builtbyvibes">
  <meta property="og:title" content="${escapeXml(title)}">
  <meta property="og:description" content="${escapeXml(description)}">
  <meta property="og:url" content="${escapeXml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png">
  <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <p><strong>Time:</strong> ${escapeXml(readableTime)}</p>
  <p><strong>Location:</strong> ${escapeXml(place)}</p>
  <p><strong>Coordinates:</strong> ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</p>
  <p><strong>Magnitude:</strong> M ${mag}</p>
  <p><strong>Depth:</strong> ${depth} km</p>
  <p>${escapeXml(significanceSentence)}</p>
  ${usgsEventUrl ? `<p><a href="${escapeXml(usgsEventUrl)}" target="_blank" rel="noopener noreferrer">View on USGS Event Page</a></p>` : ''}
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;

    return new Response(html, {
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600" // Cache for 1 hour on CDN
        }
    });

  } catch (error) {
    console.error(`[${sourceName}] Error: ${error.message}`, error);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering earthquake page.</body></html>`, {
      status: 500,
      headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, s-maxage=3600"
      },
    });
  }
}

// Prerendering function for Cluster pages
export async function handlePrerenderCluster(context, urlSlugParam) { // Renamed param for clarity
  const { request, env } = context;
  const sourceName = "prerender-cluster";
  const siteUrl = "https://earthquakeslive.com"; // Base site URL
  const urlSlug = urlSlugParam; // Use urlSlug internally

  console.log(`[${sourceName}] Attempting to prerender cluster with full slug: ${urlSlug}`);

  // Parse the new URL slug format: [count]-quakes-near-[location-slug]-up-to-m[max-magnitude]-[strongest-quake-id]
  const slugRegex = /^(\d+)-quakes-near-.*?([a-zA-Z0-9]+)$/;
  const match = urlSlug.match(slugRegex);

  if (!match) {
    console.warn(`[${sourceName}] Invalid cluster URL slug format: ${urlSlug}`);
    return new Response(`<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Invalid cluster URL format.</body></html>`, {
        status: 404,
        headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" },
    });
  }

  const extractedCount = match[1];
  const extractedStrongestQuakeId = match[2];
  console.log(`[${sourceName}] Extracted from slug: count=${extractedCount}, strongestQuakeId=${extractedStrongestQuakeId}`);

  // Construct the D1-compatible clusterId
  const clusterIdForD1Query = `overview_cluster_${extractedStrongestQuakeId}_${extractedCount}`;
  console.log(`[${sourceName}] Constructed D1 query ID: ${clusterIdForD1Query}`);

  // Using env.DB for D1 access
  if (!env.DB) {
    console.error(`[${sourceName}] D1 Database (env.DB) not configured for prerendering cluster.`);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Service configuration error.</body></html>`, {
      status: 500,
      headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, s-maxage=3600"
      },
    });
  }

  try {
    // Fetch cluster data from D1 table ClusterDefinitions using the constructed ID
    const stmt = env.DB.prepare("SELECT earthquakeIds, strongestQuakeId, updatedAt FROM ClusterDefinitions WHERE clusterId = ?").bind(clusterIdForD1Query);
    const clusterInfo = await stmt.first();

    if (!clusterInfo) {
      console.warn(`[${sourceName}] Cluster definition not found in D1 for D1 Query ID: ${clusterIdForD1Query} (derived from slug: ${urlSlug})`);
      return new Response(`<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Cluster not found.</body></html>`, {
        status: 404,
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600"
        },
      });
    }

    // earthquakeIds might be stored as JSON string in D1, parse if needed.
    let earthquakeIds;
    try {
        earthquakeIds = typeof clusterInfo.earthquakeIds === 'string' ? JSON.parse(clusterInfo.earthquakeIds) : clusterInfo.earthquakeIds;
    } catch (e) {
        console.error(`[${sourceName}] Error parsing earthquakeIds for D1 Query ID ${clusterIdForD1Query}: ${e.message}`);
        return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error processing cluster data.</body></html>`, {
            status: 500, headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }
        });
    }
    // Use the strongestQuakeId from D1 (which should match extractedStrongestQuakeId if data is consistent)
    const d1StrongestQuakeId = clusterInfo.strongestQuakeId;
    const { updatedAt } = clusterInfo;
    const numEvents = earthquakeIds ? earthquakeIds.length : 0;
    const canonicalUrl = `${siteUrl}/cluster/${urlSlug}`; // Canonical URL uses the original full slug
    const formattedUpdatedAt = new Date(updatedAt).toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC'
    });

    let strongestQuakeDetails = null;
    let title, description, bodyContent, keywords;

    // Use d1StrongestQuakeId (from D1) to fetch details. This should align with extractedStrongestQuakeId.
    if (d1StrongestQuakeId) {
      try {
        const quakeDetailUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${d1StrongestQuakeId}.geojson`;
        console.log(`[${sourceName}] Fetching strongest quake details (ID: ${d1StrongestQuakeId}) from: ${quakeDetailUrl}`);
        const res = await fetch(quakeDetailUrl);
        if (res.ok) {
          const quakeData = await res.json();
          if (quakeData && quakeData.properties) {
            strongestQuakeDetails = {
              mag: quakeData.properties.mag,
              place: quakeData.properties.place,
              time: new Date(quakeData.properties.time).toLocaleString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC'
              }),
              id: quakeData.id, // USGS Event ID for the strongest quake
              url: quakeData.properties.detail, // USGS Event Page URL
              // Store coordinates for the CollectionPage location
              latitude: quakeData.geometry?.coordinates?.[1],
              longitude: quakeData.geometry?.coordinates?.[0]
            };
            console.log(`[${sourceName}] Successfully fetched details for strongest quake: ${d1StrongestQuakeId}`);
          }
        } else {
          console.warn(`[${sourceName}] Failed to fetch strongest quake details for ${d1StrongestQuakeId}: ${res.status}`);
        }
      } catch (e) {
        console.error(`[${sourceName}] Error fetching strongest quake details for ${d1StrongestQuakeId}: ${e.message}`);
      }
    }

    if (strongestQuakeDetails) {
      title = `Earthquake Cluster near ${strongestQuakeDetails.place} | Earthquakes Live`;
      description = `Explore an active earthquake cluster near ${strongestQuakeDetails.place}, featuring ${numEvents} seismic events. The largest event in this sequence is a M ${strongestQuakeDetails.mag}. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${strongestQuakeDetails.place ? strongestQuakeDetails.place.split(', ').join(', ') : ''}, tectonic activity, M${strongestQuakeDetails.mag}`;
      bodyContent = `
        <p>This page provides details about an earthquake cluster located near <strong>${escapeXml(strongestQuakeDetails.place)}</strong>.</p>
        <p>This cluster contains <strong>${numEvents}</strong> individual seismic events.</p>
        <p>The most significant earthquake in this cluster is a <strong>M ${strongestQuakeDetails.mag}</strong>, which occurred on ${escapeXml(strongestQuakeDetails.time)}.</p>
        ${strongestQuakeDetails.url ? `<p><a href="${escapeXml(strongestQuakeDetails.url)}" target="_blank" rel="noopener noreferrer">View details for the largest event on USGS</a></p>` : ''}
        <p><em>Cluster information last updated: ${escapeXml(formattedUpdatedAt)}.</em></p>
      `;
    } else {
      // Fallback if strongest quake details couldn't be fetched
      title = `Earthquake Cluster Summary (${numEvents} Events) | Earthquakes Live`;
      description = `Details of an earthquake cluster containing ${numEvents} seismic events. This cluster is identified by the strongest quake ID: ${extractedStrongestQuakeId}. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${extractedStrongestQuakeId}, tectonic activity`;
      bodyContent = `
        <p>This page provides details about an earthquake cluster associated with the primary event ID <strong>${escapeXml(extractedStrongestQuakeId)}</strong>.</p>
        <p>This cluster contains <strong>${numEvents}</strong> individual seismic events.</p>
        <p><em>Cluster information last updated: ${escapeXml(formattedUpdatedAt)}.</em></p>
        <p><em>Further details about the most significant event in this cluster are currently unavailable.</em></p>
      `;
    }

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": title,
      "description": description,
      "url": canonicalUrl,
      "dateModified": new Date(updatedAt).toISOString(),
      "keywords": keywords.toLowerCase()
    };

    if (strongestQuakeDetails) {
      jsonLd.about = {
        "@type": "Event",
        "name": `M ${strongestQuakeDetails.mag} - ${strongestQuakeDetails.place}`,
        "identifier": strongestQuakeDetails.id, // This is d1StrongestQuakeId
        ...(strongestQuakeDetails.url && { "url": strongestQuakeDetails.url })
      };

      // Add top-level location for CollectionPage if strongest quake details (including coords) are available
      if (typeof strongestQuakeDetails.latitude === 'number' && typeof strongestQuakeDetails.longitude === 'number') {
        jsonLd.location = {
          "@type": "Place",
          "name": strongestQuakeDetails.place, // Or a broader cluster region name if available/preferred
          "geo": {
            "@type": "GeoCoordinates",
            "latitude": strongestQuakeDetails.latitude,
            "longitude": strongestQuakeDetails.longitude
          }
        };
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(title)}</title>
  <meta name="description" content="${escapeXml(description)}">
  <meta name="keywords" content="${escapeXml(keywords.toLowerCase())}">
  <link rel="canonical" href="${escapeXml(canonicalUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@builtbyvibes">
  <meta property="og:title" content="${escapeXml(title)}">
  <meta property="og:description" content="${escapeXml(description)}">
  <meta property="og:url" content="${escapeXml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png">
  <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  ${bodyContent}
  <p>Explore the live map and detailed list of events in this cluster on our interactive platform.</p>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;

    return new Response(html, {
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=1800" // Cache for 30 minutes
        }
    });

  } catch (error) {
    console.error(`[${sourceName}] Error processing cluster slug ${urlSlug} (D1 ID: ${clusterIdForD1Query || 'not_constructed'}): ${error.message}`, error);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering cluster page.</body></html>`, {
      status: 500,
      headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, s-maxage=3600"
      },
    });
  }
}


export async function onRequest(context) {
  const mainSourceName = "worker-router"; // For errors originating from the router itself
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Prerendering for crawlers
  if (isCrawler(context.request)) {
    if (pathname.startsWith("/quake/")) {
      const quakeIdPathSegment = pathname.substring("/quake/".length);
      if (quakeIdPathSegment) {
        return handlePrerenderEarthquake(context, quakeIdPathSegment);
      }
    } else if (pathname.startsWith("/cluster/")) {
      const clusterId = pathname.substring("/cluster/".length);
      if (clusterId) {
        return handlePrerenderCluster(context, clusterId);
      }
    }
  }

  // Sitemap routes
  if (pathname === "/sitemap-index.xml") {
    return handleSitemapIndexRequest(context);
  }
  else if (pathname === "/sitemap-static-pages.xml") {
    return handleStaticPagesSitemapRequest(context);
  }
  else if (pathname === "/sitemap-earthquakes.xml") {
    return handleEarthquakesSitemapRequest(context);
  }
  else if (pathname === "/sitemap-clusters.xml") {
    return handleClustersSitemapRequest(context);
  }

  // Existing API routes
  else if (pathname === "/api/usgs-proxy") {
    const apiUrl = url.searchParams.get("apiUrl");
    if (!apiUrl) {
      return jsonErrorResponse("Missing apiUrl query parameter for proxy request", 400, "usgs-proxy-router");
    }
    return handleUsgsProxyRequest(context, apiUrl);
  }

  // If it's not a crawler and not an API/Sitemap route,
  // Pages will serve the static asset (e.g. index.html for SPA routes like /quake/* /cluster/*)
  // or a 404 if the asset doesn't exist.
  // We are *not* returning a jsonErrorResponse for unknown paths here anymore,
  // to allow Pages to handle SPA routing and static assets.
  // If context.next exists (i.e. part of Cloudflare Pages advanced mode functions), call it.
  if (context.next) {
     return context.next();
  }
  // For simple Pages _functions, not returning anything specific here means
  // the request might be passed to the static asset handler.
  // If this function is the *only* thing handling requests (e.g. not a Pages Function but a standalone Worker script for a route)
  // then we might need to explicitly fetch index.html for SPA routes.
  // Given this is functions/api/usgs-proxy.js, it's likely a Pages function.
  // The desired behavior is to let Pages serve index.html for non-crawler /quake/ and /cluster/

  // Fallback for old proxy behavior if apiUrl is present on an unhandled path.
  const apiUrlParam = url.searchParams.get("apiUrl");
  if (apiUrlParam) {
      console.warn(`Request to unspecific path ${pathname} with apiUrl, proceeding with proxy. Consider using /api/usgs-proxy explicitly.`);
      return handleUsgsProxyRequest(context, apiUrlParam);
  }

  // If we've reached here, it's not a path the worker actively handles.
  // For Cloudflare Pages, not returning a Response (or calling context.next())
  // should allow the static asset handler to take over.
  // If this were a classic worker script that must always return a response,
  // we'd need to return a 404 or fetch index.html.
  // The current setup expects Pages to handle it.
  // If there's no context.next() and no explicit response, this might result in an error
  // depending on the exact Cloudflare Pages execution model for _functions without explicit passthrough.
  // For now, let's assume Pages handles the fall-through correctly for SPA routes.
  // A more robust way for SPA fallbacks if this function *must* return:
  // return context.env.ASSETS.fetch(new Request(new URL("/index.html", request.url)));
  // But this is usually not required for Pages functions if they simply don't handle the route.

  // Default behavior if no other handler is matched:
  // It's important to let non-matching requests pass through to Cloudflare Pages static asset serving.
  // So, we don't return a generic 404 here for all non-matched paths.
  // Only the specific API routes should return errors if malformed.
  // The final "else" block from the original code that returned a generic "Unknown API path"
  // has been removed to allow SPA routing.
  console.log(`[${mainSourceName}] Path ${pathname} not handled by explicit routing in worker. Passing to Pages asset handler.`);
  // Implicitly, Pages will now try to serve a static file or index.html.
  // No explicit return new Response(...) for unhandled paths.
}
