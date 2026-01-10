import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, describe, it, vi, beforeEach } from 'vitest';

// Mock child components needed for context or structure, but not under direct test
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
    return (
      <div
        data-testid={`mock-cluster-summary-item-${props.clusterData.id}`}
        onClick={() => {
          if (props.onClusterSelect) {
            props.onClusterSelect(props.clusterData);
          }
        }}
        role="button"
        tabIndex={0}
      >
        Mock ClusterSummaryItem for {props.clusterData.id}
      </div>
    );
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

// Hoisted Mocks
const { mockUseEarthquakeDataState } = vi.hoisted(() => ({ mockUseEarthquakeDataState: vi.fn() }));
const { mockUseUIState } = vi.hoisted(() => ({ mockUseUIState: vi.fn() }));
const { mockFetchActiveClusters, mockRegisterClusterDefinition } = vi.hoisted(() => ({
  mockFetchActiveClusters: vi.fn(),
  mockRegisterClusterDefinition: vi.fn(),
}));
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));


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
vi.mock('react-router-dom', async (importOriginal) => {
  const originalModules = await importOriginal();
  return {
    ...originalModules,
    useNavigate: () => mockNavigate,
    // No need to mock useParams if not used by HomePage directly for cluster logic
  };
});

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

// Helper to create mock quakes easily (scoped for this file)
const createMockQuakeInternal = (id, time, mag, place = 'Test Place') => ({
  id,
  properties: { time, mag, place, alert: null, sig: 0 },
  geometry: { coordinates: [0, 0, 0] },
});


describe('HomePage Cluster Logic', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseEarthquakeDataState.mockReturnValue(defaultEarthquakeData);
    mockUseUIState.mockReturnValue(defaultUIState);
    mockFetchActiveClusters.mockResolvedValue([]);
    mockRegisterClusterDefinition.mockResolvedValue(true);

    vi.mock('../assets/ne_110m_coastline.json', () => ({ default: { type: "FeatureCollection", features: [] }}));
    vi.mock('../assets/TectonicPlateBoundaries.json', () => ({ default: { type: "FeatureCollection", features: [] }}));
    mockClusterSummaryItemData.length = 0;
    mockOverviewClustersPropCapture.mockClear();
  });

  describe('overviewClusters Sorting and Filtering Logic', () => {
    const T_NOW = 100000000;
    const T_1_HOUR_AGO = T_NOW - 3600;
    const T_2_HOURS_AGO = T_NOW - 7200;
    const T_3_HOURS_AGO = T_NOW - 10800;

    const MAG_HIGH = MAJOR_QUAKE_THRESHOLD + 1.0;
    const MAG_MEDIUM = MAJOR_QUAKE_THRESHOLD + 0.5;
    const MAG_LOW_BUT_SIGNIFICANT = MAJOR_QUAKE_THRESHOLD;
    const MAG_BELOW_THRESHOLD = MAJOR_QUAKE_THRESHOLD - 0.1;

    // NEW: Mock data is now an array of cluster definition objects, not raw quakes
    const mockClusterDefinitions = [
      { id: 'cluster-a', locationName: "Cluster A", quakeCount: 1, maxMagnitude: MAG_HIGH, startTime: T_3_HOURS_AGO, endTime: T_3_HOURS_AGO, strongestQuakeId: 'a1', earthquakeIds: ['a1'] },
      { id: 'cluster-b', locationName: "Cluster B", quakeCount: 2, maxMagnitude: MAG_MEDIUM, startTime: T_2_HOURS_AGO, endTime: T_1_HOUR_AGO, strongestQuakeId: 'b1', earthquakeIds: ['b1', 'b2'] },
      { id: 'cluster-c', locationName: "Cluster C", quakeCount: 2, maxMagnitude: MAG_HIGH, startTime: T_2_HOURS_AGO, endTime: T_1_HOUR_AGO, strongestQuakeId: 'c1', earthquakeIds: ['c1', 'c2'] },
      { id: 'cluster-d', locationName: "Cluster D", quakeCount: 3, maxMagnitude: MAG_HIGH, startTime: T_2_HOURS_AGO, endTime: T_1_HOUR_AGO, strongestQuakeId: 'd1', earthquakeIds: ['d1', 'd2', 'd3'] },
      { id: 'cluster-e', locationName: "Cluster E", quakeCount: 1, maxMagnitude: MAG_BELOW_THRESHOLD, startTime: T_NOW, endTime: T_NOW, strongestQuakeId: 'e1', earthquakeIds: ['e1'] },
    ];

    it('sorts overviewClusters by latest time, then magnitude, then count, and filters by MAJOR_QUAKE_THRESHOLD', async () => {
      mockFetchActiveClusters.mockResolvedValue(mockClusterDefinitions); // Use new mock data
      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        // No need for dummy earthquake data here unless other components need it
        isLoadingInitialData: false, isInitialAppLoad: false,
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => expect(mockFetchActiveClusters).toHaveBeenCalled());
      await waitFor(() => {
          const items = screen.queryAllByTestId(/mock-cluster-summary-item-/);
          // Cluster E should be filtered out (mag below threshold)
          expect(items.length).toBe(4);
      });

      // Assert on the props passed to the mocked ClusterSummaryItem
      expect(mockClusterSummaryItemData.length).toBe(4);
      // Expected order: D, C, B, A based on sorting logic
      expect(mockClusterSummaryItemData[0].id).toBe('cluster-d');
      expect(mockClusterSummaryItemData[1].id).toBe('cluster-c');
      expect(mockClusterSummaryItemData[2].id).toBe('cluster-b');
      expect(mockClusterSummaryItemData[3].id).toBe('cluster-a');

      // Verify all rendered clusters meet the magnitude threshold
      mockClusterSummaryItemData.forEach(cluster => {
        expect(cluster.maxMagnitude).toBeGreaterThanOrEqual(MAJOR_QUAKE_THRESHOLD);
      });
    });
  });

  describe('handleClusterSummaryClick URL Generation', () => {
    const testCases = [
      {
        description: 'Basic valid input',
        clusterDataInput: { id: 'cluster1', quakeCount: 15, locationName: "Southern Sumatra, Indonesia", maxMagnitude: 5.8, strongestQuakeId: "us7000mfp9" },
        expectedUrl: "/cluster/15-quakes-near-southern-sumatra-indonesia-up-to-m5.8-us7000mfp9"
      },
      {
        description: 'Location name with extra spaces and mixed case, magnitude rounding',
        clusterDataInput: { id: 'cluster2', quakeCount: 5, locationName: "  Test  Location  ", maxMagnitude: 4.5, strongestQuakeId: "test123xyz" },
        expectedUrl: "/cluster/5-quakes-near-test-location-up-to-m4.5-test123xyz"
      },
      {
        description: 'Location name with special characters',
        clusterDataInput: { id: 'cluster3', quakeCount: 10, locationName: "North Island, N.Z.!", maxMagnitude: 6.0, strongestQuakeId: "nz2024abc" },
        expectedUrl: "/cluster/10-quakes-near-north-island-nz-up-to-m6.0-nz2024abc"
      },
      {
        description: 'Location name resulting in multiple hyphens (condensed by regex s+)',
        clusterDataInput: { id: 'cluster4', quakeCount: 3, locationName: "Region --- Sub-region", maxMagnitude: 4.6, strongestQuakeId: "regsub1" },
        expectedUrl: "/cluster/3-quakes-near-region-sub-region-up-to-m4.6-regsub1"
      },
      {
        description: 'Location name with multiple hyphens that should be preserved',
        clusterDataInput: { id: 'cluster5', quakeCount: 2, locationName: "Test-Location-With-Hyphens", maxMagnitude: 4.7, strongestQuakeId: "testhyphen" },
        expectedUrl: "/cluster/2-quakes-near-test-location-with-hyphens-up-to-m4.7-testhyphen"
      },
      {
        description: 'Empty locationName',
        clusterDataInput: { id: 'cluster6', quakeCount: 1, locationName: "", maxMagnitude: 4.8, strongestQuakeId: "unknownloc1" },
        expectedUrl: "/cluster/1-quakes-near-unknown-location-up-to-m4.8-unknownloc1"
      },
    ];

    testCases.forEach(({ description, clusterDataInput, expectedUrl }) => {
      it(`should generate correct URL for: ${description}`, async () => {
        // Create a mock cluster definition object from the test case input
        const mockClusterDefinition = {
          ...clusterDataInput,
          // Add other required properties for the definition object
          startTime: Date.now() - 10000,
          endTime: Date.now(),
          earthquakeIds: Array.from({ length: clusterDataInput.quakeCount }, (_, i) => i === 0 ? clusterDataInput.strongestQuakeId : `dummy${i}`),
        };

        // Mock the API to return this single cluster definition
        mockFetchActiveClusters.mockResolvedValue([mockClusterDefinition]);

        mockUseEarthquakeDataState.mockReturnValue({
          ...defaultEarthquakeData,
          isLoadingInitialData: false, isInitialAppLoad: false,
        });
        mockUseUIState.mockReturnValue(defaultUIState);

        render(
          <MemoryRouter initialEntries={['/']}>
            <App />
          </MemoryRouter>
        );

        // Find the cluster item using its stable ID
        const expectedTestId = `mock-cluster-summary-item-${clusterDataInput.id}`;
        const clusterItem = await screen.findByTestId(expectedTestId, {}, { timeout: 3000 });

        act(() => {
          clusterItem.click();
        });

        expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
      });
    });
  });
});
