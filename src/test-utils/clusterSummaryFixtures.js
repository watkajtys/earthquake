export const SUMMARY_TEST_TIME = 1790000000000;
export function summaryItem(index = 0, overrides = {}) {
  return { id: `cluster-${String(index).padStart(4, '0')}`, slug: `stored-cluster-${index}`, title: null,
    locationName: `Stored location ${index}`, quakeCount: 158, maxMagnitude: 6,
    startTime: SUMMARY_TEST_TIME - 86400000, endTime: SUMMARY_TEST_TIME - index,
    strongestQuakeId: null, summaryRevision: 'a'.repeat(64), ...overrides };
}
export function summaryPage(items = [], overrides = {}) {
  const normalized = items.map((item, index) => {
    const base = summaryItem(index);
    return Object.fromEntries(Object.keys(base).map(key => [key, Object.hasOwn(item, key) ? item[key] : base[key]]));
  });
  return { schemaVersion: 2, generationId: '11111111-1111-4111-8111-111111111111', snapshotSequence: 1,
    generatedAtMs: SUMMARY_TEST_TIME, sourceObservedAtMs: SUMMARY_TEST_TIME, source: 'stored-cluster-definitions',
    sourceWatermarkMs: null, view: 'overview', totalCount: items.length, items: normalized, nextCursor: null, stale: false,
    ...overrides };
}
