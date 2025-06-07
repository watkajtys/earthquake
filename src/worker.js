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

// Helper function to detect crawlers
export function isCrawler(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  const crawlerRegex = /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot/i;
  return crawlerRegex.test(userAgent);
}


async function handleClusterDefinitionRequest(request, env, ctx, url) {
  const sourceName = "cluster-definition-handler";
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

async function handleUsgsProxyRequest(request, env, ctx, apiUrl) {
  const sourceName = "usgs-proxy-handler";
  const cacheKey = new Request(apiUrl, request);
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

    const envCacheDuration = env.WORKER_CACHE_DURATION_SECONDS;
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

// --- Sitemap Handler Functions ---
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

  return new Response(sitemapIndexXML, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=21600" // 6 hours
    },
  });
}

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

async function handleEarthquakesSitemapRequest(request, env, ctx) {
  const sourceName = "earthquakes-sitemap-handler";
  const usgsFeedUrl = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
  let earthquakesXml = "";

  try {
    console.log(`[${sourceName}] Fetching earthquake data from: ${usgsFeedUrl}`);
    const response = await fetch(usgsFeedUrl);

    if (!response.ok) {
      console.error(`[${sourceName}] Error fetching earthquake data: ${response.status} ${response.statusText}`);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- Error fetching earthquake data -->\n</urlset>`, {
        headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
      });
    }

    const data = await response.json();

    if (data && data.features) {
      data.features.forEach(quake => {
        if (quake.properties) {
          let detailIdentifier = quake.properties.detail;
          if (!detailIdentifier && quake.properties.url) {
            detailIdentifier = quake.properties.url;
          }
          if (detailIdentifier) {
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
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
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

async function handleClustersSitemapRequest(request, env, ctx) {
  const sourceName = "clusters-sitemap-handler";
  const CLUSTER_KV = env.CLUSTER_KV;
  let clustersXml = "";
  const currentDate = new Date().toISOString();

  if (!CLUSTER_KV) {
    console.error(`[${sourceName}] CLUSTER_KV not available`);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<!-- CLUSTER_KV not available -->\n</urlset>`, {
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
    });
  }

  try {
    const listResult = await CLUSTER_KV.list({ limit: 500 });

    if (listResult && listResult.keys) {
      for (const key of listResult.keys) {
        const loc = `https://earthquakeslive.com/cluster/${escapeXml(key.name)}`;
        let lastmod = currentDate;

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
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
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


// --- Prerendering Functions ---
async function handlePrerenderEarthquake(request, env, ctx, quakeIdPathSegment) {
  const sourceName = "prerender-earthquake";
  const siteUrl = "https://earthquakeslive.com";

  try {
    const detailUrl = decodeURIComponent(quakeIdPathSegment);
    console.log(`[${sourceName}] Prerendering earthquake: ${detailUrl}`);

    const response = await fetch(detailUrl);
    if (!response.ok) {
      console.error(`[${sourceName}] Failed to fetch earthquake data from ${detailUrl}: ${response.status}`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Earthquake data not found.</body></html>`, {
        status: 404,
        headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" },
      });
    }
    const quakeData = await response.json();

    if (!quakeData || !quakeData.properties || !quakeData.geometry) {
      console.error(`[${sourceName}] Invalid earthquake data structure from ${detailUrl}`);
      return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Invalid earthquake data.</body></html>`, {
        status: 500,
        headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" },
      });
    }

    const mag = quakeData.properties.mag;
    const place = quakeData.properties.place;
    const dateObj = new Date(quakeData.properties.time);
    const readableTime = dateObj.toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC'
      });
    const isoTime = dateObj.toISOString();
    const depth = quakeData.geometry.coordinates[2];
    const lat = quakeData.geometry.coordinates[1];
    const lon = quakeData.geometry.coordinates[0];
    const canonicalUrl = `${siteUrl}/quake/${quakeIdPathSegment}`;
    const usgsEventUrl = quakeData.properties.detail;

    const titleDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const title = `M ${mag} Earthquake - ${place} - ${titleDate} | Earthquakes Live`;
    const description = `Detailed report of the M ${mag} earthquake that struck near ${place} on ${titleDate} at ${dateObj.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'})} (UTC). Magnitude: ${mag}, Depth: ${depth} km. Location: ${lat.toFixed(2)}, ${lon.toFixed(2)}. Stay updated with Earthquakes Live.`;

    let significanceSentence = `This earthquake occurred at a depth of ${depth} km.`;
    if (depth < 70) {
      significanceSentence = `This shallow earthquake (depth: ${depth} km) may have been felt by many people in the area.`;
    } else if (depth > 300) {
      significanceSentence = `This earthquake occurred very deep (depth: ${depth} km).`;
    }

    const keywords = `earthquake, ${place ? place.split(', ').join(', ') : ''}, M${mag}, seismic event, earthquake report`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": `M ${mag} - ${place}`,
      "description": description,
      "startDate": isoTime,
      "location": {
        "@type": "Place",
        "geo": { "@type": "GeoCoordinates", "latitude": lat, "longitude": lon, "elevation": -depth * 1000 },
        "name": place
      },
      "identifier": quakeData.id,
      "url": canonicalUrl,
      "keywords": keywords.toLowerCase()
    };
    if (usgsEventUrl) {
      jsonLd.sameAs = usgsEventUrl;
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
        headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" }
    });

  } catch (error) {
    console.error(`[${sourceName}] Error: ${error.message}`, error);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering earthquake page.</body></html>`, {
      status: 500,
      headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" },
    });
  }
}

async function handlePrerenderCluster(request, env, ctx, clusterId) {
  const sourceName = "prerender-cluster";
  const siteUrl = "https://earthquakeslive.com";

  if (!env.CLUSTER_KV) {
    console.error(`[${sourceName}] CLUSTER_KV not configured.`);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Service configuration error.</body></html>`, {
      status: 500,
      headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" },
    });
  }

  try {
    console.log(`[${sourceName}] Prerendering cluster: ${clusterId}`);
    const clusterDataString = await env.CLUSTER_KV.get(clusterId);

    if (!clusterDataString) {
      console.warn(`[${sourceName}] Cluster definition not found for ID: ${clusterId}`);
      return new Response(`<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Cluster not found.</body></html>`, {
        status: 404,
        headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" },
      });
    }

    const clusterData = JSON.parse(clusterDataString);
    const { earthquakeIds, strongestQuakeId, updatedAt } = clusterData;
    const numEvents = earthquakeIds ? earthquakeIds.length : 0;
    const canonicalUrl = `${siteUrl}/cluster/${clusterId}`;
    const formattedUpdatedAt = new Date(updatedAt).toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC'
    });

    let strongestQuakeDetails = null;
    let title, description, bodyContent, keywords;

    if (strongestQuakeId) {
      try {
        const quakeDetailUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${strongestQuakeId}.geojson`;
        console.log(`[${sourceName}] Fetching strongest quake details from: ${quakeDetailUrl}`);
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
              id: quakeData.id,
              url: quakeData.properties.detail,
              latitude: quakeData.geometry?.coordinates?.[1],
              longitude: quakeData.geometry?.coordinates?.[0]
            };
            console.log(`[${sourceName}] Successfully fetched details for strongest quake: ${strongestQuakeId}`);
          }
        } else {
          console.warn(`[${sourceName}] Failed to fetch strongest quake details for ${strongestQuakeId}: ${res.status}`);
        }
      } catch (e) {
        console.error(`[${sourceName}] Error fetching strongest quake details for ${strongestQuakeId}: ${e.message}`);
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
      title = `Earthquake Cluster - ${clusterId} | Earthquakes Live`;
      description = `Details of earthquake cluster ${clusterId}, containing ${numEvents} seismic events. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${clusterId}, tectonic activity`;
      bodyContent = `
        <p>This page provides details about an earthquake cluster identified as <strong>${escapeXml(clusterId)}</strong>.</p>
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
        "identifier": strongestQuakeDetails.id,
        ...(strongestQuakeDetails.url && { "url": strongestQuakeDetails.url })
      };
      if (typeof strongestQuakeDetails.latitude === 'number' && typeof strongestQuakeDetails.longitude === 'number') {
        jsonLd.location = {
          "@type": "Place",
          "name": strongestQuakeDetails.place,
          "geo": { "@type": "GeoCoordinates", "latitude": strongestQuakeDetails.latitude, "longitude": strongestQuakeDetails.longitude }
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
        headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=1800" }
    });

  } catch (error) {
    console.error(`[${sourceName}] Error processing cluster ${clusterId}: ${error.message}`, error);
    return new Response(`<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering cluster page.</body></html>`, {
      status: 500,
      headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=3600" },
    });
  }
}
// --- End Prerendering Functions ---


export default {
  async fetch(request, env, ctx) {
    const mainSourceName = "worker-router";
    const url = new URL(request.url);
    const pathname = url.pathname;
    console.log(`[${mainSourceName}] Received request for: ${pathname}`);

    // Prerendering for crawlers
    if (isCrawler(request)) {
      if (pathname.startsWith("/quake/")) {
        const quakeIdPathSegment = pathname.substring("/quake/".length);
        if (quakeIdPathSegment) {
          return handlePrerenderEarthquake(request, env, ctx, quakeIdPathSegment);
        }
      } else if (pathname.startsWith("/cluster/")) {
        const clusterId = pathname.substring("/cluster/".length);
        if (clusterId) {
          return handlePrerenderCluster(request, env, ctx, clusterId);
        }
      }
    }

    // Sitemap routes
    if (pathname === "/sitemap-index.xml") {
      return handleSitemapIndexRequest(request, env, ctx);
    }
    else if (pathname === "/sitemap-static-pages.xml") {
      return handleStaticPagesSitemapRequest(request, env, ctx);
    }
    else if (pathname === "/sitemap-earthquakes.xml") {
      return handleEarthquakesSitemapRequest(request, env, ctx);
    }
    else if (pathname === "/sitemap-clusters.xml") {
      return handleClustersSitemapRequest(request, env, ctx);
    }

    // API routes
    else if (pathname === "/api/cluster-definition") {
      return handleClusterDefinitionRequest(request, env, ctx, url);
    } else if (pathname === "/api/usgs-proxy") {
      const apiUrl = url.searchParams.get("apiUrl");
      if (!apiUrl) {
        return jsonErrorResponse("Missing apiUrl query parameter for proxy request", 400, "usgs-proxy-router");
      }
      return handleUsgsProxyRequest(request, env, ctx, apiUrl);
    }

    // Fallback for old proxy behavior if apiUrl is present on an unhandled path.
    // This might be removed if all clients are updated to use /api/usgs-proxy
    const apiUrlParam = url.searchParams.get("apiUrl");
    if (apiUrlParam) {
        console.warn(`[${mainSourceName}] Request to unspecific path ${pathname} with apiUrl, proceeding with proxy. Consider using /api/usgs-proxy explicitly.`);
        return handleUsgsProxyRequest(request, env, ctx, apiUrlParam);
    }

    // Fallback to serving static assets
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404) {
        // Check if it's a navigation request (likely an SPA route)
        const acceptHeader = request.headers.get('Accept');
        if (acceptHeader && acceptHeader.includes('text/html')) {
          console.log(`[${mainSourceName}] SPA route or missing asset for ${pathname}. Serving index.html.`);
          return env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), request));
        }
      }
      return assetResponse;
    } catch (e) {
      // Log the error and return a generic error response
      console.error(`[${mainSourceName}] Error fetching from ASSETS: ${e.message}`, e);
      return new Response("An error occurred while serving the request.", { status: 500 });
    }
  },
};
