import { compareSummaryItems, SUMMARY_DEFAULT_LIMIT, SUMMARY_STALE_AFTER_MS } from '../../shared/clusterSummaryContract.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchActiveClusters } from '../services/clusterApiService.js';
import { EXTENDED_REFRESH_INTERVAL_MS, RESOURCE_TIMEOUT_MS, useRefreshableResource } from './useRefreshableResource.js';

const EMPTY_ITEMS = [];
const sameMetadata = (a, b) => ['generationId', 'snapshotSequence', 'generatedAtMs', 'sourceObservedAtMs',
  'source', 'sourceWatermarkMs', 'view', 'totalCount'].every(key => a[key] === b[key]);
const pageFailure = () => new Error('Cluster snapshot changed unexpectedly. Please retry the refresh.');

// Snapshot pages are committed together. Request identity and generation checks
// prevent a late continuation from appending to a newer first-page refresh.
export function useActiveClusters({ enabled = true } = {}) {
  const [pages, setPages] = useState(null);
  const pagesRef = useRef(null);
  const nextRequest = useRef(null);
  const expiredGeneration = useRef(null);
  const enabledRef = useRef(enabled);
  const [nextState, setNextState] = useState({ loading: false, error: null });
  const abortNext = useCallback(() => {
    nextRequest.current?.controller.abort();
    nextRequest.current = null;
    setNextState({ loading: false, error: null });
  }, []);
  const loadFirst = useCallback(async ({ signal }) => {
    const page = await fetchActiveClusters({ signal });
    if (signal.aborted) throw signal.reason;
    const previous = pagesRef.current;
    if (page.items.length !== Math.min(SUMMARY_DEFAULT_LIMIT, page.totalCount) || (page.nextCursor === null && page.items.length !== page.totalCount)) throw pageFailure();
    if (previous) {
      if (page.snapshotSequence < previous.snapshot.snapshotSequence ||
          (page.snapshotSequence === previous.snapshot.snapshotSequence && page.generationId !== previous.snapshot.generationId)) throw pageFailure();
      if (page.generationId === previous.snapshot.generationId) {
        if (!sameMetadata(page, previous.snapshot) || JSON.stringify(page.items) !== JSON.stringify(previous.firstItems) ||
            (page.nextCursor === null) !== (previous.firstCursor === null)) throw pageFailure();
        // Opaque cursors include issuance time and can change without any
        // immutable snapshot change. Keep the existing chain until it expires.
        if (expiredGeneration.current !== page.generationId) {
          const retained = { ...previous, snapshot: page };
          pagesRef.current = retained;
          setPages(retained);
          return page;
        }
      }
    }
    abortNext();
    expiredGeneration.current = null;
    const replacement = { snapshot: page, items: page.items, firstItems: page.items, firstCursor: page.nextCursor,
      nextCursor: page.nextCursor, requestedCursors: new Set(), resetSequence: (previous?.resetSequence ?? 0) + 1 };
    pagesRef.current = replacement;
    setPages(replacement);
    return page;
  }, [abortNext]);
  const resource = useRefreshableResource(loadFirst, { intervalMs: EXTENDED_REFRESH_INTERVAL_MS, enabled });
  const refreshResource = resource.refresh;
  const refresh = useCallback(options => enabledRef.current ? refreshResource(options) : Promise.resolve(null), [refreshResource]);
  const loadMore = useCallback(() => {
    if (!enabledRef.current) return Promise.resolve(false);
    if (nextRequest.current) return nextRequest.current.promise;
    const previous = pagesRef.current;
    if (!previous?.nextCursor) return Promise.resolve(false);
    if (expiredGeneration.current === previous.snapshot.generationId) {
      const retry = { controller: new AbortController(), promise: null };
      nextRequest.current = retry;
      setNextState({ loading: true, error: null });
      retry.promise = refresh().then(() => {
        if (enabledRef.current && nextRequest.current === retry) {
          setNextState({ loading: false, error: 'The stored snapshot expired. Retry to load a current snapshot.' });
        }
        if (nextRequest.current === retry) nextRequest.current = null;
        return false;
      });
      return retry.promise;
    }
    const cursor = previous.nextCursor;
    const controller = new AbortController();
    const request = { controller, promise: null };
    nextRequest.current = request;
    setNextState({ loading: true, error: null });
    const timeout = setTimeout(() => controller.abort(new DOMException('Cluster request timed out. Please retry.', 'TimeoutError')), RESOURCE_TIMEOUT_MS);
    request.promise = (async () => {
      let onAbort;
      try {
        const cancelled = new Promise((_, reject) => {
          onAbort = () => reject(controller.signal.reason || new DOMException('Aborted', 'AbortError'));
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        const page = await Promise.race([fetchActiveClusters({ signal: controller.signal, cursor }), cancelled]);
        if (controller.signal.aborted || nextRequest.current !== request || !enabledRef.current) return false;
        const current = pagesRef.current;
        if (!sameMetadata(page, current.snapshot) || current.nextCursor !== cursor || !page.items.length ||
            page.items.length !== Math.min(SUMMARY_DEFAULT_LIMIT, page.totalCount - current.items.length)) throw pageFailure();
        const ids = new Set(current.items.map(item => item.id));
        if (compareSummaryItems(current.items.at(-1), page.items[0]) > 0 || page.items.some(item => ids.has(item.id)) || new Set(page.items.map(item => item.id)).size !== page.items.length ||
            (page.nextCursor !== null && (page.nextCursor === cursor || current.requestedCursors.has(page.nextCursor)))) throw pageFailure();
        const items = [...current.items, ...page.items];
        if (items.length > page.totalCount || (page.nextCursor === null ? items.length !== page.totalCount : items.length >= page.totalCount)) throw pageFailure();
        const appended = { ...current, items, nextCursor: page.nextCursor, requestedCursors: new Set([...current.requestedCursors, cursor]) };
        pagesRef.current = appended;
        setPages(appended);
        return true;
      } catch (error) {
        if (nextRequest.current !== request || !enabledRef.current) return false;
        if (error?.code === 'GENERATION_EXPIRED') {
          expiredGeneration.current = previous.snapshot.generationId;
          setNextState({ loading: true, error: 'This cluster snapshot expired. Refreshing the stored snapshot…' });
          await refresh();
          if (nextRequest.current === request) setNextState({ loading: false, error: 'The stored snapshot expired. Retry to load a current snapshot.' });
        } else if (error?.name !== 'AbortError') {
          setNextState({ loading: false, error: error?.message || 'Unable to load more clusters. Please retry.' });
        }
        return false;
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', onAbort);
        if (nextRequest.current === request) {
          nextRequest.current = null;
          setNextState(state => ({ ...state, loading: false }));
        }
      }
    })();
    return request.promise;
  }, [refresh]);
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) abortNext();
    return () => {
      enabledRef.current = false;
      nextRequest.current?.controller.abort();
      nextRequest.current = null;
    };
  }, [enabled, abortNext]);
  const snapshot = pages?.snapshot ?? null;
  return { ...resource, refresh, clusters: pages?.items ?? EMPTY_ITEMS, snapshot,
    totalCount: snapshot?.totalCount ?? 0, generationId: snapshot?.generationId ?? null,
    paginationKey: pages ? `${snapshot.generationId}:${pages.resetSequence}` : null,
    hasMore: Boolean(pages?.nextCursor), loadingMore: nextState.loading, nextError: nextState.error, loadMore,
    stale: snapshot ? snapshot.stale || Date.now() - snapshot.generatedAtMs > SUMMARY_STALE_AFTER_MS : false };
}
