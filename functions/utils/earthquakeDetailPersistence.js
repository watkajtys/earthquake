import { isValidUsgsEventId, usgsDetailUrl, USGS_LIMITS } from './usgs-transport.js';

// Leave space below the Queue message limit for serialization metadata.
export const MAX_DETAIL_QUEUE_BYTES = 120_000;

export function extractProductFlags(detailData) {
  const products = detailData?.properties?.products;
  if (products != null && (typeof products !== 'object' || Array.isArray(products))) {
    throw new Error('Invalid earthquake detail products');
  }
  const keys = products ? Object.keys(products) : [];
  const hasProduct = key => Array.isArray(products?.[key]) && products[key].length > 0;
  const flags = {
    has_shakemap: hasProduct('shakemap'),
    has_moment_tensor: hasProduct('moment-tensor'),
    has_focal_mechanism: hasProduct('focal-mechanism'),
    has_dyfi: hasProduct('dyfi'),
    has_losspager: hasProduct('losspager'),
    has_finite_fault: hasProduct('finite-fault'),
  };
  return { ...flags, has_enhanced_data: Object.values(flags).some(Boolean), products_json: JSON.stringify(keys) };
}

// Call only with a detail returned by fetchValidatedDetail. This migration-free
// bridge makes archive acceptance precede completion; it is not an atomic
// transaction across Queue/R2 and D1. A durable revisioned outbox follows later.
export async function persistEarthquakeDetail({ env, detailData, previousAttempts = 0, requestedId = detailData?.id }) {
  if (!env.DB) throw new Error('Database not configured');
  const properties = detailData?.properties;
  const coordinates = detailData?.geometry?.coordinates;
  const aliases = typeof properties?.ids === 'string' ? properties.ids.split(',').filter(Boolean) : [];
  if (!isValidUsgsEventId(requestedId) || !isValidUsgsEventId(detailData?.id) ||
      (requestedId !== detailData.id && !aliases.includes(requestedId)) ||
      !Number.isFinite(properties?.time) ||
      !(properties.mag === null || Number.isFinite(properties.mag)) ||
      !(properties.place === null || typeof properties.place === 'string') ||
      !Array.isArray(coordinates) || coordinates.length !== 3 || !coordinates.every(Number.isFinite) ||
      !Number.isInteger(previousAttempts) || previousAttempts < 0) {
    throw new Error('Invalid validated earthquake detail');
  }
  const flags = extractProductFlags(detailData);
  const detailJson = JSON.stringify(detailData);
  const encoder = new TextEncoder();
  if (encoder.encode(detailJson).byteLength > USGS_LIMITS.detailBytes) throw new Error('Earthquake detail exceeds storage limit');
  const message = { id: requestedId, geojson: detailData };
  const messageBytes = encoder.encode(JSON.stringify(message)).byteLength;
  let archiveDisposition;
  if (env.GEOJSON_QUEUE && messageBytes <= MAX_DETAIL_QUEUE_BYTES) {
    // A rejected send must not set detail_fetched. The caller records a retry.
    await env.GEOJSON_QUEUE.send(message);
    archiveDisposition = 'queued';
  } else if (env.GEOJSON_BUCKET) {
    await env.GEOJSON_BUCKET.put(`${requestedId}.json`, detailJson, {
      httpMetadata: { contentType: 'application/json' },
    });
    archiveDisposition = 'stored';
  } else {
    throw new Error('No archive storage accepts this earthquake detail');
  }

  const now = Date.now();
  const result = await env.DB.prepare(`
    INSERT INTO EarthquakeEvents (
      id, event_time, latitude, longitude, depth, magnitude, place, usgs_detail_url, retrieved_at,
      has_shakemap, has_moment_tensor, has_focal_mechanism, has_dyfi, has_losspager, has_finite_fault,
      has_enhanced_data, products_json, detail_fetched, detail_fetch_time, detail_fetch_attempts,
      last_detail_fetch_attempt, next_detail_fetch_attempt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      event_time = excluded.event_time, latitude = excluded.latitude, longitude = excluded.longitude,
      depth = excluded.depth, magnitude = excluded.magnitude, place = excluded.place,
      usgs_detail_url = excluded.usgs_detail_url, retrieved_at = excluded.retrieved_at,
      has_shakemap = excluded.has_shakemap, has_moment_tensor = excluded.has_moment_tensor,
      has_focal_mechanism = excluded.has_focal_mechanism, has_dyfi = excluded.has_dyfi,
      has_losspager = excluded.has_losspager, has_finite_fault = excluded.has_finite_fault,
      has_enhanced_data = excluded.has_enhanced_data, products_json = excluded.products_json,
      detail_fetched = 1, detail_fetch_time = excluded.detail_fetch_time,
      detail_fetch_attempts = MAX(COALESCE(EarthquakeEvents.detail_fetch_attempts, 0), excluded.detail_fetch_attempts),
      last_detail_fetch_attempt = excluded.last_detail_fetch_attempt, next_detail_fetch_attempt = NULL
  `).bind(
    requestedId, properties.time, coordinates[1], coordinates[0], coordinates[2], properties.mag,
    properties.place, usgsDetailUrl(requestedId), now,
    Number(flags.has_shakemap), Number(flags.has_moment_tensor), Number(flags.has_focal_mechanism),
    Number(flags.has_dyfi), Number(flags.has_losspager), Number(flags.has_finite_fault),
    Number(flags.has_enhanced_data), flags.products_json, now, previousAttempts + 1, now,
  ).run();
  if (result?.success !== true) throw new Error('Failed to persist earthquake detail metadata');
  return { flags, archiveDisposition };
}
