import { summaryPage } from '../test-utils/clusterSummaryFixtures.js';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, describe, it, vi, beforeEach } from 'vitest';
import { axe } from 'jest-axe';

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
vi.mock('./LearnPage', () => ({ default: () => <p>Static learning page</p> }));
vi.mock('./learn/PlateTectonicsPage', () => ({ default: () => <p>Static tectonics article</p> }));
vi.mock('./MonitoringPage', () => ({ default: () => <p>Monitoring page</p> }));


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
  fetchActiveClusters: options => mockFetchActiveClusters(options).then(items => Array.isArray(items) ? summaryPage(items) : items),
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

  it('loads globe assets after Strict Mode replays mount effects', async () => {
    localStorage.clear();
    render(<React.StrictMode><MemoryRouter initialEntries={['/']}><App /></MemoryRouter></React.StrictMode>);
    expect(await screen.findByTestId('mock-globe-view')).toBeInTheDocument();
  });

  describe('Accessibility', () => {
    it('should have no axe violations on initial render', async () => {
      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        isLoadingInitialData: false,
        isInitialAppLoad: false,
      });
      mockFetchActiveClusters.mockResolvedValue([]);

      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mock-globe-view')).toBeInTheDocument();
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  it.each([['/overview', 'Overview'], ['/feeds', 'Feeds & Details'], ['/overview/', 'Overview'], ['/feeds/', 'Feeds & Details']])('renders %s in the main pane without a duplicate sidebar', async (path, heading) => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: heading, exact: true })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent(heading);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders a direct cluster route while global feed initialization remains pending', async () => {
    mockUseEarthquakeDataState.mockReturnValue({ ...defaultEarthquakeData, isLoadingInitialData: true, isLoadingDaily: true, isLoadingWeekly: true });
    render(<MemoryRouter initialEntries={['/cluster/stored-slug']}><App /></MemoryRouter>);
    expect(await screen.findByTestId('mock-cluster-detail-wrapper')).toBeInTheDocument();
    expect(screen.queryByText('Seismic Data Visualization')).not.toBeInTheDocument();
  });

  it.each(['/learn', '/learn/plate-tectonics', '/monitoring', '/feeds'])('does not request or render cluster cards on %s', async path => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    await screen.findByRole('main');
    await act(async () => { await Promise.resolve(); });
    expect(mockFetchActiveClusters).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Active Earthquake Clusters' })).not.toBeInTheDocument();
  });

  it('cancels an in-flight cluster request on navigation to Learn and resumes on returning to Globe', async () => {
    let finishOld;
    mockFetchActiveClusters.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; })).mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    await waitFor(() => expect(mockFetchActiveClusters).toHaveBeenCalledOnce());
    const signal = mockFetchActiveClusters.mock.calls[0][0].signal;
    fireEvent.click(screen.getByRole('link', { name: 'Learn', exact: true }));
    expect(await screen.findByText('Static learning page')).toBeInTheDocument();
    expect(signal.aborted).toBe(true);
    await act(async () => { finishOld([{ id: 'obsolete', quakeCount: 20, maxMagnitude: 9 }]); });
    expect(screen.queryByRole('heading', { name: 'Active Earthquake Clusters' })).not.toBeInTheDocument();
    expect(mockFetchActiveClusters).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('link', { name: 'Globe', exact: true }));
    await waitFor(() => expect(mockFetchActiveClusters).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('mock-cluster-summary-item-obsolete')).not.toBeInTheDocument();
  });

  describe('Cluster Loading State Management', () => {
    it('does not reconstruct members for the disabled globe cluster overlay', async () => {
      // 1. Define the mock earthquake that will be in a cluster.
      const mockQuake = {
        id: 'c1',
        properties: { mag: 5.0, time: 2, place: 'Test' },
        geometry: { coordinates: [0, 0, 0] }
      };

      // 2. Mock the data context to provide this earthquake in `allEarthquakes`.
      // The disabled overlay does not consume these members.
      mockUseEarthquakeDataState.mockReturnValue({
        ...defaultEarthquakeData,
        allEarthquakes: [mockQuake],
      });

      // 3. Mock the API call to return the new cluster summary format.
      const mockClusterSummary = [{
        id: 'summary1', maxMagnitude: 5, quakeCount: 50, startTime: 1, endTime: 2,
        earthquakeIds: JSON.stringify([mockQuake.id]),
        // ... other summary properties can be added if needed by the component
      }];
      let resolveFetch;
      const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });
      mockFetchActiveClusters.mockReturnValue(fetchPromise);

      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      // Initially, clusters are empty while fetching.
      await waitFor(() => expect(mockFetchActiveClusters).toHaveBeenCalled());
      const clustersProp = screen.getByTestId('active-clusters-prop');
      expect(JSON.parse(clustersProp.textContent)).toEqual([]);

      // 4. Resolve the fetch with the cluster summary.
      resolveFetch(mockClusterSummary);

      // 5. The card loads independently, while the disabled overlay stays empty.
      await screen.findByTestId('mock-cluster-summary-item-summary1');
      await waitFor(() => {
        expect(JSON.parse(clustersProp.textContent)).toEqual([]);
      });
    });
  });
});
