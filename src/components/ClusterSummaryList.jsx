import React, { useEffect, useId, useRef, useState } from 'react';
import ClusterSummaryItem from './ClusterSummaryItem.jsx';

export const CLUSTER_CARDS_PER_PAGE = 20;

export default function ClusterSummaryList({ clusters, onClusterSelect }) {
  const [page, setPage] = useState(0);
  const listId = useId();
  const listRef = useRef(null);
  const paginationHadFocus = useRef(false);
  const pageCount = Math.max(1, Math.ceil(clusters.length / CLUSTER_CARDS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  useEffect(() => { setPage(current => Math.min(current, pageCount - 1)); }, [pageCount]);
  useEffect(() => {
    if (pageCount === 1 && paginationHadFocus.current && document.activeElement === document.body) {
      listRef.current?.focus();
      paginationHadFocus.current = false;
    }
  }, [pageCount]);
  if (!clusters.length) return null;
  const start = currentPage * CLUSTER_CARDS_PER_PAGE;
  const visible = clusters.slice(start, start + CLUSTER_CARDS_PER_PAGE);
  return <>
    <ul ref={listRef} id={listId} tabIndex={-1} aria-label="Active earthquake clusters" className="space-y-2">
      {visible.map(cluster => <ClusterSummaryItem key={cluster.id} clusterData={cluster} onClusterSelect={onClusterSelect} />)}
    </ul>
    <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-300">
      Showing {start + 1}–{start + visible.length} of {clusters.length} clusters
    </p>
    {pageCount > 1 && <nav aria-label="Cluster pages" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"
      onFocusCapture={() => { paginationHadFocus.current = true; }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) paginationHadFocus.current = false; }}>
      <button type="button" aria-controls={listId} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}
        className="rounded bg-slate-600 px-3 py-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Previous clusters</button>
      <span>Page {currentPage + 1} of {pageCount}</span>
      <button type="button" aria-controls={listId} disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}
        className="rounded bg-slate-600 px-3 py-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Next clusters</button>
    </nav>}
  </>;
}
