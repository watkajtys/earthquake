/**
 * @file functions/background/reconcile-stats.js
 * @description A daily cron worker to reconcile the earthquake statistics stored in KV with the D1 database.
 */

export default {
  async scheduled(controller, env, ctx) {
    console.log('[reconcile-stats] Starting daily statistics reconciliation.');

    if (!env.DB || !env.USGS_LAST_RESPONSE_KV) {
      console.error('[reconcile-stats] DB or USGS_LAST_RESPONSE_KV environment variables not set. Aborting.');
      return;
    }

    try {
      // Run the expensive D1 aggregate queries
      const statsStmt = env.DB.prepare(`
        SELECT
          COUNT(*) as total_earthquakes,
          SUM(CASE WHEN detail_fetched = TRUE THEN 1 ELSE 0 END) as fetched,
          SUM(CASE WHEN has_shakemap = TRUE THEN 1 ELSE 0 END) as with_shakemap,
          SUM(CASE WHEN has_moment_tensor = TRUE THEN 1 ELSE 0 END) as with_moment_tensor
        FROM EarthquakeEvents
      `);

      const stats = await statsStmt.first();

      // Overwrite the stats in KV
      await env.USGS_LAST_RESPONSE_KV.put('earthquake_stats', JSON.stringify(stats));

      console.log('[reconcile-stats] Successfully reconciled statistics in KV.');
      console.log(`[reconcile-stats] New stats: ${JSON.stringify(stats)}`);

    } catch (e) {
      console.error(`[reconcile-stats] Error during reconciliation: ${e.message}`);
    }
  },
};
