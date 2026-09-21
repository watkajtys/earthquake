import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClusterSummaryList from './ClusterSummaryList.jsx';
import { useActiveClusters } from '../hooks/useActiveClusters.js';
import { fetchActiveClusters } from '../services/clusterApiService.js';
import { summaryItem, summaryPage } from '../test-utils/clusterSummaryFixtures.js';
vi.mock('../services/clusterApiService.js', () => ({ fetchActiveClusters: vi.fn() }));
const items = (count, start = 0) => Array.from({ length: count }, (_, index) => summaryItem(start + index));
const first = () => summaryPage(items(100), { totalCount: 205, nextCursor: 'next-100' });
const next = () => summaryPage(items(100, 100), { totalCount: 205, nextCursor: 'next-200' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function Harness() {
  const state = useActiveClusters();
  return <><button onClick={() => { void state.refresh(); }}>Refresh test snapshot</button><ClusterSummaryList {...state} /></>;
}
beforeEach(() => fetchActiveClusters.mockReset());

describe('on-demand compact cluster pagination', () => {
  it('uses one request for five visible pages, retries the next page in place, and preserves focus and the exact total', async () => {
    fetchActiveClusters.mockResolvedValueOnce(first()).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(next());
    render(<Harness />);
    await screen.findByText('Showing 1–20 of 205 clusters');
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    const nextButton = screen.getByRole('button', { name: 'Next clusters' });
    for (let index = 0; index < 4; index++) fireEvent.click(nextButton);
    expect(screen.getByText('Showing 81–100 of 205 clusters')).toBeInTheDocument();
    expect(fetchActiveClusters).toHaveBeenCalledTimes(1);
    nextButton.focus();
    fireEvent.click(nextButton);
    const retry = await screen.findByRole('button', { name: 'Retry next clusters' });
    expect(screen.getByText('Showing 81–100 of 205 clusters')).toBeInTheDocument();
    expect(nextButton).toHaveFocus();
    retry.focus();
    fireEvent.click(retry);
    await screen.findByText('Showing 101–120 of 205 clusters');
    expect(nextButton).toHaveFocus();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(fetchActiveClusters).toHaveBeenCalledTimes(3);
    expect(fetchActiveClusters.mock.calls.at(-1)[0]).toMatchObject({ cursor: 'next-100' });
  });

  it('keeps the visible page on same-generation refresh and resets it atomically for a newer snapshot', async () => {
    fetchActiveClusters.mockResolvedValueOnce(first()).mockResolvedValueOnce(next())
      .mockResolvedValueOnce({ ...first(), nextCursor: 'newly-issued' })
      .mockResolvedValueOnce(summaryPage(items(7), { snapshotSequence: 2, generationId: '22222222-2222-4222-8222-222222222222', stale: true }));
    render(<Harness />);
    await screen.findByText('Showing 1–20 of 205 clusters');
    for (let index = 0; index < 5; index++) fireEvent.click(screen.getByRole('button', { name: 'Next clusters' }));
    await screen.findByText('Showing 101–120 of 205 clusters');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh test snapshot' }));
    await waitFor(() => expect(fetchActiveClusters).toHaveBeenCalledTimes(3));
    expect(screen.getByText('Showing 101–120 of 205 clusters')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Next clusters' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh test snapshot' }));
    await screen.findByText('Showing 1–7 of 7 clusters');
    expect(screen.getByRole('list')).toHaveFocus();
    expect(screen.getByText(/Stored cluster snapshot/)).toBeInTheDocument();
    expect(screen.getByText(/stale snapshot/)).toBeInTheDocument();
  });

  it('does not jump forward when a pending next-page request finishes after the user moved back', async () => {
    const pending = deferred();
    fetchActiveClusters.mockResolvedValueOnce(first()).mockImplementationOnce(() => pending.promise);
    render(<Harness />);
    await screen.findByText('Showing 1–20 of 205 clusters');
    for (let index = 0; index < 5; index++) fireEvent.click(screen.getByRole('button', { name: 'Next clusters' }));
    expect(screen.getByText('Loading next clusters…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous clusters' }));
    expect(screen.getByText('Showing 61–80 of 205 clusters')).toBeInTheDocument();
    await act(async () => { pending.resolve(next()); });
    expect(screen.getByText('Showing 61–80 of 205 clusters')).toBeInTheDocument();
  });
});
