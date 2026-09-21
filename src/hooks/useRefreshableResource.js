import { useCallback, useEffect, useRef, useState } from 'react';

export const EXTENDED_REFRESH_INTERVAL_MS = 5 * 60_000;
export const RESOURCE_TIMEOUT_MS = 30_000;

// Receipt time describes a successful request, not the age of its source data.
export function useRefreshableResource(load, { intervalMs, enabled = true, timeoutMs = RESOURCE_TIMEOUT_MS } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, refreshing: false, error: null,
    hasLoaded: false, hasAttempted: false, lastSuccessfulAtMs: null });
  const stateRef = useRef(state);
  const active = useRef(false);
  const current = useRef(null);
  const refresh = useCallback(({ force = true } = {}) => {
    if (!active.current) return Promise.resolve(null);
    if (current.current) return current.current.promise;
    const previous = stateRef.current;
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
        const data = await Promise.race([load({ signal: controller.signal }), cancelled]);
        if (controller.signal.aborted) return null;
        commit({ data, hasLoaded: true, lastSuccessfulAtMs: Date.now(), error: null });
        return data;
      } catch (error) {
        if (error?.name !== 'AbortError') commit({ error: error?.message || 'Unable to refresh data. Please retry.' });
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
    active.current = true;
    if (enabled) void refresh({ force: false });
    // The interval itself establishes cadence. Comparing receipt time here
    // would skip every other tick whenever a request took nonzero time.
    const timer = enabled && intervalMs ? setInterval(() => { void refresh(); }, intervalMs) : null;
    const onVisible = () => { if (enabled && document.visibilityState === 'visible') void refresh({ force: false }); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      current.current?.controller.abort();
      current.current = null;
    };
  }, [enabled, intervalMs, refresh]);
  return { ...state, refresh };
}
