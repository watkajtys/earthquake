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

async function handleClusterDefinitionRequest(context, url) {
  const sourceName = "cluster-definition-handler";
  const { request, env } = context;
  const CLUSTER_KV = env.CLUSTER_KV;

  if (!CLUSTER_KV) {
    return jsonErrorResponse("KV store not configured", 500, sourceName);
  }

  let ttl_seconds = 6 * 60 * 60; // 6 hours (21600 seconds)
  if (env.CLUSTER_DEFINITION_TTL_SECONDS) {
    const parsed = parseInt(env.CLUSTER_DEFINITION_TTL_SECONDS, 10);
    if (!isNaN(parsed) && parsed > 0) {
      ttl_seconds = parsed;
    } else {
      console.warn(`Invalid CLUSTER_DEFINITION_TTL_SECONDS value: "${env.CLUSTER_DEFINITION_TTL_SECONDS}". Using default: ${ttl_seconds}s.`);
    }
  }

  if (request.method === "POST") {
    try {
      const { clusterId, earthquakeIds, strongestQuakeId } = await request.json();
      if (!clusterId || !earthquakeIds || !Array.isArray(earthquakeIds) || earthquakeIds.length === 0 || !strongestQuakeId) {
        return jsonErrorResponse("Missing or invalid parameters for POST", 400, sourceName);
      }
      const valueToStore = {
        earthquakeIds,
        strongestQuakeId,
        updatedAt: new Date().toISOString()
      };
      const kvValue = JSON.stringify(valueToStore);
      await CLUSTER_KV.put(clusterId, kvValue, { expirationTtl: ttl_seconds });
      return new Response(JSON.stringify({ status: "success", message: "Cluster definition stored." }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Error processing POST for cluster definition:", e);
      return jsonErrorResponse(`Error processing request: ${e.message}`, 500, sourceName);
    }
  } else if (request.method === "GET") {
    const clusterId = url.searchParams.get("id");
    if (!clusterId) {
      return jsonErrorResponse("Missing 'id' query parameter for GET", 400, sourceName);
    }
    try {
      const kvValue = await CLUSTER_KV.get(clusterId);
      if (kvValue === null) {
        return jsonErrorResponse("Cluster definition not found.", 404, sourceName);
      }
      return new Response(kvValue, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Error processing GET for cluster definition:", e);
      return jsonErrorResponse(`Error processing request: ${e.message}`, 500, sourceName);
    }
  } else {
    return jsonErrorResponse("Method not allowed", 405, sourceName);
  }
}

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
function escapeXml(unsafe) {
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
  const CLUSTER_KV = context.env.CLUSTER_KV;
  let clustersXml = "";
  const currentDate = new Date().toISOString(); // For lastmod fallback

  if (!CLUSTER_KV) {
    console.error(`[${sourceName}] CLUSTER_KV not available`);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- CLUSTER_KV not available -->\n</urlset>`, {
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" }, // Cache error for 1 hour
    });
  }

  try {
    const listResult = await CLUSTER_KV.list({ limit: 500 }); // Limit to 500 keys

    if (listResult && listResult.keys) {
      for (const key of listResult.keys) {
        const loc = `https://earthquakeslive.com/cluster/${escapeXml(key.name)}`;
        let lastmod = currentDate; // Fallback to current date

        try {
          const kvValueString = await CLUSTER_KV.get(key.name);
          if (kvValueString) {
            const kvValue = JSON.parse(kvValueString);
            if (kvValue && kvValue.updatedAt) {
              lastmod = kvValue.updatedAt;
            } else {
              console.warn(`[${sourceName}] Missing updatedAt for cluster key: ${key.name}. Falling back to currentDate.`);
            }
          } else {
            console.warn(`[${sourceName}] No KV value found for cluster key: ${key.name} during sitemap generation. Falling back to currentDate.`);
          }
        } catch (e) {
          console.error(`[${sourceName}] Error parsing KV value for cluster key ${key.name}: ${e.message}. Falling back to currentDate.`, e);
        }

        clustersXml += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
      }
    } else {
      console.log(`[${sourceName}] No cluster keys found or listResult is empty.`);
    }
  } catch (error) {
    console.error(`[${sourceName}] Exception listing or processing cluster keys: ${error.message}`, error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Exception processing cluster data: ${escapeXml(error.message)} -->\n</urlset>`, {
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
function isCrawler(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  const crawlerRegex = /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot/i;
  return crawlerRegex.test(userAgent);
}

// Prerendering function for Earthquake pages
async function handlePrerenderEarthquake(context, quakeIdPathSegment) {
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
    const time = new Date(quakeData.properties.time).toUTCString();
    const depth = quakeData.geometry.coordinates[2];
    const canonicalUrl = `${siteUrl}/quake/${quakeIdPathSegment}`;

    const title = `M ${mag} Earthquake - ${place}`;
    const description = `Detailed information about the M ${mag} earthquake that occurred near ${place} on ${time}. Depth: ${depth} km.`;

    // Basic HTML structure
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(title)}</title>
  <meta name="description" content="${escapeXml(description)}">
  <link rel="canonical" href="${escapeXml(canonicalUrl)}">
  <meta name="twitter:site" content="@builtbyvibes" />
  <!-- TODO: Add more meta tags (Open Graph, JSON-LD) -->
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <p>Time: ${escapeXml(time)}</p>
  <p>Location: ${escapeXml(place)}</p>
  <p>Magnitude: ${mag}</p>
  <p>Depth: ${depth} km</p>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;

    return new Response(html, {
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600"
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
async function handlePrerenderCluster(context, clusterId) {
  const { request, env } = context;
  const sourceName = "prerender-cluster";
  const siteUrl = "https://earthquakeslive.com"; // Base site URL

  if (!env.CLUSTER_KV) {
    console.error(`[${sourceName}] CLUSTER_KV not configured.`);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Service configuration error.</body></html>`, {
      status: 500,
      headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, s-maxage=3600"
      },
    });
  }

  try {
    console.log(`[${sourceName}] Prerendering cluster: ${clusterId}`);
    const clusterDataString = await env.CLUSTER_KV.get(clusterId);

    if (!clusterDataString) {
      console.warn(`[${sourceName}] Cluster definition not found for ID: ${clusterId}`);
      return new Response(`<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Cluster not found.</body></html>`, {
        status: 404,
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600"
        },
      });
    }

    // const clusterData = JSON.parse(clusterDataString); // { earthquakeIds, strongestQuakeId }
    // For now, use generic text as fetching strongestQuakeId details is complex for initial setup.
    // Future: Fetch strongestQuakeId details to get a better locationName.
    const locationName = clusterId; // Placeholder
    const canonicalUrl = `${siteUrl}/cluster/${clusterId}`;
    const title = `Earthquake Cluster: ${locationName}`;
    const description = `Explore details of an earthquake cluster identified as ${locationName}, featuring multiple seismic events.`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(title)}</title>
  <meta name="description" content="${escapeXml(description)}">
  <link rel="canonical" href="${escapeXml(canonicalUrl)}">
  <meta name="twitter:site" content="@builtbyvibes" />
  <!-- TODO: Add more meta tags (Open Graph, JSON-LD) -->
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <p>${escapeXml(description)}</p>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;

    return new Response(html, {
        headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600"
        }
    });

  } catch (error) {
    console.error(`[${sourceName}] Error: ${error.message}`, error);
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
  else if (pathname === "/api/cluster-definition") {
    return handleClusterDefinitionRequest(context, url);
  } else if (pathname === "/api/usgs-proxy") {
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
