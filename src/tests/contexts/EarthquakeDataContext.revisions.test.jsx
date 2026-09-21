import { describe, expect, it } from 'vitest';
import { earthquakeReducer, initialState, actionTypes } from '../../contexts/earthquakeDataContextUtils.js';

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

describe('consistent event revisions across feed state', () => {
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
