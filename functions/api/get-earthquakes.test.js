import { onRequestGet } from './get-earthquakes';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock environment variables
const mockEnv = {
  GEOJSON_BUCKET: {
    get: vi.fn(),
  },
};

describe('API Endpoint: /api/get-earthquakes', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('R2 Data Retrieval', () => {
    test('should return 200 with data from R2 if available', async () => {
      const mockData = [{ id: 'test1', properties: { place: 'Test Place' } }];
      const mockR2Object = {
        json: async () => mockData,
        writeHttpMetadata: vi.fn(),
        body: JSON.stringify(mockData),
        httpEtag: 'mock-etag',
      };
      mockEnv.GEOJSON_BUCKET.get.mockResolvedValue(mockR2Object);

      const request = new Request("http://localhost/api/get-earthquakes?timeWindow=day");
      const context = {
        request,
        env: mockEnv,
      };

      const response = await onRequestGet(context);

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Data-Source')).toBe('R2');
      const body = await response.json();
      expect(body).toEqual(mockData);
    });
  });

  describe('Invalid timeWindow Parameter', () => {
    test('should return 400 for an invalid timeWindow value', async () => {
      const request = new Request("http://localhost/api/get-earthquakes?timeWindow=invalid");
      const context = {
        request,
        env: mockEnv,
      };

      const response = await onRequestGet(context);
      expect(response.status).toBe(400);
      expect(response.headers.get('X-Data-Source')).toBe('None');
      const bodyText = await response.text();
      expect(bodyText).toContain("Invalid timeWindow parameter");
    });
  });

  describe('R2 Object Not Found', () => {
    test('should return 404 if the R2 object is not found', async () => {
      // Mock R2 to return null, simulating a cache miss
      mockEnv.GEOJSON_BUCKET.get.mockResolvedValue(null);

      const request = new Request("http://localhost/api/get-earthquakes?timeWindow=day");
      const context = {
        request,
        env: mockEnv,
      };

      const response = await onRequestGet(context);

      // Expect a 404 Not Found response because the D1 fallback is removed
      expect(response.status).toBe(404);
      expect(response.headers.get('X-Data-Source')).toBe('None');
      const bodyText = await response.text();
      expect(bodyText).toContain("R2 object not found for time window: day");
    });
  });
});
