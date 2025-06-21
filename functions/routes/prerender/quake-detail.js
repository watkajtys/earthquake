/**
 * @file Handles prerendering of individual earthquake event pages for crawlers.
 */
import { escapeXml } from '../../utils/xml-utils.js';

/**
 * Generates an HTML page for a specific earthquake event, intended for web crawlers.
 * Fetches earthquake details from USGS and formats them into a simple HTML structure
 * with relevant meta tags for SEO.
 *
 * @param {object} context - The Cloudflare Pages function context.
 * @param {object} context.env - Environment variables (not directly used in this handler, but part of context).
 * @param {Request} context.request - The incoming HTTP request, used to derive the base URL for mock comparisons if needed.
 * @param {string} eventId - The USGS event ID for the earthquake to prerender.
 * @returns {Promise<Response>} A promise that resolves to an HTML response for the crawler,
 * or a plain text error response if fetching or data validation fails.
 */
export async function handleQuakeDetailPrerender(context, eventId) {
  const { env } = context; // env might be used for future configurations like API keys

  try {
    const fetchUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${eventId}`;

    const response = await fetch(fetchUrl);

    if (!response.ok) {
      console.error(`USGS fetch failed for quake prerender ${eventId}: ${response.status} ${response.statusText}`);
      const status = response.status === 404 ? 404 : 500;
      const message = response.status === 404 ? "Earthquake data not found" : `Error prerendering earthquake page: USGS upstream error ${response.status}`;
      return new Response(message, { status, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    }

    let quakeDetails;
    try {
      quakeDetails = await response.json();
    } catch (e) {
      console.error(`Failed to parse JSON for quake prerender ${eventId}: ${e.message}`);
      return new Response("Error prerendering earthquake page", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    }

    if (!quakeDetails || !quakeDetails.properties || !quakeDetails.geometry || !quakeDetails.geometry.coordinates ) {
      console.error(`Invalid earthquake data structure for prerender ${eventId} (missing top-level keys):`, quakeDetails);
      return new Response("Invalid earthquake data", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    }

    const { properties, geometry } = quakeDetails;
    const PbfPropertiesUrl = properties.url || properties.detail; // Use 'detail' if 'url' is not present, common in some USGS feeds

    if (typeof properties.mag !== 'number' || typeof properties.time !== 'number' || !PbfPropertiesUrl || !properties.place || !geometry.coordinates || geometry.coordinates.length < 2) {
        console.error(`Incomplete earthquake data fields for prerender ${eventId}:`, properties, geometry);
        return new Response("Invalid earthquake data (missing fields).", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    }

    const pageTitleText = properties.title || `M ${properties.mag.toFixed(1)} Earthquake - ${properties.place}`; // Construct title if missing

    const title = escapeXml(pageTitleText);
    const description = `Details for earthquake ${eventId}: ${title}. Magnitude ${properties.mag.toFixed(1)}, Occurred on ${new Date(properties.time).toUTCString()}. Coordinates: ${geometry.coordinates[1]}, ${geometry.coordinates[0]}. Depth: ${geometry.coordinates[2] || 0} km.`;
    const canonicalUrl = `https://earthquakeslive.com/quake/${eventId}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${escapeXml(description)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${escapeXml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": "${title}",
      "startDate": "${new Date(properties.time).toISOString()}",
      "endDate": "${new Date(properties.time).toISOString()}",
      "eventStatus": "https://schema.org/EventHappened",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "location": {
        "@type": "Place",
        "name": "${escapeXml(properties.place)}",
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": ${geometry.coordinates[1]},
          "longitude": ${geometry.coordinates[0]},
          "elevation": ${- (geometry.coordinates[2] || 0) * 1000}
        }
      },
      "image": ["https://earthquakeslive.com/social-default-earthquake.png"],
      "description": "${escapeXml(description)}",
      "url": "${canonicalUrl}",
      "organizer": {
        "@type": "Organization",
        "name": "Earthquakes Live",
        "url": "https://earthquakeslive.com"
      },
      "identifier": "${eventId}",
      "sameAs": "${escapeXml(PbfPropertiesUrl)}",
      "keywords": "${escapeXml(properties.place.split(', ')[0].toLowerCase())}, ${escapeXml(properties.place.split(', ').slice(1).join(' ').toLowerCase())}, m${properties.mag.toFixed(1)}, earthquake, seismic event, earthquake report, ${new Date(properties.time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase().replace(',', '')}"
    }
  </script>
</head>
<body>
  <h1>${title}</h1>
  <p>${escapeXml(description)}</p>
  <p><a href="${escapeXml(PbfPropertiesUrl)}">More details on USGS</a></p>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });

  } catch (error) {
    console.error(`Generic error in handleQuakeDetailPrerender for eventId "${eventId}":`, error);
    return new Response("Error prerendering earthquake page", { status: 500, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
  }
}
