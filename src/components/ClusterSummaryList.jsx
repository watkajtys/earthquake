import React, { useEffect, useId, useRef, useState } from 'react';
import ClusterSummaryItem from './ClusterSummaryItem.jsx';

export const CLUSTER_CARDS_PER_PAGE = 20;

export default function ClusterSummaryList({ clusters, onClusterSelect, totalCount = clusters.length,
  generationId = null, paginationKey = generationId, snapshot = null, stale = false, hasMore = false, loadMore,
  loadingMore = false, nextError = null }) {
  const [position, setPosition] = useState({ generationId: paginationKey, page: 0 });
  const listId = useId();
  const listRef = useRef(null);
  const nextButtonRef = useRef(null);
  const snapshotLabelRef = useRef(null);
  const paginationHadFocus = useRef(false);
  const navigation = useRef(0);
  const currentGeneration = useRef(paginationKey);
  const pageCount = Math.max(1, Math.ceil(totalCount / CLUSTER_CARDS_PER_PAGE));
  const loadedPageCount = Math.max(1, Math.ceil(clusters.length / CLUSTER_CARDS_PER_PAGE));
  const currentPage = Math.min(position.generationId === paginationKey ? position.page : 0, pageCount - 1, loadedPageCount - 1);
  useEffect(() => {
    currentGeneration.current = paginationKey;
    navigation.current += 1;
    setPosition(current => {
      const page = current.generationId === paginationKey ? Math.min(current.page, pageCount - 1) : 0;
      return current.generationId === paginationKey && current.page === page ? current : { generationId: paginationKey, page };
    });
  }, [paginationKey, pageCount]);
  useEffect(() => () => { navigation.current += 1; }, []);
  useEffect(() => {
    if (pageCount === 1 && paginationHadFocus.current && document.activeElement === document.body) {
      (listRef.current ?? snapshotLabelRef.current)?.focus();
      paginationHadFocus.current = false;
    }
  }, [pageCount]);
  const next = async () => {
    if (loadingMore || currentPage + 1 >= pageCount) return;
    const target = currentPage + 1;
    const attempt = ++navigation.current;
    if (target * CLUSTER_CARDS_PER_PAGE < clusters.length || (hasMore && await loadMore?.())) {
      if (navigation.current === attempt && currentGeneration.current === paginationKey) setPosition({ generationId: paginationKey, page: target });
    }
  };
  const start = currentPage * CLUSTER_CARDS_PER_PAGE;
  const visible = clusters.slice(start, start + CLUSTER_CARDS_PER_PAGE);
  return <>
    {snapshot && <p ref={snapshotLabelRef} tabIndex={-1} className="mb-2 text-xs text-slate-300">
      Stored cluster snapshot <time dateTime={new Date(snapshot.generatedAtMs).toISOString()}>{new Date(snapshot.generatedAtMs).toLocaleString()}</time>
      {snapshot.lastObservedAtMs > snapshot.generatedAtMs && <> · checked <time dateTime={new Date(snapshot.lastObservedAtMs).toISOString()}>{new Date(snapshot.lastObservedAtMs).toLocaleString()}</time></>}
      {stale && <span className="text-amber-200"> — stale snapshot</span>}
    </p>}
    {clusters.length > 0 && <>
      <ul ref={listRef} id={listId} tabIndex={-1} aria-label="Active earthquake clusters" className="space-y-2">
        {visible.map(cluster => <ClusterSummaryItem key={cluster.id} clusterData={cluster} onClusterSelect={onClusterSelect} />)}
      </ul>
      <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-300">
        Showing {start + 1}–{start + visible.length} of {totalCount} clusters
      </p>
      {pageCount > 1 && <nav aria-label="Cluster pages" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"
        onFocusCapture={() => { paginationHadFocus.current = true; }}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) paginationHadFocus.current = false; }}>
        <button type="button" aria-controls={listId} disabled={currentPage === 0} onClick={() => {
          navigation.current += 1;
          setPosition({ generationId: paginationKey, page: currentPage - 1 });
        }} className="rounded bg-slate-600 px-3 py-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Previous clusters</button>
        <span>Page {currentPage + 1} of {pageCount}</span>
        <button ref={nextButtonRef} type="button" aria-controls={listId} disabled={currentPage + 1 === pageCount} aria-disabled={loadingMore || undefined}
          onClick={next} className="rounded bg-slate-600 px-3 py-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Next clusters</button>
      </nav>}
      {loadingMore && <p role="status" className="mt-2 text-xs text-slate-300">Loading next clusters…</p>}
      {nextError && <div role="alert" className="mt-2 text-sm text-amber-200">{nextError}{' '}
        <button type="button" disabled={loadingMore} onClick={() => { nextButtonRef.current?.focus(); void next(); }} className="rounded bg-slate-600 px-3 py-2">Retry next clusters</button>
      </div>}
    </>}
  </>;
}
