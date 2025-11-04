import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from './get-earthquakes';

const mockEventTimeRecent = Date.now();
const mockEventTime2DaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
const mockEventTime8DaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
const mockEventTime35DaysAgo = Date.now() - 35 * 24 * 60 * 60 * 1000;

const mockEvent1 = { id: "evt1", event_time: mockEventTimeRecent, latitude: 1, longitude: 1, depth: 10, magnitude: 5.0, place: "Test Place 1" };
const mockEvent2 = { id: "evt2", event_time: mockEventTime2DaysAgo, latitude: 2, longitude: 2, depth: 20, magnitude: 4.5, place: "Test Place 2" };
const mockEvent3 = { id: "evt3", event_time: mockEventTime8DaysAgo, latitude: 3, longitude: 3, depth: 30, magnitude: 6.0, place: "Test Place 3" };

const mockDbResultsDay = [mockEvent1];
const mockDbResultsWeek = [mockEvent1, mockEvent2];
const mockDbResultsMonth = [mockEvent1, mockEvent2, mockEvent3];

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
    let mockR2Bucket;

    beforeEach(() => {
        mockStmt = {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [], success: true }),
        };
        mockDb = {
            prepare: vi.fn().mockReturnValue(mockStmt),
        };
        mockR2Bucket = {
            get: vi.fn().mockResolvedValue(null), // Default to R2 miss
        };
        mockEnv = {
            DB: mockDb,
            GEOJSON_BUCKET: mockR2Bucket,
        };
        vi.useFakeTimers();
        vi.setSystemTime(new Date(mockEventTimeRecent));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('R2 Data Retrieval', () => {
        it('should return 200 with data from R2 if available', async () => {
            const mockR2Data = JSON.stringify(mockDbResultsDay);
            const mockR2Object = {
                body: mockR2Data,
                writeHttpMetadata: vi.fn(),
                httpEtag: 'etag123',
            };
            mockR2Bucket.get.mockResolvedValue(mockR2Object);

            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv };

            const response = await onRequestGet(context);
            expect(response.status).toBe(200);
            expect(response.headers.get('X-Data-Source')).toBe('R2');
            expect(response.headers.get('etag')).toBe('etag123');
            const body = await response.json();
            expect(body).toEqual(mockDbResultsDay);
            expect(mockR2Bucket.get).toHaveBeenCalledWith('list-day.json');
            expect(mockDb.prepare).not.toHaveBeenCalled(); // D1 should not be called
        });
    });

    describe('D1 Fallback Data Retrieval', () => {
        it('should return 200 with daily data from D1 when R2 misses', async () => {
            mockStmt.all.mockResolvedValue({ results: mockDbResultsDay, success: true });
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv };

            const response = await onRequestGet(context);

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toBe('application/json');
            expect(response.headers.get('X-Data-Source')).toBe('D1');
            const body = await response.json();
            expect(body).toEqual(mockDbResultsDay);
        });
    });

    describe('Invalid timeWindow Parameter', () => {
        it('should return 400 for an invalid timeWindow value', async () => {
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=invalid`);
            const context = { request, env: mockEnv };

            const response = await onRequestGet(context);
            expect(response.status).toBe(400);
            expect(response.headers.get('X-Data-Source')).toBe('None');
            const bodyText = await response.text();
            expect(bodyText).toContain("Invalid timeWindow parameter");
        });
    });

    describe('Unavailable D1 Database', () => {
        it('should return 500 if R2 misses and env.DB is not available', async () => {
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: { ...mockEnv, DB: null } };

            const response = await onRequestGet(context);
            expect(response.status).toBe(500);
            expect(response.headers.get('X-Data-Source')).toBe('None');
            const bodyText = await response.text();
            expect(bodyText).toBe("Database not available");
        });
    });

    describe('D1 Query Execution Failure', () => {
        it('should return 500 if stmt.all() returns a structure without results', async () => {
            mockStmt.all.mockResolvedValue({ success: false, error: "Simulated D1 error" });
            const request = new Request(`http://localhost/api/get-earthquakes?timeWindow=day`);
            const context = { request, env: mockEnv };

            const response = await onRequestGet(context);
            expect(response.status).toBe(200); // Now returns 200 with empty array
            expect(await response.json()).toEqual([]);
        });
    });
});
