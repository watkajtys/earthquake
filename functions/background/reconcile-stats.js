var reconcile_stats_default = {
  async scheduled(controller, env) {
    console.log("[reconcile-stats] Starting daily statistics reconciliation.");
    if (!env.DB || !env.USGS_LAST_RESPONSE_KV) {
      console.error(
        "[reconcile-stats] DB or USGS_LAST_RESPONSE_KV environment variables not set. Aborting.",
      );
      throw new Error("Missing statistics reconciliation binding");
    }
    try {
      const statsStmt = env.DB.prepare(`
        SELECT
          COUNT(*) as total_earthquakes,
          SUM(CASE WHEN detail_fetched = TRUE THEN 1 ELSE 0 END) as fetched,
          SUM(CASE WHEN has_shakemap = TRUE THEN 1 ELSE 0 END) as with_shakemap,
          SUM(CASE WHEN has_moment_tensor = TRUE THEN 1 ELSE 0 END) as with_moment_tensor
        FROM EarthquakeEvents
      `);
      const row = await statsStmt.first();
      if (!row || !Number.isSafeInteger(row.total_earthquakes) || row.total_earthquakes < 0) {
        throw new Error("Invalid statistics query result");
      }
      const stats = { total_earthquakes: row.total_earthquakes };
      for (const key of ['fetched', 'with_shakemap', 'with_moment_tensor']) {
        // SQLite SUM returns null only for an empty table; preserve zero counts.
        const value = row[key] === null && row.total_earthquakes === 0 ? 0 : row[key];
        if (!Number.isSafeInteger(value) || value < 0 || value > row.total_earthquakes) {
          throw new Error("Invalid statistics query result");
        }
        stats[key] = value;
      }
      await env.USGS_LAST_RESPONSE_KV.put(
        "earthquake_stats",
        JSON.stringify(stats),
      );
      console.log(
        "[reconcile-stats] Successfully reconciled statistics in KV.",
      );
      console.log(`[reconcile-stats] New stats: ${JSON.stringify(stats)}`);
    } catch (e) {
      console.error(
        `[reconcile-stats] Error during reconciliation: ${e.message}`,
      );
      throw e;
    }
  },
};

export { reconcile_stats_default as default };
