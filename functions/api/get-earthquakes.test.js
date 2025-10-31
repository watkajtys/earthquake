import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from './get-earthquakes'; // Adjust path as necessary

const mockEventTimeRecent = Date.now(); // "now"
const mockEventTime2DaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
const mockEventTime8DaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
const mockEventTime35DaysAgo = Date.now() - 35 * 24 * 60 * 60 * 1000;

const mockEvent1 = { id: "evt1", event_time: mockEventTimeRecent, latitude: 1, longitude: 1, depth: 10, magnitude: 5.0, place: "Test Place 1" };
const mockEvent2 = { id: "evt2", event_time: mockEventTime2DaysAgo, latitude: 2, longitude: 2, depth: 20, magnitude: 4.5, place: "Test Place 2" };
const mockEvent3 = { id: "evt3", event_time: mockEventTime8DaysAgo, latitude: 3, longitude: 3, depth: 30, magnitude: 6.0, place: "Test Place 3" };
const _mockEvent4 = { id: "evt4", event_time: mockEventTime35DaysAgo, latitude: 4, longitude: 4, depth: 40, magnitude: 3.0, place: "Test Place 4" };

const mockDbResultsDay = [mockEvent1];
const mockDbResultsWeek = [mockEvent1, mockEvent2];
const mockDbResultsMonth = [mockEvent1, mockEvent2, mockEvent3];
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
            expect(body).toEqual(mockDbResultsDay);
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
            expect(body).toEqual(mockDbResultsWeek);
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
            expect(body).toEqual(mockDbResultsMonth);
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

});
