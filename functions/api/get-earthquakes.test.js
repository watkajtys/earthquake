import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from './get-earthquakes'; // Adjust path as necessary

const mockEventTimeRecent = Date.now(); // "now"
const mockEventTime2DaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
const mockEventTime8DaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
const mockEventTime35DaysAgo = Date.now() - 35 * 24 * 60 * 60 * 1000;

const mockFeature1 = { type: "Feature", id: "evt1", properties: { time: mockEventTimeRecent, mag: 5.0 }, geometry: { type: "Point", coordinates: [1, 1] } };
const mockFeature2 = { type: "Feature", id: "evt2", properties: { time: mockEventTime2DaysAgo, mag: 4.5 }, geometry: { type: "Point", coordinates: [2, 2] } };
const mockFeature3 = { type: "Feature", id: "evt3", properties: { time: mockEventTime8DaysAgo, mag: 6.0 }, geometry: { type: "Point", coordinates: [3, 3] } };
const mockFeature4 = { type: "Feature", id: "evt4", properties: { time: mockEventTime35DaysAgo, mag: 3.0 }, geometry: { type: "Point", coordinates: [4, 4] } };

const mockDbResultsDay = [{ geojson_feature: JSON.stringify(mockFeature1) }];
const mockDbResultsWeek = [
    { geojson_feature: JSON.stringify(mockFeature1) },
    { geojson_feature: JSON.stringify(mockFeature2) }
];
const mockDbResultsMonth = [
    { geojson_feature: JSON.stringify(mockFeature1) },
    { geojson_feature: JSON.stringify(mockFeature2) },
    { geojson_feature: JSON.stringify(mockFeature3) }
];
// mockFeature4 is older than 30 days

// Mock console
global.console = {
    ...global.console,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

describe('API Endpoint: /api/get-earthquakes', () => {
    let mockEnv;
    let mockDb;
    let mockStmt;

    beforeEach(() => {
        mockStmt = {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [], success: true }),
        };
        mockDb = {
            prepare: vi.fn().mockReturnValue(mockStmt),
        };
        mockEnv = {
            DB: mockDb,
        };
        vi.useFakeTimers(); // Use fake timers to control Date.now()
        vi.setSystemTime(new Date(mockEventTimeRecent)); // Set current time for consistent tests
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers(); // Restore real timers
    });

    describe('Successful Data Retrieval', () => {
        it('should return 200 with daily data for timeWindow=day', async () => {
            mockStmt.all.mockResolvedValue({ results: mockDbResultsDay, success: true });
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toBe('application/json');
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const body = await response.json();
            expect(body).toEqual([mockFeature1]);
            expect(mockStmt.bind).toHaveBeenCalledWith(expect.any(Number));
            // Check if the bound timestamp is roughly 24 hours ago
            const expectedStartTimeDay = new Date(mockEventTimeRecent);
            expectedStartTimeDay.setDate(expectedStartTimeDay.getDate() - 1);
            expect(mockStmt.bind.mock.calls[0][0]).toBeCloseTo(expectedStartTimeDay.getTime(), -3); // precision for ms comparison
        });

        it('should return 200 with weekly data for timeWindow=week', async () => {
            mockStmt.all.mockResolvedValue({ results: mockDbResultsWeek, success: true });
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=week`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);
            expect(response.status).toBe(200);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const body = await response.json();
            expect(body).toEqual([mockFeature1, mockFeature2]);
            // Check if the bound timestamp is roughly 7 days ago
            const expectedStartTimeWeek = new Date(mockEventTimeRecent);
            expectedStartTimeWeek.setDate(expectedStartTimeWeek.getDate() - 7);
            expect(mockStmt.bind.mock.calls[0][0]).toBeCloseTo(expectedStartTimeWeek.getTime(), -3);
        });

        it('should return 200 with monthly data for timeWindow=month', async () => {
            mockStmt.all.mockResolvedValue({ results: mockDbResultsMonth, success: true });
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=month`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);
            expect(response.status).toBe(200);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const body = await response.json();
            expect(body).toEqual([mockFeature1, mockFeature2, mockFeature3]);
            const expectedStartTimeMonth = new Date(mockEventTimeRecent);
            expectedStartTimeMonth.setMonth(expectedStartTimeMonth.getMonth() - 1);
            expect(mockStmt.bind.mock.calls[0][0]).toBeCloseTo(expectedStartTimeMonth.getTime(), -3);
        });

        it('should default to timeWindow=day if not specified', async () => {
            mockStmt.all.mockResolvedValue({ results: mockDbResultsDay, success: true });
            const request = new Request(`http://localhost/api/get-earthquakes`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };
            await onRequestGet(context);
            const expectedStartTimeDay = new Date(mockEventTimeRecent);
            expectedStartTimeDay.setDate(expectedStartTimeDay.getDate() - 1);
            expect(mockStmt.bind.mock.calls[0][0]).toBeCloseTo(expectedStartTimeDay.getTime(), -3);
        });
    });

    describe('Invalid timeWindow Parameter', () => {
        it('should return 400 for an invalid timeWindow value', async () => {
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=invalid`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);
            expect(response.status).toBe(400);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const bodyText = await response.text();
            expect(bodyText).toContain("Invalid timeWindow parameter");
        });
    });

    describe('Unavailable D1 Database', () => {
        it('should return 500 if env.DB is not available', async () => {
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: { DB: null }, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);
            expect(response.status).toBe(500);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const bodyText = await response.text();
            expect(bodyText).toBe("Database not available");
        });
    });

    describe('D1 Query Execution Failure', () => {
        it('should return 500 if db.prepare() fails', async () => {
            mockEnv.DB.prepare = vi.fn().mockImplementation(() => { throw new Error("Prepare failed"); });
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };
            const response = await onRequestGet(context);
            expect(response.status).toBe(500);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            expect(await response.text()).toContain("Failed to prepare database statement: Prepare failed");
        });

        it('should return 500 if stmt.all() throws an error', async () => {
            mockStmt.all.mockRejectedValue(new Error("Query execution failed"));
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);
            expect(response.status).toBe(500);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const bodyText = await response.text();
            expect(bodyText).toContain("Failed to execute database query: Query execution failed");
        });
         it('should return 500 if stmt.all() returns a structure without results', async () => {
            mockStmt.all.mockResolvedValue({ success: false, error: "Simulated D1 error" }); // No 'results'
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);
            expect(response.status).toBe(500);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            expect(await response.text()).toBe("Failed to retrieve data from database.");
        });
    });

    describe('Empty Data from D1', () => {
        it('should return 200 with an empty array if D1 returns no results', async () => {
            mockStmt.all.mockResolvedValue({ results: [], success: true }); // Empty results
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);
            expect(response.status).toBe(200);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const body = await response.json();
            expect(body).toEqual([]);
        });
    });

    describe('Malformed geojson_feature in D1', () => {
        it('should return 200 and filter out malformed features, logging an error', async () => {
            const malformedFeatureString = "this is not json";
            const mixedResults = [
                { geojson_feature: JSON.stringify(mockFeature1) },
                { geojson_feature: malformedFeatureString }
            ];
            mockStmt.all.mockResolvedValue({ results: mixedResults, success: true });
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv, functionPath: '/api/get-earthquakes' };

            const response = await onRequestGet(context);
            expect(response.status).toBe(200);
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const body = await response.json();
            expect(body).toEqual([mockFeature1]); // Only the valid feature
            expect(console.error).toHaveBeenCalledWith(
                "Failed to parse geojson_feature:",
                expect.any(SyntaxError), // Error object
                "Row:",
                malformedFeatureString
            );
        });
    });
});
