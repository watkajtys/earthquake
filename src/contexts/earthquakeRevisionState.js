const DAY_MS = 86400_000;
const revision = feature => Number.isFinite(feature?.properties?.updated) ? feature.properties.updated : null;
const sourceTime = payload => {
  const value = payload.sourceGeneratedAtMs ?? payload.metadata?.generated;
  return Number.isFinite(value) ? value : null;
};
const validCoverage = coverage => coverage?.complete &&
  [coverage.asOfMs, coverage.startTimeMs, coverage.endTimeMs].every(Number.isFinite) &&
  coverage.startTimeMs <= coverage.endTimeMs;
const inCoverage = (feature, coverage) => feature.properties.time >= coverage.startTimeMs && feature.properties.time < coverage.endTimeMs;

// Scientific revisions and evidence of presence have separate clocks. An
// unchanged event seen in a newer source still disproves an older absence.
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

function deletedEntry(entry, feature, deletedAtMs) {
  return { ...entry, feature: null, lastFeature: feature, eventTimeMs: feature.properties.time, deletedAtMs };
}

export function reconcileFeedRevisions(state, resource, payload) {
  const snapshots = { ...state.feedSnapshots, [resource]: payload };
  const known = Object.assign(Object.create(null), state.knownEarthquakeRevisions);
  const changedIds = new Set();
  // Keep the last proven complete coverage for each of the three resources.
  // A later partial R2/D1 response must not erase this negative evidence.
  const completeCoverage = { ...state.completeFeedCoverage };
  const coverage = payload.coverage;
  if (validCoverage(coverage) && (!completeCoverage[resource] || coverage.asOfMs > completeCoverage[resource].asOfMs)) {
    completeCoverage[resource] = { ...coverage, eventIds: [...new Set(payload.features.map(feature => feature.id))] };
  }
  const coverageChecks = Object.values(completeCoverage).map(item => ({ ...item, ids: new Set(item.eventIds) }));
  for (const feature of [state.lastMajorQuake, state.previousMajorQuake].filter(Boolean)) {
    if (!known[feature.id]) known[feature.id] = { feature, asOfMs: 0, receivedAtMs: 0 };
  }

  const generatedAtMs = sourceTime(payload);
  for (const incoming of payload.features) {
    const previous = known[incoming.id];
    // Local receipt of an old cache record is not fresh proof of presence.
    const positiveAsOfMs = generatedAtMs ?? revision(incoming) ?? 0;
    if (previous?.deletedAtMs != null &&
        positiveAsOfMs <= previous.deletedAtMs && (revision(incoming) ?? 0) <= previous.deletedAtMs) continue;
    const feature = preferredFeature(previous, incoming, positiveAsOfMs, payload.fetchTime);
    let entry = { feature, asOfMs: Math.max(previous?.asOfMs || 0, positiveAsOfMs), receivedAtMs: payload.fetchTime };
    for (const proof of coverageChecks) {
      if (!proof.ids.has(incoming.id) && inCoverage(feature, proof) &&
          proof.asOfMs > entry.asOfMs && proof.asOfMs >= (revision(feature) ?? 0)) {
        entry = deletedEntry(entry, feature, Math.max(entry.deletedAtMs || 0, proof.asOfMs));
      }
    }
    if (previous?.feature !== entry.feature) changedIds.add(incoming.id);
    known[incoming.id] = entry;
  }

  // Reconcile existing observations against complete newer windows as well as
  // late-arriving candidates. This handles both possible response orders.
  for (const [id, previous] of Object.entries(known)) {
    const feature = previous.feature || previous.lastFeature;
    if (!feature) continue;
    let entry = previous;
    for (const proof of coverageChecks) {
      if (!proof.ids.has(id) && inCoverage(feature, proof) && proof.asOfMs > entry.asOfMs &&
          proof.asOfMs > (entry.deletedAtMs || 0) && proof.asOfMs >= (revision(feature) ?? 0)) {
        entry = deletedEntry(entry, feature, proof.asOfMs);
      }
    }
    if (previous.feature !== entry.feature) changedIds.add(id);
    known[id] = entry;
  }

  const retainedIds = new Set([state.lastMajorQuake?.id, state.previousMajorQuake?.id]);
  for (const [id, entry] of Object.entries(known)) {
    if ((entry.feature?.properties?.time ?? entry.eventTimeMs) < payload.fetchTime - 31 * DAY_MS && !retainedIds.has(id)) {
      delete known[id];
      changedIds.add(id);
    }
  }
  const resolved = Object.fromEntries(Object.entries(snapshots).map(([name, snapshot]) => [name, {
    ...snapshot, features: snapshot.features.map(feature => known[feature.id]?.feature).filter(Boolean),
  }]));
  return { snapshots, known, completeCoverage, resolved, changedIds, features: Object.values(known).map(entry => entry.feature).filter(Boolean) };
}
