import React from 'react';
import { render, screen, waitFor } from '@testing-library/react'; // waitFor might not be needed if not waiting for async in remaining test
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';

// --- Mocks ---
const mockNavigate = vi.fn();
const mockUseParams = vi.fn(); // This will be used by the remaining test

const { mockFetchClusterDefinition } = vi.hoisted(() => {
  return { mockFetchClusterDefinition: vi.fn() };
});

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
  hasAttemptedMonthlyLoad: false, // Adjusted to false, can be true if specific test needs it
  loadMonthlyData: vi.fn(),
  monthlyError: null,
  // Copied other fields from the new parsing test file for consistency
  dataFetchTime: Date.now(),
  lastUpdated: new Date().toISOString(),
  earthquakesLastHour: [],
  earthquakesPriorHour: [],
  earthquakesLast24Hours: [],
  earthquakesLast7Days: [],
  prev24HourData: [],
  prev7DayData: [],
  prev14DayData: [],
  prev30DayData: [],
  dailyCounts7Days: [],
  dailyCounts14Days: [],
  dailyCounts30Days: [],
  sampledEarthquakesLast7Days: [],
  sampledEarthquakesLast14Days: [],
  sampledEarthquakesLast30Days: [],
  magnitudeDistribution7Days: [],
  magnitudeDistribution14Days: [],
  magnitudeDistribution30Days: [],
  lastMajorQuake: null,
  previousMajorQuake: null,
  timeBetweenPreviousMajorQuakes: null,
  hasRecentTsunamiWarning: false,
  tsunamiTriggeringQuake: null,
  activeAlertTriggeringQuakes: [],
  highestRecentAlert: null,
  currentLoadingMessage: '',
  currentLoadingMessages: [],
  loadingMessageIndex: 0,
  error: null,
  feelableQuakes7Days_ctx: [],
  significantQuakes7Days_ctx: [],
  feelableQuakes30Days_ctx: [],
  significantQuakes30Days_ctx: [],
  globeEarthquakes: [],
};

// Adjusted describe block title
describe('ClusterDetailModalWrapper Prop Handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData);
    // mockFetchClusterDefinition.mockResolvedValue(null); // Not strictly needed if the remaining test doesn't call it
  });

  // Removed parsingTestCases array and the forEach loop

  it('should use cluster data from overviewClusters if found, matching by strongestQuakeId', async () => {
    const slug = '10-quakes-near-test-area-up-to-m5.0-testquake1';
    const strongestQuakeId = 'testquake1';
    mockUseParams.mockReturnValue({ clusterId: slug });
    // No need to set mockFetchClusterDefinition here as it should not be called if data is from props

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

    // Using simplified props for this specific test as well, if applicable
    const simplifiedPropsForThisTest = {
        ...defaultProps, // Start with defaults
        overviewClusters: [mockClusterFromProps], // Key prop for this test
        // Other props can be simplified if they aren't crucial for this test path
        formatDate: vi.fn(),
        getMagnitudeColorStyle: vi.fn(),
        onIndividualQuakeSelect: vi.fn(),
        formatTimeAgo: vi.fn(),
        formatTimeDuration: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={[`/cluster/${slug}`]}>
        <Routes>
          <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...simplifiedPropsForThisTest} />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText(`Cluster: ${slug}`);
    expect(mockFetchClusterDefinition).not.toHaveBeenCalled();
  });

});
