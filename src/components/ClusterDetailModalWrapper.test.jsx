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
  default: vi.fn(({ cluster }) => (
    <div data-testid="mock-cluster-detail-modal">
      <p>Cluster ID: {cluster?.id}</p>
      <p>Location: {cluster?.locationName}</p>
      <p>Magnitude: M {cluster?.maxMagnitude?.toFixed(1)}</p>
      <p>Quake Count: {cluster?.quakeCount} Quakes</p>
    </div>
  )),
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

    // await screen.findByText(`Cluster: ${slug}`); // Old assertion based on previous mock
    // New assertions based on updated mock:
    await screen.findByText(`Cluster ID: ${slug}`);
    expect(screen.getByText(`Location: ${mockClusterFromProps.locationName}`)).toBeInTheDocument();
    expect(screen.getByText(`Magnitude: M ${mockClusterFromProps.maxMagnitude.toFixed(1)}`)).toBeInTheDocument();
    expect(screen.getByText(`Quake Count: ${mockClusterFromProps.quakeCount} Quakes`)).toBeInTheDocument();

    // With MSW, we don't check service mocks. Verification is via UI or other side effects.
    // expect(mockFetchClusterDefinition).not.toHaveBeenCalled();
    // expect(mockFetchActiveClusters).not.toHaveBeenCalled();
  });
});

  describe('Cluster Reconstruction with fetchActiveClusters (Old ID Format)', () => {
    const oldFormatSlug = 'overview_cluster_reconTargetID_someLocation';
    const strongestQuakeIdInOldFormat = 'reconTargetID';

    const now = Date.now();
    const sourceQuakeStrongest = { id: strongestQuakeIdInOldFormat, properties: { mag: 4.5, time: now, place: 'Recon Place' }, geometry: { coordinates: [1,2,3] } };
    const sourceQuakeOther = { id: 'otherInSource1', properties: { mag: 3.0, time: now - 1000, place: 'Recon Place' }, geometry: { coordinates: [1.1,2.1,3.1] } };
    const sourceQuakeAnother = { id: 'otherInSource2', properties: { mag: 2.5, time: now - 2000, place: 'Recon Place' }, geometry: { coordinates: [1.05,2.05,3.05] } }; // Meets CLUSTER_MIN_QUAKES = 3
    const unrelatedQuake = { id: 'unrelated', properties: { mag: 2.0, time: now - 3000, place: 'Far away' }, geometry: { coordinates: [10,20,30] } };

    const sourceQuakesForReconScenarios = [sourceQuakeStrongest, sourceQuakeOther, sourceQuakeAnother, unrelatedQuake];

    // For assertion clarity, based on the reconstructed cluster from sourceQuakeStrongest, sourceQuakeOther, sourceQuakeAnother
    const mockReconstructedClusterForAssertion = {
      id: oldFormatSlug,
      locationName: sourceQuakeStrongest.properties.place, // "Recon Place"
      maxMagnitude: sourceQuakeStrongest.properties.mag,   // 4.5
      quakeCount: 3, // Based on the three relevant quakes
    };


    it('Scenario 1: fetchActiveClusters returns data successfully', async () => {
      mockUseParams.mockReturnValue({ clusterId: oldFormatSlug });
      const scenario1SourceQuakes = [sourceQuakeStrongest, sourceQuakeOther, sourceQuakeAnother]; // Ensure enough quakes for this mock

      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        earthquakesLast72Hours: scenario1SourceQuakes,
      });

      const quakeFeaturesForCluster = [sourceQuakeStrongest, sourceQuakeOther, sourceQuakeAnother];
      const mockApiClusterData = [quakeFeaturesForCluster];

      server.use(
        http.post('/api/calculate-clusters', async () => {
          console.log('[MSW Test Log] Scenario 1: /api/calculate-clusters hit');
          return HttpResponse.json(mockApiClusterData, { headers: { 'X-Cache-Hit': 'true' } });
        })
      );

      render(
        <MemoryRouter initialEntries={[`/cluster/${oldFormatSlug}`]}>
          <Routes>
            <Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper {...defaultProps} />} />
          </Routes>
        </MemoryRouter>
      );

      // Assertions based on the updated mock modal
      await screen.findByText(`Location: ${mockReconstructedClusterForAssertion.locationName}`, {}, { timeout: 3000 });
      expect(screen.getByText(`Cluster ID: ${oldFormatSlug}`)).toBeInTheDocument();
      expect(screen.getByText(`Magnitude: M ${mockReconstructedClusterForAssertion.maxMagnitude.toFixed(1)}`)).toBeInTheDocument();
      expect(screen.getByText(`Quake Count: ${mockReconstructedClusterForAssertion.quakeCount} Quakes`)).toBeInTheDocument();
    });

    it('Scenario 2a: fetchActiveClusters (client-side) succeeds; D1 lookup (mocked to fail) should not be reached for old IDs', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUseParams.mockReturnValue({ clusterId: oldFormatSlug });

      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        earthquakesLast72Hours: sourceQuakesForReconScenarios,
        hasAttemptedMonthlyLoad: true,
      });

      server.use(
        http.post('/api/calculate-clusters', async () => {
          console.log('[MSW Test Log] Scenario 2a: /api/calculate-clusters hit (X-Cache-Hit: false, client recon success)');
          return HttpResponse.json([], { headers: { 'X-Cache-Hit': 'false' } });
        }),
        http.get('/api/cluster-definition', ({ request }) => {
          if (new URL(request.url).searchParams.get('id') === strongestQuakeIdInOldFormat) {
            console.error('[MSW Test Log ERROR] Scenario 2a: /api/cluster-definition was called (SHOULD NOT HAPPEN)');
            return new HttpResponse(null, { status: 404 });
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

      await screen.findByText(`Location: ${mockReconstructedClusterForAssertion.locationName}`);
      expect(screen.getByText(`Cluster ID: ${oldFormatSlug}`)).toBeInTheDocument();
      expect(screen.getByText(`Magnitude: M ${mockReconstructedClusterForAssertion.maxMagnitude.toFixed(1)}`)).toBeInTheDocument();
      expect(screen.getByText(`Quake Count: ${mockReconstructedClusterForAssertion.quakeCount} Quakes`)).toBeInTheDocument();

      expect(screen.queryByText('Cluster definition not found in D1.')).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('[MSW Test Log ERROR] Scenario 2a: /api/cluster-definition was called'));

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('Scenario 2b: fetchActiveClusters (client-side) succeeds; D1 lookup (mocked to succeed) should not be reached for old IDs', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUseParams.mockReturnValue({ clusterId: oldFormatSlug });

      const d1ClusterDefinition = {
        clusterId: strongestQuakeIdInOldFormat,
        earthquakeIds: JSON.stringify([sourceQuakeStrongest.id, sourceQuakeOther.id, sourceQuakeAnother.id]),
        strongestQuakeId: sourceQuakeStrongest.id,
        updatedAt: Date.now().toString(),
        title: "D1 Should Not Be Used Title",
        description: "D1 Should Not Be Used Description",
        locationName: "D1 Should Not Be Used Location",
        maxMagnitude: 1.0,
      };

      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        earthquakesLast72Hours: sourceQuakesForReconScenarios,
        hasAttemptedMonthlyLoad: true,
      });

      server.use(
        http.post('/api/calculate-clusters', async () => {
          console.log('[MSW Test Log] Scenario 2b: /api/calculate-clusters hit (X-Cache-Hit: false, client recon success)');
          return HttpResponse.json([], { headers: { 'X-Cache-Hit': 'false' } });
        }),
        http.get('/api/cluster-definition', ({ request }) => {
          if (new URL(request.url).searchParams.get('id') === strongestQuakeIdInOldFormat) {
            console.error('[MSW Test Log ERROR] Scenario 2b: /api/cluster-definition was called (SHOULD NOT HAPPEN)');
            return HttpResponse.json(d1ClusterDefinition);
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

      await screen.findByText(`Location: ${mockReconstructedClusterForAssertion.locationName}`);
      expect(screen.getByText(`Cluster ID: ${oldFormatSlug}`)).toBeInTheDocument();
      expect(screen.getByText(`Magnitude: M ${mockReconstructedClusterForAssertion.maxMagnitude.toFixed(1)}`)).toBeInTheDocument();
      expect(screen.getByText(`Quake Count: ${mockReconstructedClusterForAssertion.quakeCount} Quakes`)).toBeInTheDocument();

      expect(screen.queryByText(d1ClusterDefinition.locationName)).toBeNull(); // Should not see D1 data
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('[MSW Test Log ERROR] Scenario 2b: /api/cluster-definition was called'));

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
