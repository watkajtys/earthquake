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
});
