import { updateStatsInKV } from '../utils/kv-stats-updater.js';
import { fetchValidatedDetail } from '../utils/usgs-transport.js';
import { persistEarthquakeDetail, recoverDueDetailJobs } from '../utils/earthquakeDetailPersistence.js';
import { readBoundedJson, RequestPolicyError, policyError } from '../../src/utils/workerRequestPolicy.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const jsonResponse = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function boundedNumber(value, fallback, name, min, max, integer, fromQuery) {
  if (value === undefined || (fromQuery && value === null)) return fallback;
  if (fromQuery && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) {
    throw new RequestPolicyError(`Invalid ${name}.`);
  }
  const number = fromQuery ? Number(value) : value;
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new RequestPolicyError(`Invalid ${name}.`);
  }
  return number;
}

function parameters(input, fromQuery = false) {
  const get = name => fromQuery ? input.get(name) : input[name];
  return {
    batchSize: boundedNumber(get('batch_size'), 10, 'batch_size', 1, 100, true, fromQuery),
    minMagnitude: boundedNumber(get('min_magnitude'), 3, 'min_magnitude', -2, 10, false, fromQuery),
    maxAgeDays: boundedNumber(get('max_age_days'), 365, 'max_age_days', 1, 365, true, fromQuery),
  };
}

function pendingSelection(criteria, now) {
  return {
    where: `detail_fetched = FALSE
      AND NOT EXISTS (SELECT 1 FROM EarthquakeDetailJobs AS job
        WHERE job.event_id = EarthquakeEvents.id AND job.status IN ('pending', 'leased', 'parked')
          AND (EarthquakeEvents.source_updated_at_ms IS NULL
            OR job.target_revision_ms >= EarthquakeEvents.source_updated_at_ms))
      AND COALESCE(detail_fetch_attempts, 0) < 3
      AND ((COALESCE(detail_fetch_attempts, 0) = 0 AND event_time <= ? AND
              (next_detail_fetch_attempt IS NULL OR next_detail_fetch_attempt <= ?))
        OR (next_detail_fetch_attempt IS NOT NULL AND next_detail_fetch_attempt <= ?))
      AND magnitude >= ? AND event_time >= ?`,
    values: [now - 45 * 60 * 1000, now, now, criteria.minMagnitude, now - criteria.maxAgeDays * DAY_MS],
  };
}

function safeFailure(error) {
  if (error instanceof RequestPolicyError) return policyError(error.message, error.status);
  console.error('[backfill] Operation failed:', error);
  return policyError('Backfill operation failed.', 500);
}

// Internal scheduled entrypoint. The Worker rejects public GET requests and
// authenticates POST requests before invoking this module.
async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const criteria = parameters(url.searchParams, true);
    if (!env.DB) return policyError('Database not configured.', 500);
    const startTime = Date.now();
    const recovery = await recoverDueDetailJobs(env, { limit: 3 });
    const selection = pendingSelection(criteria, startTime);
    const result = await env.DB.prepare(`
      SELECT id, magnitude, detail_fetch_attempts FROM EarthquakeEvents
      WHERE ${selection.where}
      ORDER BY magnitude DESC, event_time DESC, id ASC LIMIT ?
    `).bind(...selection.values, criteria.batchSize).all();
    if (result?.success !== true || !Array.isArray(result.results)) throw new Error('Failed to select pending earthquake details');
    const processed = [];
    const errors = [];
    for (const [index, earthquake] of result.results.entries()) {
      let fetchedDetail = false;
      try {
        // Never fetch the stored detail URL: only the validated official URL
        // derived from the selected event ID is permitted.
        const detailData = await fetchValidatedDetail(earthquake.id);
        fetchedDetail = true;
        const { flags, archiveDisposition } = await persistEarthquakeDetail({
          env, detailData, requestedId: earthquake.id, previousAttempts: earthquake.detail_fetch_attempts || 0,
        });
        // These legacy counters remain approximate until the D1 statistics
        // migration. Their failure must not undo a completed detail operation.
        if (env.USGS_LAST_RESPONSE_KV) {
          const update = updateStatsInKV(context, 'USGS_LAST_RESPONSE_KV', 'earthquake_stats', {
            fetched: 1, with_shakemap: Number(flags.has_shakemap), with_moment_tensor: Number(flags.has_moment_tensor),
          }).catch(error => console.error('[backfill] Approximate statistics update failed:', error));
          if (context.ctx?.waitUntil) context.ctx.waitUntil(update);
          else await update;
        }
        processed.push({
          id: earthquake.id, magnitude: earthquake.magnitude, archive_disposition: archiveDisposition,
          products_found: {
            shakemap: flags.has_shakemap, moment_tensor: flags.has_moment_tensor,
            focal_mechanism: flags.has_focal_mechanism, dyfi: flags.has_dyfi,
            losspager: flags.has_losspager, finite_fault: flags.has_finite_fault,
          },
        });
      } catch (error) {
        console.error(`[backfill] Detail operation failed for ${earthquake.id}:`, error);
        const attempts = earthquake.detail_fetch_attempts || 0;
        // Infrastructure failures do not consume the upstream fetch budget.
        // Await scheduling so a successful HTTP response cannot hide its loss.
        const retry = await env.DB.prepare(`
          UPDATE EarthquakeEvents SET
            detail_fetch_attempts = MAX(COALESCE(detail_fetch_attempts, 0), ?),
            last_detail_fetch_attempt = ?, next_detail_fetch_attempt = ?
          WHERE id = ? AND detail_fetched = FALSE
        `).bind(
          fetchedDetail ? attempts : attempts + 1,
          Date.now(), Date.now() + (fetchedDetail ? HOUR_MS : [HOUR_MS, 4 * HOUR_MS, 12 * HOUR_MS][attempts]),
          earthquake.id,
        ).run();
        if (retry?.success !== true) throw new Error('Failed to persist detail retry');
        errors.push({ id: earthquake.id, error: fetchedDetail ? 'Detail persistence failed; retry scheduled.' : 'USGS detail fetch failed; retry scheduled.',
          ...(error.upstreamStatus ? { status: error.upstreamStatus } : {}) });
      }
      if (index + 1 < result.results.length) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const nextUrl = new URL(url.pathname, 'https://internal.invalid');
    nextUrl.searchParams.set('batch_size', String(criteria.batchSize));
    nextUrl.searchParams.set('min_magnitude', String(criteria.minMagnitude));
    nextUrl.searchParams.set('max_age_days', String(criteria.maxAgeDays));
    return jsonResponse({
      success: errors.length === 0, processed: processed.length, errors: errors.length,
      recovered_jobs: recovery,
      elapsed_seconds: (Date.now() - startTime) / 1000,
      last_processed_id: processed.at(-1)?.id || null,
      // Advisory internal URL only. Each invocation selects the next eligible
      // rows; lexical IDs cannot be a cursor for magnitude/time ordering.
      continue_url: result.results.length ? `${nextUrl.pathname}${nextUrl.search}` : null,
      criteria, processed_earthquakes: processed, error_earthquakes: errors,
      ...(result.results.length ? {} : { message: 'No earthquakes to backfill' }),
    });
  } catch (error) {
    return safeFailure(error);
  }
}

async function onRequestPost(context) {
  try {
    const body = await readBoundedJson(context.request, 4096);
    if (!['run_batch', 'status'].includes(body.operation)) throw new RequestPolicyError('operation must be run_batch or status.');
    const criteria = parameters(body);
    if (!context.env.DB) return policyError('Database not configured.', 500);
    if (body.operation === 'run_batch') {
      const url = new URL('https://internal.invalid/api/backfill-earthquake-details');
      url.searchParams.set('batch_size', String(criteria.batchSize));
      url.searchParams.set('min_magnitude', String(criteria.minMagnitude));
      url.searchParams.set('max_age_days', String(criteria.maxAgeDays));
      return onRequestGet({ ...context, request: new Request(url) });
    }
    const selection = pendingSelection(criteria, Date.now());
    const result = await context.env.DB.prepare(`SELECT COUNT(*) AS total FROM EarthquakeEvents WHERE ${selection.where}`)
      .bind(...selection.values).first();
    if (!Number.isSafeInteger(result?.total) || result.total < 0) throw new Error('Failed to count pending earthquake details');
    const jobs = await context.env.DB.prepare(`SELECT status, COUNT(*) AS total FROM EarthquakeDetailJobs
      WHERE status IN ('pending', 'leased', 'parked') GROUP BY status`).all();
    if (jobs?.success !== true || !Array.isArray(jobs.results) ||
        jobs.results.some(job => !['pending', 'leased', 'parked'].includes(job.status) ||
          !Number.isSafeInteger(job.total) || job.total < 0)) throw new Error('Failed to count detail jobs');
    const detailJobs = { pending: 0, leased: 0, parked: 0 };
    for (const job of jobs.results) detailJobs[job.status] = job.total;
    return jsonResponse({ success: true, operation: 'status', eligible_count: result.total,
      detail_jobs: detailJobs, criteria });
  } catch (error) {
    return safeFailure(error);
  }
}

export { onRequestGet, onRequestPost };
