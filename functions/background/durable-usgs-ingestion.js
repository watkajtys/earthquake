import { USGS_LIMITS, USGS_SUMMARY_URLS, UsgsTransportError, fetchUsgsSummary, usgsDetailUrl, validateUsgsSummary } from '../utils/usgs-transport.js';

const SNAPSHOT_PREFIX = 'trusted-usgs-ingestion/v1/';
const LEASE_MS = 120_000;
const BATCH_SIZE = 90;
// A D1 batch has two statements per event plus the cursor update. Three
// batches keep an invocation below the paid-plan 1,000-query limit even after
// lease, state, and compatibility-cache queries.
const MAX_BATCHES_PER_INVOCATION = 3;
const MAX_ATTEMPTS = 6;
const CLAIM_WAIT_MS = 10_000;
const textEncoder = new TextEncoder();

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function checked(result, operation) {
  if (result?.success !== true || !Number.isInteger(result.meta?.changes) || result.meta.changes < 0) {
    throw new Error(`${operation} returned an incomplete D1 result`);
  }
  return result.meta.changes;
}

async function rows(db, sql, ...values) {
  const result = await db.prepare(sql).bind(...values).all();
  if (result?.success !== true || !Array.isArray(result.results)) throw new Error('D1 read was incomplete');
  return result.results;
}

async function run(db, sql, ...values) {
  return checked(await db.prepare(sql).bind(...values).run(), 'D1 mutation');
}

function generatedAt(source) {
  const value = source?.metadata?.generated;
  if (!Number.isSafeInteger(value) || value < 0 || value > Date.now() + 60_000 ||
      (source.metadata.count !== undefined && source.metadata.count !== source.features.length)) {
    throw new Error('Trusted USGS feed has no valid generation/count metadata');
  }
  return value;
}

async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sorted(source) {
  return [...source.features].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

async function claim(db, feedKey) {
  await run(db, 'INSERT OR IGNORE INTO UsgsIngestionState(feed_key) VALUES (?)', feedKey);
  const owner = crypto.randomUUID();
  const deadline = Date.now() + CLAIM_WAIT_MS;
  for (let attempt = 0; attempt <= CLAIM_WAIT_MS / 100; attempt++) {
    const now = Date.now();
    const claimed = await run(db, `UPDATE UsgsIngestionState SET fence = fence + 1, lease_owner = ?, lease_until_ms = ?
      WHERE feed_key = ? AND (lease_owner IS NULL OR lease_until_ms <= ?)`, owner, now + LEASE_MS, feedKey, now);
    if (claimed === 1) {
      const [state] = await rows(db, 'SELECT * FROM UsgsIngestionState WHERE feed_key = ?', feedKey);
      if (state?.lease_owner !== owner) throw new Error('D1 ingestion lease changed after claim');
      return { owner, fence: state.fence };
    }
    if (claimed !== 0) throw new Error('D1 ingestion lease changed multiple rows');
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Trusted USGS ingestion is already running');
}

async function renew(db, feedKey, lease) {
  const now = Date.now();
  const count = await run(db, `UPDATE UsgsIngestionState SET lease_until_ms = ?
    WHERE feed_key = ? AND fence = ? AND lease_owner = ? AND lease_until_ms > ?`,
  now + LEASE_MS, feedKey, lease.fence, lease.owner, now);
  if (count !== 1) throw new Error('D1 ingestion lease was lost');
}

async function release(db, feedKey, lease) {
  await run(db, `UPDATE UsgsIngestionState SET lease_owner = NULL, lease_until_ms = NULL
    WHERE feed_key = ? AND fence = ? AND lease_owner = ?`, feedKey, lease.fence, lease.owner);
}

async function readSnapshot(bucket, descriptor) {
  const object = await bucket.get(descriptor.snapshot_key);
  if (!object || object.size !== descriptor.snapshot_bytes || object.size > USGS_LIMITS.summaryBytes) {
    throw new Error('Durable USGS source snapshot is missing or has an invalid size');
  }
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== descriptor.snapshot_bytes || await sha256(bytes) !== descriptor.snapshot_sha256) {
    throw new Error('Durable USGS source snapshot failed its checksum');
  }
  const source = validateUsgsSummary(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (source.features.length !== descriptor.feature_count || generatedAt(source) !== descriptor.source_generated_at_ms) {
    throw new Error('Durable USGS source snapshot failed validation');
  }
  return source;
}

async function stageSnapshot(bucket, feedKey, source) {
  const bytes = textEncoder.encode(JSON.stringify(source));
  if (bytes.byteLength > USGS_LIMITS.summaryBytes) throw new Error('Trusted USGS source snapshot exceeds the size limit');
  const digest = await sha256(bytes);
  const id = crypto.randomUUID();
  const key = `${SNAPSHOT_PREFIX}${feedKey}/${id}.json`;
  const object = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
    customMetadata: { sha256: digest, sourceGeneratedAtMs: String(generatedAt(source)) },
  });
  if (!object) throw new Error('Immutable USGS source snapshot could not be created');
  return { runId: id, key, digest, bytes: bytes.byteLength };
}

async function createRun(db, feedKey, lease, source, snapshot) {
  const now = Date.now();
  const statements = [
    db.prepare(`INSERT INTO UsgsIngestionRuns
      (run_id, feed_key, snapshot_key, snapshot_sha256, snapshot_bytes,
       source_generated_at_ms, feature_count, next_attempt_at_ms, created_at_ms, updated_at_ms)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM UsgsIngestionState WHERE feed_key = ? AND fence = ?
          AND lease_owner = ? AND lease_until_ms > ? AND active_run_id IS NULL)`)
      .bind(snapshot.runId, feedKey, snapshot.key, snapshot.digest, snapshot.bytes,
        generatedAt(source), source.features.length, now, now, now,
        feedKey, lease.fence, lease.owner, now),
    db.prepare(`UPDATE UsgsIngestionState SET active_run_id = ?
      WHERE feed_key = ? AND fence = ? AND lease_owner = ? AND lease_until_ms > ?
        AND active_run_id IS NULL AND EXISTS (SELECT 1 FROM UsgsIngestionRuns WHERE run_id = ?)`)
      .bind(snapshot.runId, feedKey, lease.fence, lease.owner, now, snapshot.runId),
  ];
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== 2 ||
      results.some((result, index) => checked(result, `run creation ${index}`) !== 1)) {
    throw new Error('D1 ingestion run could not be committed');
  }
  return (await rows(db, 'SELECT * FROM UsgsIngestionRuns WHERE run_id = ?', snapshot.runId))[0];
}

const upsertSql = `INSERT INTO EarthquakeEvents
  (id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url,
   source_updated_at_ms, retrieved_at, next_detail_fetch_attempt)
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
    SELECT 1 FROM UsgsIngestionState WHERE feed_key = ? AND fence = ?
      AND lease_owner = ? AND lease_until_ms > ? AND active_run_id = ?)
  ON CONFLICT(id) DO UPDATE SET
    event_time = excluded.event_time, latitude = excluded.latitude,
    longitude = excluded.longitude, depth = excluded.depth, magnitude = excluded.magnitude,
    place = excluded.place, usgs_detail_url = excluded.usgs_detail_url,
    source_updated_at_ms = excluded.source_updated_at_ms, retrieved_at = excluded.retrieved_at,
    has_shakemap = 0, has_moment_tensor = 0, has_focal_mechanism = 0,
    has_dyfi = 0, has_losspager = 0, has_finite_fault = 0,
    has_enhanced_data = 0, products_json = NULL,
    detail_fetched = 0, detail_fetch_time = NULL,
    detail_fetch_attempts = 0, last_detail_fetch_attempt = NULL,
    next_detail_fetch_attempt = excluded.next_detail_fetch_attempt,
    detail_archive_key = NULL, detail_archive_revision_ms = NULL,
    detail_metadata_revision_ms = NULL
  WHERE EarthquakeEvents.source_updated_at_ms IS NULL
     OR excluded.source_updated_at_ms > EarthquakeEvents.source_updated_at_ms`;

const issueSql = `INSERT OR IGNORE INTO UsgsIngestionIssues
  (run_id, event_id, reason, source_updated_at_ms, feature_sha256, created_at_ms)
  SELECT ?, ?, 'equal_revision_conflict', ?, ?, ? FROM EarthquakeEvents
  WHERE id = ? AND source_updated_at_ms = ? AND
    (event_time IS NOT ? OR latitude IS NOT ? OR longitude IS NOT ? OR depth IS NOT ?
      OR magnitude IS NOT ? OR place IS NOT ? OR usgs_detail_url IS NOT ?)
    AND EXISTS (SELECT 1 FROM UsgsIngestionState WHERE feed_key = ? AND fence = ?
      AND lease_owner = ? AND lease_until_ms > ? AND active_run_id = ?)`;

function featureValues(feature) {
  return [feature.id, feature.properties.time, feature.geometry.coordinates[1],
    feature.geometry.coordinates[0], feature.geometry.coordinates[2],
    feature.properties.mag, feature.properties.place, usgsDetailUrl(feature.id), feature.properties.updated];
}

async function persistBatch(db, feedKey, lease, descriptor, batch) {
  await renew(db, feedKey, lease);
  const now = Date.now();
  const operations = [];
  for (const feature of batch) {
    const values = featureValues(feature);
    operations.push(db.prepare(upsertSql).bind(...values, now, now + 45 * 60_000,
      feedKey, lease.fence, lease.owner, now, descriptor.run_id));
    operations.push(db.prepare(issueSql).bind(descriptor.run_id, feature.id,
      feature.properties.updated, await sha256(textEncoder.encode(JSON.stringify(feature))), now,
      feature.id, feature.properties.updated, ...values.slice(1, 8),
      feedKey, lease.fence, lease.owner, now, descriptor.run_id));
  }
  operations.push(db.prepare(`UPDATE UsgsIngestionRuns SET cursor = ?, status = 'pending',
    updated_at_ms = ?, last_error = NULL WHERE run_id = ? AND cursor = ?
    AND status IN ('pending', 'retry') AND EXISTS (
      SELECT 1 FROM UsgsIngestionState WHERE feed_key = ? AND fence = ?
        AND lease_owner = ? AND lease_until_ms > ? AND active_run_id = ?)`)
    .bind(descriptor.cursor + batch.length, now, descriptor.run_id, descriptor.cursor,
      feedKey, lease.fence, lease.owner, now, descriptor.run_id));
  const results = await db.batch(operations);
  if (!Array.isArray(results) || results.length !== operations.length) throw new Error('D1 batch returned incomplete ingestion results');
  results.forEach((result, index) => checked(result, `ingestion statement ${index}`));
  if (results.at(-1).meta.changes !== 1) throw new Error('D1 ingestion cursor was fenced');
  return batch.filter((_, index) => results[index * 2].meta.changes === 1).map(feature => feature.id);
}

async function markRetry(db, feedKey, lease, descriptor, error) {
  const attempts = descriptor.attempts + 1;
  const now = Date.now();
  const delay = Math.min(5 * 60_000, 10_000 * 2 ** Math.min(attempts - 1, 5));
  const jitter = crypto.getRandomValues(new Uint16Array(1))[0] % 1000;
  await run(db, `UPDATE UsgsIngestionRuns SET status = ?, attempts = ?,
    next_attempt_at_ms = ?, last_error = ?, updated_at_ms = ?
    WHERE run_id = ? AND status IN ('pending', 'retry') AND EXISTS (
      SELECT 1 FROM UsgsIngestionState WHERE feed_key = ? AND fence = ? AND lease_owner = ?
        AND lease_until_ms > ? AND active_run_id = ?)`,
  attempts >= MAX_ATTEMPTS ? 'parked' : 'retry', attempts, now + delay + jitter,
  error?.code || 'D1_BATCH_FAILED', now, descriptor.run_id,
  feedKey, lease.fence, lease.owner, now, descriptor.run_id);
}

async function completeRun(db, feedKey, lease, descriptor) {
  const now = Date.now();
  const [{ count }] = await rows(db, 'SELECT COUNT(*) AS count FROM UsgsIngestionIssues WHERE run_id = ?', descriptor.run_id);
  const status = count ? 'completed_with_rejections' : 'completed';
  const operations = [
    db.prepare(`UPDATE UsgsIngestionRuns SET status = ?, completed_at_ms = ?, updated_at_ms = ?
      WHERE run_id = ? AND cursor = feature_count AND status IN ('pending', 'retry')
        AND EXISTS (SELECT 1 FROM UsgsIngestionState WHERE feed_key = ? AND fence = ?
          AND lease_owner = ? AND lease_until_ms > ? AND active_run_id = ?)`)
      .bind(status, now, now, descriptor.run_id, feedKey, lease.fence, lease.owner, now, descriptor.run_id),
    db.prepare(`UPDATE UsgsIngestionState SET active_run_id = NULL, completed_run_id = ?,
      completed_source_generated_at_ms = ? WHERE feed_key = ? AND fence = ?
      AND lease_owner = ? AND lease_until_ms > ? AND active_run_id = ?
      AND (completed_source_generated_at_ms IS NULL OR completed_source_generated_at_ms <= ?)`)
      .bind(descriptor.run_id, descriptor.source_generated_at_ms,
        feedKey, lease.fence, lease.owner, now, descriptor.run_id, descriptor.source_generated_at_ms),
  ];
  const results = await db.batch(operations);
  if (!Array.isArray(results) || results.length !== 2 ||
      results.some((result, index) => checked(result, `run completion ${index}`) !== 1)) {
    throw new Error('D1 ingestion completion was fenced');
  }
  return { status, rejectedCount: count };
}

async function processRun(env, feedKey, lease, descriptor, maxBatches = MAX_BATCHES_PER_INVOCATION) {
  if (descriptor.status === 'parked') throw new Error('Durable USGS ingestion run is parked');
  if (descriptor.status === 'retry' && descriptor.next_attempt_at_ms > Date.now()) {
    throw new Error('Durable USGS ingestion retry is not due');
  }
  let source;
  try {
    source = await readSnapshot(env.GEOJSON_BUCKET, descriptor);
  } catch (error) {
    await markRetry(env.DB, feedKey, lease, descriptor, error);
    throw error;
  }
  const features = sorted(source);
  const persistedIds = [];
  let processedBatches = 0;
  let advancedCursor = descriptor.cursor;
  for (let cursor = descriptor.cursor; cursor < features.length; cursor += BATCH_SIZE) {
    if (processedBatches >= maxBatches) {
      return { source, persistedIds, advancedCursor, processedBatches, incomplete: true };
    }
    const batch = features.slice(cursor, cursor + BATCH_SIZE);
    try {
      persistedIds.push(...await persistBatch(env.DB, feedKey, lease, { ...descriptor, cursor }, batch));
      processedBatches++;
      advancedCursor += batch.length;
    } catch (error) {
      await markRetry(env.DB, feedKey, lease, descriptor, error);
      error.ingestion = { complete: false, successCount: cursor,
        errorCount: batch.length, persistedIds, unchangedIds: [], supersededIds: [],
        failedIds: batch.map(feature => feature.id), rejectedIds: [] };
      throw error;
    }
  }
  await renew(env.DB, feedKey, lease);
  const completion = await completeRun(env.DB, feedKey, lease, descriptor);
  return { source, persistedIds, processedBatches, completion };
}

async function classifyOutcome(db, descriptor, source, persistedIds) {
  const persisted = new Set(persistedIds);
  const rejected = new Set((await rows(db,
    'SELECT event_id FROM UsgsIngestionIssues WHERE run_id = ?', descriptor.run_id)).map(row => row.event_id));
  const revisions = new Map();
  for (let offset = 0; offset < source.features.length; offset += BATCH_SIZE) {
    const ids = source.features.slice(offset, offset + BATCH_SIZE).map(feature => feature.id);
    if (!ids.length) continue;
    for (const row of await rows(db,
      `SELECT id, source_updated_at_ms FROM EarthquakeEvents WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)) {
      revisions.set(row.id, row.source_updated_at_ms);
    }
  }
  const outcome = { successCount: 0, errorCount: 0, complete: true,
    persistedIds: [], unchangedIds: [], supersededIds: [], failedIds: [], rejectedIds: [] };
  for (const feature of source.features) {
    const id = feature.id;
    if (rejected.has(id)) outcome.rejectedIds.push(id);
    else if (persisted.has(id)) outcome.persistedIds.push(id);
    else if (revisions.get(id) > feature.properties.updated) outcome.supersededIds.push(id);
    else if (revisions.get(id) === feature.properties.updated) outcome.unchangedIds.push(id);
    else outcome.failedIds.push(id);
  }
  outcome.errorCount = outcome.failedIds.length + outcome.rejectedIds.length;
  outcome.successCount = source.features.length - outcome.errorCount;
  outcome.complete = outcome.errorCount === 0;
  return outcome;
}

async function legacyListFeatures(env, feedKey, source) {
  const kv = env.USGS_LAST_RESPONSE_KV;
  if (!kv) return source.features;
  const key = feedKey === 'hour' ? 'usgs_last_response_features' : `usgs_last_response_features:${feedKey}`;
  let previous;
  try { previous = await kv.get(key); } catch { return source.features; }
  let oldFeatures;
  try { oldFeatures = typeof previous === 'string' ? JSON.parse(previous) : previous; } catch { oldFeatures = null; }
  const oldById = new Map(Array.isArray(oldFeatures) ? oldFeatures.filter(feature => feature?.id).map(feature => [feature.id, feature]) : []);
  const listFeatures = source.features.map(feature => {
    const old = oldById.get(feature.id);
    if (Number.isSafeInteger(old?.properties?.updated) && old.properties.updated > feature.properties.updated) {
      try { validateUsgsSummary({ type: 'FeatureCollection', features: [old] }, 1); return old; } catch { /* Bad cache is never authoritative. */ }
    }
    return feature;
  });
  return listFeatures;
}

async function publishLegacyCheckpoint(env, feedKey, lease, descriptor, source) {
  const kv = env.USGS_LAST_RESPONSE_KV;
  if (!kv) return source.features;
  const key = feedKey === 'hour' ? 'usgs_last_response_features' : `usgs_last_response_features:${feedKey}`;
  const listFeatures = await legacyListFeatures(env, feedKey, source);
  await kv.put(key, JSON.stringify(listFeatures));
  const now = Date.now();
  const acknowledged = await run(env.DB, `UPDATE UsgsIngestionState SET kv_published_run_id = ?
    WHERE feed_key = ? AND fence = ? AND lease_owner = ? AND lease_until_ms > ?
      AND completed_run_id = ?`, descriptor.run_id, feedKey, lease.fence, lease.owner, now, descriptor.run_id);
  if (acknowledged !== 1) throw new Error('Legacy checkpoint acknowledgement was fenced');
  return listFeatures;
}

// Invoked only by the trusted scheduled path while the rollout gate is enabled.
// D1 is the progress authority; KV remains a derived compatibility cache.
export async function handleDurableUsgsIngestion({ env, feedKey = 'hour', logger }) {
  if (!Object.hasOwn(USGS_SUMMARY_URLS, feedKey)) return response({ message: 'Unsupported trusted feed' }, 400);
  if (!env.DB || !env.GEOJSON_BUCKET) return response({ message: 'Durable ingestion bindings are unavailable' }, 503);
  let lease;
  try {
    lease = await claim(env.DB, feedKey);
    let remainingBatches = MAX_BATCHES_PER_INVOCATION;
    let state = (await rows(env.DB, 'SELECT * FROM UsgsIngestionState WHERE feed_key = ?', feedKey))[0];
    if (state.active_run_id) {
      const pending = (await rows(env.DB, 'SELECT * FROM UsgsIngestionRuns WHERE run_id = ?', state.active_run_id))[0];
      if (!pending) throw new Error('Durable ingestion run reference is missing');
      const recovered = await processRun(env, feedKey, lease, pending, remainingBatches);
      remainingBatches -= recovered.processedBatches;
      if (recovered.incomplete) return response({ message: 'Durable USGS ingestion is continuing',
        ingestion: { complete: false, cursor: recovered.advancedCursor } }, 503);
      if (recovered.completion.rejectedCount) throw new Error('Recovered source contains quarantined conflicts');
      await publishLegacyCheckpoint(env, feedKey, lease, pending, recovered.source);
      state = (await rows(env.DB, 'SELECT * FROM UsgsIngestionState WHERE feed_key = ?', feedKey))[0];
      if (remainingBatches === 0) {
        const outcome = await classifyOutcome(env.DB, pending, recovered.source, recovered.persistedIds);
        return response({ newOrUpdatedFeatures: await legacyListFeatures(env, feedKey, recovered.source),
          fullGeoJson: recovered.source, ingestion: { ...outcome, runId: pending.run_id } });
      }
    } else if (state.completed_run_id && state.kv_published_run_id !== state.completed_run_id) {
      const completed = (await rows(env.DB, 'SELECT * FROM UsgsIngestionRuns WHERE run_id = ?', state.completed_run_id))[0];
      if (!completed) throw new Error('Completed ingestion run reference is missing');
      if (completed.status === 'completed') {
        await publishLegacyCheckpoint(env, feedKey, lease, completed,
          await readSnapshot(env.GEOJSON_BUCKET, completed));
      }
    }

    const fetched = await fetchUsgsSummary(feedKey);
    const sourceTime = generatedAt(fetched);
    const [latest] = state.completed_run_id
      ? await rows(env.DB, 'SELECT * FROM UsgsIngestionRuns WHERE run_id = ?', state.completed_run_id) : [];
    if (Number.isSafeInteger(state.completed_source_generated_at_ms) &&
        sourceTime < state.completed_source_generated_at_ms) {
      if (!latest) throw new Error('Completed ingestion source reference is missing');
      if (latest.status !== 'completed') return response({ message: 'USGS source has quarantined conflicts',
        ingestion: { complete: false } }, 503);
      const source = await readSnapshot(env.GEOJSON_BUCKET, latest);
      const outcome = await classifyOutcome(env.DB, latest, source, []);
      return response({ newOrUpdatedFeatures: await legacyListFeatures(env, feedKey, source),
        fullGeoJson: source, ingestion: outcome });
    }
    const sourceBytes = textEncoder.encode(JSON.stringify(fetched));
    if (latest && sourceBytes.byteLength === latest.snapshot_bytes &&
        await sha256(sourceBytes) === latest.snapshot_sha256) {
      if (latest.status !== 'completed') return response({ message: 'USGS source has quarantined conflicts',
        ingestion: { complete: false } }, 503);
      const outcome = await classifyOutcome(env.DB, latest, fetched, []);
      return response({ newOrUpdatedFeatures: await legacyListFeatures(env, feedKey, fetched),
        fullGeoJson: fetched, ingestion: outcome });
    }
    const snapshot = await stageSnapshot(env.GEOJSON_BUCKET, feedKey, fetched);
    const descriptor = await createRun(env.DB, feedKey, lease, fetched, snapshot);
    const result = await processRun(env, feedKey, lease, descriptor, remainingBatches);
    if (result.incomplete) return response({ message: 'Durable USGS ingestion is continuing',
      ingestion: { complete: false, cursor: result.advancedCursor } }, 503);
    if (result.completion.rejectedCount) {
      const outcome = await classifyOutcome(env.DB, descriptor, fetched, result.persistedIds);
      return response({ message: 'USGS persistence contained quarantined conflicts',
        ingestion: outcome }, 503);
    }
    const outcome = await classifyOutcome(env.DB, descriptor, fetched, result.persistedIds);
    if (!outcome.complete) return response({ message: 'USGS persistence outcome was incomplete', ingestion: outcome }, 503);
    const listFeatures = await publishLegacyCheckpoint(env, feedKey, lease, descriptor, fetched);
    return response({ newOrUpdatedFeatures: listFeatures, fullGeoJson: fetched,
      ingestion: { ...outcome, runId: descriptor.run_id } });
  } catch (error) {
    logger?.logError?.('DURABLE_USGS_INGESTION_FAILED', 'Durable USGS ingestion failed',
      { code: error.code || 'DURABLE_INGESTION_FAILED' }, true);
    return response({ message: error instanceof UsgsTransportError ? error.message : 'Durable USGS ingestion failed',
      ingestion: error.ingestion || { complete: false } }, error instanceof UsgsTransportError ? error.status : 503);
  } finally {
    if (lease) await release(env.DB, feedKey, lease).catch(() => {});
  }
}
