import { earthquakeReducer, initialState, actionTypes } from '../../contexts/earthquakeDataContextUtils.js';
import { afterEach, vi } from 'vitest';

const fetchTime = new Date(2026, 8, 21, 12).getTime();
afterEach(() => vi.restoreAllMocks());

// --- Reducer Tests ---
describe('EarthquakeDataContext Reducer', () => {
  it('should return the initial state', () => expect(earthquakeReducer(undefined, {})).toEqual(initialState));

  // Test SET_LOADING_FLAGS thoroughly
  describe('SET_LOADING_FLAGS action', () => {
    it('should update multiple loading flags', () => {
      const payload = { isLoadingDaily: false, isLoadingWeekly: false, isLoadingMonthly: true };
      const expectedState = { ...initialState, ...payload };
      expect(earthquakeReducer(initialState, { type: actionTypes.SET_LOADING_FLAGS, payload })).toEqual(expectedState);
    });
    it('should update a single loading flag', () => {
      const payload = { isLoadingMonthly: true };
      const expectedState = { ...initialState, ...payload };
      expect(earthquakeReducer(initialState, { type: actionTypes.SET_LOADING_FLAGS, payload })).toEqual(expectedState);
    });
     it('should not change other state properties', () => {
      const payload = { isLoadingDaily: false };
      const stateBefore = { ...initialState, earthquakesLastHour: [{ id: 'test' }] };
      const stateAfter = earthquakeReducer(stateBefore, { type: actionTypes.SET_LOADING_FLAGS, payload });
      expect(stateAfter.isLoadingDaily).toBe(false);
      expect(stateAfter.earthquakesLastHour).toEqual([{ id: 'test' }]); // Ensure other parts are untouched
    });
  });

  // Test SET_ERROR thoroughly
  describe('SET_ERROR action', () => {
    it('should update general error and clear monthly error', () => {
      const payload = { error: 'General Error', monthlyError: null }; // Explicitly clearing monthlyError
      const stateBefore = { ...initialState, monthlyError: 'Previous Monthly Error' };
      const expectedState = { ...stateBefore, ...payload };
      expect(earthquakeReducer(stateBefore, { type: actionTypes.SET_ERROR, payload })).toEqual(expectedState);
    });
    it('should update monthlyError and clear general error', () => {
      const payload = { monthlyError: 'Monthly Error', error: null }; // Explicitly clearing general error
      const stateBefore = { ...initialState, error: 'Previous General Error' };
      const expectedState = { ...stateBefore, ...payload };
      expect(earthquakeReducer(stateBefore, { type: actionTypes.SET_ERROR, payload })).toEqual(expectedState);
    });
    it('should update only one error if the other is undefined in payload', () => {
      let payload = { error: 'New General Error' };
      let stateBefore = { ...initialState, monthlyError: 'Existing Monthly Error' };
      let expectedState = { ...stateBefore, error: 'New General Error' };
      expect(earthquakeReducer(stateBefore, { type: actionTypes.SET_ERROR, payload })).toEqual(expectedState);

      payload = { monthlyError: 'New Monthly Error' };
      stateBefore = { ...initialState, error: 'Existing General Error' };
      expectedState = { ...stateBefore, monthlyError: 'New Monthly Error' };
      expect(earthquakeReducer(stateBefore, { type: actionTypes.SET_ERROR, payload })).toEqual(expectedState);
    });
  });

  it('should handle SET_INITIAL_LOAD_COMPLETE', () => expect(earthquakeReducer(initialState, { type: actionTypes.SET_INITIAL_LOAD_COMPLETE })).toEqual({ ...initialState, isInitialAppLoad: false }));
  it('should handle UPDATE_LOADING_MESSAGE_INDEX', () => { const s = {...initialState,currentLoadingMessages:['1','2'],loadingMessageIndex:0}; expect(earthquakeReducer(s,{type:actionTypes.UPDATE_LOADING_MESSAGE_INDEX}).loadingMessageIndex).toBe(1);});
  it('should handle UPDATE_LOADING_MESSAGE_INDEX and cycle to 0', () => { const s = {...initialState,currentLoadingMessages:['1','2'],loadingMessageIndex:1}; expect(earthquakeReducer(s,{type:actionTypes.UPDATE_LOADING_MESSAGE_INDEX}).loadingMessageIndex).toBe(0);});
  it('should handle SET_LOADING_MESSAGES', () => { const m = ['New']; expect(earthquakeReducer(initialState,{type:actionTypes.SET_LOADING_MESSAGES,payload:m})).toEqual({...initialState,currentLoadingMessages:m,loadingMessageIndex:0});});

  describe('DAILY_DATA_PROCESSED action', () => {
    const mockFetchTime = fetchTime; const mockMetadata = {generated:mockFetchTime-1000};
    const createMockQuake = (id,offset,mag,alert='green',tsunami=0) => ({id,properties:{mag,time:mockFetchTime-offset*36e5,alert,tsunami}});
    const mockFeatures = [createMockQuake('q1',0.5,2.5),createMockQuake('q2',1.5,3.0),createMockQuake('q3',10,4.5),createMockQuake('q4',30,5.5,'yellow'),createMockQuake('major1',2,6.0,'red',1)];
    const action = {type:actionTypes.DAILY_DATA_PROCESSED,payload:{features:mockFeatures,metadata:mockMetadata,fetchTime:mockFetchTime}};
    const updatedState = earthquakeReducer(initialState,action);
    it('should set isLoadingDaily to false and update fetch times', () => {expect(updatedState.isLoadingDaily).toBe(false);expect(updatedState.dataFetchTime).toBe(mockFetchTime);expect(updatedState.lastUpdated).toBe(new Date(mockMetadata.generated).toLocaleString());});
    it('should filter earthquakes', () => {expect(updatedState.earthquakesLastHour.length).toBe(1);expect(updatedState.earthquakesPriorHour.length).toBe(2);expect(updatedState.earthquakesLast24Hours.length).toBe(4);});
    it('should update tsunami and alert status', () => {expect(updatedState.hasRecentTsunamiWarning).toBe(true);expect(updatedState.highestRecentAlert).toBe('red');expect(updatedState.activeAlertTriggeringQuakes.length).toBe(1);});
    it('should consolidate major quakes', () => {expect(updatedState.lastMajorQuake.id).toBe('major1');expect(updatedState.previousMajorQuake.id).toBe('q3');});

    it('should handle no alerts', () => {
      const noAlertFeatures = [createMockQuake('q_noalert', 0.5, 2.5, 'green', 0)];
      const actionNoAlert = {...action, payload: {...action.payload, features: noAlertFeatures}};
      const stateNoAlert = earthquakeReducer(initialState, actionNoAlert);
      expect(stateNoAlert.highestRecentAlert).toBeNull();
      expect(stateNoAlert.activeAlertTriggeringQuakes.length).toBe(0);
    });

    it('should handle no major quakes', () => {
      const noMajorFeatures = [createMockQuake('q_minor', 0.5, 2.5)];
      const actionNoMajor = {...action, payload: {...action.payload, features: noMajorFeatures}};
      const stateNoMajor = earthquakeReducer(initialState, actionNoMajor);
      expect(stateNoMajor.lastMajorQuake).toBeNull();
      expect(stateNoMajor.previousMajorQuake).toBeNull();
    });
  });

  describe('WEEKLY_DATA_PROCESSED action', () => {
    const mockFetchTime = fetchTime;
    const createMockQuake = (id, timeOffsetHours, mag) => ({ id, properties: { mag, time: mockFetchTime - timeOffsetHours * 36e5 } });
    // Modified mockFeaturesWeekly with duplicate IDs
    const mockFeaturesWeekly = [
      createMockQuake('w_quake1', 10, 2.5),
      createMockQuake('w_quake2', 50, 3.0),
      createMockQuake('w_quake3', 80, 4.5), // This one is > 72h, will be filtered out by filterByTime
      createMockQuake('w_quakeMajor', 60, 5.8), // Original major quake
      createMockQuake('w_quakeMajor', 60, 5.8), // Duplicate observation
      createMockQuake('w_anotherMajor', 30, 5.9),
      createMockQuake('w_anotherMajor', 30, 5.9), // Duplicate observation
      createMockQuake('w_highMagDup', 20, 6.0), // High magnitude quake
      createMockQuake('w_highMagDup', 20, 6.0), // Duplicate observation
      ...Array.from({ length: 5 }, (_, i) => createMockQuake(`w_extra${i}`, 24 * (i + 1) , 3.0 + i * 0.1)) // Keep some other quakes (some > 72h)
    ];
    const action = { type: actionTypes.WEEKLY_DATA_PROCESSED, payload: { features: mockFeaturesWeekly, fetchTime: mockFetchTime } };
    const updatedState = earthquakeReducer(initialState, action);

    it('should set isLoadingWeekly to false', () => expect(updatedState.isLoadingWeekly).toBe(false));

    it('should filter earthquakes for last 72 hours (deduplicated) and last 7 days', () => {
      expect(updatedState.earthquakesLast72Hours.map(q => q.id)).toEqual([
        'w_quake1', 'w_quake2', 'w_quakeMajor', 'w_anotherMajor', 'w_highMagDup',
        'w_extra0', 'w_extra1', 'w_extra2',
      ]);
      expect(updatedState.earthquakesLast7Days).toEqual(mockFeaturesWeekly);
    });
    it('should populate globeEarthquakes (sorted subset of last 72 hours, deduplicated)', () => {
        expect(updatedState.globeEarthquakes.map(q => q.id)).toEqual([
          'w_highMagDup', 'w_anotherMajor', 'w_quakeMajor', 'w_extra2',
          'w_extra1', 'w_quake2', 'w_extra0', 'w_quake1',
        ]);
        const crowded = Array.from({ length: 902 }, (_, i) => createMockQuake(`rank-${i}`, 1, i / 100));
        crowded.push(createMockQuake('rank-901', 1, 9.01), createMockQuake('too-old', 73, 10));
        const capped = earthquakeReducer(initialState, { ...action, payload: { ...action.payload, features: crowded } });
        expect(capped.globeEarthquakes.map(q => q.id)).toEqual(
          Array.from({ length: 900 }, (_, i) => `rank-${901 - i}`),
        );
        expect(capped.globeEarthquakes[0].properties.mag).toBe(9.01);
    });
    it('should filter prev24HourData (48h to 24h ago)', () => {
        expect(updatedState.prev24HourData.map(q => q.id)).toEqual([
          'w_anotherMajor', 'w_anotherMajor', 'w_extra1',
        ]);
    });
    it('should consolidate major quakes from weekly data', () => {
        expect(updatedState.lastMajorQuake.id).toBe('w_highMagDup');
        expect(updatedState.previousMajorQuake.id).toBe('w_anotherMajor');
        expect(updatedState.timeBetweenPreviousMajorQuakes).toBe(10 * 36e5);
    });
    it('should calculate daily counts, magnitude bins and priority sampling for seven days', () => {
        expect(updatedState.dailyCounts7Days).toEqual([
          { dateString: 'Sep 15', count: 0 }, { dateString: 'Sep 16', count: 1 },
          { dateString: 'Sep 17', count: 1 }, { dateString: 'Sep 18', count: 2 },
          { dateString: 'Sep 19', count: 4 }, { dateString: 'Sep 20', count: 5 },
          { dateString: 'Sep 21', count: 1 },
        ]);
        expect(updatedState.magnitudeDistribution7Days.map(({ name, count }) => [name, count])).toEqual([
          ['<1', 0], ['1-1.9', 0], ['2-2.9', 1], ['3-3.9', 6],
          ['4-4.9', 1], ['5-5.9', 4], ['6-6.9', 2], ['7+', 0],
        ]);
        expect(updatedState.sampledEarthquakesLast7Days.map(q => q.id).sort())
          .toEqual(mockFeaturesWeekly.map(q => q.id).sort());
        vi.spyOn(Math, 'random').mockReturnValue(0.314);
        const crowded = Array.from({ length: 450 }, (_, i) => createMockQuake(`minor-${i}`, 1, 2));
        crowded.push(createMockQuake('priority-1', 1, 4.5), createMockQuake('priority-2', 1, 7));
        const sampled = earthquakeReducer(initialState, { ...action, payload: { ...action.payload, features: crowded } })
          .sampledEarthquakesLast7Days;
        expect(sampled).toHaveLength(300);
        expect(new Set(sampled.map(q => q.id)).size).toBe(300);
        expect(sampled.map(q => q.id)).toEqual(expect.arrayContaining(['priority-1', 'priority-2']));
        expect(sampled.every(q => crowded.includes(q))).toBe(true);
    });

    it('should handle empty features for weekly processing', () => {
      const emptyAction = { type: actionTypes.WEEKLY_DATA_PROCESSED, payload: { features: [], fetchTime: mockFetchTime } };
      const emptyState = earthquakeReducer(initialState, emptyAction);
      expect(emptyState.isLoadingWeekly).toBe(false);
      expect(emptyState.earthquakesLast72Hours.length).toBe(0);
      expect(emptyState.earthquakesLast7Days.length).toBe(0);
      expect(emptyState.globeEarthquakes.length).toBe(0);
      expect(emptyState.dailyCounts7Days.every(d => d.count === 0)).toBe(true);
      expect(emptyState.sampledEarthquakesLast7Days.length).toBe(0);
      expect(emptyState.magnitudeDistribution7Days.every(d => d.count === 0)).toBe(true);
      expect(emptyState.lastMajorQuake).toBeNull();
    });
  });

  describe('MONTHLY_DATA_PROCESSED action', () => {
    const mockFetchTime = fetchTime;
    const createMockQuake = (id, timeOffsetDays, mag) => ({ id, properties: { mag, time: mockFetchTime - timeOffsetDays * 24 * 36e5 } });
    const mockFeaturesMonthly = [
      createMockQuake('m_quake1', 5, 2.5), createMockQuake('m_quakeMajor', 15, 6.2),
      ...Array.from({ length: 10 }, (_, i) => createMockQuake(`m_extra${i}`, i + 1 , 2.0 + i * 0.2))
    ];
    const action = { type: actionTypes.MONTHLY_DATA_PROCESSED, payload: { features: mockFeaturesMonthly, fetchTime: mockFetchTime } };
    const updatedState = earthquakeReducer(initialState, action);

    it('should set isLoadingMonthly to false, hasAttemptedMonthlyLoad to true', () => {
        expect(updatedState.isLoadingMonthly).toBe(false);
        expect(updatedState.hasAttemptedMonthlyLoad).toBe(true);
    });
    it('should populate allEarthquakes, earthquakesLast14Days, and earthquakesLast30Days', () => {
        expect(updatedState.allEarthquakes.length).toBe(mockFeaturesMonthly.length);
        expect(updatedState.earthquakesLast14Days.map(q => q.id)).toEqual([
          'm_quake1', 'm_extra0', 'm_extra1', 'm_extra2', 'm_extra3', 'm_extra4',
          'm_extra5', 'm_extra6', 'm_extra7', 'm_extra8', 'm_extra9',
        ]);
        expect(updatedState.earthquakesLast30Days).toEqual(mockFeaturesMonthly);
    });
    it('should filter prev7DayData and prev14DayData', () => {
        expect(updatedState.prev7DayData.map(q => q.id)).toEqual(['m_extra7', 'm_extra8', 'm_extra9']);
        expect(updatedState.prev14DayData.map(q => q.id)).toEqual(['m_quakeMajor']);
    });
    it('should consolidate major quakes from monthly data', () => {
        expect(updatedState.lastMajorQuake.id).toBe('m_quakeMajor');
        expect(updatedState.previousMajorQuake).toBeNull();
    });
    it('should calculate daily counts, magnitude bins and priority sampling for 14/30 days', () => {
        expect(updatedState.dailyCounts14Days.map(d => d.count)).toEqual([0, 0, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 0]);
        expect(updatedState.dailyCounts14Days[0].dateString).toBe('Sep 8');
        expect(updatedState.dailyCounts14Days.at(-1).dateString).toBe('Sep 21');
        expect(updatedState.dailyCounts30Days).toHaveLength(30);
        expect(updatedState.dailyCounts30Days[0].dateString).toBe('Aug 23');
        expect(updatedState.dailyCounts30Days.filter(d => d.count)).toEqual([
          { dateString: 'Sep 6', count: 1 }, { dateString: 'Sep 11', count: 1 },
          { dateString: 'Sep 12', count: 1 }, { dateString: 'Sep 13', count: 1 },
          { dateString: 'Sep 14', count: 1 }, { dateString: 'Sep 15', count: 1 },
          { dateString: 'Sep 16', count: 2 }, { dateString: 'Sep 17', count: 1 },
          { dateString: 'Sep 18', count: 1 }, { dateString: 'Sep 19', count: 1 },
          { dateString: 'Sep 20', count: 1 },
        ]);
        expect(updatedState.magnitudeDistribution14Days.map(({ name, count }) => [name, count])).toEqual([
          ['<1', 0], ['1-1.9', 0], ['2-2.9', 6], ['3-3.9', 5],
          ['4-4.9', 0], ['5-5.9', 0], ['6-6.9', 0], ['7+', 0],
        ]);
        expect(updatedState.magnitudeDistribution30Days.map(d => d.count)).toEqual([0, 0, 6, 5, 0, 0, 1, 0]);
        expect(updatedState.sampledEarthquakesLast14Days.map(q => q.id).sort())
          .toEqual(updatedState.earthquakesLast14Days.map(q => q.id).sort());
        expect(updatedState.sampledEarthquakesLast30Days.map(q => q.id).sort())
          .toEqual(mockFeaturesMonthly.map(q => q.id).sort());
        vi.spyOn(Math, 'random').mockReturnValue(0.314);
        const crowded = Array.from({ length: 750 }, (_, i) => createMockQuake(`minor-${i}`, 2, 2));
        crowded.push(createMockQuake('priority-1', 5, 4.5), createMockQuake('priority-2', 5, 7));
        const sampled = earthquakeReducer(initialState, { ...action, payload: { ...action.payload, features: crowded } });
        for (const [quakes, cap] of [[sampled.sampledEarthquakesLast14Days, 500], [sampled.sampledEarthquakesLast30Days, 700]]) {
          expect(quakes).toHaveLength(cap);
          expect(new Set(quakes.map(q => q.id)).size).toBe(cap);
          expect(quakes.map(q => q.id)).toEqual(expect.arrayContaining(['priority-1', 'priority-2']));
          expect(quakes.every(q => crowded.includes(q))).toBe(true);
        }
    });

    it('should handle empty features for monthly processing', () => {
      const emptyAction = { type: actionTypes.MONTHLY_DATA_PROCESSED, payload: { features: [], fetchTime: mockFetchTime } };
      const emptyState = earthquakeReducer(initialState, emptyAction);
      expect(emptyState.isLoadingMonthly).toBe(false);
      expect(emptyState.allEarthquakes.length).toBe(0);
      expect(emptyState.earthquakesLast14Days.length).toBe(0);
      expect(emptyState.earthquakesLast30Days.length).toBe(0);
      expect(emptyState.dailyCounts14Days.every(d => d.count === 0)).toBe(true);
      expect(emptyState.dailyCounts30Days.every(d => d.count === 0)).toBe(true);
      expect(emptyState.sampledEarthquakesLast14Days.length).toBe(0);
      expect(emptyState.sampledEarthquakesLast30Days.length).toBe(0);
      expect(emptyState.magnitudeDistribution14Days.every(d => d.count === 0)).toBe(true);
      expect(emptyState.magnitudeDistribution30Days.every(d => d.count === 0)).toBe(true);
      expect(emptyState.lastMajorQuake).toBeNull();
    });

    it('should clear monthlyError', () => {
        const stateWithError={...initialState,monthlyError:"err"};
        const updatedStateAfterErrorClear = earthquakeReducer(stateWithError,action);
        expect(updatedStateAfterErrorClear.monthlyError).toBeNull();
    });
  });
});
