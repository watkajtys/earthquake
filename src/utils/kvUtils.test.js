import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFeaturesFromKV, setFeaturesToKV } from './kvUtils.js';

describe('kvUtils.js', () => {
  let mockKvNamespace;
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy; // Though not used by current kvUtils, good practice

  beforeEach(() => {
    mockKvNamespace = {
      get: vi.fn(),
      put: vi.fn(),
    };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getFeaturesFromKV', () => {
    it('should retrieve and parse valid JSON data', async () => {
      const mockKey = 'testKey';
      const mockFeatures = [{ id: 'feat1' }];
      mockKvNamespace.get.mockResolvedValue(JSON.stringify(mockFeatures));

      const result = await getFeaturesFromKV(mockKvNamespace, mockKey);

      expect(mockKvNamespace.get).toHaveBeenCalledWith(mockKey);
      expect(result).toEqual(mockFeatures);
      expect(consoleLogSpy).toHaveBeenCalledWith(`[kvUtils-get] Successfully retrieved and parsed features for key "${mockKey}".`);
    });

    it('should return null if key is not found', async () => {
      const mockKey = 'notFoundKey';
      mockKvNamespace.get.mockResolvedValue(null);

      const result = await getFeaturesFromKV(mockKvNamespace, mockKey);

      expect(result).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(`[kvUtils-get] Key "${mockKey}" not found in KV store.`);
    });

    it('should return null and log error if JSON parsing fails', async () => {
      const mockKey = 'invalidJson';
      mockKvNamespace.get.mockResolvedValue('this is not json');

      const result = await getFeaturesFromKV(mockKvNamespace, mockKey);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[kvUtils-get] Error retrieving or parsing key "${mockKey}" from KV:`,
        expect.any(String), // Error message can vary slightly
        "SyntaxError"
      );
    });

    it('should return null and log error if kvNamespace.get throws', async () => {
        const mockKey = 'throwErrorKey';
        const error = new Error("KV Get Failed");
        mockKvNamespace.get.mockRejectedValue(error);

        const result = await getFeaturesFromKV(mockKvNamespace, mockKey);

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          `[kvUtils-get] Error retrieving or parsing key "${mockKey}" from KV:`,
          "KV Get Failed",
          "Error"
        );
      });

    it('should return null and log error if kvNamespace is not provided', async () => {
      const result = await getFeaturesFromKV(null, 'someKey');
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith("[kvUtils-get] KV Namespace binding not provided.");
    });

    it('should return null and log error if key is not provided', async () => {
      const result = await getFeaturesFromKV(mockKvNamespace, null);
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith("[kvUtils-get] Key not provided for KV retrieval.");
    });
  });

  describe('setFeaturesToKV', () => {
    let mockWaitUntil;

    beforeEach(() => {
      mockWaitUntil = vi.fn(promise => promise); // Simple mock that returns the promise
    });

    it('should stringify features and call kvNamespace.put and waitUntil', async () => {
      const mockKey = 'setKey';
      const mockFeatures = [{ id: 'featSet1' }];
      const stringifiedFeatures = JSON.stringify(mockFeatures);
      mockKvNamespace.put.mockResolvedValue(undefined); // Simulate successful put

      setFeaturesToKV(mockKvNamespace, mockKey, mockFeatures, { waitUntil: mockWaitUntil });

      // Check that waitUntil was called with a promise
      expect(mockWaitUntil).toHaveBeenCalledTimes(1);
      const putPromise = mockWaitUntil.mock.calls[0][0];
      expect(putPromise).toBeInstanceOf(Promise);

      // Allow the promise passed to waitUntil to resolve
      await putPromise;

      expect(mockKvNamespace.put).toHaveBeenCalledWith(mockKey, stringifiedFeatures);
      expect(consoleLogSpy).toHaveBeenCalledWith(`[kvUtils-set] Successfully stored features for key "${mockKey}" in KV.`);
    });

    it('should log error via waitUntil if kvNamespace.put fails', async () => {
      const mockKey = 'setFailKey';
      const mockFeatures = [{ id: 'featSetFail' }];
      const error = new Error('KV Put Failed');
      mockKvNamespace.put.mockRejectedValue(error);

      setFeaturesToKV(mockKvNamespace, mockKey, mockFeatures, { waitUntil: mockWaitUntil });

      // The promise passed to waitUntil should resolve because setFeaturesToKV handles the rejection internally.
      const putPromise = mockWaitUntil.mock.calls[0][0];
      await putPromise; // Let the internal promise chain (including .catch) complete.

      // Now, check that console.error was called by the .catch block within setFeaturesToKV
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[kvUtils-set] Error storing features for key "${mockKey}" in KV:`,
        "KV Put Failed",
        "Error"
      );
    });

    it('should log error and not call put if JSON.stringify fails', () => {
        const mockKey = 'stringifyFail';
        const circularObject = {};
        circularObject.self = circularObject; // Creates a circular reference

        // Pass a valid executionContext, but the error should occur before waitUntil is used
        setFeaturesToKV(mockKvNamespace, mockKey, [circularObject], { waitUntil: mockWaitUntil });

        expect(mockKvNamespace.put).not.toHaveBeenCalled();
        // WaitUntil might not be called if stringify fails, or it might be called with a rejected promise
        // Depending on exact implementation, this check might be too strict.
        // The core is that put isn't called and an error is logged.
        // Let's assume for now that if JSON.stringify fails, executionContext.waitUntil is not reached.
        expect(mockWaitUntil).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          `[kvUtils-set] Error preparing data for KV storage (key "${mockKey}"):`,
          expect.stringContaining("circular structure"), // Error message varies
          "TypeError"
        );
      });

    it('should log error and not call put if kvNamespace is not provided', () => {
      setFeaturesToKV(null, 'someKey', [], { waitUntil: mockWaitUntil });
      expect(mockKvNamespace.put).not.toHaveBeenCalled();
      expect(mockWaitUntil).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith("[kvUtils-set] KV Namespace binding not provided.");
    });

    it('should log error and not call put if key is not provided', () => {
      setFeaturesToKV(mockKvNamespace, null, [], { waitUntil: mockWaitUntil });
      expect(mockKvNamespace.put).not.toHaveBeenCalled();
      expect(mockWaitUntil).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith("[kvUtils-set] Key not provided for KV storage.");
    });

    it('should log error and not call put if features are invalid', () => {
      setFeaturesToKV(mockKvNamespace, 'someKey', "not-an-array", { waitUntil: mockWaitUntil });
      expect(mockKvNamespace.put).not.toHaveBeenCalled();
      expect(mockWaitUntil).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith("[kvUtils-set] Features data is invalid or not provided for KV storage.");
    });

    it('should log error and not call put if executionContext or its waitUntil is invalid', () => {
      // Test case 1: executionContext is null
      setFeaturesToKV(mockKvNamespace, 'someKeyECNull', [], null);
      expect(mockKvNamespace.put).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith("[kvUtils-set] executionContext with a valid waitUntil function not provided. KV set will not be performed reliably in the background.");
      consoleErrorSpy.mockClear(); // Clear spy for next assertion in same test

      // Test case 2: executionContext.waitUntil is not a function
      setFeaturesToKV(mockKvNamespace, 'someKeyECWaitUntilInvalid', [], { waitUntil: "not-a-function" });
      expect(mockKvNamespace.put).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith("[kvUtils-set] executionContext with a valid waitUntil function not provided. KV set will not be performed reliably in the background.");
    });
  });
});
