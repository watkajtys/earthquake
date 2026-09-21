import { upsertEarthquakeFeaturesToD1 } from '../../src/utils/d1Utils.js';
import { readBoundedJson, RequestPolicyError } from '../../src/utils/workerRequestPolicy.js';
import { fetchUsgsCatalogPage, UsgsTransportError, usgsDetailUrl } from '../utils/usgs-transport.js';

const PAGE_SIZE = 1000;
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// The exported Worker's administrative route gate authenticates this handler before body parsing.
export async function handleBatchUsgsFetch({ request, env }) {
  if (request.method !== 'POST') {
    const response = jsonResponse({ message: 'Method not allowed' }, 405);
    response.headers.set('Allow', 'POST');
    return response;
  }
  try {
    if (new URL(request.url).search) return jsonResponse({ message: 'Use JSON body parameters' }, 400);
    const input = await readBoundedJson(request, 4096);
    if (Object.keys(input).some((key) => !['startDate', 'endDate', 'offset'].includes(key))) {
      return jsonResponse({ message: 'Unsupported batch parameters' }, 400);
    }
    if (!env.DB) return jsonResponse({ message: 'Earthquake database is unavailable' }, 503);
    const { startDate, endDate, offset = 1 } = input;
    const data = await fetchUsgsCatalogPage({ startDate, endDate, offset, limit: PAGE_SIZE });
    const features = data.features.map((feature) => ({ ...feature, properties: { ...feature.properties, detail: usgsDetailUrl(feature.id) } }));
    const outcome = await upsertEarthquakeFeaturesToD1(env.DB, features);
    const hasMore = features.length === PAGE_SIZE;
    return jsonResponse({
      message: outcome.complete ? 'Catalog page persisted.' : 'Catalog page persistence was incomplete; retry the same page.',
      startDate, endDate, offset, fetched: features.length,
      upserted: outcome.successCount, errors: outcome.errorCount,
      complete: outcome.complete === true,
      hasMore,
      nextOffset: outcome.complete && hasMore && offset + PAGE_SIZE <= 20000 ? offset + PAGE_SIZE : null,
      rangeMustBeSplit: hasMore && offset + PAGE_SIZE > 20000,
      ingestion: outcome,
    }, outcome.complete ? 200 : 503);
  } catch (error) {
    const known = error instanceof UsgsTransportError || error instanceof RequestPolicyError;
    return jsonResponse({ message: known ? error.message : 'Catalog ingestion failed' }, known ? error.status : 503);
  }
}
