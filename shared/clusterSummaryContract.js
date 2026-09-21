// This contract describes immutable observations of legacy stored definitions.
// summaryRevision hashes only these scalar fields, never scientific membership.
export const SUMMARY_SCHEMA_VERSION = 2;
export const SUMMARY_SOURCE = 'stored-cluster-definitions';
export const SUMMARY_VIEW = 'overview';
export const SUMMARY_ORDER = 'endTime-desc,maxMagnitude-desc,quakeCount-desc,id-asc';
export const SUMMARY_PREFIX = 'cluster-summaries/v2/';
export const SUMMARY_POINTER_KEY = `${SUMMARY_PREFIX}current.json`;
export const SUMMARY_PAGE_SIZE = 200;
export const MAX_SUMMARY_ITEMS = 20_000;
export const MAX_SUMMARY_PAGE_BYTES = 512 * 1024;
export const MAX_SUMMARY_ITEM_BYTES = 2400;
export const MAX_SUMMARY_POINTER_BYTES = 64 * 1024;
export const MAX_SUMMARY_MANIFEST_BYTES = 64 * 1024;
export const SUMMARY_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const SUMMARY_STALE_AFTER_MS = 20 * 60 * 1000;
export const MAX_RETAINED_GENERATIONS = 12;
export const SUMMARY_DEFAULT_LIMIT = 100;
export const SUMMARY_MAX_LIMIT = 200;
export const MAX_SUMMARY_CURSOR_LENGTH = 256;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9_-]{1,200}$/u;
const scalarKeys = ['id', 'slug', 'title', 'locationName', 'quakeCount', 'maxMagnitude', 'startTime', 'endTime', 'strongestQuakeId'];
const metadataKeys = ['schemaVersion', 'source', 'sourceWatermarkMs', 'view', 'generationId', 'snapshotSequence', 'generatedAtMs', 'sourceObservedAtMs', 'totalCount'];
const descriptorKeys = [...metadataKeys, 'pageCount', 'manifestKey'];

function check(condition, message) {
  if (!condition) throw new Error(`Invalid cluster summary: ${message}`);
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, required, optional = []) {
  check(object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key)), 'unexpected or missing fields');
}
function boundedText(value, max, nullable = false) {
  return (nullable && value === null) || (typeof value === 'string' && value.length <= max &&
    (nullable || value.length > 0) && !/\p{Cc}/u.test(value));
}
const time = value => Number.isSafeInteger(value) && value >= 0;
export function isSummaryGenerationId(value) { return typeof value === 'string' && UUID.test(value); }
export function generationManifestKey(generationId) {
  check(isSummaryGenerationId(generationId), 'generation ID');
  return `${SUMMARY_PREFIX}${generationId}/manifest.json`;
}
export function generationPageKey(generationId, index) {
  check(isSummaryGenerationId(generationId) && Number.isSafeInteger(index) && index >= 0 && index < MAX_SUMMARY_ITEMS / SUMMARY_PAGE_SIZE, 'page identity');
  return `${SUMMARY_PREFIX}${generationId}/pages/${index}.json`;
}
export function summaryEnvelopeMetadata(value) {
  return Object.fromEntries(metadataKeys.map(key => [key, value[key]]));
}
function validateMetadata(value) {
  check(object(value) && value.schemaVersion === SUMMARY_SCHEMA_VERSION && value.source === SUMMARY_SOURCE &&
    value.sourceWatermarkMs === null && value.view === SUMMARY_VIEW, 'schema/source/view');
  check(isSummaryGenerationId(value.generationId), 'generation ID');
  check(Number.isSafeInteger(value.snapshotSequence) && value.snapshotSequence > 0, 'snapshot sequence');
  check(time(value.generatedAtMs) && time(value.sourceObservedAtMs) && value.generatedAtMs >= value.sourceObservedAtMs, 'observation timestamps');
  check(Number.isSafeInteger(value.totalCount) && value.totalCount >= 0 && value.totalCount <= MAX_SUMMARY_ITEMS, 'total count');
}
function validateScalar(value) {
  check(object(value) && typeof value.id === 'string' && ID.test(value.id), 'stored cluster ID');
  check(boundedText(value.slug, 512), 'slug');
  check(boundedText(value.title, 1024, true) && boundedText(value.locationName, 1024, true), 'title/location');
  check(value.quakeCount === null || (Number.isSafeInteger(value.quakeCount) && value.quakeCount >= 0), 'quake count');
  check(Number.isFinite(value.maxMagnitude) && value.maxMagnitude >= 4.5, 'eligible magnitude');
  check((value.startTime === null || time(value.startTime)) && (value.endTime === null || time(value.endTime)), 'event times');
  check(value.startTime === null || value.endTime === null || value.endTime >= value.startTime, 'event time range');
  check(value.strongestQuakeId === null || (typeof value.strongestQuakeId === 'string' && ID.test(value.strongestQuakeId)), 'strongest event ID');
}
export function validateSummaryItem(value) {
  exactKeys(value, [...scalarKeys, 'summaryRevision']);
  validateScalar(value);
  check(typeof value.summaryRevision === 'string' && HASH.test(value.summaryRevision), 'scalar content hash');
  check(new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_SUMMARY_ITEM_BYTES, 'item byte limit');
  return value;
}
export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  check(bytes instanceof Uint8Array, 'hash input');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function projectSummaryItem(row) {
  // Construct explicitly: neither membership nor legacy version is inspected,
  // copied, serialized, or used to manufacture a scientific revision.
  const scalar = Object.fromEntries(scalarKeys.map(key => [key, row?.[key]]));
  validateScalar(scalar);
  return validateSummaryItem({ ...scalar, summaryRevision: await sha256Hex(JSON.stringify(scalar)) });
}
export function compareSummaryItems(a, b) {
  const descendingNullable = (x, y) => x === y ? 0 : x === null ? 1 : y === null ? -1 : y - x;
  return descendingNullable(a.endTime, b.endTime) || b.maxMagnitude - a.maxMagnitude ||
    descendingNullable(a.quakeCount, b.quakeCount) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function validateItems(items, maxCount) {
  check(Array.isArray(items) && items.length <= maxCount, 'items');
  const ids = new Set();
  items.forEach((item, index) => {
    validateSummaryItem(item);
    check(!ids.has(item.id), 'duplicate item ID'); ids.add(item.id);
    if (index) check(compareSummaryItems(items[index - 1], item) <= 0, 'item ordering');
  });
}
export function validateSummaryEnvelope(value) {
  exactKeys(value, [...metadataKeys, 'items', 'nextCursor'], ['stale']);
  validateMetadata(value); validateItems(value.items, SUMMARY_MAX_LIMIT);
  check(value.items.length <= value.totalCount, 'item/total count');
  check(value.nextCursor === null || (typeof value.nextCursor === 'string' && value.nextCursor.length > 0 && value.nextCursor.length <= MAX_SUMMARY_CURSOR_LENGTH), 'next cursor');
  check(value.stale === undefined || typeof value.stale === 'boolean', 'stale flag');
  return value;
}
export function validateSummaryDescriptor(value) {
  exactKeys(value, descriptorKeys); validateMetadata(value);
  check(value.pageCount === Math.max(1, Math.ceil(value.totalCount / SUMMARY_PAGE_SIZE)), 'page count');
  check(value.manifestKey === generationManifestKey(value.generationId), 'manifest key');
  return value;
}
export function validateSummaryPointer(value) {
  exactKeys(value, ['schemaVersion', 'current', 'history']);
  check(value.schemaVersion === SUMMARY_SCHEMA_VERSION, 'pointer schema');
  validateSummaryDescriptor(value.current);
  check(Array.isArray(value.history) && value.history.length < MAX_RETAINED_GENERATIONS, 'retained history');
  const generations = new Set([value.current.generationId]);
  let previous = value.current.snapshotSequence;
  value.history.forEach(descriptor => {
    validateSummaryDescriptor(descriptor);
    check(descriptor.snapshotSequence < previous && !generations.has(descriptor.generationId), 'history sequence/identity');
    previous = descriptor.snapshotSequence; generations.add(descriptor.generationId);
  });
  return value;
}
export function validateSummaryManifest(value, expectedDescriptor) {
  exactKeys(value, [...descriptorKeys, 'pageSize', 'pages', 'cursorSecret']);
  const descriptor = Object.fromEntries(descriptorKeys.map(key => [key, value[key]]));
  validateSummaryDescriptor(descriptor);
  if (expectedDescriptor) {
    validateSummaryDescriptor(expectedDescriptor);
    check(descriptorKeys.every(key => value[key] === expectedDescriptor[key]), 'manifest/committed descriptor mismatch');
  }
  check(value.pageSize === SUMMARY_PAGE_SIZE && Array.isArray(value.pages) && value.pages.length === value.pageCount, 'manifest pages');
  check(typeof value.cursorSecret === 'string' && HASH.test(value.cursorSecret), 'cursor signing key');
  value.pages.forEach((page, index) => {
    exactKeys(page, ['key', 'count', 'sha256', 'byteLength']);
    check(page.key === generationPageKey(value.generationId, index), 'page key');
    check(page.count === Math.min(SUMMARY_PAGE_SIZE, value.totalCount - index * SUMMARY_PAGE_SIZE), 'page item count');
    check(typeof page.sha256 === 'string' && HASH.test(page.sha256), 'page hash');
    check(Number.isSafeInteger(page.byteLength) && page.byteLength > 0 && page.byteLength <= MAX_SUMMARY_PAGE_BYTES, 'page bytes');
  });
  return value;
}
export function validateSummaryPage(value, manifest, index) {
  exactKeys(value, [...metadataKeys, 'pageIndex', 'items']);
  validateMetadata(value);
  check(manifest.pages[index] && metadataKeys.every(key => value[key] === manifest[key]) && value.pageIndex === index, 'page/manifest mismatch');
  validateItems(value.items, SUMMARY_PAGE_SIZE);
  check(value.items.length === manifest.pages[index].count, 'page item count');
  return value;
}
