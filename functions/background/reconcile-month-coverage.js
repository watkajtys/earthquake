import { feedEnvelopeMetadata, feedPointerKey, MAX_FEED_BYTES, MAX_FEED_POINTER_BYTES,
  validateFeedDescriptor, validateFeedEnvelope, validateFeedPointer } from '../../shared/earthquakeFeedContract.js';

// This repairs ID coverage only. Existing summaries, revisions, detail metadata,
// and archives are never changed. The hourly writer owns scientific updates.
const PREFIX = 'month-coverage/v1/';
const MODE = 'insert-missing-month-v1';
const LEASE_MS = 120_000;
export const COVERAGE_BATCH_FEATURES = 600;
export const COVERAGE_BATCH_BYTES = 256 * 1024;
export const COVERAGE_MAX_BATCHES = 32;
const encoder = new TextEncoder();

function check(ok, code) {
  if (!ok) { const error = new Error(code); error.code = code; throw error; }
}
function changes(result) {
  check(result?.success === true && Number.isInteger(result.meta?.changes) && result.meta.changes >= 0,
    'COVERAGE_D1_RESULT_INVALID');
  return result.meta.changes;
}
async function rows(db, sql, ...values) {
  const result = await db.prepare(sql).bind(...values).all();
  check(result?.success === true && Array.isArray(result.results), 'COVERAGE_D1_READ_FAILED');
  return result.results;
}
async function run(db, sql, ...values) {
  return changes(await db.prepare(sql).bind(...values).run());
}
async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function readJson(bucket, key, maxBytes, expected) {
  const object = await bucket.get(key);
  check(object && object.size > 0 && object.size <= maxBytes &&
    (!expected || object.size === expected.bytes), 'COVERAGE_SOURCE_UNAVAILABLE');
  let bytes = await object.arrayBuffer();
  check(bytes.byteLength === object.size && (!expected || await sha256(bytes) === expected.hash),
    'COVERAGE_SOURCE_CHECKSUM_FAILED');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  // The verified byte buffer is no longer needed while JSON.parse allocates
  // the object graph. Allow collection before the largest allocation phase.
  bytes = null;
  return JSON.parse(text);
}
async function sourceFor(bucket, descriptor) {
  validateFeedDescriptor(descriptor, { period: 'month', requireFresh: false });
  const source = validateFeedEnvelope(await readJson(bucket, descriptor.objectKey, MAX_FEED_BYTES,
    { bytes: descriptor.byteLength, hash: descriptor.sha256 }), { period: 'month', requireFresh: false });
  for (const [key, value] of Object.entries(feedEnvelopeMetadata(source))) {
    check(descriptor[key] === value, 'COVERAGE_SOURCE_IDENTITY_MISMATCH');
  }
  return source;
}

async function claim(db) {
  await run(db, "INSERT OR IGNORE INTO UsgsIngestionState(feed_key) VALUES ('month')");
  const owner = crypto.randomUUID();
  const now = Date.now();
  const count = await run(db, `UPDATE UsgsIngestionState SET fence = fence + 1, lease_owner = ?, lease_until_ms = ?
    WHERE feed_key = 'month' AND (lease_owner IS NULL OR lease_until_ms <= ?)`, owner, now + LEASE_MS, now);
  if (!count) return null;
  const [state] = await rows(db, "SELECT * FROM UsgsIngestionState WHERE feed_key = 'month'");
  check(count === 1 && state?.lease_owner === owner, 'COVERAGE_LEASE_LOST');
  return { owner, fence: state.fence, state };
}
async function renew(db, lease) {
  const now = Date.now();
  check(await run(db, `UPDATE UsgsIngestionState SET lease_until_ms = ? WHERE feed_key = 'month'
    AND fence = ? AND lease_owner = ? AND lease_until_ms > ?`, now + LEASE_MS, lease.fence, lease.owner, now) === 1,
  'COVERAGE_LEASE_LOST');
}
const authority = `EXISTS (SELECT 1 FROM UsgsIngestionState s JOIN UsgsIngestionRuns r ON r.run_id = s.active_run_id
  WHERE s.feed_key = 'month' AND s.fence = ? AND s.lease_owner = ? AND s.lease_until_ms > ?
    AND r.run_id = ? AND r.cursor = ? AND r.status IN ('pending', 'retry'))`;
const owned = (lease, descriptor, now) => [lease.fence, lease.owner, now, descriptor.run_id, descriptor.cursor];

async function admit(env, lease, descriptor) {
  // 0022 limits its snapshot column to16MiB. A small immutable receipt pins the
  // existing complete object (whose supported envelope limit is17MiB), without
  // duplicating that object or changing the publisher or database schema.
  const key = `${PREFIX}${descriptor.generationId}.json`;
  const bytes = encoder.encode(JSON.stringify({ schemaVersion: 1, mode: MODE, descriptor }));
  const hash = await sha256(bytes);
  const stored = await env.GEOJSON_BUCKET.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' },
    customMetadata: { sha256: hash },
  });
  if (!stored) {
    await readJson(env.GEOJSON_BUCKET, key, MAX_FEED_POINTER_BYTES, { bytes: bytes.byteLength, hash });
  }
  const id = `month-coverage:${descriptor.generationId}`;
  const now = Date.now();
  await renew(env.DB, lease);
  const result = await env.DB.batch([
    env.DB.prepare(`INSERT INTO UsgsIngestionRuns
      (run_id, feed_key, snapshot_key, snapshot_sha256, snapshot_bytes, source_generated_at_ms,
       feature_count, next_attempt_at_ms, created_at_ms, updated_at_ms)
      SELECT ?, 'month', ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM UsgsIngestionState WHERE feed_key = 'month' AND fence = ? AND lease_owner = ?
          AND lease_until_ms > ? AND active_run_id IS NULL)`)
      .bind(id, key, hash, bytes.byteLength, descriptor.upstreamGeneratedAtMs, descriptor.totalCount,
        now, now, now, lease.fence, lease.owner, now),
    env.DB.prepare(`UPDATE UsgsIngestionState SET active_run_id = ? WHERE feed_key = 'month'
      AND fence = ? AND lease_owner = ? AND lease_until_ms > ? AND active_run_id IS NULL
      AND EXISTS (SELECT 1 FROM UsgsIngestionRuns WHERE run_id = ?)`)
      .bind(id, lease.fence, lease.owner, now, id),
  ]);
  check(result.length === 2 && result.every(item => changes(item) === 1), 'COVERAGE_ADMISSION_FENCED');
  return (await rows(env.DB, 'SELECT * FROM UsgsIngestionRuns WHERE run_id = ?', id))[0];
}

export function coverageBatch(features, cursor) {
  const values = [];
  let bytes = 2;
  for (let index = cursor; index < features.length && values.length < COVERAGE_BATCH_FEATURES; index++) {
    const feature = features[index];
    const p = feature.properties;
    const c = feature.geometry.coordinates;
    const value = JSON.stringify([feature.id, p.time, c[1], c[0], c[2], p.mag, p.place, p.updated]);
    const size = encoder.encode(value).byteLength + (values.length ? 1 : 0);
    if (bytes + size > COVERAGE_BATCH_BYTES) break;
    values.push(value); bytes += size;
  }
  check(values.length > 0, 'COVERAGE_BATCH_EMPTY');
  return { json: `[${values.join(',')}]`, count: values.length };
}

async function persist(db, lease, descriptor, batch) {
  await renew(db, lease);
  const now = Date.now();
  const result = await db.batch([
    db.prepare(`INSERT INTO EarthquakeEvents
      (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url,
       source_updated_at_ms, retrieved_at, next_detail_fetch_attempt)
      SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
        json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'),
        json_extract(value, '$[6]'),
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/' || json_extract(value, '$[0]') || '.geojson',
        json_extract(value, '$[7]'), ?, ? FROM json_each(?) WHERE ${authority}
      ON CONFLICT(id) DO NOTHING`)
      .bind(now, now + 45 * 60_000, batch.json, ...owned(lease, descriptor, now)),
    db.prepare(`UPDATE UsgsIngestionRuns SET cursor = cursor + ?, status = 'pending', attempts = 0,
      updated_at_ms = ?, last_error = NULL WHERE run_id = ? AND ${authority}`)
      .bind(batch.count, now, descriptor.run_id, ...owned(lease, descriptor, now)),
  ]);
  check(result.length === 2 && changes(result[1]) === 1, 'COVERAGE_CURSOR_FENCED');
  return changes(result[0]);
}

async function complete(db, lease, descriptor) {
  await renew(db, lease);
  const now = Date.now();
  const result = await db.batch([
    db.prepare(`UPDATE UsgsIngestionRuns SET status = 'completed', completed_at_ms = ?, updated_at_ms = ?
      WHERE run_id = ? AND cursor = feature_count AND ${authority}`)
      .bind(now, now, descriptor.run_id, ...owned(lease, descriptor, now)),
    db.prepare(`UPDATE UsgsIngestionState SET active_run_id = NULL, completed_run_id = ?, completed_source_generated_at_ms = ?
      WHERE feed_key = 'month' AND fence = ? AND lease_owner = ? AND lease_until_ms > ? AND active_run_id = ?
      AND EXISTS (SELECT 1 FROM UsgsIngestionRuns WHERE run_id = ? AND status = 'completed' AND cursor = feature_count)`)
      .bind(descriptor.run_id, descriptor.source_generated_at_ms, lease.fence, lease.owner, now,
        descriptor.run_id, descriptor.run_id),
  ]);
  check(result.length === 2 && result.every(item => changes(item) === 1), 'COVERAGE_COMPLETION_FENCED');
}

async function readRun(db, id) {
  const [descriptor] = await rows(db, 'SELECT * FROM UsgsIngestionRuns WHERE run_id = ?', id);
  check(descriptor?.feed_key === 'month' && descriptor.snapshot_key.startsWith(PREFIX) &&
    descriptor.run_id.startsWith('month-coverage:'), 'COVERAGE_LEDGER_MODE_CONFLICT');
  return descriptor;
}

export async function reconcileMonthCoverage(env) {
  check(env.DB && env.GEOJSON_BUCKET, 'COVERAGE_BINDINGS_MISSING');
  const lease = await claim(env.DB);
  if (!lease) return { status: 'busy' };
  let descriptor;
  try {
    let source;
    if (lease.state.active_run_id) {
      descriptor = await readRun(env.DB, lease.state.active_run_id);
      check(['pending', 'retry'].includes(descriptor.status), 'COVERAGE_RUN_UNAVAILABLE');
      if (descriptor.next_attempt_at_ms > Date.now()) return { status: 'retry-wait', runId: descriptor.run_id };
      const receipt = await readJson(env.GEOJSON_BUCKET, descriptor.snapshot_key, MAX_FEED_POINTER_BYTES,
        { bytes: descriptor.snapshot_bytes, hash: descriptor.snapshot_sha256 });
      check(receipt.schemaVersion === 1 && receipt.mode === MODE, 'COVERAGE_RECEIPT_INVALID');
      source = await sourceFor(env.GEOJSON_BUCKET, receipt.descriptor);
      check(source.totalCount === descriptor.feature_count &&
        source.upstreamGeneratedAtMs === descriptor.source_generated_at_ms, 'COVERAGE_RUN_IDENTITY_MISMATCH');
    } else {
      if (lease.state.completed_run_id) await readRun(env.DB, lease.state.completed_run_id);
      const pointer = validateFeedPointer(await readJson(env.GEOJSON_BUCKET, feedPointerKey('month'), MAX_FEED_POINTER_BYTES),
        { period: 'month', requireFresh: false });
      if (lease.state.completed_source_generated_at_ms !== null &&
          pointer.current.upstreamGeneratedAtMs <= lease.state.completed_source_generated_at_ms) {
        return { status: 'unchanged', sourceGeneratedAtMs: lease.state.completed_source_generated_at_ms };
      }
      source = await sourceFor(env.GEOJSON_BUCKET, pointer.current);
      descriptor = await admit(env, lease, pointer.current);
    }
    let inserted = 0;
    let batches = 0;
    // One pinned source per invocation; a changing live pointer cannot starve
    // its tail. Both payload size and query count stay bounded.
    while (descriptor.cursor < source.features.length && batches < COVERAGE_MAX_BATCHES) {
      const batch = coverageBatch(source.features, descriptor.cursor);
      inserted += await persist(env.DB, lease, descriptor, batch);
      descriptor.cursor += batch.count;
      descriptor.attempts = 0;
      batches++;
    }
    const finished = descriptor.cursor === source.features.length;
    if (finished) await complete(env.DB, lease, descriptor);
    return { status: finished ? 'completed' : 'continuing', runId: descriptor.run_id,
      sourceGeneratedAtMs: descriptor.source_generated_at_ms, sourceAgeMs: Date.now() - descriptor.source_generated_at_ms,
      cursor: descriptor.cursor, featureCount: descriptor.feature_count, inserted, batches };
  } catch (error) {
    if (descriptor && ['pending', 'retry'].includes(descriptor.status)) {
      const now = Date.now();
      const attempts = descriptor.attempts + 1;
      // Transient outages never permanently park progress. Corrupt pinned
      // sources remain explicit failures and are retried without losing evidence.
      await run(env.DB, `UPDATE UsgsIngestionRuns SET status = 'retry', attempts = ?, next_attempt_at_ms = ?,
        last_error = ?, updated_at_ms = ? WHERE run_id = ? AND ${authority}`,
      attempts, now + Math.min(300_000, 10_000 * 2 ** Math.min(attempts - 1, 5)),
      error.code || 'COVERAGE_STORAGE_FAILED', now, descriptor.run_id, ...owned(lease, descriptor, now)).catch(() => {});
    }
    throw error;
  } finally {
    await run(env.DB, `UPDATE UsgsIngestionState SET lease_owner = NULL, lease_until_ms = NULL
      WHERE feed_key = 'month' AND fence = ? AND lease_owner = ?`, lease.fence, lease.owner).catch(() => {});
  }
}
