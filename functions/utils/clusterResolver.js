import { buildClusterPath, isValidClusterRouteValue, legacyClusterEventId } from '../../src/utils/entityRoutes.js';

export const CLUSTER_COLUMNS = `id, slug, strongestQuakeId, earthquakeIds, title, description, locationName,
  maxMagnitude, meanMagnitude, minMagnitude, depthRange, centroidLat, centroidLon,
  radiusKm, startTime, endTime, durationHours, quakeCount, significanceScore,
  version, createdAt, updatedAt`;

// Legacy rows mix epoch-millisecond integers with UTC timestamp text. SQLite
// orders text above integers, regardless of the instant they represent.
// Current text rows use YYYY-MM-DD HH:MM:SS.sss; the fallback handles other
// SQLite-parsable timestamps without changing the stored historical values.
export const CLUSTER_UPDATED_AT_MS_SQL = `CASE
  WHEN typeof(updatedAt) = 'integer' THEN updatedAt
  WHEN typeof(updatedAt) = 'text' THEN
    CAST(strftime('%s', updatedAt) AS INTEGER) * 1000 +
    CASE WHEN length(updatedAt) = 23 AND substr(updatedAt, 20, 1) = '.'
      THEN CAST(substr(updatedAt, 21, 3) AS INTEGER)
      ELSE CAST(substr(strftime('%f', updatedAt), 4, 3) AS INTEGER)
    END
  ELSE NULL
END`;

export class ClusterSelectorError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

export function parseClusterSelector(searchParams) {
  const keys = ['clusterId', 'slug', 'route', 'id'];
  const present = keys.filter((key) => searchParams.has(key));
  if (present.length !== 1 || searchParams.getAll(present[0]).length !== 1 ||
      [...searchParams.keys()].some((key) => !keys.includes(key))) {
    throw new ClusterSelectorError('Provide exactly one clusterId, slug, route, or legacy id selector.');
  }
  const kind = present[0];
  const value = searchParams.get(kind);
  if (!isValidClusterRouteValue(value) || (['id', 'clusterId'].includes(kind) && !/^[A-Za-z0-9_-]{1,200}$/u.test(value))) {
    throw new ClusterSelectorError('Invalid cluster selector.');
  }
  return { kind, value };
}

export async function resolveClusterDefinition(db, { kind, value }) {
  if (!db) throw new Error('Database service not available.');
  const lookup = (column, selector) => db.prepare(`SELECT ${CLUSTER_COLUMNS} FROM ClusterDefinitions WHERE ${column} = ?${column === 'strongestQuakeId' ? ` ORDER BY ${CLUSTER_UPDATED_AT_MS_SQL} DESC, id ASC LIMIT 1` : ''}`).bind(selector).first();
  let row;
  if (kind === 'clusterId') row = await lookup('id', value);
  else if (kind === 'slug') row = await lookup('slug', value);
  else if (kind === 'id') {
    // Keep the published legacy API precedence; explicit selectors avoid this ambiguity.
    row = await lookup('strongestQuakeId', value) || await lookup('id', value);
  } else if (kind === 'route') {
    row = await lookup('slug', value) || await lookup('id', value);
    if (!row) {
      const legacyId = legacyClusterEventId(value);
      if (legacyId) row = await lookup('strongestQuakeId', legacyId);
    }
  } else throw new ClusterSelectorError('Invalid cluster selector.');
  return row ? { ...row, clusterId: row.id, canonicalPath: buildClusterPath(row) } : null;
}
