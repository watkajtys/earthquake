import { fetchValidatedDetail, isValidUsgsEventId, usgsDetailUrl, USGS_LIMITS, validateUsgsDetail } from './usgs-transport.js';

export const MAX_DETAIL_QUEUE_BYTES = 120_000; // Legacy Queue payload boundary.
const LEASE_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const SUMMARY_COLUMNS = ['event_time', 'latitude', 'longitude', 'depth', 'magnitude', 'place', 'usgs_detail_url'];

function revisionError(code) {
  const error = new Error(code === 'STALE_DETAIL_REVISION'
    ? 'Earthquake detail revision is older than the stored summary'
    : 'Earthquake detail conflicts with the stored summary at the same revision');
  error.code = code;
  return error;
}

function checked(result, operation) {
  if (result?.success !== true || !Number.isInteger(result.meta?.changes) || result.meta.changes < 0) {
    throw new Error(`Failed to ${operation}`);
  }
  return result.meta.changes;
}

function assertCurrent(row, revision, summary) {
  if (!row || row.source_updated_at_ms === null) return;
  if (!Number.isSafeInteger(row.source_updated_at_ms)) throw new Error('Stored earthquake revision is invalid');
  if (row.source_updated_at_ms > revision) throw revisionError('STALE_DETAIL_REVISION');
  if (row.source_updated_at_ms === revision && SUMMARY_COLUMNS.some(name => row[name] !== summary[name])) {
    throw revisionError('CONFLICTING_DETAIL_REVISION');
  }
}

export function extractProductFlags(detailData) {
  const products = detailData?.properties?.products;
  if (products != null && (typeof products !== 'object' || Array.isArray(products))) {
    throw new Error('Invalid earthquake detail products');
  }
  const keys = products ? Object.keys(products) : [];
  const hasProduct = key => Array.isArray(products?.[key]) && products[key].length > 0;
  const flags = {
    has_shakemap: hasProduct('shakemap'), has_moment_tensor: hasProduct('moment-tensor'),
    has_focal_mechanism: hasProduct('focal-mechanism'), has_dyfi: hasProduct('dyfi'),
    has_losspager: hasProduct('losspager'), has_finite_fault: hasProduct('finite-fault'),
  };
  return { ...flags, has_enhanced_data: Object.values(flags).some(Boolean), products_json: JSON.stringify(keys) };
}

async function archiveKey(id, revision, json) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `details/v1/${id}/${revision}/${hash}.json`;
}

async function putImmutable(bucket, key, json, size) {
  const object = await bucket.put(key, json, {
    httpMetadata: { contentType: 'application/json' }, onlyIf: { etagDoesNotMatch: '*' },
  });
  if (object === null) {
    const staged = await bucket.get(key);
    if (!staged || staged.size !== size || await staged.text() !== json) {
      throw new Error('Existing detail archive is invalid');
    }
  }
}

async function jobRow(db, id, revision) {
  return db.prepare(`SELECT archive_key, status, attempts, next_attempt_at_ms,
    lease_token, lease_until_ms FROM EarthquakeDetailJobs
    WHERE event_id = ? AND target_revision_ms = ?`).bind(id, revision).first();
}

async function releaseJob(db, id, revision, token, error) {
  const now = Date.now();
  const result = await db.prepare(`UPDATE EarthquakeDetailJobs SET
    status = CASE WHEN attempts >= ? THEN 'parked' ELSE 'pending' END,
    next_attempt_at_ms = ?, lease_token = NULL, lease_until_ms = NULL,
    last_error = ?, updated_at_ms = ?
    WHERE event_id = ? AND target_revision_ms = ? AND status = 'leased' AND lease_token = ?`)
    .bind(MAX_ATTEMPTS, now + RETRY_MS, String(error?.code || error?.message || 'archive failed').slice(0, 200),
      now, id, revision, token).run();
  checked(result, 'record detail retry');
}

async function commitPointer({ env, id, revision, key, token, summary, flags, previousAttempts }) {
  const now = Date.now();
  const update = env.DB.prepare(`UPDATE EarthquakeEvents SET
    event_time = ?, latitude = ?, longitude = ?, depth = ?, magnitude = ?, place = ?,
    usgs_detail_url = ?, retrieved_at = ?, source_updated_at_ms = ?,
    has_shakemap = ?, has_moment_tensor = ?, has_focal_mechanism = ?, has_dyfi = ?,
    has_losspager = ?, has_finite_fault = ?, has_enhanced_data = ?, products_json = ?,
    detail_fetched = 1, detail_fetch_time = ?,
    detail_fetch_attempts = MAX(COALESCE(detail_fetch_attempts, 0), ?),
    last_detail_fetch_attempt = ?, next_detail_fetch_attempt = NULL,
    detail_archive_key = ?, detail_archive_revision_ms = ?, detail_metadata_revision_ms = ?
    WHERE id = ? AND
      (source_updated_at_ms IS NULL OR source_updated_at_ms < ? OR
        (source_updated_at_ms = ? AND ${SUMMARY_COLUMNS.map(name => `${name} IS ?`).join(' AND ')}))
      AND (detail_archive_revision_ms IS NULL OR detail_archive_revision_ms < ? OR
        (detail_archive_revision_ms = ? AND detail_archive_key IS ?))
      AND EXISTS (SELECT 1 FROM EarthquakeDetailJobs WHERE event_id = ? AND target_revision_ms = ?
        AND archive_key = ? AND status = 'leased' AND lease_token = ? AND lease_until_ms > ?)`)
    .bind(
      summary.event_time, summary.latitude, summary.longitude, summary.depth, summary.magnitude, summary.place,
      summary.usgs_detail_url, now, revision,
      Number(flags.has_shakemap), Number(flags.has_moment_tensor), Number(flags.has_focal_mechanism),
      Number(flags.has_dyfi), Number(flags.has_losspager), Number(flags.has_finite_fault),
      Number(flags.has_enhanced_data), flags.products_json, now, previousAttempts + 1, now,
      key, revision, revision, id, revision, revision,
      ...SUMMARY_COLUMNS.map(name => summary[name]), revision, revision, key,
      id, revision, key, token, now,
    );
  // Both statements commit or roll back together. A stale writer cannot mark
  // its job complete when the guarded pointer update did not take effect.
  const finish = env.DB.prepare(`UPDATE EarthquakeDetailJobs SET
    status = CASE
      WHEN EXISTS (SELECT 1 FROM EarthquakeEvents WHERE id = ? AND source_updated_at_ms = ?
        AND detail_archive_revision_ms = ? AND detail_archive_key = ?) THEN 'completed'
      WHEN EXISTS (SELECT 1 FROM EarthquakeEvents WHERE id = ?
        AND (source_updated_at_ms > ? OR detail_archive_revision_ms > ?)) THEN 'superseded'
      ELSE 'parked' END,
    lease_token = NULL, lease_until_ms = NULL, updated_at_ms = ?,
    last_error = CASE WHEN EXISTS (SELECT 1 FROM EarthquakeEvents WHERE id = ?
      AND source_updated_at_ms = ? AND detail_archive_key = ?) THEN NULL
      ELSE 'archive pointer fence rejected' END
    WHERE event_id = ? AND target_revision_ms = ? AND status = 'leased'
      AND lease_token = ? AND lease_until_ms > ?`)
    .bind(id, revision, revision, key, id, revision, revision, now, id, revision, key,
      id, revision, token, now);
  const status = env.DB.prepare(`SELECT status FROM EarthquakeDetailJobs WHERE event_id = ?
    AND target_revision_ms = ?`).bind(id, revision);
  const results = await env.DB.batch([update, finish, status]);
  if (!Array.isArray(results) || results.length !== 3 || results.some(result => result?.success !== true)) {
    throw new Error('Failed to commit earthquake detail archive');
  }
  const finalStatus = results[2].results?.[0]?.status;
  if (finalStatus === 'superseded') throw revisionError('STALE_DETAIL_REVISION');
  if (checked(results[1], 'finish detail job') !== 1) throw new Error('Detail job lease was lost');
  if (finalStatus === 'completed') return;
  if (finalStatus === 'parked') throw revisionError('CONFLICTING_DETAIL_REVISION');
  throw new Error('Detail job was not durably completed');
}

// Shared public-miss, backfill, and legacy-Queue persistence boundary.
export async function persistEarthquakeDetail({ env, detailData, previousAttempts = 0,
  requestedId = detailData?.id, claimedLeaseToken = null }) {
  if (!env.DB || !env.GEOJSON_BUCKET) throw new Error('Detail database and archive storage are required');
  if (!isValidUsgsEventId(requestedId) || !Number.isInteger(previousAttempts) || previousAttempts < 0) {
    throw new Error('Invalid validated earthquake detail');
  }
  validateUsgsDetail(detailData, requestedId);
  const flags = extractProductFlags(detailData);
  const json = JSON.stringify(detailData);
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > USGS_LIMITS.detailBytes) throw new Error('Earthquake detail exceeds storage limit');
  const revision = detailData.properties.updated;
  const coordinates = detailData.geometry.coordinates;
  const summary = { event_time: detailData.properties.time, latitude: coordinates[1], longitude: coordinates[0],
    depth: coordinates[2], magnitude: detailData.properties.mag, place: detailData.properties.place,
    usgs_detail_url: usgsDetailUrl(requestedId) };
  const key = await archiveKey(requestedId, revision, json);
  const existing = await env.DB.prepare(`SELECT ${SUMMARY_COLUMNS.join(', ')}, source_updated_at_ms,
    detail_archive_key, detail_archive_revision_ms FROM EarthquakeEvents
    WHERE id = ?`).bind(requestedId).first();
  assertCurrent(existing, revision, summary);
  if (Number.isSafeInteger(existing?.detail_archive_revision_ms)) {
    if (existing.detail_archive_revision_ms > revision) throw revisionError('STALE_DETAIL_REVISION');
    if (existing.detail_archive_revision_ms === revision &&
        existing.detail_archive_key != null && existing.detail_archive_key !== key) {
      throw revisionError('CONFLICTING_DETAIL_REVISION');
    }
  }
  const now = Date.now();
  // A cache miss can discover a new event. Store its summary before the job;
  // failed archival still leaves a normal pending detail row for backfill.
  checked(await env.DB.prepare(`INSERT INTO EarthquakeEvents
    (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url,
      source_updated_at_ms, retrieved_at, next_detail_fetch_attempt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(requestedId, summary.event_time, summary.latitude, summary.longitude, summary.depth,
      summary.magnitude, summary.place, summary.usgs_detail_url, revision, now, now + 45 * 60 * 1000).run(),
  'store detail summary');
  checked(await env.DB.prepare(`INSERT INTO EarthquakeDetailJobs
    (event_id, target_revision_ms, archive_key, status, next_attempt_at_ms, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, 'pending', ?, ?, ?) ON CONFLICT(event_id, target_revision_ms) DO NOTHING`)
    .bind(requestedId, revision, key, now, now, now).run(), 'record detail job');
  const job = await jobRow(env.DB, requestedId, revision);
  if (!job || job.archive_key !== key) throw revisionError('CONFLICTING_DETAIL_REVISION');
  if (job.status === 'completed') {
    if (existing?.detail_archive_key !== key || existing.detail_archive_revision_ms !== revision) {
      throw new Error('Completed detail job has no matching current archive pointer');
    }
    await putImmutable(env.GEOJSON_BUCKET, key, json, bytes.byteLength);
    return { flags, archiveDisposition: 'stored' };
  }
  if (job.status === 'superseded') throw revisionError('STALE_DETAIL_REVISION');
  if (job.status === 'parked') throw new Error('Detail job is parked for operator review');
  const token = claimedLeaseToken || crypto.randomUUID();
  if (claimedLeaseToken) {
    if (job.status !== 'leased' || job.lease_token !== token || job.lease_until_ms <= now) {
      throw new Error('Detail job lease was lost before archival');
    }
  } else {
    const claim = await env.DB.prepare(`UPDATE EarthquakeDetailJobs SET status = 'leased',
      lease_token = ?, lease_until_ms = ?, attempts = attempts + 1, updated_at_ms = ?
      WHERE event_id = ? AND target_revision_ms = ? AND archive_key = ?
        AND ((status = 'pending' AND next_attempt_at_ms <= ?)
          OR (status = 'leased' AND lease_until_ms <= ?))`)
      .bind(token, now + LEASE_MS, now, requestedId, revision, key, now, now).run();
    if (checked(claim, 'claim detail job') !== 1) {
      const error = new Error('Detail job is already leased or awaiting retry');
      error.code = 'DETAIL_JOB_NOT_DUE';
      throw error;
    }
  }
  try {
    await putImmutable(env.GEOJSON_BUCKET, key, json, bytes.byteLength);
    await commitPointer({ env, id: requestedId, revision, key, token, summary, flags, previousAttempts });
    return { flags, archiveDisposition: 'stored' };
  } catch (error) {
    try { await releaseJob(env.DB, requestedId, revision, token, error); }
    catch (retryError) { console.error('[detail-archive] Could not record retry:', retryError); }
    throw error;
  }
}

export async function recoverDueDetailJobs(env, { limit = 3 } = {}) {
  if (!env.DB || !env.GEOJSON_BUCKET) throw new Error('Detail recovery bindings are required');
  const now = Date.now();
  const due = await env.DB.prepare(`SELECT event_id, target_revision_ms FROM EarthquakeDetailJobs
    WHERE (status = 'pending' AND next_attempt_at_ms <= ?)
       OR (status = 'leased' AND lease_until_ms <= ?)
    ORDER BY next_attempt_at_ms, event_id LIMIT ?`).bind(now, now, limit).all();
  if (due?.success !== true || !Array.isArray(due.results)) throw new Error('Failed to select due detail jobs');
  let completed = 0;
  let failed = 0;
  for (const job of due.results) {
    let token = null;
    try {
      const row = await env.DB.prepare(`SELECT source_updated_at_ms, detail_archive_revision_ms
        FROM EarthquakeEvents WHERE id = ?`)
        .bind(job.event_id).first();
      if ((Number.isSafeInteger(row?.source_updated_at_ms) && row.source_updated_at_ms > job.target_revision_ms) ||
          (Number.isSafeInteger(row?.detail_archive_revision_ms) && row.detail_archive_revision_ms > job.target_revision_ms)) {
        checked(await env.DB.prepare(`UPDATE EarthquakeDetailJobs SET status = 'superseded',
          lease_token = NULL, lease_until_ms = NULL, updated_at_ms = ?
          WHERE event_id = ? AND target_revision_ms = ? AND status IN ('pending', 'leased')`)
          .bind(Date.now(), job.event_id, job.target_revision_ms).run(), 'supersede detail job');
        continue;
      }
      // Claim before the upstream request: overlapping cron invocations may
      // select the same due row, but only one may fetch it.
      token = crypto.randomUUID();
      const claim = await env.DB.prepare(`UPDATE EarthquakeDetailJobs SET status = 'leased',
        lease_token = ?, lease_until_ms = ?, attempts = attempts + 1, updated_at_ms = ?
        WHERE event_id = ? AND target_revision_ms = ?
          AND ((status = 'pending' AND next_attempt_at_ms <= ?)
            OR (status = 'leased' AND lease_until_ms <= ?))`)
        .bind(token, Date.now() + LEASE_MS, Date.now(), job.event_id, job.target_revision_ms, now, now).run();
      if (checked(claim, 'claim recovery job') !== 1) continue;
      const detail = await fetchValidatedDetail(job.event_id);
      if (detail.properties.updated < job.target_revision_ms) throw revisionError('STALE_DETAIL_REVISION');
      await persistEarthquakeDetail({ env, detailData: detail, requestedId: job.event_id,
        ...(detail.properties.updated === job.target_revision_ms ? { claimedLeaseToken: token } : {}) });
      if (detail.properties.updated > job.target_revision_ms) {
        checked(await env.DB.prepare(`UPDATE EarthquakeDetailJobs SET status = 'superseded',
          lease_token = NULL, lease_until_ms = NULL, updated_at_ms = ?
          WHERE event_id = ? AND target_revision_ms = ? AND status = 'leased' AND lease_token = ?`)
          .bind(Date.now(), job.event_id, job.target_revision_ms, token).run(), 'supersede old detail job');
      }
      completed++;
    } catch (error) {
      failed++;
      console.error(`[detail-archive] Recovery failed for ${job.event_id}:`, error);
      if (token) await releaseJob(env.DB, job.event_id, job.target_revision_ms, token, error);
    }
  }
  return { selected: due.results.length, completed, failed };
}
