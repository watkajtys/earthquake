import { fetchUsgsData } from './usgsApiService';
import { vi } from 'vitest';

// Mock the global fetch function
global.fetch = vi.fn();

const TEST_API_URL = 'https://example.com/test-data';

describe('fetchUsgsData', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('should fetch and return data successfully', async () => {
    const mockResponseData = { features: [{ id: 'test1', properties: { mag: 5 } }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseData,
    });

    const data = await fetchUsgsData(TEST_API_URL);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}`);
    expect(data).toEqual(mockResponseData);
  });

  it('should handle HTTP errors', async () => {
    const errorStatus = 404;
    fetch.mockResolvedValueOnce({
      ok: false,
      status: errorStatus,
    });

    const result = await fetchUsgsData(TEST_API_URL);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}`);
    expect(result).toEqual({
      error: {
        message: `HTTP error! status: ${errorStatus}`,
        status: errorStatus,
      },
    });
  });

  it('should handle network errors (fetch rejects)', async () => {
    const networkErrorMessage = 'Network request failed';
    fetch.mockRejectedValueOnce(new Error(networkErrorMessage));

    const result = await fetchUsgsData(TEST_API_URL);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}`);
    expect(result).toEqual({
      error: {
        message: networkErrorMessage,
        status: null,
      },
    });
  });

  it('should handle non-JSON responses (response.json() fails)', async () => {
    const parsingErrorMessage = "Unexpected token N in JSON at position 0"; // Example error
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error(parsingErrorMessage) },
    });

    const result = await fetchUsgsData(TEST_API_URL);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}`);
    expect(result).toEqual({
      error: {
        message: parsingErrorMessage,
        status: null,
      },
    });
  });

  describe('with transformParams', () => {
    it('should fetch successfully with transformParams', async () => {
      const mockResponseData = { transformed: true };
      const transformParams = { transform: "stats_7day", another: "param" };
      const expectedUrl = `/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}&transform=stats_7day&another=param`;

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      });

      const data = await fetchUsgsData(TEST_API_URL, transformParams);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(expectedUrl);
      expect(data).toEqual(mockResponseData);
    });

    it('should correctly encode transformParams with special characters', async () => {
      const mockResponseData = { encoded: true };
      const transformParams = { view: "details with spaces", id: "test/123" };
      // Expected: view=details+with+spaces&id=test%2F123
      // URLSearchParams automatically handles space to + and other encodings.
      const expectedParams = new URLSearchParams(transformParams).toString();
      const expectedUrl = `/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}&${expectedParams}`;

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      });

      const data = await fetchUsgsData(TEST_API_URL, transformParams);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(expectedUrl);
      expect(data).toEqual(mockResponseData);
    });

    it('should not add transformParams if argument is undefined, null, or an empty object', async () => {
      const mockResponseData = { features: [] };
      const expectedUrl = `/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}`;

      // Test with undefined
      fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponseData });
      await fetchUsgsData(TEST_API_URL, undefined);
      expect(fetch).toHaveBeenCalledWith(expectedUrl);
      fetch.mockClear(); // Clear for next call

      // Test with null
      fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponseData });
      await fetchUsgsData(TEST_API_URL, null);
      expect(fetch).toHaveBeenCalledWith(expectedUrl);
      fetch.mockClear(); // Clear for next call

      // Test with empty object
      fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponseData });
      await fetchUsgsData(TEST_API_URL, {});
      expect(fetch).toHaveBeenCalledWith(expectedUrl);
    });
  });
});
