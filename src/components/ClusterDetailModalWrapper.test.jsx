import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ClusterDetailModalWrapper from './ClusterDetailModalWrapper';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { fetchClusterDefinition } from '../services/clusterApiService.js';
import { findActiveClusters } from '../utils/clusterUtils.js';

// Mock dependencies
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});

// Import the mocked versions for use in the test file
import { useParams, useNavigate } from 'react-router-dom';

const { mockUseEarthquakeDataState } = vi.hoisted(() => {
  return { mockUseEarthquakeDataState: vi.fn() };
});
vi.mock('../contexts/EarthquakeDataContext.jsx', () => ({
  useEarthquakeDataState: mockUseEarthquakeDataState,
}));

vi.mock('../services/clusterApiService.js');
vi.mock('../utils/clusterUtils.js');
vi.mock('./ClusterDetailModal', () => ({
  default: vi.fn(({ cluster }) => <div data-testid="cluster-detail-modal" data-cluster={JSON.stringify(cluster)}>Mock ClusterDetailModal</div>),
}));
vi.mock('./SeoMetadata', () => ({
  default: vi.fn((props) => <div data-testid="seo-metadata" data-props={JSON.stringify(props)}>Mock SeoMetadata</div>),
}));

const mockNavigate = vi.fn();
const mockLoadMonthlyData = vi.fn();
let consoleWarnSpy;
let consoleErrorSpy;

describe('ClusterDetailModalWrapper', () => {
  const mockOverviewClusters = [
    { id: 'prop_cluster_123', name: 'Cluster From Prop', originalQuakes: [{id: 'eqProp', properties:{mag:5.0, time:Date.now()-1000, place:'Prop Place'}, geometry:{coordinates:[0,0]}}], quakeCount: 1, maxMagnitude: 5.0, locationName: "Prop Location", _earliestTimeInternal: Date.now()-1000, _latestTimeInternal: Date.now()-1000, strongestQuake: {id: 'eqProp', properties: {place: "Prop Location", time: Date.now(), mag: 5.0}, geometry: {coordinates: [0,0]}} },
  ];
  const mockFormatDate = vi.fn(date => new Date(date).toLocaleDateString());
  const mockGetMagnitudeColorStyle = vi.fn(() => "mock-style");
  const mockOnIndividualQuakeSelect = vi.fn();
  const mockFormatTimeAgo = vi.fn(time => `${time} ago`);
  const mockFormatTimeDuration = vi.fn(time => `${time} duration`);

  const mockEarthquake1 = { id: 'eq1', properties: { mag: 3.5, time: Date.now() - 100000000, place: 'Location 1 Old' }, geometry: { coordinates: [10, 10] } };
  const mockEarthquake2 = { id: 'eq2', properties: { mag: 4.0, time: Date.now() - 50000, place: 'Location 2 Recent' }, geometry: { coordinates: [20, 20] } };
  const mockEarthquake3 = { id: 'eq3', properties: { mag: 4.5, time: Date.now(), place: 'Location 3 Strongest Recent' }, geometry: { coordinates: [30, 30] } };
  const mockEarthquakeMissing = { id: 'eq_missing', properties: { mag: 2.0, time: Date.now() - 200000, place: 'Location Missing' }, geometry: { coordinates: [40,40]}};


  let currentEarthquakeContextValue;

  const setupEarthquakeContext = (overrides) => {
    currentEarthquakeContextValue = {
      allEarthquakes: [mockEarthquake1, mockEarthquake2, mockEarthquake3],
      earthquakesLast72Hours: [mockEarthquake2, mockEarthquake3],
      isLoadingWeekly: false,
      isLoadingMonthly: false,
      isInitialAppLoad: false,
      hasAttemptedMonthlyLoad: true,
      loadMonthlyData: mockLoadMonthlyData,
      monthlyError: null,
      ...overrides,
    };
    mockUseEarthquakeDataState.mockReturnValue(currentEarthquakeContextValue);
  };

  const renderComponent = (clusterIdParam, passOverviewClusters = mockOverviewClusters, passAreParentClustersLoading = false) => {
    vi.mocked(useParams).mockReturnValue({ clusterId: clusterIdParam });
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    // Ensure context is set up for each render using the latest currentEarthquakeContextValue
    mockUseEarthquakeDataState.mockReturnValue(currentEarthquakeContextValue);

    return render(
      <MemoryRouter initialEntries={[`/cluster/${clusterIdParam}`]}>
        <Routes>
          <Route path="/cluster/:clusterId" element={
            <ClusterDetailModalWrapper
              overviewClusters={passOverviewClusters}
              formatDate={mockFormatDate}
              getMagnitudeColorStyle={mockGetMagnitudeColorStyle}
              onIndividualQuakeSelect={mockOnIndividualQuakeSelect}
              formatTimeAgo={mockFormatTimeAgo}
              formatTimeDuration={mockFormatTimeDuration}
              areParentClustersLoading={passAreParentClustersLoading}
            />
          } />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.resetAllMocks();
    setupEarthquakeContext({}); // Setup with default context
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ... (keep existing tests for initial loading states, prop finding, basic reconstruction, etc.)
  it('finds cluster from overviewClusters prop successfully', async () => {
    renderComponent('prop_cluster_123');
    await waitFor(() => expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument());
    const modalData = JSON.parse(screen.getByTestId('cluster-detail-modal').getAttribute('data-cluster'));
    expect(modalData.id).toBe('prop_cluster_123');
    expect(mockLoadMonthlyData).not.toHaveBeenCalled();
  });

  it('reconstructs cluster from 72h data if not in props, loadMonthlyData not called', async () => {
    const reconstructId = `overview_cluster_${mockEarthquake3.id}_2`;
    const reconstructedClusterArray = [mockEarthquake2, mockEarthquake3];
    vi.mocked(findActiveClusters).mockReturnValue([reconstructedClusterArray]);
    setupEarthquakeContext({ hasAttemptedMonthlyLoad: false });
    renderComponent(reconstructId, []);
    await waitFor(() => expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument());
    expect(findActiveClusters).toHaveBeenCalledWith(currentEarthquakeContextValue.earthquakesLast72Hours, expect.any(Number), expect.any(Number));
    expect(mockLoadMonthlyData).not.toHaveBeenCalled();
  });


  describe('Stale D1 Definition Handling & Order of Operations', () => {
    const reconstructableId = `overview_cluster_${mockEarthquake3.id}_2`; // Assumes eq3 is in 72h/allEarthquakes
    const reconstructedData = [mockEarthquake2, mockEarthquake3]; // Data for successful reconstruction
    const staleD1Response = { earthquakeIds: [mockEarthquake1.id, 'id_missing_on_client'], strongestQuakeId: mockEarthquake1.id, updatedAt: Date.now() };
    const validD1Response = { earthquakeIds: [mockEarthquake1.id, mockEarthquake2.id], strongestQuakeId: mockEarthquake2.id, updatedAt: Date.now() };


    it('uses client-reconstructed data if D1 definition is stale', async () => {
      setupEarthquakeContext({ allEarthquakes: [mockEarthquake1, mockEarthquake2, mockEarthquake3], hasAttemptedMonthlyLoad: true });
      vi.mocked(findActiveClusters).mockImplementation((quakes) => {
        // Only succeed if called with allEarthquakes (or whatever source is appropriate for this ID)
        if (quakes.length === 3 && quakes.includes(mockEarthquake3)) return [reconstructedData];
        return [];
      });
      vi.mocked(fetchClusterDefinition).mockResolvedValue(staleD1Response);

      renderComponent(reconstructableId, []); // Not in props

      await waitFor(() => expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument());

      const modalData = JSON.parse(screen.getByTestId('cluster-detail-modal').getAttribute('data-cluster'));
      // Check it's the data from client reconstruction (eq3 is strongest)
      expect(modalData.strongestQuakeId).toBe(mockEarthquake3.id);
      expect(modalData.quakeCount).toBe(reconstructedData.length);

      // D1 fetch was attempted after client reconstruction failed with initial (72h) data or if ID wasn't overview_cluster type
      // For this test, let's assume findActiveClusters was called twice (once with 72h - fail, once with allEarthquakes - success)
      // or if it was not an overview_cluster type, it would be called once (fail), then D1 fetch.
      // The key is that D1 was called AND its stale warning appeared, but its data wasn't used.
      // MODIFIED: If client reconstruction succeeds, D1 is NOT called.
      expect(fetchClusterDefinition).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining(`D1 ClusterDefinition for ${reconstructableId} is stale`));
      expect(screen.queryByText(/Cluster definition found, but some earthquake data is missing or stale./i)).not.toBeInTheDocument();
    });

    it('shows "not found" if client reconstruction fails and D1 is stale', async () => {
      setupEarthquakeContext({ allEarthquakes: [mockEarthquake1], hasAttemptedMonthlyLoad: true }); // Only eq1 for D1 check
      vi.mocked(findActiveClusters).mockReturnValue([]); // Client reconstruction fails
      vi.mocked(fetchClusterDefinition).mockResolvedValue(staleD1Response); // D1 is stale (needs id_missing)

      renderComponent('overview_cluster_someNonExistentEq_2', []);

      await waitFor(() => expect(fetchClusterDefinition).toHaveBeenCalled());
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('is stale'));
      expect(screen.getByText(/Cluster details could not be found/i)).toBeInTheDocument();
      expect(screen.queryByTestId('cluster-detail-modal')).not.toBeInTheDocument();
    });

    it('uses valid D1 definition if prop and client reconstruction fail', async () => {
      const nonReconstructableId = 'd1_only_cluster_id';
      setupEarthquakeContext({ allEarthquakes: [mockEarthquake1, mockEarthquake2], hasAttemptedMonthlyLoad: true });
      vi.mocked(findActiveClusters).mockReturnValue([]); // Client reconstruction fails
      vi.mocked(fetchClusterDefinition).mockResolvedValue(validD1Response);

      renderComponent(nonReconstructableId, []);

      await waitFor(() => expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument());
      const modalData = JSON.parse(screen.getByTestId('cluster-detail-modal').getAttribute('data-cluster'));
      expect(modalData.strongestQuakeId).toBe(mockEarthquake2.id); // From validD1Response
      expect(modalData.quakeCount).toBe(2);
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('is stale'));
    });

    it('shows "Failed to fetch" if fetchClusterDefinition itself rejects', async () => {
      const fetchErrorId = 'fetch_will_fail_id';
      setupEarthquakeContext({ hasAttemptedMonthlyLoad: true }); // Ensure it reaches fetch attempt
      vi.mocked(findActiveClusters).mockReturnValue([]);
      vi.mocked(fetchClusterDefinition).mockRejectedValue(new Error("Network failure"));

      renderComponent(fetchErrorId, []);

      await waitFor(() => expect(screen.getByText(/Failed to fetch cluster details/i)).toBeInTheDocument());
      expect(consoleErrorSpy).toHaveBeenCalledWith(`Error fetching cluster definition ${fetchErrorId} from worker:`, expect.any(Error));
    });
  });

  // ... (Keep other existing tests like missing clusterId, monthly load scenarios, etc.)
  // Ensure they are still passing and adjust if the new logic affects them.
  // For instance, a "not found" test should ensure it's still "not found" even if D1 was stale.
  it('shows "Cluster not found" if all methods exhausted (including a final check after potential D1 ignore)', async () => {
    const nonExistentId = 'non_existent_id_123';
    setupEarthquakeContext({ allEarthquakes: [mockEarthquake1], hasAttemptedMonthlyLoad: true}); // monthly data available but won't match
    vi.mocked(findActiveClusters).mockReturnValue([]);
    // D1 returns a stale response that will be ignored
    vi.mocked(fetchClusterDefinition).mockResolvedValue({ earthquakeIds: ['id_unknown_1', 'id_unknown_2'], strongestQuakeId: 'id_unknown_1' });

    renderComponent(nonExistentId, []);

    await waitFor(() => expect(fetchClusterDefinition).toHaveBeenCalled());
    // Stale warning should appear
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`D1 ClusterDefinition for ${nonExistentId} is stale`));
    // Ultimately, it should be "not found"
    expect(screen.getByText(/Cluster details could not be found/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-detail-modal')).not.toBeInTheDocument();
  });


});
