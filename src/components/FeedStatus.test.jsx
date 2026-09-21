import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FeedStatus from './FeedStatus.jsx';
const now = Date.UTC(2026, 8, 21);
describe('feed provenance labels', () => {
  it('shows the upstream source timestamp instead of recent receipt/publication timestamps', () => {
    render(<FeedStatus now={now} label="Weekly feed" status={{ hasLoaded: true, dataSource: 'USGS snapshot',
      sourceGeneratedAtMs: now - 120000, sourceObservedAtMs: now - 100000, lastSuccessfulAtMs: now, snapshotGeneratedAtMs: now }} />);
    expect(screen.getByText(/Weekly feed: stored USGS feed/)).toBeInTheDocument();
    expect(document.querySelector('time')).toHaveAttribute('datetime', new Date(now - 120000).toISOString());
  });
  it('marks old source data stale even when the status was fresh at the last receipt', () => {
    render(<FeedStatus now={now} status={{ hasLoaded: true, dataSource: 'USGS', sourceGeneratedAtMs: now - 11 * 60000,
      sourceObservedAtMs: now, lastSuccessfulAtMs: now, stale: false }} />);
    expect(screen.getByText(/stale data/)).toBeInTheDocument();
    expect(screen.getByText(/USGS fallback/)).toBeInTheDocument();
  });
  it('distinguishes loading, unavailable, and a successfully loaded empty feed', () => {
    const { rerender } = render(<FeedStatus status={{ hasLoaded: false, loading: true }} />);
    expect(screen.getByText('Feed: loading…')).toBeInTheDocument();
    rerender(<FeedStatus status={{ hasLoaded: false, loading: false, error: 'Offline' }} />);
    expect(screen.getByText('Feed: unavailable')).toBeInTheDocument();
    rerender(<FeedStatus now={now} status={{ hasLoaded: true, sourceGeneratedAtMs: now, sourceObservedAtMs: now, dataSource: 'USGS snapshot' }} />);
    expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument();
  });
});
