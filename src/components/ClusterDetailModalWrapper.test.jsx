import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';
import { fetchClusterWithQuakes } from '../services/clusterApiService.js';
import SeoMetadata from './SeoMetadata.jsx';

vi.mock('../services/clusterApiService.js', () => ({ fetchClusterWithQuakes: vi.fn() }));
vi.mock('./SeoMetadata.jsx', () => ({ default: vi.fn(() => null) }));
vi.mock('./ClusterDetailModal', () => ({ default: ({ cluster, onClose }) => <div><p>Cluster ID: {cluster.id}</p><p>Count: {cluster.quakeCount}</p><p>Members: {cluster.originalQuakes.length}</p><button onClick={onClose}>Close content</button></div> }));
const cluster = (id = 'canonical-id') => ({ id, slug: 'stored-slug', canonicalPath: '/cluster/stored-slug', strongestQuakeId: 'eq1', earthquakeIds: ['eq1','missing'], quakeCount: 2, maxMagnitude: -0.5,
  quakes: [{ type: 'Feature', id: 'eq1', properties: { time: 1750000000000, mag: -0.5, place: 'Test' }, geometry: { type: 'Point', coordinates: [1,2,3] } }] });
const props = { formatDate: vi.fn(), getMagnitudeColorStyle: vi.fn(), formatTimeAgo: () => 'recently', formatTimeDuration: () => '1h', areParentClustersLoading: true };
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate('/cluster/second')}>Second route</button>; }
function mount(path = '/cluster/stored-slug') {
  return render(<MemoryRouter initialEntries={[path]}><Navigation /><Routes><Route path="/cluster/*" element={<ClusterDetailModalWrapper {...props} />} /><Route path="/" element={<p>Home</p>} /></Routes></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); fetchClusterWithQuakes.mockResolvedValue(cluster()); });
afterEach(() => vi.useRealTimers());

describe('cluster route resolution', () => {
  it('requests the complete route independently of global-feed loading and preserves canonical identity/counts', async () => {
    mount();
    expect(await screen.findByText('Cluster ID: canonical-id')).toBeInTheDocument();
    expect(screen.getByText('Count: 2')).toBeInTheDocument();
    expect(screen.getByText('Members: 1')).toBeInTheDocument();
    expect(fetchClusterWithQuakes).toHaveBeenCalledWith({ route: 'stored-slug' }, { signal: expect.any(AbortSignal) });
    expect(SeoMetadata.mock.lastCall[0]).toMatchObject({ canonicalUrl: 'https://earthquakeslive.com/cluster/stored-slug', noIndex: false });
  });
  it('finishes a missing legacy route instead of waiting for monthly reconstruction', async () => {
    fetchClusterWithQuakes.mockResolvedValue(null);
    mount('/cluster/overview_cluster_missing_3');
    expect(await screen.findByRole('heading', { name: 'Cluster Not Found' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(SeoMetadata.mock.lastCall[0].noIndex).toBe(true);
  });
  it('offers retry after an error and recovers the same route', async () => {
    fetchClusterWithQuakes.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(cluster());
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Cluster ID: canonical-id')).toBeInTheDocument();
    expect(fetchClusterWithQuakes).toHaveBeenCalledTimes(2);
  });
  it('ignores a response for the prior route and aborts its signal', async () => {
    let finishFirst;
    fetchClusterWithQuakes.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; })).mockResolvedValueOnce(cluster('second-id'));
    mount('/cluster/first');
    const oldSignal = fetchClusterWithQuakes.mock.calls[0][1].signal;
    fireEvent.click(screen.getByRole('button', { name: 'Second route' }));
    expect(await screen.findByText('Cluster ID: second-id')).toBeInTheDocument();
    await act(async () => finishFirst(cluster('obsolete-id')));
    expect(oldSignal.aborted).toBe(true);
    expect(screen.queryByText('Cluster ID: obsolete-id')).not.toBeInTheDocument();
  });
  it('turns a stalled lookup into a retryable error after30seconds', async () => {
    vi.useFakeTimers();
    fetchClusterWithQuakes.mockReturnValue(new Promise(() => {}));
    mount();
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(screen.getByRole('heading', { name: 'Cluster Unavailable' })).toBeInTheDocument();
    expect(screen.getByText('Cluster details timed out. Please retry.')).toBeInTheDocument();
  });
  it('handles malformed route encoding without fetching and closes direct entry to home', async () => {
    mount('/cluster/%E0%A4%A');
    expect(screen.getByRole('heading', { name: 'Cluster Not Found' })).toBeInTheDocument();
    expect(fetchClusterWithQuakes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
  });
});
