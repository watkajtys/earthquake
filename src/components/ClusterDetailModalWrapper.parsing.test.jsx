import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';
import { fetchClusterWithQuakes } from '../services/clusterApiService.js';
vi.mock('../services/clusterApiService.js', () => ({ fetchClusterWithQuakes: vi.fn() }));
vi.mock('./SeoMetadata.jsx', () => ({ default: () => null }));
beforeEach(() => { vi.clearAllMocks(); fetchClusterWithQuakes.mockResolvedValue(null); });
it.each(['3-quakes-near-local-test-m6.3-12345-40d0--100d0', 'overview_cluster_us123_3', '15-quakes-near-sumatra-up-to-m5.8-us7000mfp9'])('sends stored and legacy route %s unchanged for server resolution', async (route) => {
  render(<MemoryRouter initialEntries={[`/cluster/${route}`]}><ClusterDetailModalWrapper /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Cluster Not Found' });
  expect(fetchClusterWithQuakes).toHaveBeenCalledWith({ route }, { signal: expect.any(AbortSignal) });
});
