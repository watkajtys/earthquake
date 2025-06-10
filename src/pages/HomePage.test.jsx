import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';

// Mock context hooks
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { useUIState } from '../contexts/UIStateContext.jsx';

// Mock services
import { fetchActiveClusters, registerClusterDefinition } from '../services/clusterApiService.js';

// Mock child components to simplify testing HomePage logic
vi.mock('../components/InteractiveGlobeView', () => ({
  default: vi.fn(({ activeClusters, areClustersLoading }) => (
    <div data-testid="mock-globe-view">
      <span data-testid="active-clusters-prop">{JSON.stringify(activeClusters)}</span>
      <span data-testid="are-clusters-loading-prop">{String(areClustersLoading)}</span>
    </div>
  )),
}));
vi.mock('../components/NotableQuakeFeature', () => ({ default: () => <div data-testid="mock-notable-quake-feature"></div> }));
vi.mock('../components/PreviousNotableQuakeFeature', () => ({ default: () => <div data-testid="mock-prev-notable-quake-feature"></div> }));
vi.mock('../components/GlobalLastMajorQuakeTimer', () => ({ default: () => <div data-testid="mock-timer"></div> }));
vi.mock('../components/BottomNav', () => ({ default: () => <div data-testid="mock-bottom-nav"></div> }));
vi.mock('../components/SeoMetadata', () => ({ default: () => null }));
vi.mock('../components/ErrorBoundary', () => ({ default: ({children}) => <>{children}</>}));
vi.mock('../components/TimeSinceLastMajorQuakeBanner', () => ({ default: () => <div data-testid="mock-time-since-banner"></div> }));
vi.mock('../components/SummaryStatisticsCard', () => ({ default: () => <div data-testid="mock-summary-stats"></div> }));
vi.mock('../components/AlertDisplay', () => ({ default: () => <div data-testid="mock-alert-display"></div> }));
vi.mock('../components/ClusterSummaryItem', () => ({default: () => <div data-testid="mock-cluster-summary-item"></div>}));


// Import the App component from HomePage.jsx
import App from './HomePage';

// Default mock implementations for context hooks
const mockUseEarthquakeDataState = vi.fn();
const mockUseUIState = vi.fn();

// Mock for fetchActiveClusters
const mockFetchActiveClusters = vi.fn();
const mockRegisterClusterDefinition = vi.fn();


vi.mock('../contexts/EarthquakeDataContext.jsx', () => ({
  useEarthquakeDataState: mockUseEarthquakeDataState,
  EarthquakeDataProvider: ({ children }) => <div>{children}</div> // Simple provider mock
}));

vi.mock('../contexts/UIStateContext.jsx', () => ({
  useUIState: mockUseUIState,
  UIStateProvider: ({ children }) => <div>{children}</div> // Simple provider mock
}));

vi.mock('../services/clusterApiService.js', () => ({
  fetchActiveClusters: mockFetchActiveClusters,
  registerClusterDefinition: mockRegisterClusterDefinition
}));


// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// Mock matchMedia
window.matchMedia = window.matchMedia || function() {
    return { matches: false, addListener: vi.fn(), removeListener: vi.fn() };
};

describe('HomePage (App Component)', () => {
  const defaultEarthquakeData = {
    isLoadingDaily: false, isLoadingWeekly: false, isLoadingInitialData: false, error: null,
    dataFetchTime: Date.now(), lastUpdated: Date.now().toString(),
    earthquakesLastHour: [], earthquakesPriorHour: [], earthquakesLast24Hours: [],
    earthquakesLast72Hours: [], earthquakesLast7Days: [], prev24HourData: [],
    hasRecentTsunamiWarning: false, highestRecentAlert: null, activeAlertTriggeringQuakes: [],
    lastMajorQuake: null, currentLoadingMessage: '', isInitialAppLoad: false,
    isLoadingMonthly: false, hasAttemptedMonthlyLoad: false, monthlyError: null,
    allEarthquakes: [], earthquakesLast14Days: [], earthquakesLast30Days: [],
    prev7DayData: [], prev14DayData: [], loadMonthlyData: vi.fn(),
    feelableQuakes7Days_ctx: [], significantQuakes7Days_ctx: [],
    feelableQuakes30Days_ctx: [], significantQuakes30Days_ctx: [],
  };

  const defaultUIState = {
    activeSidebarView: 'overview_panel', setActiveSidebarView: vi.fn(),
    activeFeedPeriod: 'last_24_hours',
    globeFocusLng: 0, setGlobeFocusLng: vi.fn(),
    setFocusedNotableQuake: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData);
    mockUseUIState.mockReturnValue(defaultUIState);
    // Mock dynamic imports for GeoJSON to prevent errors if not critical for test
    vi.mock('../assets/ne_110m_coastline.json', () => ({ default: { type: "FeatureCollection", features: [] }}));
    vi.mock('../assets/TectonicPlateBoundaries.json', () => ({ default: { type: "FeatureCollection", features: [] }}));
  });

  describe('Accessibility', () => {
    it('should have no axe violations on initial render', async () => {
      let container;
      await act(async () => {
        const { container: renderedContainer } = render(
          <MemoryRouter initialEntries={['/']}>
            <App />
          </MemoryRouter>
        );
        container = renderedContainer;
        await new Promise(resolve => setTimeout(resolve, 200)); // Allow time for initial effects & lazy loads
      });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    }, 10000);
  });

  describe('Cluster Loading State Management', () => {
    it('initial state: areClustersLoading is false, fetchActiveClusters not called', () => {
      mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, earthquakesLast7Days: null });
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );
      expect(screen.getByTestId('are-clusters-loading-prop').textContent).toBe('false');
      expect(mockFetchActiveClusters).not.toHaveBeenCalled();
      expect(screen.getByTestId('active-clusters-prop').textContent).toBe('[]');
    });

    it('fetch triggered: areClustersLoading true, fetchActiveClusters called', async () => {
      const mockQuakes = [{ id: 'eq1', properties: {}, geometry: {} }];
      mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, earthquakesLast7Days: mockQuakes });
      mockFetchActiveClusters.mockReturnValue(new Promise(() => {})); // Keep promise pending

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      // areClustersLoading should become true due to the useEffect dependency change
      // Need to wait for the useEffect to run and state to update
      await waitFor(() => {
        expect(screen.getByTestId('are-clusters-loading-prop').textContent).toBe('true');
      });
      expect(mockFetchActiveClusters).toHaveBeenCalledWith(mockQuakes, expect.any(Number), expect.any(Number));
    });

    it('fetch success: areClustersLoading false, calculatedClusters updated', async () => {
      const mockQuakes = [{ id: 'eq1', properties: {}, geometry: {} }];
      const mockClusterData = [{ clusterId: 'c1', quakes: [mockQuakes[0]] }];
      mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, earthquakesLast7Days: mockQuakes });
      mockFetchActiveClusters.mockResolvedValue(mockClusterData);

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('are-clusters-loading-prop').textContent).toBe('false');
      });
      expect(screen.getByTestId('active-clusters-prop').textContent).toBe(JSON.stringify(mockClusterData));
      expect(mockFetchActiveClusters).toHaveBeenCalledTimes(1);
    });

    it('fetch failure: areClustersLoading false, calculatedClusters empty', async () => {
      const mockQuakes = [{ id: 'eq1', properties: {}, geometry: {} }];
      mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, earthquakesLast7Days: mockQuakes });
      mockFetchActiveClusters.mockRejectedValue(new Error('API Error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress expected error

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('are-clusters-loading-prop').textContent).toBe('false');
      });
      expect(screen.getByTestId('active-clusters-prop').textContent).toBe('[]');
      expect(mockFetchActiveClusters).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching active clusters:", expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    it('no earthquakesLast7Days: fetch not called, areClustersLoading false, calculatedClusters empty', () => {
      mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, earthquakesLast7Days: [] }); // Empty array

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      expect(screen.getByTestId('are-clusters-loading-prop').textContent).toBe('false');
      expect(mockFetchActiveClusters).not.toHaveBeenCalled();
      expect(screen.getByTestId('active-clusters-prop').textContent).toBe('[]');

      // Test with null
       mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, earthquakesLast7Days: null });
       render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );
      expect(screen.getByTestId('are-clusters-loading-prop').textContent).toBe('false');
      expect(mockFetchActiveClusters).not.toHaveBeenCalled();
      expect(screen.getByTestId('active-clusters-prop').textContent).toBe('[]');
    });
  });
});
