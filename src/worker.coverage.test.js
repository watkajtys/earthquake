// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { reconcileMonthCoverage } from '../functions/background/reconcile-month-coverage.js';

vi.mock('../functions/background/reconcile-month-coverage.js', () => ({ reconcileMonthCoverage: vi.fn() }));

const cron = '2-59/5 * * * *';
const scheduledTime = Date.UTC(2026, 8, 24, 12, 2);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('month coverage scheduled lifetime', () => {
  it.each([undefined, 'false', true])('does no coverage work without the exact enabled flag (%s)', async flag => {
    const context = { waitUntil: vi.fn() };
    await worker.scheduled({ cron, scheduledTime }, { MONTH_COVERAGE_ENABLED: flag }, context);
    expect(reconcileMonthCoverage).not.toHaveBeenCalled();
    expect(context.waitUntil).not.toHaveBeenCalled();
  });

  it('keeps coverage work attached to the scheduled lifetime until it finishes', async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    reconcileMonthCoverage.mockReturnValue(pending);
    const env = { MONTH_COVERAGE_ENABLED: 'true' };
    const context = { waitUntil: vi.fn() };
    await worker.scheduled({ cron, scheduledTime }, env, context);
    expect(reconcileMonthCoverage).toHaveBeenCalledExactlyOnceWith(env);
    expect(context.waitUntil).toHaveBeenCalledOnce();
    finish({ status: 'completed', processed: 3 });
    await expect(context.waitUntil.mock.calls[0][0]).resolves.toEqual({ status: 'completed', processed: 3 });
    expect(console.log).toHaveBeenCalledWith('[scheduled-worker] MILESTONE',
      expect.objectContaining({ milestone: 'Month coverage reconciliation finished',
        data: { status: 'completed', processed: 3 } }));
  });

  it('exposes coverage failure to the platform through waitUntil', async () => {
    const failure = new Error('Month source checksum failed');
    reconcileMonthCoverage.mockRejectedValue(failure);
    const tasks = [];
    const context = { waitUntil: vi.fn(promise => {
      tasks.push(promise.then(value => ({ value }), error => ({ error })));
    }) };
    await worker.scheduled({ cron, scheduledTime }, { MONTH_COVERAGE_ENABLED: 'true' }, context);
    expect(context.waitUntil).toHaveBeenCalledOnce();
    expect(await Promise.all(tasks)).toEqual([{ error: failure }]);
  });
});
