// One aggregate statement observes a consistent D1 snapshot. No KV read/modify/write.
export async function readEarthquakeStatistics(db, { now = Date.now } = {}) {
  if (!db) throw new Error('Missing statistics database binding');
  const queryStartedAtMs = now();
  if (!Number.isSafeInteger(queryStartedAtMs) || queryStartedAtMs < 0) throw new Error('Invalid statistics observation time');
  // An unconstrained replica must not masquerade as a current primary observation.
  const reader = typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
  const row = await reader.prepare(`
    SELECT COUNT(*) AS total_earthquakes,
      SUM(CASE WHEN detail_fetched = TRUE THEN 1 ELSE 0 END) AS fetched,
      SUM(CASE WHEN has_shakemap = TRUE THEN 1 ELSE 0 END) AS with_shakemap,
      SUM(CASE WHEN has_moment_tensor = TRUE THEN 1 ELSE 0 END) AS with_moment_tensor
    FROM EarthquakeEvents
  `).first();
  if (!row || !Number.isSafeInteger(row.total_earthquakes) || row.total_earthquakes < 0) {
    throw new Error('Invalid statistics query result');
  }
  const counts = { total_earthquakes: row.total_earthquakes };
  for (const key of ['fetched', 'with_shakemap', 'with_moment_tensor']) {
    const value = row[key] === null && row.total_earthquakes === 0 ? 0 : row[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > row.total_earthquakes) {
      throw new Error('Invalid statistics query result');
    }
    counts[key] = value;
  }
  const queryCompletedAtMs = now();
  if (!Number.isSafeInteger(queryCompletedAtMs) || queryCompletedAtMs < queryStartedAtMs) {
    throw new Error('Invalid statistics observation time');
  }
  return { ...counts, source: 'd1-earthquake-events', consistency: 'snapshot', queryStartedAtMs, queryCompletedAtMs };
}
