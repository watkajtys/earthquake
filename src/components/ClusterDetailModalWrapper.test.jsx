import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';
// Assuming these are the contexts and services it uses or that need mocking for it to render
// import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx'; // Removed, using hoisted mock
// import { fetchClusterDefinition } from '../services/clusterApiService.js'; // Removed, using hoisted mock

// --- Mocks ---
const mockNavigate = vi.fn();
// const mockFetchClusterDefinition = vi.fn(); // Will be hoisted
const mockUseParams = vi.fn();

// Hoist mocks that are used in other vi.mock factories
const { mockFetchClusterDefinition } = vi.hoisted(() => {
  return { mockFetchClusterDefinition: vi.fn() };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useParams: () => mockUseParams(), // Will be customized per test
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../services/clusterApiService.js', () => ({
  fetchClusterDefinition: mockFetchClusterDefinition,
}));

// Mock the actual modal content to simplify testing the wrapper
vi.mock('./ClusterDetailModal', () => ({
  default: vi.fn(({ cluster }) => <div data-testid="mock-cluster-detail-modal">Cluster: {cluster.id}</div>),
}));

vi.mock('./SeoMetadata', () => ({
  default: vi.fn(() => null), // Mock SeoMetadata to do nothing
}));

// Mock context hooks
const { mockUseEarthquakeDataState } = vi.hoisted(() => ({
  mockUseEarthquakeDataState: vi.fn(),
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

// TODO: INVESTIGATE OOM - This test suite was skipped due to previous Out Of Memory errors when running all test cases together. Needs investigation and potential refactoring to run reliably (e.g., breaking into smaller suites or individual tests if the issue is cumulative).
describe('ClusterDetailModalWrapper URL Slug Parsing and Data Fetching', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData);
    mockFetchClusterDefinition.mockResolvedValue(null); // Default to not finding a definition
  });

  const parsingTestCases = [
    {
      description: 'Valid full slug',
      slug: '15-quakes-near-southern-sumatra-indonesia-up-to-m5.8-us7000mfp9',
      expectedId: 'us7000mfp9',
      expectError: false,
    },
    {
      description: 'Invalid slug - empty ID at the end',
      slug: '10-quakes-near-some-place-up-to-m5.0-',
      expectedId: null,
      expectError: true,
      errorMessageContent: /Invalid cluster URL format|Could not extract quake ID/i,
    },
    {
      description: 'Null slug (e.g. route not fully loaded)',
      slug: null,
      expectedId: null,
      expectError: true,
      errorMessageContent: /No cluster slug specified/i,
    },
    {
      description: 'Slug with only ID-like part after last hyphen (permissive regex)',
      slug: 'invalid-slug-format-usGSX1',
      expectedId: 'usGSX1',
      expectError: false,
    }
  ];

  parsingTestCases.forEach(({ description, slug, expectedId, expectError, errorMessageContent }) => {
  // Temporarily run only the first test case to isolate OOM error
  // const firstTestCase = parsingTestCases[0];
  it(`should handle slug: "${slug}" (${description})`, async () => {
    mockUseParams.mockReturnValue({ clusterId: slug });

    // Mock that the cluster is not found in overviewClusters prop initially
    const propsWithEmptyOverview = { ...defaultProps, overviewClusters: [] };

    render(
      <MemoryRouter initialEntries={slug !== null ? [`/cluster/${slug}`] : ['/cluster/']}>
        <Routes>
          <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...propsWithEmptyOverview} />} />
           {/* Added a fallback route for null/empty slug to avoid router errors in test setup */}
          <Route path="/cluster/" element={<ClusterDetailModalWrapper {...propsWithEmptyOverview} />} />
        </Routes>
      </MemoryRouter>
    );

    if (expectError) {
      // Wait for error message to appear
      const errorElement = await screen.findByText(errorMessageContent);
      expect(errorElement).toBeInTheDocument();
      expect(mockFetchClusterDefinition).not.toHaveBeenCalled();
    } else {
      // Should attempt to fetch with the extracted ID
      await waitFor(() => {
        expect(mockFetchClusterDefinition).toHaveBeenCalledWith(expectedId);
      });
      // Check that no general error message (like "Invalid URL format") is shown
      // It might show "Cluster details could not be found" if fetch returns null, which is fine for this test.
      if (errorMessageContent) { // Only if a specific error is NOT expected for this valid case
           expect(screen.queryByText(errorMessageContent)).toBeNull();
      }
    }
  });
  });

  it('should use cluster data from overviewClusters if found, matching by strongestQuakeId', async () => {
    const slug = '10-quakes-near-test-area-up-to-m5.0-testquake1';
    const strongestQuakeId = 'testquake1';
    mockUseParams.mockReturnValue({ clusterId: slug });

    const mockClusterFromProps = {
      id: `overview_cluster_${strongestQuakeId}_10`, // Original ID format from overview
      strongestQuakeId: strongestQuakeId,
      locationName: 'Test Area from Prop',
      quakeCount: 10,
      maxMagnitude: 5.0,
      originalQuakes: [{ id: strongestQuakeId, properties: { place: 'Test Area from Prop', mag: 5.0 }, geometry: { coordinates: [0,0,0] }}],
      // ... other necessary fields for the modal like _latestTimeInternal, _earliestTimeInternal for timeRange
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

    // Check if the modal is rendered with data from the prop
    // The mock modal displays cluster.id. In the wrapper, if clusterFromProp is used,
    // its 'id' is replaced with `fullSlugFromParams`.
    await screen.findByText(`Cluster: ${slug}`);
    expect(mockFetchClusterDefinition).not.toHaveBeenCalled(); // Should not fetch if found in props
  });

});
