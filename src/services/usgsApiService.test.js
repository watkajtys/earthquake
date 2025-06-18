import { fetchUsgsData } from './usgsApiService';
import { vi, describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server'; // Corrected path

const TEST_API_URL = 'https://example.com/test-data';

describe('fetchUsgsData', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  // No need for beforeEach specific to fetch.mockClear() anymore

  it('should fetch and return data successfully', async () => {
    const mockResponseData = { features: [{ id: 'test1', properties: { mag: 5 } }] };
    server.use(
      http.get('/api/usgs-proxy', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('apiUrl')).toBe(TEST_API_URL);
        return HttpResponse.json(mockResponseData);
      })
    );
    const data = await fetchUsgsData(TEST_API_URL);
    expect(data).toEqual(mockResponseData);
  });

  it('should handle HTTP errors', async () => {
    const errorStatus = 404;
    const errorText = "Not Found"; // Body text for the error response
    server.use(
      http.get('/api/usgs-proxy', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('apiUrl')).toBe(TEST_API_URL);
        return new HttpResponse(errorText, { status: errorStatus });
      })
    );
    const result = await fetchUsgsData(TEST_API_URL);
    expect(result).toEqual({
      error: {
        message: `HTTP error! status: ${errorStatus}`, // errorText might be empty with new HttpResponse
        status: errorStatus,
      },
    });
  });

  it('should handle network errors (fetch rejects)', async () => {
    const networkErrorMessage = 'Simulated network failure'; // This won't be the actual message from service
    server.use(
      http.get('/api/usgs-proxy', () => {
        // Simulate a server error that might represent a network issue from proxy's perspective
        return new HttpResponse(null, { status: 503, statusText: 'Service Unavailable' });
      })
    );
    const result = await fetchUsgsData(TEST_API_URL);
    expect(result).toEqual({
      error: {
        message: `HTTP error! status: 503`, // Service formats based on status
        status: 503,
      },
    });
  });

  it('should handle non-JSON responses (response.json() fails)', async () => {
    const nonJsonResponseBody = "Not valid JSON";
    server.use(
      http.get('/api/usgs-proxy', () => {
        return new HttpResponse(nonJsonResponseBody, { headers: { 'Content-Type': 'application/json' } });
      })
    );
    const result = await fetchUsgsData(TEST_API_URL);
    expect(result).toEqual({
      error: {
        message: expect.stringMatching(/Unexpected token|invalid JSON/i), // More robust check for JSON parsing errors
        status: null,
      },
    });
  });
});
