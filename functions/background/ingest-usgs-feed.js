import { upsertEarthquakeFeaturesToD1 } from '../../src/utils/d1Utils.js';
import { updateStatsInKV } from '../utils/kv-stats-updater.js';
import { fetchUsgsSummary, USGS_SUMMARY_URLS, UsgsTransportError, usgsDetailUrl } from '../utils/usgs-transport.js';

const HOURLY_CHECKPOINT = 'usgs_last_response_features';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// Only scheduled/administrative code imports this function. No request field can select this path.
export async function handleTrustedUsgsIngestion({ env, executionContext, logger, feedKey = 'hour' }) {
  if (!Object.hasOwn(USGS_SUMMARY_URLS, feedKey)) return jsonResponse({ message: 'Unsupported trusted feed' }, 400);
  if (!env.DB) return jsonResponse({ message: 'Earthquake database is unavailable' }, 503);
  try {
    const fullGeoJson = await fetchUsgsSummary(feedKey);
    const kv = env.USGS_LAST_RESPONSE_KV;
    // Preserve the hourly key for this migration-free release; other trusted windows cannot overwrite it.
    const checkpointKey = feedKey === 'hour' ? HOURLY_CHECKPOINT : `${HOURLY_CHECKPOINT}:${feedKey}`;
    let oldFeatures;
    if (kv) {
      try {
        const stored = await kv.get(checkpointKey);
        oldFeatures = typeof stored === 'string' ? JSON.parse(stored) : stored;
      } catch { /* A missed checkpoint replays idempotent upserts. */ }
    }
    const oldById = new Map(Array.isArray(oldFeatures) ? oldFeatures.filter((feature) => feature?.id).map((feature) => [feature.id, feature]) : []);
    const candidates = fullGeoJson.features.filter((feature) => {
      const old = oldById.get(feature.id);
      return !old || !Number.isSafeInteger(old.properties?.updated) || feature.properties.updated > old.properties.updated;
    }).map((feature) => ({ ...feature, properties: { ...feature.properties, detail: usgsDetailUrl(feature.id) } }));

    // Retain the existing approximate statistic, but never increment it for a failed write.
    const existingIds = new Set();
    let canUpdateStats = Boolean(kv);
    if (canUpdateStats && candidates.length) {
      try {
        for (let offset = 0; offset < candidates.length; offset += 90) {
          const ids = candidates.slice(offset, offset + 90).map((feature) => feature.id);
          const result = await env.DB.prepare(`SELECT id FROM EarthquakeEvents WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
          if (!Array.isArray(result.results)) throw new Error('Invalid existing-event query result');
          for (const row of result.results) existingIds.add(row.id);
        }
      } catch { canUpdateStats = false; }
    }
    const outcome = await upsertEarthquakeFeaturesToD1(env.DB, candidates);
    if (outcome.complete !== true) {
      logger?.logError?.('D1_INGESTION_INCOMPLETE', 'USGS persistence was incomplete', { successCount: outcome.successCount, errorCount: outcome.errorCount }, true);
      return jsonResponse({ message: 'USGS persistence was incomplete', ingestion: outcome }, 503);
    }
    // Await the checkpoint write; rejection must remain visible to the scheduler.
    if (kv) await kv.put(checkpointKey, JSON.stringify(fullGeoJson.features));
    if (canUpdateStats) {
      const insertedCount = (outcome.persistedIds || []).filter((id) => !existingIds.has(id)).length;
      if (insertedCount) {
        const stats = updateStatsInKV({ env }, 'USGS_LAST_RESPONSE_KV', 'earthquake_stats', { total_earthquakes: insertedCount })
          .catch(() => logger?.logError?.('STATS_UPDATE_FAILED', 'Derived earthquake statistics could not be updated', {}, false));
        if (executionContext?.waitUntil) executionContext.waitUntil(stats);
        else await stats;
      }
    }
    // The list generator historically consumes every fetched feature, including unchanged ones.
    return jsonResponse({ newOrUpdatedFeatures: fullGeoJson.features, fullGeoJson, ingestion: outcome });
  } catch (error) {
    logger?.logError?.('USGS_INGESTION_FAILED', 'Trusted USGS ingestion failed', { code: error.code || 'PERSISTENCE_FAILED' }, true);
    return jsonResponse({ message: error instanceof UsgsTransportError ? error.message : 'USGS ingestion failed' }, error instanceof UsgsTransportError ? error.status : 503);
  }
}
