import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MemoryRouter, Routes, Route } from 'react-router-dom'; // Import Routes and Route
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';

// Mock context hooks
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { useUIState } from '../contexts/UIStateContext.jsx';

// Mock services
import { fetchActiveClusters, registerClusterDefinition } from '../services/clusterApiService.js';

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

// Mock ClusterSummaryItem to inspect its props
const mockClusterSummaryItemData = [];
vi.mock('../components/ClusterSummaryItem', () => ({
  default: vi.fn((props) => {
    mockClusterSummaryItemData.push(props.clusterData);
    return <div data-testid={`mock-cluster-summary-item-${props.clusterData.id}`}>Mock ClusterSummaryItem</div>;
  }),
}));
// Mock ClusterDetailModalWrapper to inspect its props
const mockOverviewClustersPropCapture = vi.fn();
vi.mock('../components/ClusterDetailModalWrapper', () => ({
    default: vi.fn((props) => {
        mockOverviewClustersPropCapture(props.overviewClusters);
        return <div data-testid="mock-cluster-detail-wrapper">Mock ClusterDetailModalWrapper</div>;
    })
}));


import App from './HomePage';
import { MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants.js';

const mockUseEarthquakeDataState = vi.fn();
const mockUseUIState = vi.fn();
const mockFetchActiveClusters = vi.fn();
const mockRegisterClusterDefinition = vi.fn();

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

global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe = vi.fn();unobserve = vi.fn();disconnect = vi.fn();
};
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
    activeFeedPeriod: 'last_24_hours', globeFocusLng: 0, setGlobeFocusLng: vi.fn(),
    setFocusedNotableQuake: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData);
    mockUseUIState.mockReturnValue(defaultUIState);
    vi.mock('../assets/ne_110m_coastline.json', () => ({ default: { type: "FeatureCollection", features: [] }}));
    vi.mock('../assets/TectonicPlateBoundaries.json', () => ({ default: { type: "FeatureCollection", features: [] }}));
    mockClusterSummaryItemData.length = 0; // Clear captured data for each test
  });

  // ... (Accessibility and Cluster Loading State Management tests remain)
  describe('Accessibility', () => { /* ... existing tests ... */ });
  describe('Cluster Loading State Management', () => { /* ... existing tests ... */ });


  describe('overviewClusters Sorting and Filtering Logic', () => {
    const createMockQuake = (id, time, mag, place = 'Test Place') => ({
      id,
      properties: { time, mag, place },
      geometry: { coordinates: [0, 0, 0] },
    });

    // Times (most recent to oldest)
    const T_NOW = Date.now();
    const T_1_HOUR_AGO = T_NOW - 3600 * 1000;
    const T_2_HOURS_AGO = T_NOW - 2 * 3600 * 1000;
    const T_3_HOURS_AGO = T_NOW - 3 * 3600 * 1000;

    // Magnitudes
    const MAG_HIGH = MAJOR_QUAKE_THRESHOLD + 1.0; // e.g., 5.5
    const MAG_MEDIUM = MAJOR_QUAKE_THRESHOLD + 0.5; // e.g., 5.0
    const MAG_LOW_BUT_SIGNIFICANT = MAJOR_QUAKE_THRESHOLD; // e.g., 4.5
    const MAG_BELOW_THRESHOLD = MAJOR_QUAKE_THRESHOLD - 0.1; // e.g., 4.4

    const clusterA_Quakes = [createMockQuake('a1', T_3_HOURS_AGO, MAG_HIGH, "Cluster A Strongest")]; // Oldest, High Mag, 1 Quake
    const clusterB_Quakes = [createMockQuake('b1', T_1_HOUR_AGO, MAG_MEDIUM, "Cluster B Medium"), createMockQuake('b2', T_2_HOURS_AGO, MAG_LOW_BUT_SIGNIFICANT)]; // Recent, Medium Mag, 2 Quakes
    const clusterC_Quakes = [createMockQuake('c1', T_1_HOUR_AGO, MAG_HIGH, "Cluster C High"), createMockQuake('c2', T_2_HOURS_AGO, MAG_MEDIUM)]; // Recent (same as B), High Mag (higher than B), 2 Quakes
    const clusterD_Quakes = [createMockQuake('d1', T_1_HOUR_AGO, MAG_HIGH, "Cluster D High More Quakes"), createMockQuake('d2', T_1_HOUR_AGO - 1000, MAG_MEDIUM), createMockQuake('d3', T_2_HOURS_AGO, MAG_LOW_BUT_SIGNIFICANT)]; // Recent (same as B,C), High Mag (same as C), 3 Quakes (more than C)
    const clusterE_Filtered_Quakes = [createMockQuake('e1', T_NOW, MAG_BELOW_THRESHOLD, "Cluster E Filtered Out")]; // Most Recent, but Mag too low

    const mockActiveClustersInput = [
      clusterA_Quakes, // Expected: A (oldest, but high mag)
      clusterB_Quakes, // Expected: B (recent, medium mag)
      clusterC_Quakes, // Expected: C (recent, high mag)
      clusterD_Quakes, // Expected: D (recent, high mag, more quakes)
      clusterE_Filtered_Quakes, // Expected: E (filtered out)
    ];

    it('sorts overviewClusters by latest time, then magnitude, then count, and filters by MAJOR_QUAKE_THRESHOLD', async () => {
      // Mock fetchActiveClusters to return our specific input data
      mockFetchActiveClusters.mockResolvedValue(mockActiveClustersInput);
      // Ensure earthquakesLast7Days has some data to trigger the effect
      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        earthquakesLast7Days: [createMockQuake('dummy', T_NOW, MAG_HIGH)]
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      // Wait for fetchActiveClusters to be called and state to update
      await waitFor(() => expect(mockFetchActiveClusters).toHaveBeenCalled());
      // Wait for the overviewClusters memo to recompute and ClusterSummaryItems to render
      // The number of items should reflect filtering
      await waitFor(() => {
          const items = screen.queryAllByTestId(/mock-cluster-summary-item-/);
          // A, B, C, D should pass the threshold. E should be filtered.
          expect(items.length).toBe(4);
      });

      // Check the order of mockClusterSummaryItemData which captures props
      // Expected order: D, C, B, A (after filtering E)
      // D: T_1_HOUR_AGO, MAG_HIGH, 3 quakes (Strongest quake: d1) -> id: overview_cluster_d1_3
      // C: T_1_HOUR_AGO, MAG_HIGH, 2 quakes (Strongest quake: c1) -> id: overview_cluster_c1_2
      // B: T_1_HOUR_AGO, MAG_MEDIUM, 2 quakes (Strongest quake: b1) -> id: overview_cluster_b1_2
      // A: T_3_HOURS_AGO, MAG_HIGH, 1 quake (Strongest quake: a1) -> id: overview_cluster_a1_1

      expect(mockClusterSummaryItemData.length).toBe(4);
      expect(mockClusterSummaryItemData[0].id).toBe(`overview_cluster_d1_${clusterD_Quakes.length}`); // Cluster D
      expect(mockClusterSummaryItemData[1].id).toBe(`overview_cluster_c1_${clusterC_Quakes.length}`); // Cluster C
      expect(mockClusterSummaryItemData[2].id).toBe(`overview_cluster_b1_${clusterB_Quakes.length}`); // Cluster B
      expect(mockClusterSummaryItemData[3].id).toBe(`overview_cluster_a1_${clusterA_Quakes.length}`); // Cluster A

      // Verify all displayed clusters meet the magnitude threshold
      mockClusterSummaryItemData.forEach(cluster => {
        expect(cluster.maxMagnitude).toBeGreaterThanOrEqual(MAJOR_QUAKE_THRESHOLD);
      });
    });
  });

});
