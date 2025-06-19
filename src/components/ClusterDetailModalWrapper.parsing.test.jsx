import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';

// --- Mocks ---
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

// Changed to mock fetchClusterWithQuakes
const { mockFetchClusterWithQuakes } = vi.hoisted(() => {
  return { mockFetchClusterWithQuakes: vi.fn() };
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
  // fetchClusterDefinition: mockFetchClusterDefinition, // Old mock
  fetchClusterWithQuakes: mockFetchClusterWithQuakes, // New mock
  fetchActiveClusters: vi.fn(), // Keep other mocks if they are used by component, or remove if not
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

// Default props needed by ClusterDetailModalWrapper (subset for parsing tests)
const defaultProps = {
  overviewClusters: [],
  formatDate: vi.fn(timestamp => new Date(timestamp).toISOString()),
  getMagnitudeColorStyle: vi.fn(() => ({ backgroundColor: 'red', color: 'white' })),
  onIndividualQuakeSelect: vi.fn(),
  formatTimeAgo: vi.fn(ms => `${ms / 1000}s ago`),
  formatTimeDuration: vi.fn(ms => `${ms / 1000}s`),
  areParentClustersLoading: false,
};

// Default state for EarthquakeDataContext (subset for parsing tests)
const defaultEarthquakeData = {
  allEarthquakes: [],
  earthquakesLast72Hours: [],
  isLoadingWeekly: false,
  isLoadingMonthly: false,
  isInitialAppLoad: false,
  hasAttemptedMonthlyLoad: false,
  loadMonthlyData: vi.fn(),
  monthlyError: null,
  // Adding other fields that might be accessed by the component during render, even if not directly for parsing logic
  dataFetchTime: Date.now(),
  lastUpdated: new Date().toISOString(),
  earthquakesLastHour: [],
  earthquakesPriorHour: [],
  earthquakesLast24Hours: [],
  earthquakesLast7Days: [],
  prev24HourData: [],
  prev7DayData: [],
  prev14DayData: [],
  prev30DayData: [], // Corrected variable name
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
  currentLoadingMessages: [], // Added this field
  loadingMessageIndex: 0, // Added this field
  error: null,
  feelableQuakes7Days_ctx: [],
  significantQuakes7Days_ctx: [],
  feelableQuakes30Days_ctx: [],
  significantQuakes30Days_ctx: [],
  globeEarthquakes: [], // Added this field
};


describe('ClusterDetailModalWrapper URL Slug Parsing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData); // This will be set inside each test
    mockFetchClusterWithQuakes.mockResolvedValue(null); // Use the new mock
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
    it(`should handle slug: "${slug}" (${description})`, async () => {
      mockUseParams.mockReturnValue({ clusterId: slug });

      const minimalProps = {
        overviewClusters: [],
        formatDate: vi.fn(),
        getMagnitudeColorStyle: vi.fn(),
        onIndividualQuakeSelect: vi.fn(),
        formatTimeAgo: vi.fn(),
        formatTimeDuration: vi.fn(),
        areParentClustersLoading: false,
      };

      const minimalEarthquakeData = {
        ...defaultEarthquakeData, // Start with all default fields
        allEarthquakes: [],
        earthquakesLast72Hours: [],
        isLoadingWeekly: false,
        isLoadingMonthly: false,
        isInitialAppLoad: false,
        hasAttemptedMonthlyLoad: true,
        loadMonthlyData: vi.fn(),
        monthlyError: null,
      };
      mockUseEarthquakeDataState.mockReturnValue(minimalEarthquakeData);
      // Ensure mockFetchClusterDefinition is set for the expectation, even if default in beforeEach
      // For non-error cases, it's expected to be called.
      // For error cases where it's not called, the assertion `not.toHaveBeenCalled()` handles it.
      // If a specific test case *expected* a different resolution from fetchClusterDefinition,
      // it would need to be set here, overriding the beforeEach.
      // For these parsing tests, resolving to null (cluster not found by fetch) is okay if it's called.

      render(
        <MemoryRouter initialEntries={slug !== null ? [`/cluster/${slug}`] : ['/cluster/']}>
          <Routes>
            <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...minimalProps} />} />
            <Route path="/cluster/" element={<ClusterDetailModalWrapper {...minimalProps} />} />
          </Routes>
        </MemoryRouter>
      );

      if (expectError) {
        const errorElement = await screen.findByText(errorMessageContent);
        expect(errorElement).toBeInTheDocument();
        expect(mockFetchClusterWithQuakes).not.toHaveBeenCalled(); // Use new mock
      } else {
        await waitFor(() => {
          expect(mockFetchClusterWithQuakes).toHaveBeenCalledWith(expectedId); // Use new mock
        });
        if (errorMessageContent) {
             expect(screen.queryByText(errorMessageContent)).toBeNull();
        }
      }
    });
  });
});
