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
// Mock context directly to control its return value easily per test
const mockUseEarthquakeDataStateActual = vi.fn();
vi.mock('../contexts/EarthquakeDataContext.jsx', () => ({
  useEarthquakeDataState: mockUseEarthquakeDataStateActual,
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

describe('ClusterDetailModalWrapper', () => {
  const mockOverviewClusters = [
    { id: 'prop_cluster_123', name: 'Cluster From Prop', originalQuakes: [], quakeCount: 1, maxMagnitude: 5.0, locationName: "Prop Location", _earliestTimeInternal: Date.now(), _latestTimeInternal: Date.now(), strongestQuake: {id: 'eqProp', properties: {place: "Prop Location", time: Date.now(), mag: 5.0}, geometry: {coordinates: [0,0]}} },
  ];
  const mockFormatDate = vi.fn(date => new Date(date).toLocaleDateString());
  const mockGetMagnitudeColorStyle = vi.fn(() => "mock-style");
  const mockOnIndividualQuakeSelect = vi.fn();
  const mockFormatTimeAgo = vi.fn(time => `${time} ago`);
  const mockFormatTimeDuration = vi.fn(time => `${time} duration`);

  const mockEarthquake1 = { id: 'eq1', properties: { mag: 3.5, time: Date.now() - 100000000, place: 'Location 1 Old' }, geometry: { coordinates: [10, 10] } }; // Older quake
  const mockEarthquake2 = { id: 'eq2', properties: { mag: 4.0, time: Date.now() - 50000, place: 'Location 2 Recent' }, geometry: { coordinates: [20, 20] } };
  const mockEarthquake3 = { id: 'eq3', properties: { mag: 4.5, time: Date.now(), place: 'Location 3 Strongest Recent' }, geometry: { coordinates: [30, 30] } };

  let currentEarthquakeContext;

  const setupEarthquakeContext = (overrides) => {
    currentEarthquakeContext = {
      allEarthquakes: [mockEarthquake1, mockEarthquake2, mockEarthquake3], // Default to all for simplicity in some tests
      earthquakesLast72Hours: [mockEarthquake2, mockEarthquake3],
      isLoadingWeekly: false,
      isLoadingMonthly: false,
      isInitialAppLoad: false,
      hasAttemptedMonthlyLoad: true, // Default to true, override for specific tests
      loadMonthlyData: mockLoadMonthlyData,
      monthlyError: null,
      ...overrides,
    };
    vi.mocked(useEarthquakeDataState).mockReturnValue(currentEarthquakeContext);
  };

  const renderComponent = (clusterIdParam, currentOverviewClusters = mockOverviewClusters, currentAreParentClustersLoading = false) => {
    // Ensure context is set before each render if not explicitly overridden in test
    if (!vi.mocked(useEarthquakeDataState).getMock реализации()) { // Check if mock has implementation
        setupEarthquakeContext({}); // Setup with default if not set by test
    }
    vi.mocked(useParams).mockReturnValue({ clusterId: clusterIdParam });
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    return render(
      <MemoryRouter initialEntries={[`/cluster/${clusterIdParam}`]}>
        <Routes>
          <Route path="/cluster/:clusterId" element={
            <ClusterDetailModalWrapper
              overviewClusters={currentOverviewClusters}
              formatDate={mockFormatDate}
              getMagnitudeColorStyle={mockGetMagnitudeColorStyle}
              onIndividualQuakeSelect={mockOnIndividualQuakeSelect}
              formatTimeAgo={mockFormatTimeAgo}
              formatTimeDuration={mockFormatTimeDuration}
              areParentClustersLoading={currentAreParentClustersLoading}
            />
          } />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.resetAllMocks();
    // Set a default context for tests that don't override it
    setupEarthquakeContext({});
  });
  afterEach(() => {
    vi.restoreAllMocks(); // Ensure spies are restored if any were created
  });


  it('shows loading state if parent clusters are loading', async () => {
    setupEarthquakeContext({});
    renderComponent('some_id', [], true);
    expect(screen.getByText(/Loading Cluster Details/i)).toBeInTheDocument();
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Loading Cluster...'));
    expect(fetchClusterDefinition).not.toHaveBeenCalled();
    expect(findActiveClusters).not.toHaveBeenCalled();
  });

  it('shows loading state if context data is busy (monthly)', async () => {
    setupEarthquakeContext({ isLoadingMonthly: true, allEarthquakes: [] });
    renderComponent('some_id', [], false);
    expect(screen.getByText(/Loading Cluster Details/i)).toBeInTheDocument();
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Loading Cluster...'));
  });

  it('shows loading state if context data is busy (weekly/initial)', async () => {
    setupEarthquakeContext({ hasAttemptedMonthlyLoad: false, isLoadingWeekly: true, earthquakesLast72Hours: [] });
    renderComponent('some_id', [], false);
    expect(screen.getByText(/Loading Cluster Details/i)).toBeInTheDocument();
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Loading Cluster...'));
  });

  it('finds cluster from overviewClusters prop successfully and does not call loadMonthlyData', async () => {
    setupEarthquakeContext({}); // Default context
    renderComponent('prop_cluster_123');
    await waitFor(() => {
      expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('cluster-detail-modal');
    const modalData = JSON.parse(modal.getAttribute('data-cluster'));
    expect(modalData.id).toBe('prop_cluster_123');
    expect(fetchClusterDefinition).not.toHaveBeenCalled();
    expect(findActiveClusters).not.toHaveBeenCalled();
    expect(mockLoadMonthlyData).not.toHaveBeenCalled();
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Earthquake Cluster: Prop Location"'));
  });

  it('reconstructs cluster via findActiveClusters (using 72h data) and does not call loadMonthlyData', async () => {
    const reconstructId = `overview_cluster_${mockEarthquake3.id}_2`;
    const reconstructedClusterArray = [mockEarthquake2, mockEarthquake3]; // from 72h data
    vi.mocked(findActiveClusters).mockReturnValue([reconstructedClusterArray]);
    setupEarthquakeContext({ hasAttemptedMonthlyLoad: false }); // Ensure it uses 72h data first

    renderComponent(reconstructId, [], false);

    await waitFor(() => expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument());
    const modal = screen.getByTestId('cluster-detail-modal');
    const modalData = JSON.parse(modal.getAttribute('data-cluster'));
    expect(modalData.id).toBe(reconstructId);
    expect(findActiveClusters).toHaveBeenCalledWith(currentEarthquakeContext.earthquakesLast72Hours, expect.any(Number), expect.any(Number));
    expect(fetchClusterDefinition).not.toHaveBeenCalled();
    expect(mockLoadMonthlyData).not.toHaveBeenCalled();
  });

  describe('Monthly Data Loading Scenarios', () => {
    const oldClusterId = `overview_cluster_${mockEarthquake1.id}_1`; // eq1 is only in allEarthquakes (older)

    it('triggers loadMonthlyData, then finds cluster from allEarthquakes', async () => {
      // Initial state: monthly not loaded, 72h data doesn't have eq1
      setupEarthquakeContext({
        earthquakesLast72Hours: [mockEarthquake2, mockEarthquake3], // eq1 not here
        allEarthquakes: [], // Initially empty
        hasAttemptedMonthlyLoad: false,
        isLoadingMonthly: false,
        monthlyError: null,
      });
      vi.mocked(findActiveClusters).mockImplementation((quakes) => {
        if (quakes.includes(mockEarthquake1)) { // Should only find it when allEarthquakes is passed
          return [[mockEarthquake1]];
        }
        return [];
      });

      const { rerender } = renderComponent(oldClusterId, [], false);

      // Initial render: Should try with 72h, fail, then call loadMonthlyData
      await waitFor(() => expect(mockLoadMonthlyData).toHaveBeenCalledTimes(1));
      expect(screen.getByText(/Checking extended data/i)).toBeInTheDocument(); // Loading message updated

      // Simulate monthly data loading
      act(() => {
        setupEarthquakeContext({
          ...currentEarthquakeContext, // Keep other parts of context
          isLoadingMonthly: true,
          hasAttemptedMonthlyLoad: false, // Still false while loading
        });
      });
      // We need to re-trigger the effect in the component. In a real app, context changes do this.
      // Here, we can simulate it by re-rendering with the updated context.
      // However, the effect should re-run automatically when context values it depends on change.
      // Let's ensure internalIsLoading is true.
      expect(screen.getByText(/Checking extended data/i)).toBeInTheDocument();


      // Simulate monthly data loaded successfully
      act(() => {
        setupEarthquakeContext({
          earthquakesLast72Hours: [mockEarthquake2, mockEarthquake3], // Keep this as it was
          allEarthquakes: [mockEarthquake1, mockEarthquake2, mockEarthquake3], // Now includes eq1
          hasAttemptedMonthlyLoad: true,
          isLoadingMonthly: false,
          monthlyError: null,
          loadMonthlyData: currentEarthquakeContext.loadMonthlyData, // Preserve mock
        });
      });
      // Re-render with new context state to trigger useEffect again
      // In a real app, context consumers re-render automatically. In test, sometimes explicit re-render is clearer.
       rerender(
         <MemoryRouter initialEntries={[`/cluster/${oldClusterId}`]}>
           <Routes>
             <Route path="/cluster/:clusterId" element={
               <ClusterDetailModalWrapper
                 overviewClusters={[]}
                 formatDate={mockFormatDate}
                 getMagnitudeColorStyle={mockGetMagnitudeColorStyle}
                 onIndividualQuakeSelect={mockOnIndividualQuakeSelect}
                 formatTimeAgo={mockFormatTimeAgo}
                 formatTimeDuration={mockFormatTimeDuration}
                 areParentClustersLoading={false}
               />
             } />
           </Routes>
         </MemoryRouter>
       );

      await waitFor(() => expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument());
      const modal = screen.getByTestId('cluster-detail-modal');
      const modalData = JSON.parse(modal.getAttribute('data-cluster'));
      expect(modalData.id).toBe(oldClusterId);
      expect(modalData.strongestQuakeId).toBe(mockEarthquake1.id);
      // findActiveClusters would have been called twice: once with 72h, once with allEarthquakes
      expect(findActiveClusters).toHaveBeenCalledTimes(2);
      expect(findActiveClusters).toHaveBeenCalledWith(expect.arrayContaining([mockEarthquake1]), expect.any(Number), expect.any(Number));
    });

    it('triggers loadMonthlyData, then shows error if monthly load fails', async () => {
      setupEarthquakeContext({
        earthquakesLast72Hours: [mockEarthquake2, mockEarthquake3],
        allEarthquakes: [],
        hasAttemptedMonthlyLoad: false,
        isLoadingMonthly: false,
        monthlyError: null,
      });
      vi.mocked(findActiveClusters).mockReturnValue([]); // Assume it won't find it in 72h data

      const { rerender } = renderComponent(oldClusterId, [], false);

      await waitFor(() => expect(mockLoadMonthlyData).toHaveBeenCalledTimes(1));
      expect(screen.getByText(/Checking extended data/i)).toBeInTheDocument();

      act(() => {
        setupEarthquakeContext({
          ...currentEarthquakeContext,
          hasAttemptedMonthlyLoad: true,
          isLoadingMonthly: false,
          allEarthquakes: [], // Still empty
          monthlyError: "Failed to load 30-day data",
        });
      });
       rerender( // Re-render with new context state
         <MemoryRouter initialEntries={[`/cluster/${oldClusterId}`]}>
           <Routes><Route path="/cluster/:clusterId" element={<ClusterDetailModalWrapper overviewClusters={[]} formatDate={mockFormatDate} getMagnitudeColorStyle={mockGetMagnitudeColorStyle} onIndividualQuakeSelect={mockOnIndividualQuakeSelect} formatTimeAgo={mockFormatTimeAgo} formatTimeDuration={mockFormatTimeDuration} areParentClustersLoading={false} />} /></Routes>
         </MemoryRouter>
       );

      await waitFor(() => {
        expect(screen.getByText(/Failed to load extended data: Failed to load 30-day data/i)).toBeInTheDocument();
      });
      expect(screen.queryByTestId('cluster-detail-modal')).not.toBeInTheDocument();
    });
  });

  // ... (other existing tests like 'fetches cluster via fetchClusterDefinition', 'shows "Cluster not found"', etc.,
  // should be reviewed to ensure they correctly use the new context setup and don't unintentionally trigger monthly load
  // or correctly handle its outcome if they do.)

  it('fetches cluster via fetchClusterDefinition if other methods (including post-monthly) fail', async () => {
    const fetchId = 'fetched_cluster_789';
    const mockFetchedDefinition = { earthquakeIds: [mockEarthquake1.id], strongestQuakeId: mockEarthquake1.id, updatedAt: Date.now() };
    vi.mocked(fetchClusterDefinition).mockResolvedValue(mockFetchedDefinition);
    vi.mocked(findActiveClusters).mockReturnValue([]); // Ensure reconstruction fails with any data

    // Simulate that monthly data has been attempted and loaded (but didn't help find the cluster via reconstruction)
    setupEarthquakeContext({
        allEarthquakes: [mockEarthquake1, mockEarthquake2], // eq1 is available for fetch hydration
        earthquakesLast72Hours: [mockEarthquake2],
        hasAttemptedMonthlyLoad: true,
        isLoadingMonthly: false
    });

    renderComponent(fetchId, [], false);

    await waitFor(() => {
      expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('cluster-detail-modal');
    const modalData = JSON.parse(modal.getAttribute('data-cluster'));
    expect(modalData.id).toBe(fetchId);
    expect(modalData.strongestQuakeId).toBe(mockEarthquake1.id);
    expect(fetchClusterDefinition).toHaveBeenCalledWith(fetchId);
    expect(mockLoadMonthlyData).not.toHaveBeenCalled(); // Should not be called if hasAttemptedMonthlyLoad is true
  });

});
