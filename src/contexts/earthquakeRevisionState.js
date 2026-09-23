import { FEED_PERIOD_DAYS } from '../../shared/earthquakeFeedContract.js';

const DAY_MS = 86400_000;
const RETENTION_MS = 31 * DAY_MS;
export const MAX_COVERAGE_SEGMENTS = 128;
const revision = feature => Number.isFinite(feature?.properties?.updated) ? feature.properties.updated : null;
const sourceTime = payload => {
  const value = payload.sourceGeneratedAtMs ?? payload.metadata?.generated;
  return Number.isFinite(value) ? value : null;
};
// Only the canonical, complete rolling windows can prove absence. Their minimum
// one-day width also bounds disconnected coverage within the 31-day horizon.
const validCoverage = (coverage, resource, generatedAtMs) => coverage?.complete &&
  Number.isFinite(generatedAtMs) && coverage.asOfMs === generatedAtMs &&
  coverage.endTimeMs === generatedAtMs &&
  coverage.startTimeMs === generatedAtMs - FEED_PERIOD_DAYS[resource] * DAY_MS;
const inCoverage = (feature, coverage) => feature.properties.time >= coverage.startTimeMs && feature.properties.time < coverage.endTimeMs;

// Scientific revisions and source evidence of identity presence have separate
// clocks: a newer snapshot containing an ID can confirm its existence even if
// that snapshot's scientific fields lose to an already accepted revision.
// Receipt/304 observation times never establish presence or undo an absence.
function preferredFeature(previous, incoming, positiveAsOfMs, receivedAtMs) {
  const existing = previous?.feature || previous?.lastFeature;
  if (!existing) return incoming;
  const oldRevision = revision(existing);
  const newRevision = revision(incoming);
  if (oldRevision !== null) return newRevision !== null && newRevision > oldRevision ? incoming : existing;
  if (newRevision !== null) return incoming;
  if (positiveAsOfMs !== previous.asOfMs) return positiveAsOfMs > previous.asOfMs ? incoming : existing;
  return receivedAtMs >= (previous.receivedAtMs || 0) ? incoming : existing;
}

function appendSegment(segments, segment) {
  const previous = segments.at(-1);
  if (previous?.endTimeMs === segment.startTimeMs && previous.asOfMs === segment.asOfMs && previous.floor === segment.floor) {
    previous.endTimeMs = segment.endTimeMs;
  } else segments.push({ ...segment });
}

// Disjoint intervals retain the newest evidence at each event time, including
// the narrow tail swept out when a rolling lower boundary advances.
function overlayCoverage(segments, incoming) {
  const boundaries = [...new Set([...segments.flatMap(item => [item.startTimeMs, item.endTimeMs]),
    incoming.startTimeMs, incoming.endTimeMs])].sort((a, b) => a - b);
  const result = [];
  let index = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startTimeMs = boundaries[i];
    const endTimeMs = boundaries[i + 1];
    while (segments[index]?.endTimeMs <= startTimeMs) index++;
    const existing = segments[index]?.startTimeMs <= startTimeMs ? segments[index] : null;
    const covers = incoming.startTimeMs <= startTimeMs && incoming.endTimeMs >= endTimeMs;
    const winner = covers && (!existing || incoming.asOfMs >= existing.asOfMs) ? incoming : existing;
    if (winner) appendSegment(result, { ...winner, startTimeMs, endTimeMs });
  }
  return result;
}

function boundedCoverage(segments) {
  const result = segments.map(item => ({ ...item }));
  while (result.length > MAX_COVERAGE_SEGMENTS) {
    let oldestPair = -1;
    let oldestClock = Infinity;
    for (let i = 0; i < result.length - 1; i++) {
      const clock = Math.max(result[i].asOfMs, result[i + 1].asOfMs);
      if (result[i].endTimeMs === result[i + 1].startTimeMs && clock < oldestClock) {
        oldestPair = i;
        oldestClock = clock;
      }
    }
    // Canonical windows have at most 32 disconnected components in 31 days,
    // so a mergeable pair always exists above the cap. Never bridge a gap.
    const left = result[oldestPair];
    const right = result[oldestPair + 1];
    result.splice(oldestPair, 2, { startTimeMs: left.startTimeMs, endTimeMs: right.endTimeMs,
      asOfMs: oldestClock, floor: true });
  }
  return result;
}

function latestCovering(feature, segments) {
  return segments.reduce((latest, segment) => inCoverage(feature, segment) && (!latest || segment.asOfMs > latest.asOfMs) ? segment : latest, null);
}

export function reconcileFeedRevisions(state, resource, payload) {
  const snapshots = { ...state.feedSnapshots, [resource]: payload };
  const known = Object.assign(Object.create(null), state.knownEarthquakeRevisions);
  const changedIds = new Set();
  const generatedAtMs = sourceTime(payload);
  const hasCompleteCoverage = validCoverage(payload.coverage, resource, generatedAtMs);
  // Include accepted source clocks as well as receipts so the retained range
  // stays bounded even if a caller's local clock lags the source clock.
  const retainAfterMs = Math.max(...Object.values(snapshots).map(snapshot => snapshot.fetchTime),
    ...Object.values(state.completeFeedCoverage || {}).map(item => item.asOfMs),
    hasCompleteCoverage ? generatedAtMs : 0) - RETENTION_MS;
  const completeCoverage = {};
  for (const [name, previous] of Object.entries(state.completeFeedCoverage || {})) {
    completeCoverage[name] = { ...previous, segments: (previous.segments || []).filter(item => item.endTimeMs > retainAfterMs)
      .map(item => ({ ...item, startTimeMs: Math.max(item.startTimeMs, retainAfterMs) })) };
  }
  if (hasCompleteCoverage) {
    const previous = completeCoverage[resource];
    const incoming = { startTimeMs: Math.max(payload.coverage.startTimeMs, retainAfterMs),
      endTimeMs: payload.coverage.endTimeMs, asOfMs: generatedAtMs, floor: false };
    completeCoverage[resource] = { ...(previous?.asOfMs > generatedAtMs ? previous : payload.coverage),
      segments: incoming.startTimeMs < incoming.endTimeMs ? overlayCoverage(previous?.segments || [], incoming) : previous?.segments || [] };
  }
  const segments = Object.values(completeCoverage).flatMap(item => item.segments);
  const proofs = segments.filter(item => !item.floor);
  const floors = segments.filter(item => item.floor);
  const needsAdmission = new Set();
  for (const feature of [state.lastMajorQuake, state.previousMajorQuake].filter(Boolean)) {
    if (!known[feature.id]) {
      known[feature.id] = { feature, asOfMs: 0, receivedAtMs: 0 };
      needsAdmission.add(feature.id);
    }
  }

  // Record every positive member before using any complete window as negative
  // evidence. Equal source clocks favor presence regardless of response order.
  for (const incoming of payload.features) {
    const previous = known[incoming.id];
    const positiveAsOfMs = generatedAtMs ?? 0;
    const feature = preferredFeature(previous, incoming, positiveAsOfMs, payload.fetchTime);
    if (!previous?.feature || previous.feature.properties.time !== feature.properties.time) needsAdmission.add(incoming.id);
    known[incoming.id] = { ...previous, feature, asOfMs: Math.max(previous?.asOfMs || 0, positiveAsOfMs), receivedAtMs: payload.fetchTime };
  }

  for (const [id, observation] of Object.entries(known)) {
    const feature = observation.feature || observation.lastFeature;
    if (!feature) continue;
    // Keep an exact scoped proof for a tombstone, including pinned major events
    // outside normal retention. A corrected time must be checked anew.
    const absence = latestCovering(feature, observation.absenceCoverage ? [...proofs, observation.absenceCoverage] : proofs);
    const floor = latestCovering(feature, observation.admissionCoverage ? [...floors, observation.admissionCoverage] : floors);
    const sourceAsOfMs = observation.asOfMs;
    const updated = revision(feature) ?? 0;
    const absent = absence && absence.asOfMs > sourceAsOfMs && absence.asOfMs >= updated;
    // Compaction cannot reconstruct every historical distinction. Its maximum
    // clock is an admission floor for unknown/deleted/relocated observations,
    // never a claim that an unchanged, already accepted event was deleted.
    const inadmissible = (needsAdmission.has(id) || !observation.feature) && floor && floor.asOfMs > sourceAsOfMs && floor.asOfMs >= updated;
    const entry = { feature, asOfMs: sourceAsOfMs, receivedAtMs: observation.receivedAtMs };
    if (absent || inadmissible) {
      entry.feature = null;
      entry.lastFeature = feature;
      entry.eventTimeMs = feature.properties.time;
      if (absent) {
        entry.deletedAtMs = absence.asOfMs;
        entry.absenceCoverage = absence;
      }
      if (inadmissible) entry.admissionCoverage = floor;
    }
    if (state.knownEarthquakeRevisions?.[id]?.feature !== entry.feature) changedIds.add(id);
    known[id] = entry;
  }

  const retainedIds = new Set([state.lastMajorQuake?.id, state.previousMajorQuake?.id]);
  for (const [id, entry] of Object.entries(known)) {
    if ((entry.feature?.properties?.time ?? entry.eventTimeMs) < retainAfterMs && !retainedIds.has(id)) {
      delete known[id];
      changedIds.add(id);
    }
  }
  // Apply exact new evidence before compacting it, so no current known member
  // can bypass a deletion merely because this response crosses the memory cap.
  for (const item of Object.values(completeCoverage)) item.segments = boundedCoverage(item.segments);
  const resolved = Object.fromEntries(Object.entries(snapshots).map(([name, snapshot]) => [name, {
    ...snapshot, features: snapshot.features.map(feature => known[feature.id]?.feature).filter(Boolean),
  }]));
  return { snapshots, known, completeCoverage, resolved, changedIds, features: Object.values(known).map(entry => entry.feature).filter(Boolean) };
}
