// src/components/ClusterDetailModalWrapper.test.jsx

// Import necessary testing utilities and the component
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest'; // Import vi from Vitest
import '@testing-library/jest-dom';
// Remove top-level import: import ClusterDetailModalWrapper from './ClusterDetailModalWrapper';

// Mock external dependencies
// Path to the actual service might be different
vi.mock('../services/clusterApiService.js', () => ({
  fetchClusterDefinition: vi.fn(),
}));
// Mock react-router-dom hooks
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // Import and retain default behavior
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});
// Mock context hook
vi.mock('../contexts/EarthquakeDataContext.jsx', () => ({
  useEarthquakeDataState: vi.fn(),
}));
// Mock child components to simplify testing the wrapper's logic
vi.mock('./ClusterDetailModal', () => ({
  default: () => <div data-testid="cluster-detail-modal">Mocked Modal</div>,
}));
vi.mock('./SeoMetadata', () => ({
  default: () => <div data-testid="seo-metadata">Mocked SEO</div>,
}));


describe('ClusterDetailModalWrapper Caching Logic', () => {
  let ClusterDetailModalWrapper; // Will hold the freshly imported component
  let fetchClusterDefinition;
  let useParams;
  let useEarthquakeDataState;
  let mockNavigate;

  // Stable mock functions for context, to prevent re-triggering effects due to new function references
  const stableFormatDate = vi.fn(date => new Date(date).toLocaleDateString());
  const stableFormatTimeAgo = vi.fn(ms => `${ms / 1000}s ago`);
  const stableFormatTimeDuration = vi.fn(ms => `${ms / 1000}s`);
  const stableGetMagnitudeColorStyle = vi.fn(() => ({ color: 'red' }));

  // Default mock data
  const mockClusterId = 'cluster123';
  const mockEarthquakeData = {
    earthquakeIds: ['eq1', 'eq2'],
    strongestQuakeId: 'eq2',
    updatedAt: new Date().toISOString(), // Ensure this matches expected structure if used
  };
  const mockSourceQuakes = [
    { id: 'eq1', properties: { time: Date.now() - 200000, mag: 3.0, place: 'Location A' }, geometry: { coordinates: [0,0] } },
    { id: 'eq2', properties: { time: Date.now() - 100000, mag: 4.5, place: 'Location B (Strongest)' }, geometry: { coordinates: [0,0] } },
  ];

  beforeEach(async () => { // Make beforeEach async for await vi.importActual
    // Reset modules to clear the module-level cache in ClusterDetailModalWrapper
    vi.resetModules();

    // Dynamically import the component after resetting modules to get a fresh module scope
    ClusterDetailModalWrapper = (await import('./ClusterDetailModalWrapper')).default;

    // Re-require mocks and the component after resetting modules

    // Modules with vi.mock at the top level are automatically mocked.
    // We need to get a reference to these mocks.
    const rrdMocks = await import('react-router-dom');
    useParams = rrdMocks.useParams;
    mockNavigate = rrdMocks.useNavigate; // This is already a vi.fn() due to the top-level mock
    mockNavigate.mockReset(); // Reset for the current test

    // For modules not fully mocked at the top (like services or contexts where we only mock specific functions)
    // or when we need the actual module structure with some parts mocked.
    // fetchClusterDefinition is mocked at the top level, so we get its mock reference.
    const clusterApiServiceMocks = await import('../services/clusterApiService.js');
    fetchClusterDefinition = clusterApiServiceMocks.fetchClusterDefinition;

    const earthquakeDataContextMocks = await import('../contexts/EarthquakeDataContext.jsx');
    useEarthquakeDataState = earthquakeDataContextMocks.useEarthquakeDataState;

    // Reset mock functions' state
    fetchClusterDefinition.mockReset(); // Already a vi.fn() from the top-level mock
    useParams.mockReset(); // Already a vi.fn() from the top-level mock
    useEarthquakeDataState.mockReset(); // Already a vi.fn() from the top-level mock

    // Default setup for hooks for each test
    useParams.mockReturnValue({ clusterId: mockClusterId });
    useEarthquakeDataState.mockReturnValue({
      allEarthquakes: mockSourceQuakes,
      earthquakesLast72Hours: mockSourceQuakes,
      isLoadingWeekly: false,
      isLoadingMonthly: false,
      isInitialAppLoad: false,
      hasAttemptedMonthlyLoad: true, // Set to true to use allEarthquakes
      formatDate: stableFormatDate,
      formatTimeAgo: stableFormatTimeAgo,
      formatTimeDuration: stableFormatTimeDuration,
      getMagnitudeColorStyle: stableGetMagnitudeColorStyle,
    });
  });

  afterEach(() => {
    vi.useRealTimers(); // Clean up Vitest fake timers
    vi.restoreAllMocks(); // Restore any spied-on objects
  });

  test('Test Case 1: Initial fetch, data is cached, and UI reflects fetched data', async () => {
    fetchClusterDefinition.mockResolvedValueOnce(JSON.parse(JSON.stringify(mockEarthquakeData)));

    render(<ClusterDetailModalWrapper overviewClusters={[]} />); // Pass necessary props

    await waitFor(() => {
      expect(fetchClusterDefinition).toHaveBeenCalledTimes(1);
      expect(fetchClusterDefinition).toHaveBeenCalledWith(mockClusterId);
    });

    await waitFor(() => {
        expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
        // Example: Check if location name from strongest quake is used by SEO/Modal
        // This requires SeoMetadata or ClusterDetailModal to render something identifiable
        // For now, presence of modal is the primary check.
    });
  });

  test('Test Case 2: Subsequent call for the same ID uses cached data (fetchClusterDefinition not called again)', async () => {
    fetchClusterDefinition.mockResolvedValueOnce(JSON.parse(JSON.stringify(mockEarthquakeData)));
    // Initial render to populate cache
    const { unmount } = render(<ClusterDetailModalWrapper overviewClusters={[]} />);
    await waitFor(() => expect(fetchClusterDefinition).toHaveBeenCalledTimes(1));

    unmount(); // Unmount the component

    fetchClusterDefinition.mockClear(); // Clear call count for the next check

    // Re-render (simulates navigating back or opening modal again)
    render(<ClusterDetailModalWrapper overviewClusters={[]} />);

    await waitFor(() => {
      expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    });
    // fetchClusterDefinition should NOT have been called again
    expect(fetchClusterDefinition).not.toHaveBeenCalled();
  });

  test('Test Case 3: Cache expires and data is re-fetched', async () => {
    vi.useFakeTimers();

    // Initial fetch
    fetchClusterDefinition.mockResolvedValueOnce(JSON.parse(JSON.stringify({...mockEarthquakeData, note: 'Initial Fetch'})));
    // CACHE_DURATION_MS is defined in the component module: 15 * 60 * 1000

    const { rerender, findByTestId } = render(<ClusterDetailModalWrapper overviewClusters={[]} />);
    await waitFor(() => expect(fetchClusterDefinition).toHaveBeenCalledTimes(1));
    expect(fetchClusterDefinition).toHaveBeenLastCalledWith(mockClusterId);
    await findByTestId('cluster-detail-modal'); // Ensure UI is stable

    // Clear mock *before* advancing timers to count the next call accurately
    fetchClusterDefinition.mockClear();
    fetchClusterDefinition.mockResolvedValueOnce(JSON.parse(JSON.stringify({...mockEarthquakeData, note: 'Re-fetched after expiry'})));

    // Advance time beyond cache duration
    act(() => {
      vi.advanceTimersByTime((15 * 60 * 1000) + 1000);
    });

    // Rerender. Pass a slightly different prop to ensure React processes the rerender.
    // This also helps if the effect depends on props that might not change if only state/context changes.
    rerender(<ClusterDetailModalWrapper overviewClusters={[{id: 'force-refresh-prop'}]} />);

    // fetchClusterDefinition should be called again (once for this new phase)
    await waitFor(() => expect(fetchClusterDefinition).toHaveBeenCalledTimes(1), { timeout: 4800 });
    expect(fetchClusterDefinition).toHaveBeenLastCalledWith(mockClusterId);

    await waitFor(() => {
        expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    }, { timeout: 4800 });

    vi.useRealTimers();
  });

  test('Test Case 4: Different cluster ID fetches new data (cache miss for new ID)', async () => {
    // Initial fetch for the first cluster ID
    fetchClusterDefinition.mockResolvedValueOnce(JSON.parse(JSON.stringify({...mockEarthquakeData, idForTest: mockClusterId})));
    useParams.mockReturnValue({ clusterId: mockClusterId }); // Set initial params
    const { rerender } = render(<ClusterDetailModalWrapper overviewClusters={[]} />);
    await waitFor(() => expect(fetchClusterDefinition).toHaveBeenCalledWith(mockClusterId));

    // Change params to a new cluster ID
    const newClusterId = 'cluster456';
    const newMockEarthquakeData = {
        earthquakeIds: ['eq3', 'eq4'],
        strongestQuakeId: 'eq4',
        updatedAt: new Date().toISOString(),
    };
    fetchClusterDefinition.mockResolvedValueOnce(JSON.parse(JSON.stringify({...newMockEarthquakeData, idForTest: newClusterId})));
    useParams.mockReturnValue({ clusterId: newClusterId }); // Update mock for useParams

    // Ensure sourceQuakes for the new cluster are available in the context
    const newSourceQuakes = [
      { id: 'eq3', properties: { time: Date.now() - 50000, mag: 2.0, place: 'Location C' }, geometry: { coordinates: [0,0] } },
      { id: 'eq4', properties: { time: Date.now() - 40000, mag: 2.5, place: 'Location D (Strongest New)' }, geometry: { coordinates: [0,0] } },
    ];
    useEarthquakeDataState.mockReturnValue({
      // Use stable functions from the outer scope
      allEarthquakes: newSourceQuakes,
      earthquakesLast72Hours: newSourceQuakes,
      isLoadingWeekly: false,
      isLoadingMonthly: false,
      isInitialAppLoad: false,
      hasAttemptedMonthlyLoad: true,
      formatDate: stableFormatDate,
      formatTimeAgo: stableFormatTimeAgo,
      formatTimeDuration: stableFormatTimeDuration,
      getMagnitudeColorStyle: stableGetMagnitudeColorStyle, // or a new one if it should be different
    });

    rerender(<ClusterDetailModalWrapper overviewClusters={[]} />); // Rerender with new params

    await waitFor(() => expect(fetchClusterDefinition).toHaveBeenCalledWith(newClusterId));
    // Total calls: 1 for mockClusterId, 1 for newClusterId.
    expect(fetchClusterDefinition).toHaveBeenCalledTimes(2);


    await waitFor(() => {
        expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    });
  });

  test('Cache is used if sourceQuakes are initially unavailable, then become available', async () => {
    fetchClusterDefinition.mockResolvedValueOnce(JSON.parse(JSON.stringify(mockEarthquakeData)));

    // Initial render with no source quakes - use stable references for arrays and the whole context object
    const initialEmptyAllEarthquakes = [];
    const initialEmptyLast72Hours = [];
    const initialContextValue = {
      allEarthquakes: initialEmptyAllEarthquakes,
      earthquakesLast72Hours: initialEmptyLast72Hours,
      isLoadingWeekly: false, isLoadingMonthly: false, isInitialAppLoad: false, hasAttemptedMonthlyLoad: true,
      formatDate: stableFormatDate, formatTimeAgo: stableFormatTimeAgo, formatTimeDuration: stableFormatTimeDuration, getMagnitudeColorStyle: stableGetMagnitudeColorStyle,
    };
    useEarthquakeDataState.mockReturnValueOnce(initialContextValue);

    const { rerender } = render(<ClusterDetailModalWrapper overviewClusters={[]} />);

    // Wait for the first fetch attempt
    await waitFor(() => expect(fetchClusterDefinition).toHaveBeenCalledWith(mockClusterId));
    // Capture how many times it was called in the initial phase
    const callsBeforeContextUpdate = fetchClusterDefinition.mock.calls.length;
    // At this point, data is cached, but processing failed. loadingPhase might be 'reconstruct_from_id_attempt'.
    // Modal might not be visible or in a specific state.

    // Now, simulate EarthquakeDataContext providing the sourceQuakes
    const updatedContextValue = { // Update context for subsequent renders
      allEarthquakes: mockSourceQuakes, earthquakesLast72Hours: mockSourceQuakes,
      isLoadingWeekly: false, isLoadingMonthly: false, isInitialAppLoad: false, hasAttemptedMonthlyLoad: true,
      formatDate: stableFormatDate,
      formatTimeAgo: stableFormatTimeAgo,
      formatTimeDuration: stableFormatTimeDuration,
      getMagnitudeColorStyle: stableGetMagnitudeColorStyle,
    };
    useEarthquakeDataState.mockReturnValue(updatedContextValue);

    rerender(<ClusterDetailModalWrapper overviewClusters={[]} />); // This re-render will cause useEffect to run again due to context change

    // Wait for UI to update (e.g., modal is now correctly displayed)
    await waitFor(() => {
      expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    });

    // fetchClusterDefinition should NOT have been called *additionally*. Total calls should be same as before context update.
    expect(fetchClusterDefinition).toHaveBeenCalledTimes(callsBeforeContextUpdate);
  });
});
