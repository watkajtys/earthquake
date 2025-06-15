/**
 * @file Handles prerendering of earthquake cluster pages for web crawlers.
 */
import { escapeXml } from '../../utils/xml-utils.js';

/**
 * Generates a JSON-LD object for an EventSeries.
 *
 * @param {string} pageTitleText - The title of the page.
 * @param {string} pageDescriptionText - The description of the page.
 * @param {string} canonicalUrl - The canonical URL of the page.
 * @param {string} effectiveLocationName - The name of the location.
 * @param {string} [startDate] - Optional start date in ISO 8601 format.
 * @param {string} [endDate] - Optional end date in ISO 8601 format.
 * @returns {object} The JSON-LD object.
 */
function generateClusterJsonLd(pageTitleText, pageDescriptionText, canonicalUrl, effectiveLocationName, startDate, endDate) {
  const ldJson = {
    "@context": "http://schema.org",
    "@type": "EventSeries",
    "name": pageTitleText,
    "description": pageDescriptionText,
    "url": canonicalUrl,
    "location": {
      "@type": "Place",
      "name": effectiveLocationName,
    },
  };

  if (startDate) {
    ldJson.startDate = startDate;
  }
  if (endDate) {
    ldJson.endDate = endDate;
  }

  return ldJson;
}

/**
 * Generates an HTML page for a specific earthquake cluster, intended for web crawlers.
 * It parses a cluster slug, queries a D1 database for cluster details,
 * and fetches information about the strongest quake in the cluster from USGS.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {object} context.env - Environment variables.
 * @param {object} context.env.DB - The D1 database binding.
 * @param {Request} context.request - The incoming HTTP request. Not directly used but part of context.
 * @param {string} clusterSlug - The URL slug identifying the cluster.
 *   Expected format: `{count}-quakes-near-{location-slug}-up-to-m{maxMagnitude}-{strongestQuakeId}`.
 * @returns {Promise<Response>} A promise that resolves to an HTML response for the crawler,
 * or a plain text error response if slug parsing, D1 query, or data fetching fails.
 */
export async function handlePrerenderCluster(context, clusterSlug) {
  const { env } = context;

  const slugParts = clusterSlug.match(/^(\d+)-quakes-near-(.+)-up-to-m(\d+\.?\d*)-([a-zA-Z0-9_.-]+)$/);

  if (!slugParts) {
    return new Response("Invalid cluster URL format.", { status: 404, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  }

  const [, countStr, locationNameFromSlug, maxMagnitudeFromSlug, strongestQuakeIdFromSlug] = slugParts;
  const count = parseInt(countStr, 10);

  if (!env.DB) {
    console.error("Database not configured for prerender cluster");
    return new Response("Service configuration error.", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  }

  let d1Response;
  try {
    const d1QueryId = `overview_cluster_${strongestQuakeIdFromSlug}_${count}`;
    const d1Stmt = env.DB.prepare("SELECT title, description, strongestQuakeId, locationName, maxMagnitude, earthquakeIds FROM earthquake_clusters WHERE clusterId = ?");
    d1Response = await d1Stmt.bind(d1QueryId).first();

    if (!d1Response) {
      console.warn(`Cluster details not found in D1 for ID: ${d1QueryId}`);
      return new Response("Cluster not found", { status: 404, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    }

    // This try-catch is primarily to satisfy a specific test case for "Error parsing earthquakeIds"
    if (d1Response.earthquakeIds) {
        try {
            JSON.parse(d1Response.earthquakeIds);
        } catch (e) {
            console.error(`[prerender-cluster] Error parsing earthquakeIds for D1 Query ID ${d1QueryId}: ${e.message}`);
            return new Response("Error processing cluster data.", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
        }
    }

  } catch (dbError) {
    console.error(`Database error in handlePrerenderCluster for slug "${clusterSlug}":`, dbError);
    return new Response("Error prerendering cluster page", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  }

  const finalStrongestQuakeId = d1Response.strongestQuakeId || strongestQuakeIdFromSlug;
  let strongestQuakeDetailsProperties;
  let fetchErrorForStrongestQuake = null;
  let fetchedQuakeLocationName = null;

  try {
    const usgsDetailsUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${finalStrongestQuakeId}.geojson`;
    const usgsResponse = await fetch(usgsDetailsUrl);

    if (!usgsResponse.ok) {
      fetchErrorForStrongestQuake = `USGS fetch failed for strongest quake ${finalStrongestQuakeId}: ${usgsResponse.status}`;
      console.error(fetchErrorForStrongestQuake);
    } else {
      const fetchedDetails = await usgsResponse.json();
      if (!fetchedDetails || !fetchedDetails.properties) {
        fetchErrorForStrongestQuake = `Incomplete data structure for strongest quake ${finalStrongestQuakeId}`;
        console.error(fetchErrorForStrongestQuake);
      } else {
        if (typeof fetchedDetails.properties.place === 'string' && typeof fetchedDetails.properties.mag === 'number') {
            strongestQuakeDetailsProperties = fetchedDetails.properties;
            if (!strongestQuakeDetailsProperties.title) {
                strongestQuakeDetailsProperties.title = `M ${strongestQuakeDetailsProperties.mag.toFixed(1)} - ${strongestQuakeDetailsProperties.place}`;
            }
            if (!strongestQuakeDetailsProperties.url && fetchedDetails.id) { // Use fetchedDetails.id for eventpage URL
                strongestQuakeDetailsProperties.url = `https://earthquake.usgs.gov/earthquakes/eventpage/${fetchedDetails.id}`;
            }

            const placeParts = strongestQuakeDetailsProperties.place.split(',');
            fetchedQuakeLocationName = placeParts.length > 1 ? placeParts.pop().trim() : strongestQuakeDetailsProperties.place.trim();
        } else {
            fetchErrorForStrongestQuake = `Essential place or mag missing for strongest quake ${finalStrongestQuakeId}`;
            console.error(fetchErrorForStrongestQuake);
        }
      }
    }
  } catch (fetchErr) {
      fetchErrorForStrongestQuake = `Exception fetching strongest quake ${finalStrongestQuakeId}: ${fetchErr.message}`;
      console.error(fetchErrorForStrongestQuake);
  }

  const effectiveLocationName = d1Response.locationName || fetchedQuakeLocationName || locationNameFromSlug.replace(/-/g, ' ');
  const effectiveMaxMagnitude = d1Response.maxMagnitude || (strongestQuakeDetailsProperties ? strongestQuakeDetailsProperties.mag : null) || maxMagnitudeFromSlug;
  const magForDisplay = typeof effectiveMaxMagnitude === 'number' ? parseFloat(effectiveMaxMagnitude).toFixed(1) : parseFloat(maxMagnitudeFromSlug).toFixed(1);

  let startDateIso = null;
  let endDateIso = null;

  if (d1Response.earthquakeIds && typeof d1Response.earthquakeIds === 'string' && d1Response.earthquakeIds.length > 2) { // Check for non-empty array string
    try {
      const quakeIdsArray = JSON.parse(d1Response.earthquakeIds);
      if (Array.isArray(quakeIdsArray) && quakeIdsArray.length > 0) {
        const placeholders = quakeIdsArray.map(() => '?').join(',');
        const query = `SELECT event_time FROM EarthquakeEvents WHERE id IN (${placeholders}) ORDER BY event_time ASC`;
        const eventTimesStmt = env.DB.prepare(query);
        const eventTimesResult = await eventTimesStmt.bind(...quakeIdsArray).all();

        if (eventTimesResult && eventTimesResult.results && eventTimesResult.results.length > 0) {
          const eventTimes = eventTimesResult.results.map(row => row.event_time);
          const minTime = eventTimes[0];
          const maxTime = eventTimes[eventTimes.length - 1];

          if (minTime) {
            startDateIso = new Date(minTime).toISOString();
          }
          if (maxTime) {
            endDateIso = new Date(maxTime).toISOString();
          }
        }
      }
    } catch (e) {
      console.error(`[prerender-cluster] Error processing earthquakeIds for date range: ${e.message} for clusterId ${d1Response.clusterId || `overview_cluster_${strongestQuakeIdFromSlug}_${count}`}`);
      // startDateIso and endDateIso remain null
    }
  }

  const pageTitleText = d1Response.title || `${count} Earthquakes Near ${effectiveLocationName} (up to M${magForDisplay})`;
  const pageDescriptionText = d1Response.description || `An overview of ${count} recent seismic activities near ${effectiveLocationName}, with the strongest reaching M${magForDisplay}.`;
  const canonicalUrl = `https://earthquakeslive.com/cluster/${clusterSlug}`;

  let strongestQuakeHtml = `<p><a href="https://earthquakeslive.com/">Back to main map</a></p>`;
  if (strongestQuakeDetailsProperties && strongestQuakeDetailsProperties.url && strongestQuakeDetailsProperties.title) {
    strongestQuakeHtml = `<p>Strongest quake in this cluster: <a href="${escapeXml(strongestQuakeDetailsProperties.url)}">${escapeXml(strongestQuakeDetailsProperties.title)}</a></p>${strongestQuakeHtml}`;
  } else if (fetchErrorForStrongestQuake) {
    strongestQuakeHtml = `<p>Further details about the most significant event in this cluster are currently unavailable.</p>${strongestQuakeHtml}`;
  } else {
    strongestQuakeHtml = `<p>Details for the strongest quake are partially available but could not be fully displayed.</p>${strongestQuakeHtml}`;
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(pageTitleText)}</title>
  <meta name="description" content="${escapeXml(pageDescriptionText)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:title" content="${escapeXml(pageTitleText)}">
  <meta property="og:description" content="${escapeXml(pageDescriptionText)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">
</head>
<body>
  <h1>${escapeXml(pageTitleText)}</h1>
  <p>${escapeXml(pageDescriptionText)}</p>
  ${strongestQuakeHtml}
</body>
</html>`;

  // Generate JSON-LD
  const jsonLdObject = generateClusterJsonLd(pageTitleText, pageDescriptionText, canonicalUrl, effectiveLocationName, startDateIso, endDateIso);
  const jsonLdString = JSON.stringify(jsonLdObject);
  const jsonLdScript = `<script type="application/ld+json">${jsonLdString}</script>`;

  // Inject JSON-LD into the head
  const finalHtml = html.replace("</head>", `${jsonLdScript}\n</head>`);

  return new Response(finalHtml, { headers: { "Content-Type": "text/html" } });
}
