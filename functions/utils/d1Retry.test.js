import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryTransientD1 } from './d1Retry.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('bounded transient D1 write retries', () => {
  it.each(['Network connection lost.', 'storage caused object to be reset', 'reset because its code was updated'])(
    'recovers the documented transient failure: %s', async message => {
      const operation = vi.fn().mockRejectedValueOnce(new Error(`D1_ERROR: ${message}`)).mockResolvedValue('committed');
      const pending = retryTransientD1(operation);
      await vi.runAllTimersAsync();
      expect(await pending).toBe('committed');
      expect(operation).toHaveBeenCalledTimes(2);
    });

  it('stops after three attempts and preserves the actual failure', async () => {
    const error = new Error('D1_ERROR: Network connection lost.');
    const operation = vi.fn().mockRejectedValue(error);
    const pending = retryTransientD1(operation).catch(cause => cause);
    await vi.runAllTimersAsync();
    expect(await pending).toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry constraints, invalid acknowledgements or unknown errors', async () => {
    for (const message of ['UNIQUE constraint failed', 'COVERAGE_CURSOR_FENCED', 'D1 did not confirm cluster persistence']) {
      const operation = vi.fn().mockRejectedValue(new Error(message));
      await expect(retryTransientD1(operation)).rejects.toThrow(message);
      expect(operation).toHaveBeenCalledTimes(1);
    }
  });

  it('does not add an attempt after the retry budget elapsed', async () => {
    const operation = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      throw new Error('D1_ERROR: Network connection lost.');
    });
    const pending = retryTransientD1(operation).catch(cause => cause);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(Error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
