import { useCallback, useEffect, useRef, useState } from 'react';

export const EXTENDED_REFRESH_INTERVAL_MS = 5 * 60_000;
export const RESOURCE_TIMEOUT_MS = 30_000;
const terminalStatus = status => [400, 401, 403, 404, 405, 410, 422].includes(status);
const canPoll = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;

// Receipt time describes a successful request, not the age of its source data.
export function useRefreshableResource(load, { intervalMs, enabled = true, timeoutMs = RESOURCE_TIMEOUT_MS } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, refreshing: false, error: null,
    hasLoaded: false, hasAttempted: false, lastSuccessfulAtMs: null });
  const stateRef = useRef(state);
  const active = useRef(false);
  const current = useRef(null);
  const retry = useRef({ failures: 0, nextAt: 0, terminal: false });
  const retryOwner = useRef(load);
  const refresh = useCallback(({ force = true, automatic = false } = {}) => {
    if (!active.current) return Promise.resolve(null);
    if (current.current) return current.current.promise;
    const previous = stateRef.current;
    if (automatic && (!canPoll() || retry.current.terminal || Date.now() < retry.current.nextAt)) {
      return Promise.resolve(previous.data);
    }
    if (!force && previous.hasLoaded && !previous.error && Date.now() - previous.lastSuccessfulAtMs < intervalMs) {
      return Promise.resolve(previous.data);
    }
    const controller = new AbortController();
    const request = { controller, promise: null };
    current.current = request;
    const commit = patch => {
      if (!active.current || current.current !== request) return;
      stateRef.current = { ...stateRef.current, ...patch };
      setState(stateRef.current);
    };
    commit({ loading: true, refreshing: previous.hasLoaded, error: null, hasAttempted: true });
    const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out. Please retry.', 'TimeoutError')), timeoutMs);
    request.promise = (async () => {
      let onAbort;
      try {
        const cancelled = new Promise((_, reject) => {
          onAbort = () => reject(controller.signal.reason || new DOMException('Aborted', 'AbortError'));
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        const data = await Promise.race([load({ signal: controller.signal, previousData: previous.data }), cancelled]);
        if (controller.signal.aborted) return null;
        retry.current = { failures: 0, nextAt: 0, terminal: false };
        commit({ data, hasLoaded: true, lastSuccessfulAtMs: Date.now(), error: null });
        return data;
      } catch (error) {
        if (error?.name !== 'AbortError' && active.current && current.current === request) {
          const failures = Math.min(retry.current.failures + 1, 10);
          const delay = Math.min(15 * 60_000, (intervalMs || 60_000) * 2 ** (failures - 1) * (1 + Math.random() * 0.2));
          retry.current = { failures, nextAt: Date.now() + delay, terminal: terminalStatus(error?.status) };
          commit({ error: error?.message || 'Unable to refresh data. Please retry.' });
        }
        return null;
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', onAbort);
        commit({ loading: false, refreshing: false });
        if (current.current === request) current.current = null;
      }
    })();
    return request.promise;
  }, [load, intervalMs, timeoutMs]);

  useEffect(() => {
    active.current = enabled;
    if (retryOwner.current !== load) {
      retryOwner.current = load;
      retry.current = { failures: 0, nextAt: 0, terminal: false };
    }
    if (enabled) void refresh({ force: false, automatic: true });
    else if (stateRef.current.loading || stateRef.current.refreshing) {
      // Cleanup aborts the old request before its finally can commit. Clear
      // only its busy flags so a fresh cached value stays usable on re-entry.
      stateRef.current = { ...stateRef.current, loading: false, refreshing: false };
      setState(stateRef.current);
    }
    // The interval itself establishes cadence. Comparing receipt time here
    // would skip every other tick whenever a request took nonzero time.
    const timer = enabled && intervalMs ? setInterval(() => { void refresh({ automatic: true }); }, intervalMs) : null;
    const onAvailability = () => {
      if (!enabled) return;
      if (canPoll()) void refresh({ force: false, automatic: true });
      else current.current?.controller.abort();
    };
    document.addEventListener('visibilitychange', onAvailability);
    window.addEventListener('online', onAvailability);
    window.addEventListener('offline', onAvailability);
    return () => {
      active.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onAvailability);
      window.removeEventListener('online', onAvailability);
      window.removeEventListener('offline', onAvailability);
      current.current?.controller.abort();
      current.current = null;
    };
  }, [enabled, intervalMs, load, refresh]);
  return { ...state, refresh };
}
