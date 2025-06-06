import React from 'react';
import { earthquakeReducer, initialState, actionTypes, EarthquakeDataContext, EarthquakeDataProvider } from '../../contexts/EarthquakeDataContext';

// --- React specific testing imports ---
import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
// contextActionTypes removed from import as it's unused
import { initialState as contextInitialState, useEarthquakeDataState } from '../../contexts/EarthquakeDataContext';
import { fetchUsgsData } from '../../services/usgsApiService';
import {
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
    USGS_API_URL_MONTH,
    USGS_API_URL_DAY,
    USGS_API_URL_WEEK,
    // Constants needed for reducer tests if not available in main initialState/actionTypes
    // For example, if MAJOR_QUAKE_THRESHOLD is used directly in reducer tests:
    // MAJOR_QUAKE_THRESHOLD as APP_MAJOR_QUAKE_THRESHOLD
} from '../../constants/appConstants';

// Mock the usgsApiService
vi.mock('../../services/usgsApiService', () => ({
  fetchUsgsData: vi.fn(),
}));

// --- Helper Function Definitions (copied from EarthquakeDataContext.jsx for isolated testing) ---
// These are assumed to be correct and tested by their own suites below.
const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => { if (!Array.isArray(data)) return []; const startTime = now - hoursAgoStart * 36e5; const endTime = now - hoursAgoEnd * 36e5; return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);};
const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0, now = Date.now()) => { if (!Array.isArray(data)) return []; const startTime = now - (daysAgoStart * 24 * 36e5); const endTime = now - (daysAgoEnd * 24 * 36e5); return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);};
const consolidateMajorQuakesLogic = (currentLastMajor, currentPreviousMajor, newMajors) => { let potentialQuakes = [...newMajors]; if (currentLastMajor) potentialQuakes.push(currentLastMajor); if (currentPreviousMajor) potentialQuakes.push(currentPreviousMajor); const consolidated = potentialQuakes.sort((a, b) => b.properties.time - a.properties.time).filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id)); const newLastMajor = consolidated.length > 0 ? consolidated[0] : null; const newPreviousMajor = consolidated.length > 1 ? consolidated[1] : null; const newTimeBetween = newLastMajor && newPreviousMajor ? newLastMajor.properties.time - newPreviousMajor.properties.time : null; return { lastMajorQuake: newLastMajor, previousMajorQuake: newPreviousMajor, timeBetweenPreviousMajorQuakes: newTimeBetween };};
const sampleArray = (array, sampleSize) => { if (!Array.isArray(array) || array.length === 0) return []; if (sampleSize <= 0) return []; if (sampleSize >= array.length) return [...array]; const shuffled = [...array]; for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; } return shuffled.slice(0, sampleSize);};
// function sampleArrayWithPriority (fullArray, sampleSize, priorityMagnitudeThreshold) { ... } // Removed unused helper
const MAGNITUDE_RANGES = [ {name: '<1', min: -Infinity, max: 0.99}, {name : '1-1.9', min : 1, max : 1.99}, {name: '2-2.9', min: 2, max: 2.99}, {name : '3-3.9', min : 3, max : 3.99}, {name: '4-4.9', min: 4, max: 4.99}, {name : '5-5.9', min : 5, max : 5.99}, {name: '6-6.9', min: 6, max: 6.99}, {name : '7+', min : 7, max : Infinity}, ];
// --- Helper Function Definitions (copied from EarthquakeDataContext.jsx for isolated testing) ---
// Note: In a typical scenario, these would be exported from their source file and imported directly.
// For this test file, we are testing copies to match the existing pattern for some reducer helpers.

// getMagnitudeColor is imported from utils, MAGNITUDE_RANGES needs to be defined here for calculateMagnitudeDistribution
import { getMagnitudeColor } from '../../utils/utils.js';

const MAGNITUDE_RANGES_FOR_TEST = [
    {name: '<1', min: -Infinity, max: 0.99},
    {name : '1-1.9', min : 1, max : 1.99},
    {name: '2-2.9', min: 2, max: 2.99},
    {name : '3-3.9', min : 3, max : 3.99},
    {name: '4-4.9', min: 4, max: 4.99},
    {name : '5-5.9', min : 5, max : 5.99},
    {name: '6-6.9', min: 6, max: 6.99},
    {name : '7+', min : 7, max : Infinity},
];

const formatDateForTimeline = (timestamp) => {
    if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return 'Invalid Date'; // Added for robustness
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Invalid Date'; // Added for robustness
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getInitialDailyCounts = (numDays, baseTime) => {
    const counts = [];
    for (let i = 0; i < numDays; i++) {
        const date = new Date(baseTime);
        date.setUTCDate(date.getUTCDate() - i); // Use UTC methods for consistency
        counts.push({ dateString: formatDateForTimeline(date.getTime()), count: 0 });
    }
    return counts.reverse();
};

const calculateMagnitudeDistribution = (earthquakes) => {
    const distribution = MAGNITUDE_RANGES_FOR_TEST.map(range => ({
        name: range.name,
        count: 0,
        color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min)
    }));
    if (!Array.isArray(earthquakes)) return distribution;
    earthquakes.forEach(quake => {
        const mag = quake.properties?.mag;
        if (mag === null || typeof mag !== 'number' || Number.isNaN(mag)) return;
        for (const range of distribution) {
            const rangeDetails = MAGNITUDE_RANGES_FOR_TEST.find(r => r.name === range.name);
            if (mag >= rangeDetails.min && mag <= rangeDetails.max) {
                range.count++;
                break;
            }
        }
    });
    return distribution;
};

function sampleArrayWithPriority(fullArray, sampleSize, priorityMagnitudeThreshold) {
    if (!Array.isArray(fullArray) || fullArray.length === 0) return [];
    if (sampleSize <= 0) return [];
    const priorityQuakes = fullArray.filter(
        q => q.properties && typeof q.properties.mag === 'number' && !Number.isNaN(q.properties.mag) && q.properties.mag >= priorityMagnitudeThreshold
    );
    const otherQuakes = fullArray.filter(
        q => !q.properties || typeof q.properties.mag !== 'number' || Number.isNaN(q.properties.mag) || q.properties.mag < priorityMagnitudeThreshold
    );
    if (priorityQuakes.length >= sampleSize) {
        return sampleArray(priorityQuakes, sampleSize);
    } else {
        const remainingSlots = sampleSize - priorityQuakes.length;
        const sampledOtherQuakes = sampleArray(otherQuakes, remainingSlots);
        return [...priorityQuakes, ...sampledOtherQuakes];
    }
}


// --- Reducer Tests ---
describe('EarthquakeDataContext Reducer', () => {
  it('should return the initial state', () => expect(earthquakeReducer(undefined, {})).toEqual(initialState));
  it('should handle SET_LOADING_FLAGS', () => { const p = {isLoadingDaily:false,isLoadingWeekly:false}; expect(earthquakeReducer(initialState,{type:actionTypes.SET_LOADING_FLAGS,payload:p})).toEqual({...initialState,...p}); });
  it('should handle SET_LOADING_FLAGS for a single flag', () => { const p = {isLoadingMonthly:true}; expect(earthquakeReducer(initialState,{type:actionTypes.SET_LOADING_FLAGS,payload:p})).toEqual({...initialState,...p}); });
  it('should handle SET_ERROR', () => { const p = {error:'Test error',monthlyError:null}; expect(earthquakeReducer(initialState,{type:actionTypes.SET_ERROR,payload:p})).toEqual({...initialState,...p}); });
  it('should handle SET_ERROR for monthlyError', () => { const p = {monthlyError:'Failed'}; expect(earthquakeReducer(initialState,{type:actionTypes.SET_ERROR,payload:p})).toEqual({...initialState,...p}); });
  it('should handle SET_INITIAL_LOAD_COMPLETE', () => expect(earthquakeReducer(initialState,{type:actionTypes.SET_INITIAL_LOAD_COMPLETE})).toEqual({...initialState,isInitialAppLoad:false}));
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
      expect(updatedState.earthquakesLast7Days.length).toBe(mockFeaturesWeekly.length);
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
    it('should clear monthlyError', () => {
        const stateWithError={...initialState,monthlyError:"err"};
        const updatedStateAfterErrorClear = earthquakeReducer(stateWithError,action);
        expect(updatedStateAfterErrorClear.monthlyError).toBeNull();
    });
  });
});

// --- Tests for Helper Functions ---

describe('Helper: filterByTime', () => {
  const now = new Date(2023, 2, 15, 12, 0, 0).getTime(); // Mar 15, 2023, 12:00:00 PM
  const createEvent = (id, hoursAgo) => ({ id, properties: { time: now - hoursAgo * 36e5 } });

  it('should return an empty array for empty data', () => {
    expect(filterByTime([], 24, 0, now)).toEqual([]);
  });
  it('should filter items within the last 24 hours', () => {
    const events = [createEvent('a', 1), createEvent('b', 23), createEvent('c', 25)];
    expect(filterByTime(events, 24, 0, now).map(e=>e.id)).toEqual(['a', 'b']);
  });
  it('should handle hoursAgoEnd correctly', () => {
    const events = [createEvent('a', 1), createEvent('b', 5), createEvent('c', 10)];
    expect(filterByTime(events, 8, 3, now).map(e=>e.id)).toEqual(['b']); // Between 3 and 8 hours ago
  });
  it('should return all items if range covers all', () => {
    const events = [createEvent('a', 1), createEvent('b', 2)];
    expect(filterByTime(events, 3, 0, now).length).toBe(2);
  });
  it('should return no items if range excludes all', () => {
    const events = [createEvent('a', 5), createEvent('b', 6)];
    expect(filterByTime(events, 3, 0, now).length).toBe(0);
  });
   it('should handle boundary conditions (inclusive start, exclusive end)', () => {
    const events = [createEvent('start', 2), createEvent('end', 1), createEvent('inside', 1.5)];
    // startTime = now - 2*36e5; endTime = now - 1*36e5;
    // time >= startTime && time < endTime
    expect(filterByTime(events, 2, 1, now).map(e=>e.id)).toEqual(['start', 'inside']);
  });
  it('should return empty array for invalid data input', () => {
    expect(filterByTime(null, 24, 0, now)).toEqual([]);
    expect(filterByTime({}, 24, 0, now)).toEqual([]);
  });
});

describe('Helper: filterMonthlyByTime', () => {
  const now = new Date(2023, 2, 15, 12, 0, 0).getTime(); // Mar 15, 2023
  const createEventDays = (id, daysAgo) => ({ id, properties: { time: now - daysAgo * 24 * 36e5 } });

  it('should return an empty array for empty data', () => {
    expect(filterMonthlyByTime([], 30, 0, now)).toEqual([]);
  });
  it('should filter items within the last 7 days', () => {
    const events = [createEventDays('a', 1), createEventDays('b', 6), createEventDays('c', 8)];
    expect(filterMonthlyByTime(events, 7, 0, now).map(e=>e.id)).toEqual(['a', 'b']);
  });
  it('should handle daysAgoEnd correctly', () => {
    const events = [createEventDays('a', 1), createEventDays('b', 10), createEventDays('c', 20)];
    expect(filterMonthlyByTime(events, 15, 5, now).map(e=>e.id)).toEqual(['b']); // Between 5 and 15 days ago
  });
   it('should handle boundary conditions (inclusive start, exclusive end)', () => {
    const events = [createEventDays('start', 2), createEventDays('end', 1), createEventDays('inside', 1.5)];
    expect(filterMonthlyByTime(events, 2, 1, now).map(e=>e.id)).toEqual(['start', 'inside']);
  });
  it('should return empty array for invalid data input', () => {
    expect(filterMonthlyByTime(null, 7, 0, now)).toEqual([]);
  });
});

describe('Helper: consolidateMajorQuakesLogic', () => {
  const createMajor = (id, time, mag = MAJOR_QUAKE_THRESHOLD) => ({ id, properties: { time, mag } });
  const now = Date.now();

  it('should handle all null/empty inputs', () => {
    const result = consolidateMajorQuakesLogic(null, null, []);
    expect(result.lastMajorQuake).toBeNull();
    expect(result.previousMajorQuake).toBeNull();
    expect(result.timeBetweenPreviousMajorQuakes).toBeNull();
  });
  it('should set lastMajorQuake if one newMajor', () => {
    const q1 = createMajor('q1', now);
    const result = consolidateMajorQuakesLogic(null, null, [q1]);
    expect(result.lastMajorQuake).toEqual(q1);
    expect(result.previousMajorQuake).toBeNull();
  });
  it('should sort and set last and previous from newMajors', () => {
    const q1 = createMajor('q1', now - 1000);
    const q2 = createMajor('q2', now); // newest
    const result = consolidateMajorQuakesLogic(null, null, [q1, q2]);
    expect(result.lastMajorQuake).toEqual(q2);
    expect(result.previousMajorQuake).toEqual(q1);
    expect(result.timeBetweenPreviousMajorQuakes).toBe(1000);
  });
  it('should correctly integrate currentMajor and newMajors', () => {
    const current = createMajor('curr', now - 2000);
    const q1 = createMajor('q1', now - 1000); // newer than current
    const q2 = createMajor('q2', now);      // newest
    const result = consolidateMajorQuakesLogic(current, null, [q1, q2]);
    expect(result.lastMajorQuake).toEqual(q2);
    expect(result.previousMajorQuake).toEqual(q1);
  });
  it('should handle currentLast and currentPrevious correctly', () => {
    const last = createMajor('last', now - 1000);
    const prev = createMajor('prev', now - 2000);
    const newQ = createMajor('newQ', now); // newest
    const result = consolidateMajorQuakesLogic(last, prev, [newQ]);
    expect(result.lastMajorQuake).toEqual(newQ);
    expect(result.previousMajorQuake).toEqual(last);
  });
  it('should deduplicate by ID, keeping the one from newMajors if times differ or the first one if same', () => {
    const q1 = createMajor('q1', now);
    const q1older = createMajor('q1', now - 1000);
    const result = consolidateMajorQuakesLogic(null, null, [q1older, q1]); // q1 is newer
    expect(result.lastMajorQuake).toEqual(q1);
    expect(result.previousMajorQuake).toBeNull();
  });
});

describe('Helper: sampleArray', () => {
  it('should return empty array for empty input', () => expect(sampleArray([], 5)).toEqual([]));
  it('should return empty array for sampleSize 0', () => expect(sampleArray([1,2,3], 0)).toEqual([]));
  it('should return empty array for negative sampleSize', () => expect(sampleArray([1,2,3], -1)).toEqual([]));
  it('should return a copy of full array if sampleSize >= length', () => {
    const arr = [1,2,3];
    expect(sampleArray(arr, 3)).toEqual(arr);
    expect(sampleArray(arr, 4)).toEqual(arr);
    expect(sampleArray(arr, 3)).not.toBe(arr); // Should be a copy
  });
  it('should return sampleSize items if sampleSize < length', () => {
    const arr = [1,2,3,4,5];
    expect(sampleArray(arr, 3).length).toBe(3);
  });
  it('returned items should be from original array', () => {
    const arr = [1,2,3,4,5];
    const sampled = sampleArray(arr, 3);
    sampled.forEach(item => expect(arr).toContain(item));
  });
});

describe('Helper: sampleArrayWithPriority', () => {
  const createQ = (id, mag) => ({id, properties: {mag}});
  const data = [createQ('p1',5), createQ('p2',6), createQ('o1',3), createQ('o2',4), createQ('o3',2)];

  it('should return empty for empty array', () => expect(sampleArrayWithPriority([], 5, 5)).toEqual([]));
  it('should return empty for sampleSize 0', () => expect(sampleArrayWithPriority(data, 0, 5)).toEqual([]));
  it('should return only priority quakes if they meet sampleSize', () => {
    const result = sampleArrayWithPriority(data, 2, 5);
    expect(result.length).toBe(2);
    result.forEach(q => expect(q.properties.mag).toBeGreaterThanOrEqual(5));
  });
  it('should fill with otherQuakes if priorityQuakes are less than sampleSize', () => {
    const result = sampleArrayWithPriority(data, 3, 5); // 2 priority, need 1 other
    expect(result.length).toBe(3);
    expect(result.filter(q => q.properties.mag >= 5).length).toBe(2); // Both priority included
    expect(result.filter(q => q.properties.mag < 5).length).toBe(1);
  });
  it('should return all priority if fewer than sampleSize, plus all others if still not enough', () => {
    const result = sampleArrayWithPriority(data, 10, 5); // Ask for more than available
    expect(result.length).toBe(data.length);
    expect(result.filter(q => q.properties.mag >= 5).length).toBe(2);
  });
  it('should sample from others if no priorityQuakes', () => {
    const result = sampleArrayWithPriority(data, 2, 7); // No quakes >= 7
    expect(result.length).toBe(2);
    result.forEach(q => expect(q.properties.mag).toBeLessThan(7));
  });
  it('should handle no otherQuakes if priorityQuakes exist', () => {
    const priorityOnly = [createQ('p1',5), createQ('p2',6)];
    const result = sampleArrayWithPriority(priorityOnly, 1, 5);
    expect(result.length).toBe(1);
    expect(result[0].properties.mag).toBeGreaterThanOrEqual(5);
  });
});

describe('Helper: formatDateForTimeline', () => {
  let toLocaleDateStringSpy;

  beforeEach(() => {
    // Spy on Date.prototype.toLocaleDateString and mock its implementation
    toLocaleDateStringSpy = vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function(locales, options) {
      // 'this' should be the Date instance.
      if (this instanceof Date && typeof this.toISOString === 'function') {
        if (locales === 'en-US' && options && options.month === 'short' && options.day === 'numeric') {
          if (this.toISOString().startsWith('2023-01-15')) return 'Jan 15';
          if (this.toISOString().startsWith('1970-01-01')) return 'Jan 1'; // For timestamp 0
        }
      }
      // Fallback for unhandled cases or if 'this' is not a Date
      return 'MockedDateStringFallback';
    });
  });

  afterEach(() => {
    toLocaleDateStringSpy.mockRestore(); // Restore the original method
  });

  it('formats a valid timestamp', () => {
    const ts = new Date('2023-01-15T12:00:00Z').getTime();
    expect(formatDateForTimeline(ts)).toBe('Jan 15');
  });
  it('formats timestamp 0 (epoch start)', () => {
    expect(formatDateForTimeline(0)).toBe('Jan 1');
  });
  it('returns "Invalid Date" for null, undefined, NaN, non-numeric string', () => {
    expect(formatDateForTimeline(null)).toBe('Invalid Date');
    expect(formatDateForTimeline(undefined)).toBe('Invalid Date');
    expect(formatDateForTimeline(NaN)).toBe('Invalid Date');
    expect(formatDateForTimeline("abc")).toBe('Invalid Date');
  });
});

describe('Helper: getInitialDailyCounts', () => {
  let originalToLocaleDateString;
  beforeEach(() => { // Mock toLocaleDateString for formatDateForTimeline consistency
    originalToLocaleDateString = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = vi.fn(function(locale, options) {
      const d = new Date(this.getTime());
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; // Simple mock like "1/15"
    });
  });
  afterEach(() => { Date.prototype.toLocaleDateString = originalToLocaleDateString; });

  it('returns correct structure for 3 days', () => {
    const baseTime = new Date(2023, 0, 3).getTime(); // Jan 3, 2023
    const result = getInitialDailyCounts(3, baseTime);
    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ dateString: '1/1', count: 0 }); // Jan 1
    expect(result[1]).toEqual({ dateString: '1/2', count: 0 }); // Jan 2
    expect(result[2]).toEqual({ dateString: '1/3', count: 0 }); // Jan 3
    result.forEach(item => expect(item).toHaveProperty('count', 0));
  });
  it('returns empty for numDays = 0', () => expect(getInitialDailyCounts(0, Date.now())).toEqual([]));
});

describe('Helper: calculateMagnitudeDistribution', () => {
  const createQ = (id, mag) => ({id, properties: {mag}});
  it('returns all zero counts for empty earthquakes array', () => {
    const result = calculateMagnitudeDistribution([]);
    result.forEach(range => expect(range.count).toBe(0));
    expect(result.length).toBe(MAGNITUDE_RANGES_FOR_TEST.length);
  });
  it('correctly distributes earthquakes into magnitude ranges', () => {
    const quakes = [createQ('q1',0.5), createQ('q2',1.5), createQ('q3',1.8), createQ('q4',7.2)];
    const result = calculateMagnitudeDistribution(quakes);
    expect(result.find(r=>r.name==='<1').count).toBe(1);
    expect(result.find(r=>r.name==='1-1.9').count).toBe(2);
    expect(result.find(r=>r.name==='7+').count).toBe(1);
    expect(result.find(r=>r.name==='2-2.9').count).toBe(0);
  });
  it('handles earthquakes at range boundaries correctly', () => {
    const quakes = [createQ('q1',0.99), createQ('q2',1.0), createQ('q3',6.99), createQ('q4',7.0)];
    const result = calculateMagnitudeDistribution(quakes);
    expect(result.find(r=>r.name==='<1').count).toBe(1); // 0.99
    expect(result.find(r=>r.name==='1-1.9').count).toBe(1); // 1.0
    expect(result.find(r=>r.name==='6-6.9').count).toBe(1); // 6.99
    expect(result.find(r=>r.name==='7+').count).toBe(1); // 7.0
  });
  it('ignores earthquakes with null or non-numeric mag', () => {
    const quakes = [createQ('q1',3.5), createQ('q2',null), createQ('q3',undefined), createQ('q4','abc'), createQ('q5',NaN)];
    const result = calculateMagnitudeDistribution(quakes);
    expect(result.find(r=>r.name==='3-3.9').count).toBe(1);
    expect(result.reduce((sum, r) => sum + r.count, 0)).toBe(1);
  });
   it('returns empty counts if data is not an array', () => {
    const result = calculateMagnitudeDistribution(null);
    result.forEach(r => expect(r.count).toBe(0));
  });
});

// --- Tests for loadMonthlyData and Memoized Selectors ---
const AllTheProviders = ({ children }) => (<EarthquakeDataProvider>{children}</EarthquakeDataProvider>);

describe('EarthquakeDataContext: loadMonthlyData', () => {
  beforeEach(() => {
    fetchUsgsData.mockReset();
  });

  it('should fetch monthly data and dispatch MONTHLY_DATA_PROCESSED on success', async () => {
    const minimalMockFeatures = [{ id: 'mocker1', properties: { time: Date.now(), mag: 3.0 } }];
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({ features: minimalMockFeatures });
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

    expect(result.current.monthlyError).toBeNull();
    await act(async () => { result.current.loadMonthlyData(); });

    expect(fetchUsgsData).toHaveBeenCalledWith(USGS_API_URL_MONTH);
    expect(result.current.isLoadingMonthly).toBe(false);
    expect(result.current.hasAttemptedMonthlyLoad).toBe(true);
    expect(result.current.monthlyError).toBeNull();
    expect(result.current.allEarthquakes.length).toBe(minimalMockFeatures.length);
    if (minimalMockFeatures.length > 0) expect(result.current.allEarthquakes[0].id).toBe(minimalMockFeatures[0].id);
  });

  it('should set monthlyError if API returns an error object', async () => {
    const errorMessage = "API Error for monthly data";
    const apiErrorResponse = { error: { message: errorMessage } };
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve(apiErrorResponse);
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

    await act(async () => { result.current.loadMonthlyData(); });
    expect(result.current.monthlyError).toBe(errorMessage);
  });

  it('should set monthlyError if API call throws an error', async () => {
    const thrownErrorMessage = "Network failure";
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.reject(new Error(thrownErrorMessage));
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

    await act(async () => { result.current.loadMonthlyData(); });
    expect(result.current.monthlyError).toContain(`Monthly Data Processing Error: ${thrownErrorMessage}`);
  });

  it('should set monthlyError if API returns no features or empty features array', async () => {
    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({ features: [] });
      return Promise.resolve({ features: [], metadata: {} });
    });

    const { result } = renderHook(() => useEarthquakeDataState(), { wrapper: AllTheProviders });
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

    await act(async () => { result.current.loadMonthlyData(); });
    expect(result.current.monthlyError).toBe("Monthly data is unavailable or incomplete.");

    fetchUsgsData.mockImplementation(async (url) => {
      if (url === USGS_API_URL_MONTH) return Promise.resolve({});
      return Promise.resolve({ features: [], metadata: {} });
    });

    await act(async () => { result.current.loadMonthlyData(); });
    expect(result.current.monthlyError).toBe("Monthly data is unavailable or incomplete.");
  });
});

describe('EarthquakeDataContext: Memoized Selectors', () => {
  const createMockQuake = (id, mag) => ({ id, properties: { mag, time: Date.now() } });
  const mockQuakes7Days = [ createMockQuake('q7_1', 2.0), createMockQuake('q7_2', 2.5), createMockQuake('q7_3', 3.0), createMockQuake('q7_4', 4.5), createMockQuake('q7_5', 5.0), createMockQuake('q7_null', null), ];
  const mockQuakes30Days = [ createMockQuake('q30_1', 1.0), createMockQuake('q30_2', 2.49), createMockQuake('q30_3', 2.5), createMockQuake('q30_4', 4.0), createMockQuake('q30_5', 4.49), createMockQuake('q30_6', 4.5), createMockQuake('q30_7', 6.0), createMockQuake('q30_undefined', undefined), ];

  it('should correctly compute memoized selectors based on context state', () => {
    const TestProvider = ({ children, mockState }) => {
      const currentMockState = mockState || {};
      const feelableQuakes7Days_ctx = React.useMemo(() => { const data = currentMockState.earthquakesLast7Days || []; return data.filter( q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD ); }, [currentMockState.earthquakesLast7Days, FEELABLE_QUAKE_THRESHOLD]);
      const significantQuakes7Days_ctx = React.useMemo(() => { const data = currentMockState.earthquakesLast7Days || []; return data.filter( q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= MAJOR_QUAKE_THRESHOLD ); }, [currentMockState.earthquakesLast7Days, MAJOR_QUAKE_THRESHOLD]);
      const feelableQuakes30Days_ctx = React.useMemo(() => { const data = currentMockState.allEarthquakes || []; return data.filter( q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD ); }, [currentMockState.allEarthquakes, FEELABLE_QUAKE_THRESHOLD]);
      const significantQuakes30Days_ctx = React.useMemo(() => { const data = currentMockState.allEarthquakes || []; return data.filter( q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= MAJOR_QUAKE_THRESHOLD ); }, [currentMockState.allEarthquakes, MAJOR_QUAKE_THRESHOLD]);
      const contextValueForTestProvider = { ...currentMockState, feelableQuakes7Days_ctx, significantQuakes7Days_ctx, feelableQuakes30Days_ctx, significantQuakes30Days_ctx, };
      return <EarthquakeDataContext.Provider value={contextValueForTestProvider}>{children}</EarthquakeDataContext.Provider>;
    };
    const mockProviderState = { ...contextInitialState, earthquakesLast7Days: mockQuakes7Days, allEarthquakes: mockQuakes30Days, };
    const wrapper = ({ children }) => <TestProvider mockState={mockProviderState}>{children}</TestProvider>;
    const { result: contextValueHookResult } = renderHook(() => useEarthquakeDataState(), { wrapper });

    const expectedFeelable7Days = mockQuakes7Days.filter(q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD);
    expect(contextValueHookResult.current.feelableQuakes7Days_ctx.map(q => q.id).sort()).toEqual(expectedFeelable7Days.map(q => q.id).sort());
    const expectedSignificant7Days = mockQuakes7Days.filter(q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
    expect(contextValueHookResult.current.significantQuakes7Days_ctx.map(q => q.id).sort()).toEqual(expectedSignificant7Days.map(q => q.id).sort());
    const expectedFeelable30Days = mockQuakes30Days.filter(q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD);
    expect(contextValueHookResult.current.feelableQuakes30Days_ctx.map(q => q.id).sort()).toEqual(expectedFeelable30Days.map(q => q.id).sort());
    const expectedSignificant30Days = mockQuakes30Days.filter(q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
    expect(contextValueHookResult.current.significantQuakes30Days_ctx.map(q => q.id).sort()).toEqual(expectedSignificant30Days.map(q => q.id).sort());
  });
});
