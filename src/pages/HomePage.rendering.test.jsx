import React from 'react';
import { render, screen, waitFor } from '@testing-library/react'; // Added waitFor
import { MemoryRouter } from 'react-router-dom';
import { expect, describe, it, vi, beforeEach } from 'vitest';

// Mock child components
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
vi.mock('../components/ClusterSummaryItem', () => ({ default: (props) => <div data-testid={`mock-cluster-summary-item-${props.clusterData.id}`}>Mock ClusterSummaryItem</div> }));
vi.mock('../components/ClusterDetailModalWrapper', () => ({ default: () => <div data-testid="mock-cluster-detail-wrapper">Mock ClusterDetailModalWrapper</div> }));


import App from './HomePage'; // Retain App import

// Hoisted Mocks
const { mockUseEarthquakeDataState } = vi.hoisted(() => ({ mockUseEarthquakeDataState: vi.fn() }));
const { mockUseUIState } = vi.hoisted(() => ({ mockUseUIState: vi.fn() }));
const { mockFetchActiveClusters, mockRegisterClusterDefinition } = vi.hoisted(() => ({
  mockFetchActiveClusters: vi.fn(),
  mockRegisterClusterDefinition: vi.fn(),
}));

vi.mock('../contexts/EarthquakeDataContext.jsx', () => ({
  useEarthquakeDataState: mockUseEarthquakeDataState,
  EarthquakeDataProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('../contexts/UIStateContext.jsx', () => ({
  useUIState: mockUseUIState,
  UIStateProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('../services/clusterApiService.js', () => ({
  fetchActiveClusters: mockFetchActiveClusters,
  registerClusterDefinition: mockRegisterClusterDefinition,
}));

// Global Mocks
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe = vi.fn();unobserve = vi.fn();disconnect = vi.fn();
};
window.matchMedia = window.matchMedia || function() {
  return { matches: false, addListener: vi.fn(), removeListener: vi.fn() };
};

// Mock Data
const defaultEarthquakeData = {
  isLoadingDaily: false, isLoadingWeekly: false, isLoadingInitialData: false, error: null,
  dataFetchTime: Date.now(), lastUpdated: Date.now().toString(),
  earthquakesLastHour: [], earthquakesPriorHour: [], earthquakesLast24Hours: [],
  earthquakesLast72Hours: [], earthquakesLast7Days: [], prev24HourData: [],
  hasRecentTsunamiWarning: false, highestRecentAlert: null, activeAlertTriggeringQuakes: [],
  lastMajorQuake: null, currentLoadingMessage: '', isInitialAppLoad: true, // Set to true for initial render test
  isLoadingMonthly: false, hasAttemptedMonthlyLoad: false, monthlyError: null,
  allEarthquakes: [], earthquakesLast14Days: [], earthquakesLast30Days: [],
  prev7DayData: [], prev14DayData: [], loadMonthlyData: vi.fn(),
  feelableQuakes7Days_ctx: [], significantQuakes7Days_ctx: [],
  feelableQuakes30Days_ctx: [], significantQuakes30Days_ctx: [],
};
const defaultUIState = {
  activeSidebarView: 'overview_panel', setActiveSidebarView: vi.fn(),
  activeFeedPeriod: 'last_24_hours', globeFocusLng: 0, setGlobeFocusLng: vi.fn(),
  setFocusedNotableQuake: vi.fn(),
};

describe('HomePage Rendering and Basic UI', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData);
    mockUseUIState.mockReturnValue(defaultUIState);
    mockFetchActiveClusters.mockResolvedValue([]);
    mockRegisterClusterDefinition.mockResolvedValue(true);

    vi.mock('../assets/ne_110m_coastline.json', () => ({ default: { type: "FeatureCollection", features: [] }}));
    vi.mock('../assets/TectonicPlateBoundaries.json', () => ({ default: { type: "FeatureCollection", features: [] }}));
  });

  it('renders key child components when data is loaded', async () => { // Made async
    mockUseEarthquakeDataState.mockReturnValue({
      ...defaultEarthquakeData,
      isLoadingInitialData: false,
      isInitialAppLoad: false,
    });
    mockFetchActiveClusters.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-globe-view')).toBeInTheDocument();
      // Check other components once globe is confirmed
      expect(screen.getByTestId('mock-notable-quake-feature')).toBeInTheDocument();
      expect(screen.getByTestId('mock-prev-notable-quake-feature')).toBeInTheDocument();
      expect(screen.getByTestId('mock-timer')).toBeInTheDocument();
      expect(screen.getByTestId('mock-bottom-nav')).toBeInTheDocument();
      expect(screen.getByTestId('mock-time-since-banner')).toBeInTheDocument();
      expect(screen.getByTestId('mock-summary-stats')).toBeInTheDocument();
      expect(screen.getByTestId('mock-alert-display')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  describe('Accessibility', () => {
    it.todo('should have accessibility tests implemented for HomePage');
  });

  describe('Cluster Loading State Management', () => {
    it.todo('should have tests implemented for cluster loading states');
  });
});
