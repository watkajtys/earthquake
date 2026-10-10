// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readR2 } from './r2ReadRetry.js';
afterEach(() => vi.useRealTimers());
describe('bounded R2 transport read retry', () => {
  it.each(['get', 'head'])('retries a known internal500 %s once', async method => {
    vi.useFakeTimers();
    const object = { size: 1 };
    const bucket = { [method]: vi.fn().mockRejectedValueOnce(new Error(`R2 ${method.toUpperCase()} failed: (500) Internal Server Error`)).mockResolvedValueOnce(object) };
    const result = readR2(bucket, method, 'private-key', new AbortController().signal);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBe(object);
    expect(bucket[method]).toHaveBeenCalledTimes(2);
  });
  it('exhausts one network retry', async () => {
    vi.useFakeTimers();
    const bucket = { get: vi.fn().mockRejectedValue(new Error('Network connection lost.')) };
    const result = readR2(bucket, 'get', 'key', new AbortController().signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ code: 'R2_NETWORK_ERROR' });
    expect(bucket.get).toHaveBeenCalledTimes(2);
  });
  it.each([new Error('R2 GET failed: (403) Forbidden'), new Error('Invalid JSON'), new Error('checksum mismatch')])('does not retry other failures', async error => {
    const bucket = { get: vi.fn().mockRejectedValue(error) };
    await expect(readR2(bucket, 'get', 'key', new AbortController().signal)).rejects.toBe(error);
    expect(bucket.get).toHaveBeenCalledOnce();
  });
  it('does not retry a missing object', async () => {
    const bucket = { get: vi.fn().mockResolvedValue(null) };
    expect(await readR2(bucket, 'get', 'key', new AbortController().signal)).toBeNull();
    expect(bucket.get).toHaveBeenCalledOnce();
  });
  it.each(['get', 'head'])('recognizes documented%s binding internal and unavailable suffixes', async method => {
    vi.useFakeTimers();
    for (const [code, expected, status] of [['10001', 'R2_INTERNAL_ERROR', 500], ['10043', 'R2_SERVICE_UNAVAILABLE', 503]]) {
      const bucket = { [method]: vi.fn().mockRejectedValue(new Error(`${method}: storage service failure (${code})`)) };
      const result = readR2(bucket, method, 'key', new AbortController().signal).catch(error => error);
      await vi.advanceTimersByTimeAsync(100);
      expect(await result).toMatchObject({ code: expected, upstreamStatus: status });
      expect(bucket[method]).toHaveBeenCalledTimes(2);
    }
  });
  it.each(['10002', '10003', '10007', '10037'])('does not retry terminal binding code%s', async code => {
    const error = new Error(`get: storage failure (${code})`);
    const bucket = { get: vi.fn().mockRejectedValue(error) };
    await expect(readR2(bucket, 'get', 'key', new AbortController().signal)).rejects.toBe(error);
    expect(bucket.get).toHaveBeenCalledOnce();
  });
  it('aborts the retry delay without making another request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const bucket = { get: vi.fn().mockRejectedValue(new Error('Network connection lost.')) };
    const result = readR2(bucket, 'get', 'key', controller.signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(50);
    const reason = new Error('deadline'); controller.abort(reason);
    expect(await result).toBe(reason);
    await vi.advanceTimersByTimeAsync(100);
    expect(bucket.get).toHaveBeenCalledOnce();
  });
});
