// functions/utils/earthquake-processor.test.js
import { describe, it, expect } from 'vitest';
import { processEarthquakeData } from './earthquake-processor.js';

// Mock data for testing
const now = Date.now();
const mockQuake = (id, mag, time, alert = 'green', tsunami = 0) => ({
    id,
    properties: { mag, time, alert, tsunami },
    geometry: { coordinates: [0, 0, 0] }
});

// d2 is the most recent major quake
const dailyFeatures = [
    mockQuake('d1', 2.5, now - 1 * 36e5), // 1 hour ago
    mockQuake('d2', 4.6, now - 23 * 36e5, 'yellow'), // 23 hours ago, major
];

// w2 is the second most recent major quake
const weeklyFeatures = [
    ...dailyFeatures,
    mockQuake('w1', 3.0, now - 3 * 24 * 36e5), // 3 days ago
    mockQuake('w2', 5.0, now - 6 * 24 * 36e5, 'red', 1), // 6 days ago, major
];

// m2 is the third most recent major quake
const monthlyFeatures = [
    ...weeklyFeatures,
    mockQuake('m1', 1.5, now - 10 * 24 * 36e5), // 10 days ago
    mockQuake('m2', 6.0, now - 20 * 24 * 36e5), // 20 days ago, major
];

describe('processEarthquakeData', () => {
    it('should process weekly data correctly', () => {
        const processed = processEarthquakeData(dailyFeatures, weeklyFeatures, [], now);

        expect(processed.earthquakesLastHour.length).toBe(1);
        expect(processed.earthquakesLast24Hours.length).toBe(2);
        expect(processed.earthquakesLast7Days.length).toBe(4);

        // Corrected assertion: d2 is the most recent major quake
        expect(processed.lastMajorQuake.id).toBe('d2');
        // Corrected assertion: w2 is the second most recent
        expect(processed.previousMajorQuake.id).toBe('w2');

        expect(processed.highestRecentAlert).toBe('yellow');
        expect(processed.hasRecentTsunamiWarning).toBe(false); // w2 is not in the last 24 hours
        expect(processed.dailyCounts7Days.length).toBe(7);
        expect(processed.magnitudeDistribution7Days.length).toBe(8);
    });

    it('should process monthly data correctly', () => {
        const processed = processEarthquakeData(dailyFeatures, weeklyFeatures, monthlyFeatures, now);

        expect(processed.earthquakesLast30Days.length).toBe(6);
        expect(processed.allEarthquakes.length).toBe(6);

        // Corrected assertion: d2 is the most recent major quake
        expect(processed.lastMajorQuake.id).toBe('d2');
        // Corrected assertion: w2 is the second most recent major quake
        expect(processed.previousMajorQuake.id).toBe('w2');

        expect(processed.earthquakesLast14Days.length).toBe(5); // d1, d2, w1, w2, m1
    });

    it('should handle empty data arrays', () => {
        const processed = processEarthquakeData([], [], [], now);
        expect(processed.earthquakesLast24Hours.length).toBe(0);
        expect(processed.earthquakesLast7Days.length).toBe(0);
        expect(processed.lastMajorQuake).toBeNull();
    });

    it('should correctly identify tsunami warnings', () => {
        const dailyWithTsunami = [...dailyFeatures, mockQuake('d3', 5.5, now - 2 * 36e5, 'orange', 1)];
        const processed = processEarthquakeData(dailyWithTsunami, dailyWithTsunami, [], now);
        expect(processed.hasRecentTsunamiWarning).toBe(true);
        expect(processed.tsunamiTriggeringQuake.id).toBe('d3');
    });
});
