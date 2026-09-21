import { timestampMilliseconds } from './entityRoutes.js';

// Project only stored scalar metadata. Client event feeds are incomplete views
// and must never change a cluster's identity, member count or scientific range.
export function buildClusterSummaries(definitions, { minimumMagnitude, preserveOrder = false, formatTimeAgo, formatTimeDuration, now = Date.now() }) {
  const eligible = preserveOrder ? definitions : definitions.filter(definition => definition && typeof definition.id === 'string' && definition.id &&
    Number.isFinite(definition.maxMagnitude) && definition.maxMagnitude >= minimumMagnitude);
  const summaries = eligible.map(definition => {
    const startTime = timestampMilliseconds(definition.startTime);
    const endTime = timestampMilliseconds(definition.endTime);
    const quakeCount = Number.isSafeInteger(definition.quakeCount) && definition.quakeCount >= 0 ? definition.quakeCount : null;
    let timeRange = { prefix: '', value: 'Time information unavailable', suffix: '' };
    if (startTime !== null && endTime !== null && endTime >= startTime) {
      const duration = endTime - startTime;
      timeRange = now - endTime < 86400000 && quakeCount > 1
        ? { prefix: 'Active over ', value: duration < 60000 ? 'less than 1m' : duration < 3600000 ? `${Math.round(duration / 60000)}m` : formatTimeDuration(duration), suffix: '' }
        : { prefix: 'Started ', value: formatTimeAgo(Math.max(0, now - startTime)), suffix: '' };
    }
    return {
      id: definition.id, slug: definition.slug, title: definition.title,
      locationName: definition.locationName || 'Unknown Cluster Location',
      quakeCount, maxMagnitude: definition.maxMagnitude, startTime, endTime,
      strongestQuakeId: definition.strongestQuakeId || null, summaryRevision: definition.summaryRevision, timeRange,
    };
  });
  return preserveOrder ? summaries : summaries.sort((a, b) => (b.endTime ?? -Infinity) - (a.endTime ?? -Infinity) ||
    b.maxMagnitude - a.maxMagnitude || (b.quakeCount ?? -1) - (a.quakeCount ?? -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
