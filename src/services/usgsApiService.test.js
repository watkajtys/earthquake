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

    try {
      await fetchUsgsData(TEST_API_URL);
    } catch (error) {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(`/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}`);
      expect(error).toBeInstanceOf(Error);
      // The actual message now includes details from the (mocked) proxy response
      // For this test, proxy response parsing will likely be null as we don't mock response.json() for error
      expect(error.message).toContain(`Failed to fetch USGS data from proxy. Status: ${errorStatus}`);
      expect(error.status).toBe(errorStatus);
    }
  });

  it('should handle network errors (fetch rejects)', async () => {
    const networkErrorMessage = 'Network request failed';
    fetch.mockRejectedValueOnce(new Error(networkErrorMessage));

    try {
      await fetchUsgsData(TEST_API_URL);
    } catch (error) {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(`/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}`);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(networkErrorMessage);
    }
  });

  it('should handle non-JSON responses (response.json() fails)', async () => {
    const parsingErrorMessage = "Unexpected token N in JSON at position 0";
    fetch.mockResolvedValueOnce({
      ok: true, // response.ok is true
      json: async () => { throw new Error(parsingErrorMessage); }, // but .json() fails
    });

    try {
      await fetchUsgsData(TEST_API_URL);
    } catch (error) {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(`/api/usgs-proxy?apiUrl=${encodeURIComponent(TEST_API_URL)}`);
      expect(error).toBeInstanceOf(Error);
      // This error is thrown by response.json() itself and bubbles up
      expect(error.message).toBe(parsingErrorMessage);
    }
  });
});
