import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
    useParams: () => mockUseParams(), // Will be customized per test
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
  default: vi.fn(() => null), // Mock SeoMetadata to do nothing
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
      description: 'Valid slug with simpler location',
      slug: '5-quakes-near-california-up-to-m4.2-ci12345',
      expectedId: 'ci12345',
      expectError: false,
    },
    {
      description: 'Slug with numbers in location part',
      slug: '10-quakes-near-region-51-up-to-m6.0-ev999',
      expectedId: 'ev999',
      expectError: false,
    },
    {
      description: 'Slug with only ID-like part after last hyphen (permissive regex)',
      slug: 'invalid-slug-format-usGSX1',
      expectedId: 'usGSX1',
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
      description: 'Slug with ID containing hyphen (current regex captures part after last hyphen)',
      slug: '2-quakes-near-test-up-to-m3.0-id-with-hyphen',
      expectedId: 'hyphen',
      expectError: false,
    },
     {
      description: 'Slug with ID containing hyphen (if regex were /-([a-zA-Z0-9-]+)$/) - for future ref',
      slug: '2-quakes-near-test-up-to-m3.0-id-with-hyphen-part2',
      expectedId: 'part2',
      expectError: false,
    },
    {
      description: 'Null slug (e.g. route not fully loaded)',
      slug: null,
      expectedId: null,
      expectError: true,
      errorMessageContent: /No cluster slug specified/i,
    },
    {
      description: 'Empty string slug',
      slug: "",
      expectedId: null,
      expectError: true,
      errorMessageContent: /No cluster slug specified/i,
    }
  ];

  parsingTestCases.forEach(({ description, slug, expectedId, expectError, errorMessageContent }) => {
    it(`should handle slug: "${slug}" (${description})`, async () => {
      mockUseParams.mockReturnValue({ clusterId: slug });
      const propsWithEmptyOverview = { ...defaultProps, overviewClusters: [] };

      render(
        <MemoryRouter initialEntries={slug !== null ? [`/cluster/${slug}`] : ['/cluster/']}>
          <Routes>
            <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...propsWithEmptyOverview} />} />
            <Route path="/cluster/" element={<ClusterDetailModalWrapper {...propsWithEmptyOverview} />} />
          </Routes>
        </MemoryRouter>
      );

      if (expectError) {
        const errorElement = await screen.findByText(errorMessageContent);
        expect(errorElement).toBeInTheDocument();
        expect(mockFetchClusterDefinition).not.toHaveBeenCalled();
      } else {
        await waitFor(() => {
          expect(mockFetchClusterDefinition).toHaveBeenCalledWith(expectedId);
        });
        if (errorMessageContent) {
             expect(screen.queryByText(errorMessageContent)).toBeNull();
        }
      }
    });
  });
});
