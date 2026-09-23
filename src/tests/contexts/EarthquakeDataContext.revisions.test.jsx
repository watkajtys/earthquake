import { describe, expect, it } from 'vitest';
import { earthquakeReducer, initialState, actionTypes } from '../../contexts/earthquakeDataContextUtils.js';
import { MAX_COVERAGE_SEGMENTS } from '../../contexts/earthquakeRevisionState.js';

const now = Date.UTC(2026, 8, 21);
const day = 86400_000;
const quake = (id, mag, { time = now - 1000, updated = now - 100, ...properties } = {}) => ({
  type: 'Feature', id, geometry: { type: 'Point', coordinates: [0, 0, 1] }, properties: { mag, time, updated, ...properties },
});
const feed = (state, type, features, options = {}) => earthquakeReducer(state, { type, payload: {
  features, fetchTime: now, dataSource: 'USGS', ...options,
} });
const complete = (asOfMs, days = 1) => ({ sourceGeneratedAtMs: asOfMs,
  coverage: { complete: true, asOfMs, startTimeMs: asOfMs - days * day, endTimeMs: asOfMs } });
const rollDay = (state = initialState, count = MAX_COVERAGE_SEGMENTS * 2) => {
  for (let i = 0; i < count; i++) {
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], { fetchTime: now + i * 1000, ...complete(now + i * 1000) });
  }
  return state;
};

describe('consistent event revisions across feed state', () => {
  it.each([actionTypes.WEEKLY_DATA_PROCESSED, actionTypes.MONTHLY_DATA_PROCESSED])(
    'retains a swept-out day boundary when a late %s introduces an unknown event', type => {
      const absent = quake('absent', 5, { time: now - day + 45_000, updated: now - 1000 });
      const unrelated = quake('history', 4, { time: now - 3 * day });
      let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [], {
        fetchTime: now + 30_000, ...complete(now + 30_000),
      });
      state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], {
        fetchTime: now + 60_000, ...complete(now + 60_000),
      });
      state = feed(state, type, [absent, unrelated], {
        fetchTime: now + 70_000, ...complete(now, type === actionTypes.WEEKLY_DATA_PROCESSED ? 7 : 30),
      });
      expect(type === actionTypes.WEEKLY_DATA_PROCESSED ? state.earthquakesLast7Days : state.allEarthquakes).toEqual([unrelated]);
      expect(state.lastMajorQuake).toBeNull();
      expect(state.knownEarthquakeRevisions.absent.deletedAtMs).toBe(now + 30_000);
    },
  );

  it.each([true, false])('lets presence win equal source clocks regardless of arrival order (absence first: %s)', absenceFirst => {
    const a = quake('A', 5, { updated: now - 1000 });
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [a], complete(now - 100, 30));
    const absent = current => feed(current, actionTypes.DAILY_DATA_PROCESSED, [], complete(now));
    const present = current => feed(current, actionTypes.MONTHLY_DATA_PROCESSED, [a], complete(now, 30));
    state = absenceFirst ? present(absent(state)) : absent(present(state));
    expect(state.allEarthquakes).toEqual([a]);
    expect(state.lastMajorQuake).toEqual(a);
    expect(state.knownEarthquakeRevisions.A.deletedAtMs).toBeUndefined();
  });

  it('reconsiders absence at the corrected event time before applying a tombstone', () => {
    const original = quake('A', 5, { time: now - day + 10_000, updated: now - 40_000 });
    const corrected = quake('A', 5, { time: now - day - 10_000, updated: now - 10_000 });
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [original], complete(now - 30_000, 30));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now));
    expect(state.lastMajorQuake).toBeNull();
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [corrected], complete(now - 5000, 30));
    expect(state.allEarthquakes).toEqual([corrected]);
    expect(state.lastMajorQuake).toEqual(corrected);
    expect(state.knownEarthquakeRevisions.A.deletedAtMs).toBeUndefined();
  });

  it.each([true, false])('treats newer source presence as identity evidence while retaining corrected fields (correction first: %s)', correctionFirst => {
    const original = quake('A', 5, { time: now - 3 * day, updated: now - 40_000 });
    const corrected = quake('A', 5, { time: now - 1000, updated: now - 20_000 });
    const correction = state => feed(state, actionTypes.WEEKLY_DATA_PROCESSED, [corrected], complete(now - 30_000, 7));
    const newerPresence = state => feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [original], complete(now + 20_000, 30));
    let state = correctionFirst ? correction(initialState) : newerPresence(initialState);
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 10_000));
    state = correctionFirst ? newerPresence(state) : correction(state);
    expect(state.knownEarthquakeRevisions.A.feature).toEqual(corrected);
    expect(state.knownEarthquakeRevisions.A.asOfMs).toBe(now + 20_000);
    expect(state.lastMajorQuake).toEqual(corrected);
  });

  it('bounds rolling history without admitting old events or blocking unrelated periods', () => {
    let state = rollDay();
    const segments = state.completeFeedCoverage.day.segments;
    expect(segments.length).toBeLessThanOrEqual(MAX_COVERAGE_SEGMENTS);
    expect(segments.some(item => item.floor)).toBe(true);
    expect(segments.every(item => !Object.hasOwn(item, 'eventIds'))).toBe(true);
    const absent = quake('absent', 5, { time: now - day + 500, updated: now - 20_000 });
    const outside = quake('outside', 4, { time: now - 3 * day });
    state = feed(state, actionTypes.WEEKLY_DATA_PROCESSED, [absent, outside], {
      fetchTime: now + 300_000, ...complete(now - 10_000, 7),
    });
    expect(state.earthquakesLast7Days).toEqual([outside]);
    expect(state.knownEarthquakeRevisions.absent.feature).toBeNull();
    expect(state.knownEarthquakeRevisions.absent.admissionCoverage).toMatchObject({ floor: true });
    state = feed(state, actionTypes.WEEKLY_DATA_PROCESSED, [absent, outside], complete(now + 300_000, 7));
    expect(state.earthquakesLast7Days).toEqual([absent, outside]);
    expect(state.lastMajorQuake).toEqual(absent);
  });

  it('does not turn compacted evidence into a deletion of an accepted unchanged member', () => {
    const present = quake('A', 5, { time: now - day + 500, updated: now - 20_000 });
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [present], complete(now - 1000, 30));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [present], complete(now));
    for (let i = 1; i <= MAX_COVERAGE_SEGMENTS * 2; i++) {
      state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], { fetchTime: now + i * 1000, ...complete(now + i * 1000) });
    }
    expect(state.completeFeedCoverage.day.segments.some(item => item.floor)).toBe(true);
    expect(state.knownEarthquakeRevisions.A.feature).toEqual(present);
    expect(state.lastMajorQuake).toEqual(present);
  });

  it('applies new exact absence before compacting history at the cap', () => {
    let state = rollDay(initialState, MAX_COVERAGE_SEGMENTS);
    const present = quake('A', 5, { updated: now + 200_000 });
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [present], complete(now + 200_000, 30));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 300_000));
    expect(state.completeFeedCoverage.day.segments.length).toBeLessThanOrEqual(MAX_COVERAGE_SEGMENTS);
    expect(state.knownEarthquakeRevisions.A.feature).toBeNull();
    expect(state.knownEarthquakeRevisions.A.deletedAtMs).toBe(now + 300_000);
  });

  it('keeps source and scientific equality distinct at a compacted floor without renewing old receipts', () => {
    const base = rollDay();
    const floor = base.completeFeedCoverage.day.segments.find(item => item.floor);
    const feature = quake('A', 5, { time: floor.startTimeMs, updated: floor.asOfMs });
    let cached = feed(base, actionTypes.MONTHLY_DATA_PROCESSED, [feature], {
      dataSource: 'R2', fetchTime: now + 400_000, sourceObservedAtMs: now + 400_000,
    });
    expect(cached.knownEarthquakeRevisions.A.feature).toBeNull();
    cached = feed(cached, actionTypes.MONTHLY_DATA_PROCESSED, [feature], {
      dataSource: 'R2', fetchTime: now + 500_000, sourceObservedAtMs: now + 500_000,
    });
    expect(cached.knownEarthquakeRevisions.A.feature).toBeNull();
    const sourceConfirmed = feed(cached, actionTypes.MONTHLY_DATA_PROCESSED, [feature], complete(floor.asOfMs, 30));
    expect(sourceConfirmed.knownEarthquakeRevisions.A.feature).toEqual(feature);
    const revised = quake('A', 5, { time: floor.startTimeMs, updated: floor.asOfMs + 1 });
    const scientificallyConfirmed = feed(cached, actionTypes.MONTHLY_DATA_PROCESSED, [revised], { dataSource: 'R2' });
    expect(scientificallyConfirmed.knownEarthquakeRevisions.A.feature).toEqual(revised);
  });

  it('applies floor admission when a live event moves into retired coverage and rechecks when it moves out', () => {
    const original = quake('A', 5, { time: now - 3 * day, updated: now - 30_000 });
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [original], complete(now - 20_000, 30));
    state = rollDay(state);
    const movedInside = quake('A', 5, { time: now - day + 500, updated: now - 10_000 });
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [movedInside], complete(now - 5000, 30));
    expect(state.knownEarthquakeRevisions.A.feature).toBeNull();
    expect(state.knownEarthquakeRevisions.A.admissionCoverage).toMatchObject({ floor: true });
    const movedOutside = quake('A', 5, { time: now - 2 * day, updated: now - 1000 });
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [movedOutside], complete(now, 30));
    expect(state.knownEarthquakeRevisions.A.feature).toEqual(movedOutside);
    expect(state.lastMajorQuake).toEqual(movedOutside);
  });

  it('distinguishes scientific equality from source equality and retains the newest fields after restoration', () => {
    const original = quake('A', 5, { updated: now - 2000 });
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [original], complete(now - 1000, 30));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now));
    const equalRevision = quake('A', 6, { updated: now });
    state = feed(state, actionTypes.WEEKLY_DATA_PROCESSED, [equalRevision], { dataSource: 'R2', fetchTime: now + 1000 });
    expect(state.knownEarthquakeRevisions.A.feature).toBeNull();
    const corrected = quake('A', 4, { updated: now + 1000, place: 'Latest revision' });
    state = feed(state, actionTypes.WEEKLY_DATA_PROCESSED, [corrected], complete(now - 500, 7));
    expect(state.knownEarthquakeRevisions.A.feature).toEqual(corrected);
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [original], complete(now + 2000, 30));
    expect(state.knownEarthquakeRevisions.A.feature).toEqual(corrected);
    expect(state.knownEarthquakeRevisions.A.asOfMs).toBe(now + 2000);
  });

  it('uses half-open proof boundaries and never bridges disjoint coverage gaps', () => {
    let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [], complete(now - 2 * day));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now));
    const before = quake('before', 4, { time: now - day - 1, updated: now - 1000 });
    const start = quake('start', 4, { time: now - day, updated: now - 1000 });
    const end = quake('end', 4, { time: now, updated: now - 1000 });
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [before, start, end], { sourceGeneratedAtMs: now - 1000 });
    expect(state.knownEarthquakeRevisions.before.feature).toEqual(before);
    expect(state.knownEarthquakeRevisions.start.feature).toBeNull();
    expect(state.knownEarthquakeRevisions.end.feature).toEqual(end);
    expect(state.completeFeedCoverage.day.segments).toHaveLength(2);
  });

  it('trims expired proof ranges without losing a retained major event', () => {
    const major = quake('major', 5);
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [major], complete(now, 30));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], {
      fetchTime: now + 32 * day, ...complete(now + 32 * day),
    });
    expect(state.completeFeedCoverage.month.segments).toEqual([]);
    expect(state.completeFeedCoverage.day.segments).toHaveLength(1);
    expect(state.lastMajorQuake).toEqual(major);
  });

  it('bounds disconnected ranges even when source clocks advance faster than local receipts', () => {
    let state = initialState;
    for (let i = 0; i <= MAX_COVERAGE_SEGMENTS; i++) {
      state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + i * 2 * day));
      expect(state.completeFeedCoverage.day.segments.length).toBeLessThanOrEqual(MAX_COVERAGE_SEGMENTS);
    }
    const segments = state.completeFeedCoverage.day.segments;
    expect(segments.every(item => !item.floor)).toBe(true);
    expect(segments.length).toBeLessThanOrEqual(16);
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], { dataSource: 'R2' });
    expect(state.completeFeedCoverage.day.segments).toEqual(segments);
  });

  it('does not use partial, mismatched-source or noncanonical windows as absence evidence', () => {
    const a = quake('A', 5);
    const baseline = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [a], complete(now, 30));
    for (const invalid of [
      { ...complete(now + 1000), coverage: { ...complete(now + 1000).coverage, complete: false } },
      { ...complete(now + 1000), sourceGeneratedAtMs: now + 2000 },
      complete(now + 1000, 0.5),
    ]) {
      const state = feed(baseline, actionTypes.DAILY_DATA_PROCESSED, [], invalid);
      expect(state.knownEarthquakeRevisions.A.feature).toEqual(a);
      expect(state.completeFeedCoverage.day).toBeUndefined();
    }
  });

  it('propagates a time correction past older snapshot receipt times into all rolling views', () => {
    const original = quake('A', 5);
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [original], complete(now, 30));
    state = feed(state, actionTypes.WEEKLY_DATA_PROCESSED, [original], complete(now, 7));
    const corrected = quake('A', 5, { time: now + 60_000, updated: now + 60_000 });
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [corrected], {
      fetchTime: now + 120_000, ...complete(now + 120_000),
    });
    for (const events of [state.earthquakesLast24Hours, state.earthquakesLast7Days,
      state.earthquakesLast14Days, state.earthquakesLast30Days, state.globeEarthquakes,
      state.sampledEarthquakesLast14Days, state.sampledEarthquakesLast30Days]) {
      expect(events).toEqual([corrected]);
    }
    expect(state.dailyCounts14Days.reduce((sum, day) => sum + day.count, 0)).toBe(1);
    expect(state.dailyCounts30Days.reduce((sum, day) => sum + day.count, 0)).toBe(1);
    expect(state.lastMajorQuake).toEqual(corrected);
    expect(state.feedSnapshots.month.fetchTime).toBe(now);
    expect(state.feedSnapshots.month.sourceGeneratedAtMs).toBe(now);
    expect(state.feedSnapshots.week.fetchTime).toBe(now);
    expect(state.feedSnapshots.week.sourceGeneratedAtMs).toBe(now);
    expect(state.dataFetchTime).toBe(now + 120_000);
  });

  it('retains a feed generation watermark across a cache response with no source timestamp', () => {
    const features = [quake('A', 5), quake('B', 4)];
    let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, features, complete(now + 3000));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, features, { dataSource: 'R2', fetchTime: now + 4000 });
    const retained = state;
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [features[0]], complete(now + 1000));
    expect(state).toBe(retained);
    expect(state.earthquakesLast24Hours.map(item => item.id)).toEqual(['A', 'B']);
  });

  it('keeps an unchanged event confirmed by a newer day when an older week says it is absent', () => {
    const a = quake('A', 5);
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [a], complete(now, 30));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [a], complete(now + 3000));
    state = feed(state, actionTypes.WEEKLY_DATA_PROCESSED, [], complete(now + 1000, 7));
    expect(state.lastMajorQuake).toEqual(a);
    expect(state.allEarthquakes).toEqual([a]);
    expect(state.knownEarthquakeRevisions.A.asOfMs).toBe(now + 3000);
  });

  it('blocks an older month from introducing an unknown event already disproved by newer day coverage', () => {
    const a = quake('A', 5);
    let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 3000));
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [a], complete(now + 1000, 30));
    expect(state.lastMajorQuake).toBeNull();
    expect(state.allEarthquakes).toEqual([]);
    expect(state.knownEarthquakeRevisions.A.deletedAtMs).toBe(now + 3000);
  });

  it('retains complete absence evidence across an intervening cache response', () => {
    let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 3000));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], { dataSource: 'R2', fetchTime: now + 4000 });
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [quake('A', 5)], complete(now + 1000, 30));
    expect(state.lastMajorQuake).toBeNull();
    expect(state.allEarthquakes).toEqual([]);
    expect(state.completeFeedCoverage.day.asOfMs).toBe(now + 3000);
  });

  it('does not interpret a recent cache receipt as proof that an old deleted event exists again', () => {
    let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 3000));
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [quake('A', 5)], { dataSource: 'R2', fetchTime: now + 5000 });
    expect(state.lastMajorQuake).toBeNull();
    expect(state.allEarthquakes).toEqual([]);
  });

  it('accepts newer source confirmation after deletion without regressing scientific fields', () => {
    const original = quake('A', 5, { updated: now, place: 'Current fields' });
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [original], complete(now, 30));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 1000));
    const olderFields = quake('A', 4, { updated: now - 1000, place: 'Old fields' });
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [olderFields], complete(now + 2000, 30));
    expect(state.lastMajorQuake).toEqual(original);
    expect(state.allEarthquakes).toEqual([original]);
    expect(state.knownEarthquakeRevisions.A.deletedAtMs).toBeUndefined();
  });

  it('accepts a scientific revision newer than the recorded absence even from a cache array', () => {
    let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 1000));
    const updated = quake('A', 5, { updated: now + 2000 });
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [updated], { dataSource: 'R2', fetchTime: now + 3000 });
    expect(state.lastMajorQuake).toEqual(updated);
  });

  it('uses source observation time when neither feature carries a revision timestamp', () => {
    const current = quake('A', 4); delete current.properties.updated;
    const old = quake('A', 6); delete old.properties.updated;
    let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [current], complete(now + 3000));
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [old], { fetchTime: now + 5000, ...complete(now + 1000, 30) });
    expect(state.lastMajorQuake).toBeNull();
    expect(state.allEarthquakes).toEqual([current]);
  });

  it('ignores an older source generation for the same feed without losing its newer members', () => {
    const newer = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [quake('A', 5), quake('B', 4)], { sourceGeneratedAtMs: now });
    const result = feed(newer, actionTypes.DAILY_DATA_PROCESSED, [quake('A', 5)], { sourceGeneratedAtMs: now - 1000, fetchTime: now + 1000 });
    expect(result).toBe(newer);
    expect(result.earthquakesLast24Hours.map(item => item.id)).toEqual(['A', 'B']);
  });

  it('removes a downward-revised major from cards, month selectors, alerts and globe highlights together', () => {
    const a = quake('A', 5, { alert: 'red', tsunami: 1 });
    const b = quake('B', 4.7, { time: now - 2000 });
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [a, b]);
    state = feed(state, actionTypes.WEEKLY_DATA_PROCESSED, [a, b]);
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [a, b]);
    const revised = quake('A', 4, { updated: now, alert: null, tsunami: 0, place: 'Corrected place' });
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [revised, b]);
    expect(state.lastMajorQuake.id).toBe('B');
    expect(state.previousMajorQuake).toBeNull();
    expect(state.timeBetweenPreviousMajorQuakes).toBeNull();
    expect(state.highestRecentAlert).toBeNull();
    expect(state.hasRecentTsunamiWarning).toBe(false);
    for (const values of [state.allEarthquakes, state.earthquakesLast7Days, state.globeEarthquakes]) {
      expect(values.find(item => item.id === 'A')).toEqual(revised);
    }
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [a, b], { fetchTime: now + 5000 });
    expect(state.lastMajorQuake.id).toBe('B');
    expect(state.allEarthquakes.find(item => item.id === 'A')).toEqual(revised);
  });

  it('promotes upward magnitude revisions and recomputes ordering after a time/place correction', () => {
    let state = feed(initialState, actionTypes.WEEKLY_DATA_PROCESSED, [quake('A', 4), quake('B', 5, { time: now - 2000 })]);
    const revised = quake('A', 5.2, { time: now - 3000, updated: now, place: 'Revised' });
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [revised]);
    expect(state.lastMajorQuake.id).toBe('B');
    expect(state.previousMajorQuake).toEqual(revised);
    expect(state.timeBetweenPreviousMajorQuakes).toBe(1000);
  });

  it('retains history outside shorter coverage and does not infer deletion from unproven arrays', () => {
    const old = quake('old', 5, { time: now - 3 * day });
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [old]);
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 1));
    expect(state.lastMajorQuake).toEqual(old);
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [], { dataSource: 'R2', fetchTime: now + 2 });
    expect(state.lastMajorQuake).toEqual(old);
  });

  it('removes an absent event only within later complete coverage and blocks old-feed resurrection', () => {
    const a = quake('A', 5);
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [a], complete(now, 30));
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [], complete(now + 1000));
    expect(state.lastMajorQuake).toBeNull();
    expect(state.allEarthquakes).toEqual([]);
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [a], { fetchTime: now + 2000, ...complete(now, 30) });
    expect(state.lastMajorQuake).toBeNull();
    expect(state.allEarthquakes).toEqual([]);
  });

  it('does not regress known revisions when a legacy cached record has no upstream update timestamp', () => {
    const current = quake('A', 4, { updated: now });
    let state = feed(initialState, actionTypes.DAILY_DATA_PROCESSED, [current]);
    const stale = quake('A', 6); delete stale.properties.updated;
    state = feed(state, actionTypes.MONTHLY_DATA_PROCESSED, [stale], { dataSource: 'D1', fetchTime: now + 1000 });
    expect(state.lastMajorQuake).toBeNull();
    expect(state.allEarthquakes).toEqual([current]);
  });

  it('does not clear another resource loading or error state while correcting its observations', () => {
    let state = feed(initialState, actionTypes.MONTHLY_DATA_PROCESSED, [quake('A', 5)]);
    state = { ...state, isLoadingMonthly: true, monthlyError: 'Last refresh failed' };
    state = feed(state, actionTypes.DAILY_DATA_PROCESSED, [quake('A', 4, { updated: now })]);
    expect(state.isLoadingMonthly).toBe(true);
    expect(state.monthlyError).toBe('Last refresh failed');
    expect(state.lastMajorQuake).toBeNull();
  });
});
