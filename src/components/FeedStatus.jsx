import React from 'react';
import { FEED_FRESHNESS_MS } from '../../shared/earthquakeFeedContract.js';

export default function FeedStatus({ status, label = 'Feed', now = Date.now() }) {
  if (!status) return null;
  if (!status.hasLoaded) return <span>{label}: {status.loading ? 'loading…' : 'unavailable'}</span>;
  const sourceTime = status.sourceGeneratedAtMs;
  const observed = status.sourceObservedAtMs;
  const stale = status.stale || !Number.isFinite(sourceTime) || !Number.isFinite(observed) ||
    now - sourceTime > FEED_FRESHNESS_MS || now - observed > FEED_FRESHNESS_MS;
  return <span>
    {label}: {status.dataSource === 'USGS snapshot' ? 'stored USGS feed' : 'USGS fallback'}
    {Number.isFinite(sourceTime) && <> · source <time dateTime={new Date(sourceTime).toISOString()}>{new Date(sourceTime).toLocaleString()}</time></>}
    {stale ? <span className="text-amber-300"> · stale data</span> : status.error ? <span className="text-amber-300"> · latest refresh failed</span> : status.refreshing ? ' · refreshing…' : null}
  </span>;
}
