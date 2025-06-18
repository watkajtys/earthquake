import React from 'react';
import { render, screen, waitFor } from '@testing-library/react'; // waitFor might not be needed if not waiting for async in remaining test
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { server } from '../mocks/server.js'; // MSW server
import { http, HttpResponse } from 'msw';    // MSW http utilities

import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';

// --- Mocks ---
const mockNavigate = vi.fn();
const mockUseParams = vi.fn(); // This will be used by the remaining test

// Hoisted mocks for service functions are no longer needed with MSW
// const { mockFetchClusterDefinition, mockFetchActiveClusters } = vi.hoisted(() => {
//   return {
//     mockFetchClusterDefinition: vi.fn(),
//     mockFetchActiveClusters: vi.fn(),
//   };
// });

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useParams: () => mockUseParams(),
    useNavigate: () => mockNavigate,
  };
});

// vi.mock('../services/clusterApiService.js', () => ({ // This entire mock will be removed
//   fetchClusterDefinition: mockFetchClusterDefinition,
//   fetchActiveClusters: mockFetchActiveClusters,
// }));

vi.mock('./ClusterDetailModal', () => ({
  default: vi.fn(({ cluster }) => <div data-testid="mock-cluster-detail-modal">Cluster: {cluster?.id || 'N/A'}</div>),
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
describe('ClusterDetailModalWrapper', () => {
  beforeEach(() => {
    vi.resetAllMocks(); // Ensures mocks are clean for each test
    mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData);
    // MSW handlers will provide default responses, no need to mock service functions here
    // mockFetchClusterDefinition.mockResolvedValue(null);
    // mockFetchActiveClusters.mockResolvedValue([]);
  });

  // Existing test for overviewClusters prop
  describe('Prop Handling', () => {
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
    // With MSW, we don't check service mocks. Verification is via UI or other side effects.
    // expect(mockFetchClusterDefinition).not.toHaveBeenCalled();
    // expect(mockFetchActiveClusters).not.toHaveBeenCalled();
  });
});

  describe('Cluster Reconstruction with fetchActiveClusters (Old ID Format)', () => {
    const oldFormatSlug = 'overview_cluster_reconTargetID_someLocation';
    const strongestQuakeIdInOldFormat = 'reconTargetID';

    const sourceQuakeStrongest = { id: strongestQuakeIdInOldFormat, properties: { mag: 4.5, time: Date.now(), place: 'Recon Place' }, geometry: { coordinates: [1,2,3] } };
    const sourceQuakeOther = { id: 'otherInSource', properties: { mag: 3.0, time: Date.now() - 1000, place: 'Recon Place' }, geometry: { coordinates: [1.1,2.1,3.1] } };
    const unrelatedQuake = { id: 'unrelated', properties: { mag: 2.0, time: Date.now() - 2000, place: 'Far away' }, geometry: { coordinates: [10,20,30] } };


    it('Scenario 1: fetchActiveClusters returns data successfully', async () => {
      mockUseParams.mockReturnValue({ clusterId: oldFormatSlug });
      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        earthquakesLast72Hours: [sourceQuakeStrongest, sourceQuakeOther, unrelatedQuake], // Provide source quakes
      });

      const reconstructedClusterArray = [sourceQuakeStrongest, sourceQuakeOther];
      server.use(
        http.post('/api/calculate-clusters', async () => {
          console.log('[MSW Test Log] Scenario 1: /api/calculate-clusters hit');
          return HttpResponse.json({ clusters: [reconstructedClusterArray], cacheHit: 'true' });
        })
      );

      render(
        <MemoryRouter initialEntries={[`/cluster/${oldFormatSlug}`]}>
          <Routes>
            <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...defaultProps} />} />
          </Routes>
        </MemoryRouter>
      );

      await screen.findByText(`Cluster: ${oldFormatSlug}`);

      // We no longer check mockFetchActiveClusters directly.
      // The successful rendering of the modal with the cluster ID is the primary verification.
      // expect(mockFetchClusterDefinition).not.toHaveBeenCalled();
      const modal = screen.getByTestId('mock-cluster-detail-modal');
      expect(modal).toHaveTextContent(`Cluster: ${oldFormatSlug}`);
      // Further assertions on the `cluster` prop passed to ClusterDetailModal would require capturing its props.
      // For now, rendering with the ID is a good sign.
    });

    it('Scenario 2a: fetchActiveClusters fails, and fetchClusterDefinition also returns null', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockUseParams.mockReturnValue({ clusterId: oldFormatSlug });
      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        earthquakesLast72Hours: [sourceQuakeStrongest, sourceQuakeOther, unrelatedQuake],
      });

      server.use(
        http.post('/api/calculate-clusters', () => {
          console.log('[MSW Test Log] Scenario 2a: /api/calculate-clusters hit (expecting error)');
          return HttpResponse.error(); // Simulate fetchActiveClusters failure
        }),
        http.get('/api/cluster-definition', ({ request }) => {
          if (new URL(request.url).searchParams.get('id') === strongestQuakeIdInOldFormat) {
            console.log('[MSW Test Log] Scenario 2a: /api/cluster-definition hit (expecting 404)');
            return new HttpResponse(null, { status: 404 }); // Simulate fetchClusterDefinition returning null
          }
        })
      );

      render(
        <MemoryRouter initialEntries={[`/cluster/${oldFormatSlug}`]}>
          <Routes>
            <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...defaultProps} />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Cluster details could not be found or were incomplete.')).toBeInTheDocument();
      });
      // We no longer check mockFetchActiveClusters or mockFetchClusterDefinition directly.
      // The UI state and console warnings (if any related to the service calls themselves) become the verification points.
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Cluster reconstruction via fetchActiveClusters (old ID path) failed:"));
      consoleWarnSpy.mockRestore();
    });

    it('Scenario 2b: fetchActiveClusters fails, but fetchClusterDefinition succeeds', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockUseParams.mockReturnValue({ clusterId: oldFormatSlug });
      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        earthquakesLast72Hours: [sourceQuakeStrongest, sourceQuakeOther],
      });

      const d1ClusterDefinition = {
        clusterId: strongestQuakeIdInOldFormat,
        earthquakeIds: JSON.stringify([sourceQuakeStrongest.id, sourceQuakeOther.id]), // Ensure earthquakeIds is a string
        strongestQuakeId: sourceQuakeStrongest.id,
        updatedAt: Date.now().toString(), // Ensure updatedAt is a string if service expects it
        // Add other fields like title, description, locationName, maxMagnitude if your component uses them from D1
        title: "D1 Cluster Title",
        description: "D1 Cluster Description",
        locationName: "D1 Location",
        maxMagnitude: 4.5,
      };

      server.use(
        http.post('/api/calculate-clusters', () => {
          console.log('[MSW Test Log] Scenario 2b: /api/calculate-clusters hit (expecting error)');
          return HttpResponse.error(); // Simulate fetchActiveClusters failure
        }),
        http.get('/api/cluster-definition', ({ request }) => {
          if (new URL(request.url).searchParams.get('id') === strongestQuakeIdInOldFormat) {
            console.log('[MSW Test Log] Scenario 2b: /api/cluster-definition hit (expecting success)');
            return HttpResponse.json(d1ClusterDefinition); // Simulate fetchClusterDefinition success
          }
        })
      );

      render(
        <MemoryRouter initialEntries={[`/cluster/${oldFormatSlug}`]}>
          <Routes>
            <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...defaultProps} />} />
          </Routes>
        </MemoryRouter>
      );

      await screen.findByText(`Cluster: ${oldFormatSlug}`);
      // UI state and console warnings are primary verification points.
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Cluster reconstruction via fetchActiveClusters (old ID path) failed:"));
      const modal = screen.getByTestId('mock-cluster-detail-modal');
      expect(modal).toHaveTextContent(`Cluster: ${oldFormatSlug}`);
      consoleWarnSpy.mockRestore();
    });
  });
});
