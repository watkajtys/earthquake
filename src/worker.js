// Backend restored from the live deployed Worker bundle (2026-08).
// Frontend assets are built and deployed with this Worker through the ASSETS binding.
import { onRequestGet } from '../functions/api/cluster-detail-with-quakes.js';
import { handleUsgsProxy } from '../functions/routes/api/usgs-proxy.js';
import { handleTrustedUsgsIngestion } from '../functions/background/ingest-usgs-feed.js';
import { fetchValidatedDetail, isValidUsgsEventId, usgsDetailUrl } from '../functions/utils/usgs-transport.js';
import { persistEarthquakeDetail } from '../functions/utils/earthquakeDetailPersistence.js';
import { readArchivedEarthquakeDetail } from '../functions/utils/earthquakeDetailRead.js';
import { createScheduledTaskLogger } from './utils/scheduledTaskLogger.js';
import { onRequestGet as onRequestGet2 } from '../functions/api/get-earthquakes.js';
import { onRequestGet as onRequestGet3 } from '../functions/api/get-clusters.js';
import { onRequestGet as getClusterSummaries } from '../functions/api/cluster-summaries.js';
import { onRequestGet as getEarthquakeFeeds } from '../functions/api/earthquake-feeds.js';
import { publishEarthquakeFeeds } from '../functions/background/publish-earthquake-feeds.js';
import { handleBatchUsgsFetch } from '../functions/api/batch-usgs-fetch.js';
import { handleIndexSitemap } from '../functions/routes/sitemaps/index-sitemap.js';
import { handleEarthquakesSitemap } from '../functions/routes/sitemaps/earthquakes-sitemap.js';
import { isEarthquakeSitemapEligible } from '../functions/routes/sitemaps/earthquake-sitemap-eligibility.js';
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
import { buildClusterPath, buildEarthquakePath, isValidClusterRouteValue, parseEarthquakePath, parseClusterPath, timestampMilliseconds } from './utils/entityRoutes.js';
import { CLUSTER_UPDATED_AT_MS_SQL, resolveClusterDefinition } from '../functions/utils/clusterResolver.js';

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
  const staticPages = [
    {
      loc: "https://earthquakeslive.com/",
      priority: "1.0",
      changefreq: "daily",
    },
    {
      loc: "https://earthquakeslive.com/overview",
      priority: "0.9",
      changefreq: "daily",
    },
  ];
  const feedPeriods = [
    {
      period: "last_hour",
      priority: "0.9",
      changefreq: "hourly",
    },
    {
      period: "last_24_hours",
      priority: "0.9",
      changefreq: "hourly",
    },
    {
      period: "last_7_days",
      priority: "0.9",
      changefreq: "daily",
    },
    {
      period: "last_30_days",
      priority: "0.7",
      changefreq: "daily",
    },
  ];
  let urlsXml = "";
  staticPages.forEach((page) => {
    urlsXml += `
  <url><loc>${page.loc}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`;
  });
  feedPeriods.forEach((feed) => {
    urlsXml += `
  <url><loc>https://earthquakeslive.com/feeds?activeFeedPeriod=${feed.period}</loc><changefreq>${feed.changefreq}</changefreq><priority>${feed.priority}</priority></url>`;
  });
  urlsXml += `
  <url><loc>https://earthquakeslive.com/learn</loc><priority>0.5</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/magnitude-vs-intensity</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/measuring-earthquakes</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/plate-tectonics</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/what-causes-earthquakes</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/earthquake-safety</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://earthquakeslive.com/learn/tsunamis-and-earthquakes</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>`;
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
  if (!DB) {
    console.error(`[${sourceName}] D1 Database (DB) not available`);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- D1 Database not available -->
</urlset>`,
      {
        status: 503,
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  try {
    const stmt = DB.prepare(
      `SELECT slug, updatedAt FROM ClusterDefinitions WHERE slug IS NOT NULL AND slug <> '' ORDER BY ${CLUSTER_UPDATED_AT_MS_SQL} DESC, id ASC LIMIT 500`,
    );
    const readResult = await stmt.all();
    if (readResult?.success !== true || !Array.isArray(readResult.results)) throw new Error('Cluster sitemap query failed');
    const { results } = readResult;
    if (results.length > 0) {
      for (const row of results) {
        // The stored slug is the same canonical path used by cluster detail
        // pages. Rebuilding old overview slugs from USGS detail both advertises
        // a different URL and multiplies each sitemap request into upstream calls.
        if (!isValidClusterRouteValue(row.slug)) continue;
        // The scheduled writer can refresh updatedAt without changing the
        // public cluster page. Do not advertise that clock as page freshness.
        const sitemapUrl = `https://earthquakeslive.com${buildClusterPath(row)}`;
        clustersXml += `
  <url><loc>${escapeXml2(sitemapUrl)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`;
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
        status: 503,
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "no-store",
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
async function crawlerAssetTags(request, env) {
  if (!env.ASSETS) return '';
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    if (!response.ok) return '';
    const shell = await response.text();
    // Only reuse built local assets from the trusted asset binding, never /src/main.jsx.
    return (shell.match(/<script\b[^>]*src=["']\/assets\/[^"']+["'][^>]*><\/script>|<link\b[^>]*href=["']\/assets\/[^"']+["'][^>]*>/gi) || []).join('');
  } catch { return ''; }
}
function crawlerError(message, status) {
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeXml2(message)} | Earthquakes Live</title><meta name="robots" content="noindex"></head><body><h1>${escapeXml2(message)}</h1><p><a href="/">Return to Earthquakes Live</a></p></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
async function crawlerDocument(request, env, { title, description, canonicalPath, body, structuredData, prerenderedEarthquakeRoute, verifiedClusterRoute, noIndex = false }) {
  const canonicalUrl = `https://earthquakeslive.com${canonicalPath}`;
  const assets = await crawlerAssetTags(request, env);
  const jsonLd = JSON.stringify({ ...structuredData, url: canonicalUrl }).replace(/</g, '\\u003c');
  const verifiedRouteAttribute = prerenderedEarthquakeRoute
    ? ` data-prerendered-earthquake-route="${escapeXml2(prerenderedEarthquakeRoute)}" data-prerendered-earthquake-indexable="${!noIndex}"`
    : verifiedClusterRoute ? ` data-verified-cluster-route="${escapeXml2(verifiedClusterRoute)}"` : '';
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${noIndex ? '<meta name="robots" content="noindex">' : ''}<title>${escapeXml2(title)} | Earthquakes Live</title><meta name="description" content="${escapeXml2(description)}"><link rel="canonical" href="${escapeXml2(canonicalUrl)}"><meta property="og:title" content="${escapeXml2(title)}"><meta property="og:description" content="${escapeXml2(description)}"><meta property="og:url" content="${escapeXml2(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:image" content="https://earthquakeslive.com/social-default-earthquake.png"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${jsonLd}</script>${assets}</head><body><div id="root"${verifiedRouteAttribute}><main><h1>${escapeXml2(title)}</h1>${body}<p><a href="/">Explore Earthquakes Live</a></p></main></div></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
async function handlePrerenderEarthquake(request, env) {
  const route = parseEarthquakePath(new URL(request.url).pathname);
  if (!route.ok) return crawlerError('Invalid earthquake URL', 404);
  // Indexability is based on the stored row used by the sitemap, even when
  // the detail body is archived. A missing DB binding cannot verify it.
  if (!env.DB) return crawlerError('Earthquake details unavailable', 503);
  try {
    const archived = await readArchivedEarthquakeDetail(env.GEOJSON_BUCKET, route.eventId, { db: env.DB });
    let quake = archived?.data;
    let storedSummary = archived?.storedSummary ?? null;
    if (!quake) {
      // Sitemap URLs come from EarthquakeEvents. An archive miss must not turn
      // every crawler request into an uncached upstream detail fetch.
      let row;
      try {
        row = await env.DB.prepare(`SELECT id, event_time, latitude, longitude, depth, magnitude, place,
          has_moment_tensor, has_focal_mechanism
          FROM EarthquakeEvents WHERE id = ? LIMIT 1`).bind(route.eventId).first();
      } catch (error) {
        console.error('[prerender-earthquake] Stored summary query failed:', error.message);
        return crawlerError('Earthquake details unavailable', 503);
      }
      if (row === null) return crawlerError('Earthquake not found', 404);
      if (!row || row.id !== route.eventId || !Number.isSafeInteger(row.event_time) ||
          !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) ||
          row.latitude < -90 || row.latitude > 90 ||
          row.longitude < -180 || row.longitude > 180 ||
          !Number.isFinite(row.depth) ||
          !(row.magnitude === null || Number.isFinite(row.magnitude)) ||
          !(row.place === null || typeof row.place === 'string') ||
          !Number.isFinite(new Date(row.event_time).getTime())) {
        return crawlerError('Earthquake details unavailable', 503);
      }
      storedSummary = row;
      quake = {
        id: row.id,
        properties: { mag: row.magnitude, place: row.place, time: row.event_time },
        geometry: { coordinates: [row.longitude, row.latitude, row.depth] },
      };
    }
    const { mag, place, time } = quake.properties;
    // Use the same stored fields as the sitemap, including for archived detail.
    // The archive reader already fetched this row while resolving its pointer.
    const indexable = isEarthquakeSitemapEligible(storedSummary);
    const magnitude = Number.isFinite(mag) ? mag.toFixed(1) : 'unknown';
    const location = place || 'Unknown location';
    const isoTime = new Date(time).toISOString();
    const title = `M ${magnitude} Earthquake — ${location}`;
    const description = `Earthquake near ${location} at ${isoTime}, magnitude ${magnitude}.`;
    const [longitude, latitude, depth] = quake.geometry.coordinates;
    return crawlerDocument(request, env, {
      title, description, canonicalPath: buildEarthquakePath(quake.id),
      // A 200 response backed by stored detail or D1 summary is stronger
      // evidence of page existence than a later, fallible browser JSON read.
      prerenderedEarthquakeRoute: new URL(request.url).pathname,
      noIndex: !indexable,
      body: `<p>${escapeXml2(description)}</p><p>Depth: ${depth} km. Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}.</p>`,
      structuredData: { '@context': 'https://schema.org', '@type': 'Event', name: title, description, identifier: quake.id,
        startDate: isoTime, endDate: isoTime, eventStatus: 'https://schema.org/EventHappened',
        location: { '@type': 'Place', name: location, geo: { '@type': 'GeoCoordinates', latitude, longitude, elevation: -depth * 1000 } } },
    });
  } catch (error) {
    console.error('[prerender-earthquake] Failed to resolve earthquake:', error.message);
    return crawlerError(error.status === 404 ? 'Earthquake not found' : 'Earthquake details unavailable', error.status === 404 ? 404 : error.status >= 500 ? error.status : 502);
  }
}
async function handlePrerenderCluster(request, env) {
  const route = parseClusterPath(new URL(request.url).pathname);
  if (!route.ok) return crawlerError('Invalid cluster URL', 404);
  if (!env.DB) return crawlerError('Cluster details unavailable', 503);
  try {
    const cluster = await resolveClusterDefinition(env.DB, { kind: 'route', value: route.route });
    if (!cluster) return crawlerError('Cluster not found', 404);
    const magnitude = Number.isFinite(cluster.maxMagnitude) ? cluster.maxMagnitude.toFixed(1) : 'unknown';
    const place = cluster.locationName || 'Unknown location';
    const title = cluster.title || `Earthquake Cluster near ${place}`;
    const description = cluster.description || `Earthquake cluster near ${place} with ${cluster.quakeCount ?? 'unknown'} events and maximum magnitude ${magnitude}.`;
    const updated = timestampMilliseconds(cluster.updatedAt);
    const modified = updated !== null && Number.isFinite(new Date(updated).getTime()) ? new Date(updated).toISOString() : null;
    return crawlerDocument(request, env, {
      title, description, canonicalPath: cluster.canonicalPath,
      verifiedClusterRoute: new URL(request.url).pathname,
      body: `<p>${escapeXml2(description)}</p><p>Events: ${escapeXml2(String(cluster.quakeCount ?? 'Unknown'))}. Maximum magnitude: ${escapeXml2(magnitude)}.</p>${modified ? `<p>Updated: ${escapeXml2(modified)}.</p>` : ''}`,
      structuredData: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description,
        identifier: cluster.id, ...(modified && { dateModified: modified }) },
    });
  } catch (error) {
    console.error('[prerender-cluster] Failed to resolve cluster:', error.message);
    return crawlerError('Cluster details unavailable', 500);
  }
}
async function handleEarthquakeDetailRequest(request, env, ctx, event_id) {
  const sourceName = "earthquake-detail-handler";
  if (!isValidUsgsEventId(event_id)) return policyError('Invalid event ID.', 400);
  try {
    const archived = await readArchivedEarthquakeDetail(env.GEOJSON_BUCKET, event_id, { db: env.DB });
    if (archived) return new Response(archived.body, { headers: archived.headers });
    const usgsUrl = usgsDetailUrl(event_id);
    console.log(
      `[${sourceName}] Fetching event ${event_id} from USGS: ${usgsUrl}`,
    );
    const geojsonFeature = await fetchValidatedDetail(event_id);
    if (env.DB) {
      const current = await env.DB.prepare(`SELECT source_updated_at_ms, event_time, latitude,
        longitude, depth, magnitude, place FROM EarthquakeEvents WHERE id = ?`)
        .bind(event_id).first();
      const coordinates = geojsonFeature.geometry.coordinates;
      const sameScience = current?.event_time === geojsonFeature.properties.time &&
        current.latitude === coordinates[1] && current.longitude === coordinates[0] &&
        current.depth === coordinates[2] && current.magnitude === geojsonFeature.properties.mag &&
        current.place === geojsonFeature.properties.place;
      if (current?.source_updated_at_ms != null &&
          (!Number.isSafeInteger(current.source_updated_at_ms) ||
            current.source_updated_at_ms > geojsonFeature.properties.updated ||
            (current.source_updated_at_ms === geojsonFeature.properties.updated && !sameScience))) {
        return jsonErrorResponse('Earthquake detail revision is not current.', 503, sourceName);
      }
    }
    if (env.DB && env.GEOJSON_BUCKET) {
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
    if (pathname === '/api/earthquake-feeds') {
      return getEarthquakeFeeds({ request, env });
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
    if (pathname === "/api/cluster-summaries") {
      if (!['GET', 'HEAD'].includes(request.method)) return policyError('Method Not Allowed', 405, { Allow: 'GET, HEAD' });
      return getClusterSummaries({ request, env, ctx });
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
          Promise.allSettled([
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
          publishEarthquakeFeeds(env).then(results => {
            console.log('[period-feeds] Publication results.', results);
          }).catch(error => {
            console.error('[period-feeds] Publication failed.', error.results ?? { status: 'failed' });
            throw error;
          }),
          ]).then(results => {
            // Both independent jobs finish before the platform sees failure.
            // A D1 failure cannot suppress complete USGS feed publication.
            const failure = results.find(result => result.status === 'rejected');
            if (failure) throw failure.reason;
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
    // A production release must first drain every in-flight legacy list writer.
    // Missing or malformed environment/pause bindings fail closed. Only the
    // named preview environment can publish without activation bindings.
    if (env.DEPLOYMENT_ENVIRONMENT !== "preview" &&
        (env.LIST_PUBLICATION_PAUSED !== "false" ||
          env.DURABLE_INGESTION_ENABLED !== "true")) {
      logger.logMilestone("List publication paused during writer transition", {
        versionId: env.WORKER_VERSION_METADATA?.id || null,
        revision: env.RELEASE_REVISION || null,
        scheduledTime: event.scheduledTime,
      });
      return;
    }
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
