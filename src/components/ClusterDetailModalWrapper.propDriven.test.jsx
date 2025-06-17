import React from 'react';
import { render, screen, waitFor } from '@testing-library/react'; // waitFor is used in the original test
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';

// --- Mocks ---
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

// Hoist mocks that are used in other vi.mock factories
const { mockFetchClusterDefinition } = vi.hoisted(() => {
  return { mockFetchClusterDefinition: vi.fn() };
});

const { mockUseEarthquakeDataState } = vi.hoisted(() => ({
  mockUseEarthquakeDataState: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useParams: () => mockUseParams(),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../services/clusterApiService.js', () => ({
  fetchClusterDefinition: mockFetchClusterDefinition,
}));

vi.mock('./ClusterDetailModal', () => ({
  default: vi.fn(({ cluster }) => <div data-testid="mock-cluster-detail-modal">Cluster: {cluster.id}</div>),
}));

vi.mock('./SeoMetadata', () => ({
  default: vi.fn(() => null),
}));

vi.mock('../contexts/EarthquakeDataContext.jsx', () => ({
  useEarthquakeDataState: mockUseEarthquakeDataState,
}));

// Default props needed by ClusterDetailModalWrapper
const defaultProps = {
  overviewClusters: [],
  formatDate: vi.fn(timestamp => new Date(timestamp).toISOString()),
  getMagnitudeColorStyle: vi.fn(() => ({ backgroundColor: 'red', color: 'white' })),
  onIndividualQuakeSelect: vi.fn(),
  formatTimeAgo: vi.fn(ms => `${ms / 1000}s ago`),
  formatTimeDuration: vi.fn(ms => `${ms / 1000}s`),
  areParentClustersLoading: false,
};

// Default state for EarthquakeDataContext
const defaultEarthquakeData = {
  allEarthquakes: [],
  earthquakesLast72Hours: [],
  isLoadingWeekly: false,
  isLoadingMonthly: false,
  isInitialAppLoad: false,
  hasAttemptedMonthlyLoad: false,
  loadMonthlyData: vi.fn(),
  monthlyError: null,
};

describe('ClusterDetailModalWrapper Prop-Driven Behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData);
    mockFetchClusterDefinition.mockResolvedValue(null);
  });

  it('should use cluster data from overviewClusters if found, matching by strongestQuakeId', async () => {
    const slug = '10-quakes-near-test-area-up-to-m5.0-testquake1'; // slug is used to find the modal by ID
    const strongestQuakeId = 'testquake1';
    mockUseParams.mockReturnValue({ clusterId: slug }); // useParams is still called by the component

    const mockClusterFromProps = {
      id: `overview_cluster_${strongestQuakeId}_10`,
      strongestQuakeId: strongestQuakeId,
      locationName: 'Test Area from Prop',
      quakeCount: 10,
      maxMagnitude: 5.0,
      originalQuakes: [{ id: strongestQuakeId, properties: { place: 'Test Area from Prop', mag: 5.0 }, geometry: { coordinates: [0,0,0] }}],
      _latestTimeInternal: Date.now(),
      _earliestTimeInternal: Date.now() - 100000
    };

    render(
      <MemoryRouter initialEntries={[`/cluster/${slug}`]}>
        <Routes>
          <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...defaultProps} overviewClusters={[mockClusterFromProps]} />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText(`Cluster: ${slug}`);
    expect(mockFetchClusterDefinition).not.toHaveBeenCalled();
  });
});
