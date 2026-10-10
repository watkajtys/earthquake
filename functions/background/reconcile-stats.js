import { readEarthquakeStatistics } from '../utils/earthquakeStatistics.js';
import { failureDiagnostics, releaseDiagnostics } from '../utils/failureDiagnostics.js';

export default {
  async scheduled(controller, env) {
    if (!env.DB || !env.USGS_LAST_RESPONSE_KV) {
      console.error('[reconcile-stats] DB or USGS_LAST_RESPONSE_KV environment variables not set. Aborting.');
      throw new Error('Missing statistics reconciliation binding');
    }
    let stage = 'statistics-query';
    try {
      const stats = await readEarthquakeStatistics(env.DB);
      // KV is an eventually consistent, daily observation only. An overlapping
      // invocation can finish out of order; readers must inspect the query observation interval.
      // No application API uses this key as an exact live source of truth.
      stage = 'statistics-publication';
      await env.USGS_LAST_RESPONSE_KV.put('earthquake_stats', JSON.stringify(stats));
      console.log('[reconcile-stats] D1 statistics snapshot published.', {
        queryStartedAtMs: stats.queryStartedAtMs, queryCompletedAtMs: stats.queryCompletedAtMs, ...releaseDiagnostics(env),
      });
      return stats;
    } catch (error) {
      console.error('[reconcile-stats] Snapshot publication failed.', {
        ...failureDiagnostics(error, { d1: stage === 'statistics-query', stage, code: 'STATISTICS_FAILED' }),
        ...releaseDiagnostics(env),
      });
      throw error;
    }
  },
};
