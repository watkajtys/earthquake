import React from 'react';
import { render, act, screen, waitFor, fireEvent } from '@testing-library/react';
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
      <button
        type="button"
        data-testid={`mock-cluster-summary-item-${props.clusterData.id}`}
        onClick={() => {
          if (props.onClusterSelect) {
            props.onClusterSelect(props.clusterData);
          }
        }}
      >
        Mock ClusterSummaryItem for {props.clusterData.id}
      </button>
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
    // This helper is specific to this describe block, can be defined here or outside if shared more widely
    const createMockQuake = (id, time, mag, place = 'Test Place') => ({
      id,
      properties: { time, mag, place },
      geometry: { coordinates: [0, 0, 0] },
    });

    const T_NOW = 100000000;
    const T_1_HOUR_AGO = T_NOW - 3600;
    const T_2_HOURS_AGO = T_NOW - 7200;
    const T_3_HOURS_AGO = T_NOW - 10800;

    const MAG_HIGH = MAJOR_QUAKE_THRESHOLD + 1.0;
    const MAG_MEDIUM = MAJOR_QUAKE_THRESHOLD + 0.5;
    const MAG_LOW_BUT_SIGNIFICANT = MAJOR_QUAKE_THRESHOLD;
    const MAG_BELOW_THRESHOLD = MAJOR_QUAKE_THRESHOLD - 0.1;

    const clusterA_Quakes = [createMockQuake('a1', T_3_HOURS_AGO, MAG_HIGH, "Cluster A Strongest")];
    const clusterB_Quakes = [createMockQuake('b1', T_1_HOUR_AGO, MAG_MEDIUM, "Cluster B Medium"), createMockQuake('b2', T_2_HOURS_AGO, MAG_LOW_BUT_SIGNIFICANT)];
    const clusterC_Quakes = [createMockQuake('c1', T_1_HOUR_AGO, MAG_HIGH, "Cluster C High"), createMockQuake('c2', T_2_HOURS_AGO, MAG_MEDIUM)];
    const clusterD_Quakes = [createMockQuake('d1', T_1_HOUR_AGO, MAG_HIGH, "Cluster D High More Quakes"), createMockQuake('d2', T_1_HOUR_AGO - 1000, MAG_MEDIUM), createMockQuake('d3', T_2_HOURS_AGO, MAG_LOW_BUT_SIGNIFICANT)];
    const clusterE_Filtered_Quakes = [createMockQuake('e1', T_NOW, MAG_BELOW_THRESHOLD, "Cluster E Filtered Out")];

    const allQuakesForTest = [
        ...clusterA_Quakes, ...clusterB_Quakes, ...clusterC_Quakes,
        ...clusterD_Quakes, ...clusterE_Filtered_Quakes,
    ];

    const mockClusterSummaries = [
      { id: "stored-a", maxMagnitude: MAG_HIGH, endTime: T_3_HOURS_AGO, startTime: T_3_HOURS_AGO, quakeCount: 1, earthquakeIds: JSON.stringify(clusterA_Quakes.map(q => q.id)) },
      { id: "stored-b", maxMagnitude: MAG_MEDIUM, endTime: T_1_HOUR_AGO, startTime: T_3_HOURS_AGO, quakeCount: 2, earthquakeIds: JSON.stringify(clusterB_Quakes.map(q => q.id)) },
      { id: "stored-c", maxMagnitude: MAG_HIGH, endTime: T_1_HOUR_AGO, startTime: T_3_HOURS_AGO, quakeCount: 2, earthquakeIds: JSON.stringify(clusterC_Quakes.map(q => q.id)) },
      { id: "stored-d", maxMagnitude: MAG_HIGH, endTime: T_1_HOUR_AGO, startTime: T_3_HOURS_AGO, quakeCount: 3, earthquakeIds: JSON.stringify(clusterD_Quakes.map(q => q.id)) },
      { id: "stored-e", maxMagnitude: MAG_BELOW_THRESHOLD, endTime: T_NOW, startTime: T_3_HOURS_AGO, quakeCount: 1, earthquakeIds: JSON.stringify(clusterE_Filtered_Quakes.map(q => q.id)) },
    ];


    it('sorts overviewClusters by latest time, then magnitude, then count, and filters by MAJOR_QUAKE_THRESHOLD', async () => {
      mockFetchActiveClusters.mockResolvedValue(mockClusterSummaries);
      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        allEarthquakes: allQuakesForTest, // Unrelated feed data must not determine stored summaries
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
          expect(items.length).toBe(4);
      });

      expect(mockClusterSummaryItemData.length).toBe(4);
      expect(mockClusterSummaryItemData[0].id).toBe("stored-d");
      expect(mockClusterSummaryItemData[1].id).toBe("stored-c");
      expect(mockClusterSummaryItemData[2].id).toBe("stored-b");
      expect(mockClusterSummaryItemData[3].id).toBe("stored-a");

      mockClusterSummaryItemData.forEach(cluster => {
        expect(cluster.maxMagnitude).toBeGreaterThanOrEqual(MAJOR_QUAKE_THRESHOLD);
      });
    });
  });

  it('preserves the full stored summary through empty, weekly and monthly feeds without the strongest event', async () => {
    const now = Date.now();
    const definition = { id: 'stored-id', slug: 'stored-slug', locationName: 'Stored location', quakeCount: 53,
      maxMagnitude: 6.3, startTime: now - 25 * 86400000, endTime: now - 7200000, strongestQuakeId: 'absent-anchor',
      earthquakeIds: 'deliberately invalid membership: summaries must not read it' };
    mockFetchActiveClusters.mockResolvedValue([definition]);
    const ui = <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>;
    const { rerender } = render(ui);
    await screen.findByTestId('mock-cluster-summary-item-stored-id');
    const first = mockClusterSummaryItemData.at(-1);
    expect(first).toMatchObject({ id: definition.id, slug: definition.slug, locationName: definition.locationName,
      quakeCount: 53, maxMagnitude: 6.3, startTime: definition.startTime, endTime: definition.endTime, strongestQuakeId: 'absent-anchor' });
    expect(first).not.toHaveProperty('originalQuakes');
    const weekly = [createMockQuakeInternal('weekly1', now, 9, 'Different feed location')];
    mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, earthquakesLast7Days: weekly });
    rerender(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(mockClusterSummaryItemData.at(-1)).toBe(first);
    mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, earthquakesLast7Days: weekly,
      allEarthquakes: [...weekly, createMockQuakeInternal('monthly1', now - 20 * 86400000, 8)], monthlyHasLoaded: true, hasAttemptedMonthlyLoad: true });
    rerender(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(mockClusterSummaryItemData.at(-1)).toBe(first);
    expect(defaultEarthquakeData.loadMonthlyData).not.toHaveBeenCalled();
  });

  it('renders only twenty cards at once and exposes the final page without fetching members', async () => {
    mockFetchActiveClusters.mockResolvedValue(Array.from({ length: 45 }, (_, index) => ({
      id: `stored-${String(index).padStart(2, '0')}`, maxMagnitude: 6, quakeCount: 100, startTime: 1, endTime: 2,
    })));
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    await screen.findByText('Showing 1–20 of 45 clusters');
    expect(screen.getAllByTestId(/mock-cluster-summary-item-/)).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Next clusters' }));
    expect(screen.getByText('Showing 21–40 of 45 clusters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next clusters' }));
    expect(screen.getAllByTestId(/mock-cluster-summary-item-/)).toHaveLength(5);
    expect(screen.getByText('Showing 41–45 of 45 clusters')).toBeInTheDocument();
    expect(mockFetchActiveClusters).toHaveBeenCalledTimes(1);
  });

  describe('handleClusterSummaryClick URL Generation', () => {
    // createMockQuakeInternal is already defined at the top of this file.

    const testCases = [
      { description: 'stored slug survives changed local membership and title',
        clusterDataInput: { id: 'canonical-uuid', slug: 'stored-cluster-slug', quakeCount: 3, locationName: 'New location', maxMagnitude: 5.8, strongestQuakeId: 'us7000mfp9' },
        expectedUrl: '/cluster/stored-cluster-slug' },
      { description: 'canonical ID is used when no stored slug exists',
        clusterDataInput: { id: 'canonical-id-no-slug', quakeCount: 2, locationName: '', maxMagnitude: 4.8, strongestQuakeId: 'test123xyz' },
        expectedUrl: '/cluster/canonical-id-no-slug' },
    ];

    testCases.forEach(({ description, clusterDataInput, expectedUrl }) => {
      it(`should generate correct URL for: ${description}`, async () => {
        const mockRawQuakesForCluster = [];
        for (let i = 0; i < clusterDataInput.quakeCount; i++) {
          mockRawQuakesForCluster.push(
            createMockQuakeInternal(
              i === 0 ? clusterDataInput.strongestQuakeId : `dummy${i}_${clusterDataInput.strongestQuakeId}`,
              Date.now() - i * 1000,
              i === 0 ? clusterDataInput.maxMagnitude : clusterDataInput.maxMagnitude - 0.1,
              clusterDataInput.locationName
            )
          );
        }

        const mockClusterSummary = {
            ...clusterDataInput,
            earthquakeIds: JSON.stringify(mockRawQuakesForCluster.map(q => q.id)),
        };

        mockFetchActiveClusters.mockResolvedValue([mockClusterSummary]);
        mockUseEarthquakeDataState.mockReturnValue({
          ...defaultEarthquakeData,
          allEarthquakes: mockRawQuakesForCluster,
          isLoadingInitialData: false, isInitialAppLoad: false,
        });
        mockUseUIState.mockReturnValue(defaultUIState);

        render(
          <MemoryRouter initialEntries={['/']}>
            <App />
          </MemoryRouter>
        );

        const expectedTestId = `mock-cluster-summary-item-${clusterDataInput.id}`;
        const clusterItem = await screen.findByTestId(expectedTestId, {}, { timeout: 3000 });

        act(() => {
          clusterItem.click();
        });

        expect(mockNavigate).toHaveBeenCalledWith(expectedUrl, { state: { returnTo: '/', inAppNavigation: true } });
      });
    });
  });
});
