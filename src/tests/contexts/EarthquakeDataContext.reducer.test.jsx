import React from 'react'; // Though not directly used in reducer tests, often kept for consistency or if helper components were used.
import { earthquakeReducer, initialState, actionTypes } from '../../contexts/earthquakeDataContextUtils.js';
import { MAJOR_QUAKE_THRESHOLD } from '../../constants/appConstants'; // Used in consolidateMajorQuakesLogic, which is used by a reducer case.

// --- Helper Function Definitions (copied from EarthquakeDataContext.jsx for isolated testing of reducer logic if they are directly involved) ---
// Only include helpers directly used or affecting the reducer's pure logic.
// For this reducer, consolidateMajorQuakesLogic is used. Others like filterByTime are used internally by action creators or within the reducer but might not need to be tested *here* again if tested with the reducer.
const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => { if (!Array.isArray(data)) return []; const startTime = now - hoursAgoStart * 36e5; const endTime = now - hoursAgoEnd * 36e5; return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);};
const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0, now = Date.now()) => { if (!Array.isArray(data)) return []; const startTime = now - (daysAgoStart * 24 * 36e5); const endTime = now - (daysAgoEnd * 24 * 36e5); return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);};
const consolidateMajorQuakesLogic = (currentLastMajor, currentPreviousMajor, newMajors) => { let potentialQuakes = [...newMajors]; if (currentLastMajor) potentialQuakes.push(currentLastMajor); if (currentPreviousMajor) potentialQuakes.push(currentPreviousMajor); const consolidated = potentialQuakes.sort((a, b) => b.properties.time - a.properties.time).filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id)); const newLastMajor = consolidated.length > 0 ? consolidated[0] : null; const newPreviousMajor = consolidated.length > 1 ? consolidated[1] : null; const newTimeBetween = newLastMajor && newPreviousMajor ? newLastMajor.properties.time - newPreviousMajor.properties.time : null; return { lastMajorQuake: newLastMajor, previousMajorQuake: newPreviousMajor, timeBetweenPreviousMajorQuakes: newTimeBetween };};
const MAGNITUDE_RANGES = [ {name: '<1', min: -Infinity, max: 0.99}, {name : '1-1.9', min : 1, max : 1.99}, {name: '2-2.9', min: 2, max: 2.99}, {name : '3-3.9', min : 3, max : 3.99}, {name: '4-4.9', min: 4, max: 4.99}, {name : '5-5.9', min : 5, max : 5.99}, {name: '6-6.9', min: 6, max: 6.99}, {name : '7+', min : 7, max : Infinity}, ];


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
    const mockFetchTime = Date.now(); const mockMetadata = {generated:mockFetchTime-1000};
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
    const mockFetchTime = Date.now();
    const createMockQuake = (id, timeOffsetHours, mag) => ({ id, properties: { mag, time: mockFetchTime - timeOffsetHours * 36e5 } });
    // Modified mockFeaturesWeekly with duplicate IDs
    const mockFeaturesWeekly = [
      createMockQuake('w_quake1', 10, 2.5),
      createMockQuake('w_quake2', 50, 3.0),
      createMockQuake('w_quake3', 80, 4.5), // This one is > 72h, will be filtered out by filterByTime
      createMockQuake('w_quakeMajor', 60, 5.8), // Original major quake
      createMockQuake('w_quakeMajor', 61, 5.7), // Duplicate ID, slightly different time & mag, within 72h
      createMockQuake('w_anotherMajor', 30, 5.9),
      createMockQuake('w_anotherMajor', 31, 5.85), // Duplicate ID for another major quake, within 72h
      createMockQuake('w_highMagDup', 20, 6.0), // High magnitude quake
      createMockQuake('w_highMagDup', 22, 5.9), // Duplicate ID for high magnitude quake
      ...Array.from({ length: 5 }, (_, i) => createMockQuake(`w_extra${i}`, 24 * (i + 1) , 3.0 + i * 0.1)) // Keep some other quakes (some > 72h)
    ];
    const action = { type: actionTypes.WEEKLY_DATA_PROCESSED, payload: { features: mockFeaturesWeekly, fetchTime: mockFetchTime } };
    const updatedState = earthquakeReducer(initialState, action);

    it('should set isLoadingWeekly to false', () => expect(updatedState.isLoadingWeekly).toBe(false));

    it('should filter earthquakes for last 72 hours (deduplicated) and last 7 days', () => {
      // Test earthquakesLast72Hours (which should be deduplicated by the reducer)
      const expectedIn72HoursRaw = mockFeaturesWeekly.filter(q => (mockFetchTime - q.properties.time) <= 72 * 36e5);
      const uniqueIds72h = new Set();
      const expectedDeduplicatedIn72Hours = expectedIn72HoursRaw.filter(quake => {
          if (!uniqueIds72h.has(quake.id)) {
              uniqueIds72h.add(quake.id);
              return true;
          }
          return false;
      });
      expect(updatedState.earthquakesLast72Hours.map(q=>q.id).sort()).toEqual(expectedDeduplicatedIn72Hours.map(q=>q.id).sort());
      expect(updatedState.earthquakesLast72Hours.length).toEqual(expectedDeduplicatedIn72Hours.length);
      // Test earthquakesLast7Days (no deduplication applied here in the reducer)
      // This assertion was previously checking against mockFeaturesWeekly.length which includes quakes beyond 7 days.
      // It should filter to the actual 7-day window.
      const expectedLast7Days = mockFeaturesWeekly.filter(q => (mockFetchTime - q.properties.time) <= 7 * 24 * 36e5);
      expect(updatedState.earthquakesLast7Days.map(q=>q.id).sort()).toEqual(expectedLast7Days.map(q=>q.id).sort());
    });
    it('should populate globeEarthquakes (sorted subset of last 72 hours, deduplicated)', () => {
        const last72HoursData = filterByTime(mockFeaturesWeekly, 72, 0, mockFetchTime);

        // Deduplication step for the test's expectation
        const uniqueEarthquakeIds = new Set();
        const deduplicatedLast72HoursData = last72HoursData.filter(quake => {
            if (!uniqueEarthquakeIds.has(quake.id)) {
                uniqueEarthquakeIds.add(quake.id);
                return true;
            }
            return false;
        });

        const expectedGlobeQuakes = [...deduplicatedLast72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 900);
        expect(updatedState.globeEarthquakes.map(q=>q.id).sort()).toEqual(expectedGlobeQuakes.map(q=>q.id).sort());
        // Also check that the count is as expected after deduplication
        expect(updatedState.globeEarthquakes.length).toEqual(expectedGlobeQuakes.length);
    });
    it('should filter prev24HourData (48h to 24h ago)', () => {
        const expectedPrev24 = filterByTime(mockFeaturesWeekly, 48, 24, mockFetchTime);
        expect(updatedState.prev24HourData.map(q=>q.id).sort()).toEqual(expectedPrev24.map(q=>q.id).sort());
    });
    it('should consolidate major quakes from weekly data', () => {
        const weeklyMajors = mockFeaturesWeekly.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
        const mjUpdates = consolidateMajorQuakesLogic(initialState.lastMajorQuake, initialState.previousMajorQuake, weeklyMajors);
        expect(updatedState.lastMajorQuake?.id).toBe(mjUpdates.lastMajorQuake?.id);
    });
    it('should calculate dailyCounts7Days, sampledEarthquakesLast7Days, and magnitudeDistribution7Days', () => {
        expect(updatedState.dailyCounts7Days.length).toBe(7);
        expect(updatedState.sampledEarthquakesLast7Days).toBeInstanceOf(Array);
        expect(updatedState.magnitudeDistribution7Days.length).toBe(MAGNITUDE_RANGES.length);
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
    const mockFetchTime = Date.now();
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
        const expected14day = filterMonthlyByTime(mockFeaturesMonthly, 14, 0, mockFetchTime);
        expect(updatedState.earthquakesLast14Days.map(q=>q.id).sort()).toEqual(expected14day.map(q=>q.id).sort());
    });
    it('should filter prev7DayData and prev14DayData', () => {
        const expectedP7 = filterMonthlyByTime(mockFeaturesMonthly, 14, 7, mockFetchTime);
        const expectedP14 = filterMonthlyByTime(mockFeaturesMonthly, 28, 14, mockFetchTime);
        expect(updatedState.prev7DayData.map(q=>q.id).sort()).toEqual(expectedP7.map(q=>q.id).sort());
        expect(updatedState.prev14DayData.map(q=>q.id).sort()).toEqual(expectedP14.map(q=>q.id).sort());
    });
    it('should consolidate major quakes from monthly data', () => {
        const monthlyMajors = mockFeaturesMonthly.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
        const mjUpdates = consolidateMajorQuakesLogic(initialState.lastMajorQuake, initialState.previousMajorQuake, monthlyMajors);
        expect(updatedState.lastMajorQuake?.id).toBe(mjUpdates.lastMajorQuake?.id);
    });
    it('should calculate dailyCounts, sampledEarthquakes, and magnitudeDistribution for 14/30 days', () => {
        expect(updatedState.dailyCounts14Days.length).toBe(14);
        expect(updatedState.dailyCounts30Days.length).toBe(30);
        expect(updatedState.sampledEarthquakesLast14Days).toBeInstanceOf(Array);
        expect(updatedState.sampledEarthquakesLast30Days).toBeInstanceOf(Array);
        expect(updatedState.magnitudeDistribution14Days.length).toBe(MAGNITUDE_RANGES.length);
        expect(updatedState.magnitudeDistribution30Days.length).toBe(MAGNITUDE_RANGES.length);
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
