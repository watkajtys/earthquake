// Backend restored from the live deployed Worker bundle (2026-08).
// Frontend assets are built and deployed with this Worker through the ASSETS binding.
import { onRequestGet } from '../functions/api/cluster-detail-with-quakes.js';
import { handleUsgsProxy } from '../functions/routes/api/usgs-proxy.js';
import { handleTrustedUsgsIngestion } from '../functions/background/ingest-usgs-feed.js';
import { fetchValidatedDetail, isValidUsgsEventId, usgsDetailUrl } from '../functions/utils/usgs-transport.js';
import { persistEarthquakeDetail } from '../functions/utils/earthquakeDetailPersistence.js';
import { createScheduledTaskLogger } from './utils/scheduledTaskLogger.js';
import { onRequestGet as onRequestGet2 } from '../functions/api/get-earthquakes.js';
import { onRequestGet as onRequestGet3 } from '../functions/api/get-clusters.js';
import { handleBatchUsgsFetch } from '../functions/api/batch-usgs-fetch.js';
import { handleIndexSitemap } from '../functions/routes/sitemaps/index-sitemap.js';
import { handleEarthquakesSitemap } from '../functions/routes/sitemaps/earthquakes-sitemap.js';
import { onRequestGet as onRequestGet4, onRequestDelete } from '../functions/api/cache-stats.js';
import { onRequestGet as onRequestGet5 } from '../functions/api/system-health.js';
import { onRequestGet as onRequestGet6 } from '../functions/api/task-metrics.js';
import { onRequestGet as onRequestGet7 } from '../functions/api/system-logs.js';
import geojson_archive_default from '../functions/consumers/geojson-archive.js';
import { handleGenerateLists } from '../functions/background/generate-lists.js';
import process_cluster_definitions_default from '../functions/background/process-cluster-definitions.js';
import reconcile_stats_default from '../functions/background/reconcile-stats.js';
import { findActiveClustersOptimized } from '../functions/utils/spatialClusterUtils.js';
import { CLUSTER_MIN_QUAKES } from './constants/appConstants.js';
import { handleLegacyStaticAsset } from './legacyStaticAssets.js';
import { enforceRoutePolicy, finalizeResponse, policyError, readBoundedJson, RequestPolicyError, validateCalculation } from './utils/workerRequestPolicy.js';
import { releaseIdentity } from './utils/releaseIdentity.js';

var jsonErrorResponse = (message, status, sourceName, upstreamStatus = void 0) => {
    const errorBody = {
      status: "error",
      message,
      source: sourceName,
    };
    if (upstreamStatus !== void 0) {
      errorBody.upstream_status = upstreamStatus;
    }
    return new Response(JSON.stringify(errorBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
function escapeXml2(unsafe) {
  if (typeof unsafe !== "string") {
    return "";
  }
  return unsafe.replace(/[<>&"']/g, function (c) {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return c;
    }
  });
}
function isCrawler(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  const crawlerRegex =
    /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot/i;
  return crawlerRegex.test(userAgent);
}
async function handleStaticPagesSitemapRequest() {
  const today = /* @__PURE__ */ new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const lastModified = `${year}-${month}-${day}`;
  const staticPages = [
    {
      loc: "https://earthquakeslive.com/",
      priority: "1.0",
      changefreq: "daily",
      lastmod: lastModified,
    },
    {
      loc: "https://earthquakeslive.com/overview",
      priority: "0.9",
      changefreq: "daily",
      lastmod: lastModified,
    },
    {
      loc: "https://earthquakeslive.com/feeds",
      priority: "0.9",
      changefreq: "hourly",
      lastmod: lastModified,
    },
    // Feeds page itself might change if new feed types are added
  ];
  const feedPeriods = [
    {
      period: "last_hour",
      priority: "0.9",
      changefreq: "hourly",
      lastmod: lastModified,
    },
    {
      period: "last_24_hours",
      priority: "0.9",
      changefreq: "hourly",
      lastmod: lastModified,
    },
    {
      period: "last_7_days",
      priority: "0.9",
      changefreq: "daily",
      lastmod: lastModified,
    },
    {
      period: "last_30_days",
      priority: "0.7",
      changefreq: "daily",
      lastmod: lastModified,
    },
  ];
  let urlsXml = "";
  staticPages.forEach((page) => {
    urlsXml += `
  <url><loc>${page.loc}</loc><lastmod>${page.lastmod}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`;
  });
  feedPeriods.forEach((feed) => {
    urlsXml += `
  <url><loc>https://earthquakeslive.com/feeds?activeFeedPeriod=${feed.period}</loc><lastmod>${feed.lastmod}</lastmod><changefreq>${feed.changefreq}</changefreq><priority>${feed.priority}</priority></url>`;
  });
  urlsXml += `
  <url><loc>https://earthquakeslive.com/learn</loc><lastmod>${lastModified}</lastmod><priority>0.5</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/magnitude-vs-intensity</loc><lastmod>${lastModified}</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/measuring-earthquakes</loc><lastmod>${lastModified}</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/plate-tectonics</loc><lastmod>${lastModified}</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>`;
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlsXml}
</urlset>`;
  return new Response(sitemapXML, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
async function handleClustersSitemapRequest(request, env) {
  const sourceName = "clusters-sitemap-handler";
  const DB = env.DB;
  let clustersXml = "";
  const currentDate = /* @__PURE__ */ new Date().toISOString();
  if (!DB) {
    console.error(`[${sourceName}] D1 Database (DB) not available`);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- D1 Database not available -->
</urlset>`,
      {
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  }
  try {
    const stmt = DB.prepare(
      "SELECT slug, updatedAt FROM ClusterDefinitions WHERE slug IS NOT NULL AND slug <> '' ORDER BY updatedAt DESC LIMIT 500",
    );
    const { results } = await stmt.all();
    if (results && results.length > 0) {
      for (const row of results) {
        const d1Slug = row.slug;
        const lastmod = row.updatedAt
          ? new Date(row.updatedAt).toISOString()
          : currentDate;
        const slugPatternRegex = /^overview_cluster_([a-zA-Z0-9]+)_(\d+)$/;
        const slugMatch = d1Slug.match(slugPatternRegex);
        if (!slugMatch) {
          const sitemapUrlPath = d1Slug.startsWith("/")
            ? d1Slug.substring(1)
            : d1Slug;
          const sitemapUrl = `https://earthquakeslive.com/cluster/${sitemapUrlPath}`;
          clustersXml += `
  <url><loc>${escapeXml2(sitemapUrl)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
          continue;
        }
        const strongestQuakeIdFromDb = slugMatch[1];
        const quakeCountFromDb = slugMatch[2];
        let quakeData;
        try {
          quakeData = await fetchValidatedDetail(strongestQuakeIdFromDb);
        } catch (fetchError) {
          console.error(
            `[${sourceName}] Error fetching USGS data for ${strongestQuakeIdFromDb}: ${fetchError.message}. Skipping.`,
          );
          continue;
        }
        if (!quakeData || !quakeData.properties) {
          console.warn(
            `[${sourceName}] Invalid or missing properties in USGS data for ${strongestQuakeIdFromDb}. Skipping.`,
          );
          continue;
        }
        const locationName = quakeData.properties.place;
        const maxMagnitude = quakeData.properties.mag;
        if (!locationName || typeof locationName !== "string") {
          console.warn(
            `[${sourceName}] Missing or invalid locationName for ${strongestQuakeIdFromDb}. Skipping.`,
          );
          continue;
        }
        if (
          maxMagnitude === null ||
          maxMagnitude === void 0 ||
          typeof maxMagnitude !== "number"
        ) {
          console.warn(
            `[${sourceName}] Missing or invalid maxMagnitude for ${strongestQuakeIdFromDb}. Skipping.`,
          );
          continue;
        }
        const locationSlug = locationName
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        const newUrl = `https://earthquakeslive.com/cluster/${quakeCountFromDb}-quakes-near-${locationSlug}-up-to-m${maxMagnitude.toFixed(1)}-${strongestQuakeIdFromDb}`;
        clustersXml += `
  <url><loc>${escapeXml2(newUrl)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
      }
    } else {
      console.log(
        `[${sourceName}] No cluster definitions found in D1 table ClusterDefinitions.`,
      );
    }
  } catch (error) {
    console.error(
      `[${sourceName}] Exception querying or processing cluster data from D1: ${error.message}`,
      error,
    );
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- Exception processing cluster data from D1: ${escapeXml2(error.message)} -->
</urlset>`,
      {
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  }
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${clustersXml}
</urlset>`;
  return new Response(sitemapXML, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=10800",
    },
  });
}
async function handlePrerenderEarthquake(
  request,
  env,
  ctx,
  quakeIdPathSegment,
) {
  const sourceName = "prerender-earthquake";
  const siteUrl = "https://earthquakeslive.com";
  try {
    const parts = quakeIdPathSegment ? quakeIdPathSegment.split("-") : [];
    const usgsId = parts.length > 1 ? parts[parts.length - 1] : null;
    if (!usgsId) {
      console.error(
        `[${sourceName}] Could not extract usgs-id from quakeIdPathSegment: ${quakeIdPathSegment}`,
      );
      return new Response(
        `<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Invalid earthquake identifier.</body></html>`,
        {
          status: 404,
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600",
          },
        },
      );
    }
    const detailUrl = usgsDetailUrl(usgsId);
    const quakeData = await fetchValidatedDetail(usgsId);
    if (!quakeData || !quakeData.properties || !quakeData.geometry) {
      console.error(
        `[${sourceName}] Invalid earthquake data structure from ${detailUrl} (USGS ID: ${usgsId})`,
      );
      return new Response(
        `<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Invalid earthquake data.</body></html>`,
        {
          status: 500,
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600",
          },
        },
      );
    }
    const { mag, place, time } = quakeData.properties;
    const dateObj = new Date(time);
    const readableTime = dateObj.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: "UTC",
    });
    const isoTime = dateObj.toISOString();
    const depth = quakeData.geometry.coordinates[2];
    const lat = quakeData.geometry.coordinates[1];
    const lon = quakeData.geometry.coordinates[0];
    const canonicalUrl = `${siteUrl}/quake/${quakeIdPathSegment}`;
    const usgsEventUrl = quakeData.properties.detail;
    const titleDate = dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    const pageTitle = `M ${mag} Earthquake - ${place} - ${titleDate} | Earthquakes Live`;
    const description = `Detailed report of the M ${mag} earthquake that struck near ${place} on ${titleDate} at ${dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} (UTC). Magnitude: ${mag}, Depth: ${depth} km. Location: ${lat.toFixed(2)}, ${lon.toFixed(2)}. Stay updated with Earthquakes Live.`;
    let significanceSentence = `This earthquake occurred at a depth of ${depth} km.`;
    if (depth < 70)
      significanceSentence = `This shallow earthquake (depth: ${depth} km) may have been felt by many people in the area.`;
    else if (depth > 300)
      significanceSentence = `This earthquake occurred very deep (depth: ${depth} km).`;
    const keywordDateFormatter = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const keywordDateString = keywordDateFormatter
      .format(dateObj)
      .toLowerCase();
    const baseKeywords = `earthquake, ${place ? place.split(", ").join(", ") : ""}, M${mag}, seismic event, earthquake report`;
    const keywords = `${baseKeywords}, ${keywordDateString}`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: `M ${mag} - ${place}`,
      description: description,
      startDate: isoTime,
      endDate: isoTime,
      // Setting endDate same as startDate for simplicity
      eventStatus: "https://schema.org/EventHappened",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: place,
        geo: {
          "@type": "GeoCoordinates",
          latitude: lat,
          longitude: lon,
          elevation: -depth * 1e3,
          // Schema.org uses meters for elevation, depth is in km
        },
      },
      image: ["https://earthquakeslive.com/social-default-earthquake.png"],
      organizer: {
        "@type": "Organization",
        name: "Earthquakes Live",
        url: "https://earthquakeslive.com",
      },
      identifier: quakeData.id,
      url: canonicalUrl,
      keywords: keywords.toLowerCase(),
    };
    if (usgsEventUrl) jsonLd.sameAs = usgsEventUrl;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeXml2(pageTitle)}</title><meta name="description" content="${escapeXml2(description)}"><meta name="keywords" content="${escapeXml2(keywords.toLowerCase())}"><link rel="canonical" href="${escapeXml2(canonicalUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@builtbyvibes"><meta property="og:title" content="${escapeXml2(pageTitle)}"><meta property="og:description" content="${escapeXml2(description)}"><meta property="og:url" content="${escapeXml2(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png"><script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script></head><body><h1>${escapeXml2(pageTitle)}</h1><p><strong>Time:</strong> ${escapeXml2(readableTime)}</p><p><strong>Location:</strong> ${escapeXml2(place)}</p><p><strong>Coordinates:</strong> ${lat.toFixed(4)}\xB0N, ${lon.toFixed(4)}\xB0E</p><p><strong>Magnitude:</strong> M ${mag}</p><p><strong>Depth:</strong> ${depth} km</p><p>${escapeXml2(significanceSentence)}</p>${usgsEventUrl ? `<p><a href="${escapeXml2(usgsEventUrl)}" target="_blank" rel="noopener noreferrer">View on USGS Event Page</a></p>` : ""}<div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "public, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error(`[${sourceName}] Error: ${error.message}`, error);
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering earthquake page.</body></html>`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, s-maxage=3600",
        },
      },
    );
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
    return new Response(
      `<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Invalid cluster URL format.</body></html>`,
      {
        status: 404,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, s-maxage=3600",
        },
      },
    );
  }
  const extractedCount = match[1];
  const extractedStrongestQuakeId = match[2];
  const clusterIdForD1Query = `overview_cluster_${extractedStrongestQuakeId}_${extractedCount}`;
  if (!env.DB) {
    console.error(
      `[${sourceName}] D1 Database (env.DB) not configured for prerendering cluster.`,
    );
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Service configuration error.</body></html>`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, s-maxage=3600",
        },
      },
    );
  }
  try {
    const stmt = env.DB.prepare(
      "SELECT id, slug, title, description, earthquakeIds, strongestQuakeId, updatedAt, locationName, maxMagnitude, startTime, endTime, quakeCount FROM ClusterDefinitions WHERE slug = ?",
    ).bind(clusterIdForD1Query);
    const clusterInfo = await stmt.first();
    if (!clusterInfo) {
      console.warn(
        `[${sourceName}] Cluster definition not found in D1 for slug: ${clusterIdForD1Query} (derived from URL slug: ${urlSlug})`,
      );
      return new Response(
        `<!DOCTYPE html><html><head><title>Not Found</title><meta name="robots" content="noindex"></head><body>Cluster not found.</body></html>`,
        {
          status: 404,
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600",
          },
        },
      );
    }
    let earthquakeIds;
    try {
      earthquakeIds =
        typeof clusterInfo.earthquakeIds === "string"
          ? JSON.parse(clusterInfo.earthquakeIds)
          : clusterInfo.earthquakeIds;
    } catch (e) {
      console.error(
        `[${sourceName}] Error parsing earthquakeIds for D1 Query ID ${clusterIdForD1Query}: ${e.message}`,
      );
      return new Response(
        `<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error processing cluster data.</body></html>`,
        {
          status: 500,
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, s-maxage=3600",
          },
        },
      );
    }
    const d1StrongestQuakeId = clusterInfo.strongestQuakeId;
    const { updatedAt } = clusterInfo;
    const numEvents = earthquakeIds ? earthquakeIds.length : 0;
    const canonicalUrl = `${siteUrl}/cluster/${urlSlug}`;
    const formattedUpdatedAt = new Date(updatedAt).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: "UTC",
    });
    let strongestQuakeDetails = null,
      pageTitle,
      description,
      bodyContent,
      keywords;
    if (d1StrongestQuakeId) {
      try {
        const quakeData = await fetchValidatedDetail(d1StrongestQuakeId);
        strongestQuakeDetails = {
          mag: quakeData.properties.mag,
          place: quakeData.properties.place,
          time: new Date(quakeData.properties.time).toLocaleString("en-US", {
            year: "numeric", month: "long", day: "numeric", hour: "2-digit",
            minute: "2-digit", timeZoneName: "short", timeZone: "UTC",
          }),
          id: quakeData.id,
          url: usgsDetailUrl(quakeData.id),
          latitude: quakeData.geometry.coordinates[1],
          longitude: quakeData.geometry.coordinates[0],
        };
      } catch (e) {
        console.error(
          `[${sourceName}] Error fetching strongest quake details for ${d1StrongestQuakeId}: ${e.message}`,
        );
      }
    }
    if (strongestQuakeDetails) {
      pageTitle = `Earthquake Cluster near ${strongestQuakeDetails.place} | Earthquakes Live`;
      description = `Explore an active earthquake cluster near ${strongestQuakeDetails.place}, featuring ${numEvents} seismic events. The largest event in this sequence is a M ${strongestQuakeDetails.mag}. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${strongestQuakeDetails.place ? strongestQuakeDetails.place.split(", ").join(", ") : ""}, tectonic activity, M${strongestQuakeDetails.mag}`;
      bodyContent = `<p>This page provides details about an earthquake cluster located near <strong>${escapeXml2(strongestQuakeDetails.place)}</strong>.</p><p>This cluster contains <strong>${numEvents}</strong> individual seismic events.</p><p>The most significant earthquake in this cluster is a <strong>M ${strongestQuakeDetails.mag}</strong>, which occurred on ${escapeXml2(strongestQuakeDetails.time)}.</p>${strongestQuakeDetails.url ? `<p><a href="${escapeXml2(strongestQuakeDetails.url)}" target="_blank" rel="noopener noreferrer">View details for the largest event on USGS</a></p>` : ""}<p><em>Cluster information last updated: ${escapeXml2(formattedUpdatedAt)}.</em></p>`;
    } else {
      pageTitle = `Earthquake Cluster Summary (${numEvents} Events) | Earthquakes Live`;
      description = `Details of an earthquake cluster containing ${numEvents} seismic events. This cluster is identified by the strongest quake ID: ${extractedStrongestQuakeId}. Updated ${formattedUpdatedAt}.`;
      keywords = `earthquake cluster, seismic sequence, ${extractedStrongestQuakeId}, tectonic activity`;
      bodyContent = `<p>This page provides details about an earthquake cluster associated with the primary event ID <strong>${escapeXml2(extractedStrongestQuakeId)}</strong>.</p><p>This cluster contains <strong>${numEvents}</strong> individual seismic events.</p><p><em>Cluster information last updated: ${escapeXml2(formattedUpdatedAt)}.</em></p><p><em>Further details about the most significant event in this cluster are currently unavailable.</em></p>`;
    }
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: pageTitle,
      description,
      url: canonicalUrl,
      dateModified: new Date(updatedAt).toISOString(),
      keywords: keywords.toLowerCase(),
    };
    if (strongestQuakeDetails) {
      jsonLd.about = {
        "@type": "Event",
        name: `M ${strongestQuakeDetails.mag} - ${strongestQuakeDetails.place}`,
        identifier: strongestQuakeDetails.id,
        ...(strongestQuakeDetails.url && { url: strongestQuakeDetails.url }),
      };
      if (
        typeof strongestQuakeDetails.latitude === "number" &&
        typeof strongestQuakeDetails.longitude === "number"
      ) {
        jsonLd.location = {
          "@type": "Place",
          name: strongestQuakeDetails.place,
          geo: {
            "@type": "GeoCoordinates",
            latitude: strongestQuakeDetails.latitude,
            longitude: strongestQuakeDetails.longitude,
          },
        };
      }
    }
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeXml2(pageTitle)}</title><meta name="description" content="${escapeXml2(description)}"><meta name="keywords" content="${escapeXml2(keywords.toLowerCase())}"><link rel="canonical" href="${escapeXml2(canonicalUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@builtbyvibes"><meta property="og:title" content="${escapeXml2(pageTitle)}"><meta property="og:description" content="${escapeXml2(description)}"><meta property="og:url" content="${escapeXml2(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png"><script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script></head><body><h1>${escapeXml2(pageTitle)}</h1>${bodyContent}<p>Explore the live map and detailed list of events in this cluster on our interactive platform.</p><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "public, s-maxage=1800",
      },
    });
  } catch (error) {
    console.error(
      `[${sourceName}] Error processing cluster slug ${urlSlug} (D1 ID: ${clusterIdForD1Query || "not_constructed"}): ${error.message}`,
      error,
    );
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title><meta name="robots" content="noindex"></head><body>Error prerendering cluster page.</body></html>`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, s-maxage=3600",
        },
      },
    );
  }
}
async function handleEarthquakeDetailRequest(request, env, ctx, event_id) {
  const sourceName = "earthquake-detail-handler";
  if (!isValidUsgsEventId(event_id)) return policyError('Invalid event ID.', 400);
  if (env.GEOJSON_BUCKET) {
    const r2Object = await env.GEOJSON_BUCKET.get(`${event_id}.json`);
    if (r2Object !== null) {
      console.log(
        `[${sourceName}] Serving GeoJSON from R2 for event: ${event_id}.`,
      );
      const headers = new Headers();
      r2Object.writeHttpMetadata(headers);
      headers.set("etag", r2Object.httpEtag);
      headers.set("Content-Type", "application/json");
      headers.set("X-Data-Source", "R2-Storage");
      return new Response(r2Object.body, { headers });
    }
    console.log(
      `[${sourceName}] Event ${event_id} not found in R2. Proceeding to USGS fetch.`,
    );
  }
  try {
    const usgsUrl = usgsDetailUrl(event_id);
    console.log(
      `[${sourceName}] Fetching event ${event_id} from USGS: ${usgsUrl}`,
    );
    const geojsonFeature = await fetchValidatedDetail(event_id);
    if (env.DB && (env.GEOJSON_QUEUE || env.GEOJSON_BUCKET)) {
      ctx.waitUntil(persistEarthquakeDetail({ env, detailData: geojsonFeature, requestedId: event_id })
        .catch((error) => console.error(`[${sourceName}] Detail persistence failed for ${event_id}: ${error.message}`)));
    }
    return new Response(JSON.stringify(geojsonFeature), {
      headers: {
        "Content-Type": "application/json",
        "X-Data-Source": "USGS-API",
      },
    });
  } catch (usgsOrGeneralError) {
    console.error(
      `[${sourceName}] Error during USGS fetch/processing for event ${event_id}: ${usgsOrGeneralError.message}`,
      usgsOrGeneralError,
    );
    return jsonErrorResponse(
      'Earthquake detail is unavailable.',
      usgsOrGeneralError.status || 502,
      sourceName,
    );
  }
}
async function handleClusterDefinitionPost({ request, env }) {
  const sourceName = "cluster-definition-post-handler";
  if (!env.DB) {
    console.error(`[${sourceName}] D1 Database (DB) binding not found`);
    return jsonErrorResponse(
      "D1 Database (DB) binding not found",
      500,
      sourceName,
    );
  }
  let payload;
  try {
    payload = await readBoundedJson(request, 256 * 1024);
  } catch (e) {
    return policyError(e.message, e.status || 400);
  }
  const clusterId = payload?.clusterId ?? payload?.id;
  const earthquakeIds = payload?.earthquakeIds;
  const strongestQuakeId = payload?.strongestQuakeId;
  if (typeof clusterId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(clusterId)) {
    return jsonErrorResponse(
      "Invalid cluster data: clusterId must be a non-empty string.",
      400,
      sourceName,
    );
  }
  if (!Array.isArray(earthquakeIds) || earthquakeIds.length < 1 || earthquakeIds.length > 2000 ||
      !earthquakeIds.every(isValidUsgsEventId) || new Set(earthquakeIds).size !== earthquakeIds.length) {
    return jsonErrorResponse(
      "Invalid cluster data: earthquakeIds must be an array.",
      400,
      sourceName,
    );
  }
  if (!isValidUsgsEventId(strongestQuakeId) || !earthquakeIds.includes(strongestQuakeId)) {
    return jsonErrorResponse(
      "Invalid cluster data: strongestQuakeId must be a non-empty string.",
      400,
      sourceName,
    );
  }
  try {
    for (let offset = 0; offset < earthquakeIds.length; offset += 100) {
      const ids = earthquakeIds.slice(offset, offset + 100);
      const members = await env.DB.prepare(`SELECT id FROM EarthquakeEvents WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
      if (members.results?.length !== ids.length) return policyError('Cluster members must exist in the event database.', 400);
    }
    const existing = await env.DB.prepare(
      "SELECT id FROM ClusterDefinitions WHERE id = ?",
    )
      .bind(clusterId)
      .first();
    if (existing) {
      return new Response(
        JSON.stringify({ status: "already_registered", id: clusterId }),
        {
          // 201 even when already registered: the deployed frontend treats only
          // 201 as success and retries on any other status.
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO ClusterDefinitions
       (id, stableKey, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
        maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
        radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore, version,
        createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        clusterId,
        null,
        clusterId,
        strongestQuakeId,
        JSON.stringify(earthquakeIds),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        earthquakeIds.length,
        null,
        null,
        now,
        now,
      )
      .run();
    return new Response(
      JSON.stringify({ status: "registered", id: clusterId }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error(
      `[${sourceName}] Failed to store cluster definition for ${clusterId}: ${e.message}`,
      e,
    );
    return jsonErrorResponse(
      `Failed to store cluster definition: ${e.message}`,
      500,
      sourceName,
    );
  }
}
async function handleClusterDefinitionGet({ request, env }) {
  const sourceName = "cluster-definition-get-handler";
  if (!env.DB) {
    console.error(`[${sourceName}] D1 Database (DB) binding not found`);
    return jsonErrorResponse(
      "D1 Database (DB) binding not found",
      500,
      sourceName,
    );
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return jsonErrorResponse("Missing id query parameter.", 400, sourceName);
  }
  try {
    const result = await env.DB.prepare(
      `SELECT id, stableKey, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
              maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
              radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
              version, createdAt, updatedAt
       FROM ClusterDefinitions WHERE id = ?`,
    )
      .bind(id)
      .first();
    if (!result) {
      return new Response(`Cluster definition for id ${id} not found.`, {
        status: 404,
      });
    }
    return new Response(
      JSON.stringify({
        ...result,
        earthquakeIds: JSON.parse(result.earthquakeIds || "[]"),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error(
      `[${sourceName}] Error processing GET request: ${e.message}`,
      e,
    );
    return jsonErrorResponse(
      `Failed to process request: ${e.message}`,
      500,
      sourceName,
    );
  }
}
async function handleCalculateClusters({ request }) {
  const sourceName = "calculate-clusters-handler";
  let input;
  let originalFeatures;
  try {
    const payload = await readBoundedJson(request, 8 * 1024 * 1024);
    input = validateCalculation(payload, CLUSTER_MIN_QUAKES);
    originalFeatures = new Map(payload.earthquakes.map(feature => [feature.id, feature]));
  } catch (e) {
    return policyError(e.message, e.status || 400);
  }
  const { earthquakes, maxDistanceKm, minQuakes } = input;
  try {
    const clusters = findActiveClustersOptimized(
      earthquakes,
      maxDistanceKm,
      minQuakes,
    );
    return new Response(JSON.stringify({ clusters: clusters.map(cluster => cluster.map(feature => originalFeatures.get(feature.id))), cacheHit: "false" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache-Hit": "false",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(
      `[${sourceName}] Error calculating clusters: ${e.message}`,
      e,
    );
    return jsonErrorResponse(
      e.code === 'SPATIAL_BUDGET_EXCEEDED' ? 'Cluster calculation exceeds the work limit.' : 'Cluster calculation failed.',
      e.code === 'SPATIAL_BUDGET_EXCEEDED' ? 422 : 500,
      sourceName,
    );
  }
}
var worker_default = {
  ...geojson_archive_default,
  async fetch(request, env, ctx) {
    const userAgent = request.headers.get("User-Agent") || "";
    if (!userAgent.trim()) {
      return new Response("Forbidden: User-Agent required.", {
        status: 403,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
    if (
      /meta-externalagent|bytespider|GPTBot|ClaudeBot|Amazonbot|ImagesiftBot|CCBot/i.test(
        userAgent,
      )
    ) {
      return new Response("Forbidden: Automated AI scraping disallowed.", {
        status: 403,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
    if (/early hints|bastion/i.test(userAgent)) {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "public, max-age=300" },
      });
    }
    const url = new URL(request.url);
    const pathname = url.pathname;
    const denied = await enforceRoutePolicy(request, env);
    if (denied) return denied;
    if (pathname === '/api/release-identity') {
      if (!['GET', 'HEAD'].includes(request.method)) return policyError('Method Not Allowed', 405, { Allow: 'GET, HEAD' });
      return releaseIdentity(env);
    }
    if (isCrawler(request)) {
      if (pathname.startsWith("/quake/")) {
        const quakeIdPathSegment = pathname.substring("/quake/".length);
        if (quakeIdPathSegment)
          return handlePrerenderEarthquake(
            request,
            env,
            ctx,
            quakeIdPathSegment,
          );
      } else if (pathname.startsWith("/cluster/")) {
        const clusterId = pathname.substring("/cluster/".length);
        if (clusterId)
          return handlePrerenderCluster(request, env, ctx, clusterId);
      }
    }
    if (pathname === "/sitemap-index.xml")
      return handleIndexSitemap({ request, env, ctx });
    if (pathname === "/sitemap-static-pages.xml")
      return handleStaticPagesSitemapRequest();
    if (pathname.startsWith("/sitemaps/earthquakes-")) {
      return handleEarthquakesSitemap({ request, env, ctx });
    }
    if (pathname === "/sitemap-clusters.xml")
      return handleClustersSitemapRequest(request, env);
    if (pathname === "/api/usgs-proxy") {
      return handleUsgsProxy({ request, env, executionContext: ctx });
    }
    if (pathname.startsWith("/api/earthquake/")) {
      const parts = pathname.split("/");
      if (parts.length === 4 && parts[3]) {
        try {
          const event_id = decodeURIComponent(parts[3]);
          return handleEarthquakeDetailRequest(request, env, ctx, event_id);
        } catch (e) {
          if (e instanceof URIError)
            return jsonErrorResponse(
              "Invalid event_id encoding",
              400,
              "worker-router-earthquake-decode",
            );
          console.error(
            `[worker-fetch-earthquake] Unexpected error: ${e.message}`,
            e,
          );
          return jsonErrorResponse(
            "Error processing earthquake request",
            500,
            "worker-router-earthquake-unexpected",
          );
        }
      } else {
        return jsonErrorResponse(
          "Invalid earthquake event ID path",
          400,
          "worker-router-earthquake-format",
        );
      }
    }
    if (
      pathname === "/api/cluster-detail-with-quakes" &&
      request.method === "GET"
    ) {
      return onRequestGet({ request, env, ctx });
    }
    if (pathname === "/api/get-clusters" && request.method === "GET") {
      return onRequestGet3({ request, env, ctx });
    }
    if (pathname === "/api/get-earthquakes" && request.method === "GET") {
      return onRequestGet2({ request, env, ctx });
    }
    if (pathname === "/api/batch-usgs-fetch" && request.method === "POST") {
      return handleBatchUsgsFetch({ request, env, ctx });
    }
    if (pathname === "/api/backfill-earthquake-details") {
      const { onRequestPost: onRequestPost2 } =
        await import('../functions/api/backfill-earthquake-details.js');
      return onRequestPost2({ request, env, ctx });
    }
    if (
      pathname === "/api/fix-enhanced-data-flag" &&
      request.method === "POST"
    ) {
      const { onRequestGet: onRequestGet10 } = await import('../functions/api/fix-enhanced-data-flag.js');
      return onRequestGet10({ request, env, ctx });
    }
    if (pathname === "/api/cache-stats") {
      if (request.method === "GET") {
        return onRequestGet4({ request, env, ctx });
      } else if (request.method === "DELETE") {
        return onRequestDelete({ request, env, ctx });
      } else {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET, DELETE" },
        });
      }
    }
    if (pathname === "/api/system-health" && request.method === "GET") {
      return onRequestGet5({ request, env, ctx });
    }
    if (pathname === "/api/task-metrics" && request.method === "GET") {
      return onRequestGet6({ request, env, ctx });
    }
    if (pathname === "/api/system-logs" && request.method === "GET") {
      return onRequestGet7({ request, env, ctx });
    }
    if (pathname === "/api/cluster-definition") {
      if (request.method === "POST") {
        return handleClusterDefinitionPost({ request, env });
      } else if (request.method === "GET") {
        return handleClusterDefinitionGet({ request, env });
      } else {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST, GET" },
        });
      }
    }
    if (
      pathname === "/api/calculate-clusters" &&
      request.method === "POST"
    ) {
      return handleCalculateClusters({ request });
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return jsonErrorResponse("API endpoint not found", 404, "worker-router");
    }
    const legacyAsset = await handleLegacyStaticAsset(request, env);
    return legacyAsset || env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    const logger = createScheduledTaskLogger(
      "scheduled-worker",
      event.scheduledTime,
    );
    logger.addContext("cronTrigger", { cron: event.cron });
    switch (event.cron) {
      case "*/5 * * * *":
        console.log(
          `[worker-scheduled] Cron matched '${event.cron}'. Running high-frequency tasks.`,
        );
        logger.logMilestone("High-frequency tasks started");
        ctx.waitUntil(
          this.fetchLatestUsgsData(event, env, ctx, logger)
            .then((proxyResponse) => {
              if (proxyResponse && proxyResponse.ok) {
                return proxyResponse.json();
              }
              return null;
            })
            .then((proxyData) => {
              if (proxyData && proxyData.newOrUpdatedFeatures) {
                return this.generateFrontendLists(
                  event,
                  env,
                  ctx,
                  logger,
                  proxyData.newOrUpdatedFeatures,
                );
              } else {
                logger.logMilestone(
                  "Skipping list generation due to no new data or upstream error.",
                );
                console.log(
                  "[worker-scheduled] Skipping list generation: no new data or upstream error.",
                );
              }
            })
            .catch((err) => {
              logger.logError("HIGH_FREQ_TASK_CHAIN_ERROR", err, {}, true);
              throw err;
            }),
        );
        break;
      case "*/30 * * * *":
        console.log(
          `[worker-scheduled] Cron matched '${event.cron}'. Running backfill task.`,
        );
        logger.logMilestone("Backfill task started");
        ctx.waitUntil(this.runAutomatedBackfill(event, env, ctx, logger));
        break;
      case "*/10 * * * *":
        console.log(
          `[worker-scheduled] Cron matched '${event.cron}'. Running cluster definition processing.`,
        );
        logger.logMilestone("Cluster definition processing started");
        ctx.waitUntil(
          process_cluster_definitions_default.scheduled(event, env, ctx),
        );
        break;
      case "0 0 * * *":
        console.log(
          `[worker-scheduled] Cron matched '${event.cron}'. Running daily stat reconciliation.`,
        );
        logger.logMilestone("Daily stat reconciliation started");
        ctx.waitUntil(reconcile_stats_default.scheduled(event, env, ctx));
        break;
      default:
        console.warn(
          `[worker-scheduled] Cron matched '${event.cron}' has no defined task.`,
        );
        logger.logError(
          "UNKNOWN_CRON",
          `No task defined for cron: ${event.cron}`,
          {},
          false,
        );
    }
  },
  /**
   * Fetches the latest earthquake data from the USGS feed.
   * This is part of the high-frequency tasks.
   */
  async fetchLatestUsgsData(event, env, ctx, parentLogger) {
    const logger =
      parentLogger ||
      createScheduledTaskLogger("usgs-data-sync", event.scheduledTime);
    logger.addContext("environment", {
      hasDB: !!env.DB,
      hasUsgsKV: !!env.USGS_LAST_RESPONSE_KV,
      workerVersion: "scheduled-v1.0",
    });
    if (!env.DB) {
      logger.logError(
        "MISSING_BINDING",
        "D1 Database (DB) binding not found",
        { binding: "DB" },
        true,
      );
      logger.logTaskCompletion(false, { error: "Missing required DB binding" });
      throw new Error('Missing required DB binding');
    }
    logger.logMilestone("Environment validation passed", {
      dbAvailable: true,
      kvAvailable: !!env.USGS_LAST_RESPONSE_KV,
    });
    const USGS_FEED_URL =
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
    logger.addContext("apiEndpoint", { usgsUrl: USGS_FEED_URL, feedType: "all_hour" });
    try {
      const response = await handleTrustedUsgsIngestion({ env, executionContext: ctx, logger, feedKey: 'hour' });
      if (!response.ok) throw new Error(`Trusted ingestion returned HTTP ${response.status}`);
      logger.logTaskCompletion(true, { status: response.status });
      return response;
    } catch (error) {
      logger.logError("INGESTION_ERROR", error, {}, true);
      logger.logTaskCompletion(false, { error: error.message });
      throw error;
    }
  },
  /**
   * Generates the frontend earthquake lists and stores them in R2.
   * This is part of the high-frequency tasks.
   */
  async generateFrontendLists(event, env, ctx, parentLogger, newFeatures) {
    const logger =
      parentLogger ||
      createScheduledTaskLogger("generate-lists", event.scheduledTime);
    console.log(
      `[worker-scheduled] Generating lists with ${newFeatures.length} new/updated features.`,
    );
    try {
      await handleGenerateLists({ env, newFeatures });
      logger.logMilestone("List generation complete");
    } catch (error) {
      logger.logError(
        "LIST_GENERATION_ERROR",
        error.message,
        { stack: error.stack },
        true,
      );
      throw error;
    }
  },
  /**
   * Runs the automated backfill process for enriching historical earthquake data.
   * This is a low-frequency task.
   */
  async runAutomatedBackfill(event, env, ctx, parentLogger) {
    const logger =
      parentLogger ||
      createScheduledTaskLogger("automated-backfill", event.scheduledTime);
    console.log("[scheduled-backfill] Starting automated backfill process");
    try {
      const { onRequestGet: backfillHandler } = await import('../functions/api/backfill-earthquake-details.js');
      const backfillUrl = `https://dummy-host/api/backfill-earthquake-details?batch_size=10&min_magnitude=0&max_age_days=1`;
      const backfillRequest = new Request(backfillUrl, {
        method: "GET",
        headers: {
          "User-Agent": "CloudflareWorker-AutoBackfill/1.0",
          "X-Execution-ID": logger.executionId,
        },
      });
      const response = await backfillHandler({
        request: backfillRequest,
        env,
        ctx,
      });
      const result = await response.json();
      if (result.success) {
        console.log(
          `[scheduled-backfill] Processed ${result.processed} earthquakes with ${result.errors || 0} errors.`,
        );
        logger.logMilestone("Automated backfill complete", {
          processed: result.processed,
          errors: result.errors,
        });
      } else {
        console.error("[scheduled-backfill] Backfill failed:", result.error);
        logger.logError(
          "BACKFILL_ERROR",
          result.error || "Unknown error",
          { result },
          false,
        );
        throw new Error(result.error || 'Automated backfill failed');
      }
    } catch (backfillError) {
      console.error(
        "[scheduled-backfill] Error during automated backfill:",
        backfillError.message,
      );
      logger.logError(
        "BACKFILL_EXECUTION_ERROR",
        backfillError.message,
        {
          stack: backfillError.stack,
        },
        false,
      );
      throw backfillError;
    }
  },
};
export default {
  ...worker_default,
  async fetch(request, env, ctx) {
    try {
      return finalizeResponse(request, await worker_default.fetch(request, env, ctx), env);
    } catch (error) {
      if (error instanceof RequestPolicyError) return finalizeResponse(request, policyError(error.message, error.status), env);
      console.error('[worker-fetch] Request failed:', error.name);
      return finalizeResponse(request, policyError('Service unavailable.', 503), env);
    }
  },
};
