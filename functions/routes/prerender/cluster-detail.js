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

  // Basic slug validation (optional, as DB query is the main check)
  // Example: if (clusterSlug && !/^[a-z0-9-]+$/.test(clusterSlug)) {
  //   return new Response("Invalid cluster slug format.", { status: 400, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  // }

  if (!env.DB) {
    console.error("Database not configured for prerender cluster");
    return new Response("Service configuration error.", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  }

  let d1Response;
  try {
    // Query by slug using the new ClusterDefinitions table schema
    const d1Stmt = env.DB.prepare(
      "SELECT id, slug, title, description, strongestQuakeId, locationName, maxMagnitude, earthquakeIds, startTime, endTime, quakeCount FROM ClusterDefinitions WHERE slug = ?"
    );
    d1Response = await d1Stmt.bind(clusterSlug).first();

    if (!d1Response) {
      console.warn(`Cluster details not found in D1 for slug: ${clusterSlug}`);
      return new Response("Cluster not found", { status: 404, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    }

    // Optional: Validate earthquakeIds if still needed for other purposes (not for dates anymore)
    if (d1Response.earthquakeIds) {
        try {
            JSON.parse(d1Response.earthquakeIds);
        } catch (e) {
            console.error(`[prerender-cluster] Error parsing earthquakeIds for slug ${clusterSlug}: ${e.message}`);
            // Depending on severity, might return 500 or just log
        }
    }

  } catch (dbError) {
    console.error(`Database error in handlePrerenderCluster for slug "${clusterSlug}":`, dbError);
    return new Response("Error prerendering cluster page", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  }

  // Use strongestQuakeId directly from d1Response for fetching USGS details
  const finalStrongestQuakeId = d1Response.strongestQuakeId;
  let strongestQuakeDetailsProperties;
  let fetchErrorForStrongestQuake = null;
  // let fetchedQuakeLocationName = null; // This will now primarily come from d1Response.locationName

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

  const sqProps = strongestQuakeDetailsProperties; // shorthand

  const finalLocationName = d1Response.locationName || (sqProps ? sqProps.place : null);
  const effectiveLocationName = finalLocationName || "Unknown Location";

  const finalMaxMagnitude = (d1Response.maxMagnitude !== null && d1Response.maxMagnitude !== undefined)
                            ? d1Response.maxMagnitude
                            : (sqProps ? sqProps.mag : null);
  const magForDisplay = (finalMaxMagnitude !== null && finalMaxMagnitude !== undefined && typeof finalMaxMagnitude === 'number')
                        ? parseFloat(finalMaxMagnitude).toFixed(1)
                        : "N/A";

  let startDateIso = null;
  let endDateIso = null;

  // Use startTime and endTime from d1Response for JSON-LD
  if (d1Response.startTime) {
    try {
      startDateIso = new Date(d1Response.startTime).toISOString();
    } catch (e) {
      console.error(`[prerender-cluster] Error parsing startTime for slug ${clusterSlug}: ${e.message}`);
    }
  }
  if (d1Response.endTime) {
    try {
      endDateIso = new Date(d1Response.endTime).toISOString();
    } catch (e) {
      console.error(`[prerender-cluster] Error parsing endTime for slug ${clusterSlug}: ${e.message}`);
    }
  }

  // Use title and description directly from d1Response
  // Fallback to a generated title/description if d1Response fields are empty
  const countForDisplay = d1Response.quakeCount || 'Multiple'; // Use quakeCount from D1
  const titleSuffix = effectiveLocationName !== "Unknown Location" ? `Near ${effectiveLocationName}` : "Cluster Overview";

  const pageTitleText = d1Response.title || `${countForDisplay} Earthquakes ${titleSuffix}${magForDisplay !== 'N/A' ? ` (up to M${magForDisplay})` : ''}`;
  const pageDescriptionText = d1Response.description || `An overview of ${countForDisplay} recent seismic activities ${effectiveLocationName !== "Unknown Location" ? `near ${effectiveLocationName}` : 'in an active region'}, with the strongest reaching M${magForDisplay}.`;
  const canonicalUrl = `https://earthquakeslive.com/cluster/${d1Response.slug || clusterSlug}`;

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
