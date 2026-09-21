import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeedsPageLayout from './FeedsPageLayout';
// Corrected imports for Context objects
import { EarthquakeDataContext } from '../contexts/earthquakeDataContextUtils';
import { UIStateContext } from '../contexts/uiStateContextUtils';

// Import actual components to be mocked for use with vi.mocked
import FeedSelector from './FeedSelector';
import SummaryStatisticsCard from './SummaryStatisticsCard';
import PaginatedEarthquakeTable from './PaginatedEarthquakeTable';
import LoadMoreDataButton from './LoadMoreDataButton';
// SeoMetadata is also mocked but not asserted with vi.mocked in the new tests, so direct import not strictly needed yet.

// Mock child components
vi.mock('./SeoMetadata', () => ({
  default: vi.fn(() => <div data-testid="seo-metadata">SeoMetadata</div>),
}));
vi.mock('./FeedSelector', () => ({
  default: vi.fn(() => <div data-testid="feed-selector">FeedSelector</div>),
}));
vi.mock('./SummaryStatisticsCard', () => ({
  default: vi.fn(() => <div data-testid="summary-stats-card">SummaryStatisticsCard</div>),
}));
vi.mock('./PaginatedEarthquakeTable', () => ({
  default: vi.fn(() => <div data-testid="paginated-table">PaginatedEarthquakeTable</div>),
}));
vi.mock('./LoadMoreDataButton', () => ({
  default: vi.fn(() => <div data-testid="load-more-button">LoadMoreDataButton</div>),
}));

const mockEarthquakeDataContextValue = {
  earthquakesLastHour: [],
  earthquakesPriorHour: [],
  earthquakesLast24Hours: [],
  prev24HourData: [],
  earthquakesLast7Days: [],
  prev7DayData: [],
  earthquakesLast14Days: [],
  prev14DayData: [],
  earthquakesLast30Days: [],
  allEarthquakes: [],
  isLoadingDaily: false,
  isLoadingWeekly: false,
  isLoadingMonthly: false,
  hasAttemptedMonthlyLoad: false,
  loadMonthlyData: vi.fn(),
};

const mockUIStateContextValue = {
  activeFeedPeriod: 'last_24_hours',
  setActiveFeedPeriod: vi.fn(),
};

const mockProps = {
  handleQuakeClick: vi.fn(),
  getFeedPageSeoInfo: vi.fn(() => ({ title: 'Test Title', description: 'Test Desc', keywords: 'test' })),
  calculateStats: vi.fn(() => ({ total: 0, maxMag: 0, avgMag: 0, change: 0, trend: 'neutral' })),
  getMagnitudeColorStyle: vi.fn(() => ({ color: 'white' })),
  formatTimeAgo: vi.fn(() => 'some time ago'),
  formatDate: vi.fn(() => 'Jan 1, 2024'),
};

describe('FeedsPageLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Reset mocks before each test
  });

  it('keeps weekly coverage labels after a failed first monthly attempt and exposes retry state', () => {
    render(<EarthquakeDataContext.Provider value={{ ...mockEarthquakeDataContextValue, hasAttemptedMonthlyLoad: true, monthlyHasLoaded: false, monthlyError: 'Unavailable' }}>
      <UIStateContext.Provider value={{ ...mockUIStateContextValue, activeFeedPeriod: 'feelable_quakes' }}><FeedsPageLayout {...mockProps} /></UIStateContext.Provider>
    </EarthquakeDataContext.Provider>);
    expect(PaginatedEarthquakeTable).toHaveBeenLastCalledWith(expect.objectContaining({ title: expect.stringContaining('Last 7 Days'), paginationKey: 'feelable_quakes' }), undefined);
    expect(LoadMoreDataButton).toHaveBeenLastCalledWith(expect.objectContaining({ monthlyHasLoaded: false, monthlyError: 'Unavailable' }), undefined);
  });

  it('treats a successful empty month as loaded coverage', () => {
    render(<EarthquakeDataContext.Provider value={{ ...mockEarthquakeDataContextValue, hasAttemptedMonthlyLoad: true, monthlyHasLoaded: true }}>
      <UIStateContext.Provider value={{ ...mockUIStateContextValue, activeFeedPeriod: 'feelable_quakes' }}><FeedsPageLayout {...mockProps} /></UIStateContext.Provider>
    </EarthquakeDataContext.Provider>);
    expect(PaginatedEarthquakeTable).toHaveBeenLastCalledWith(expect.objectContaining({ title: expect.stringContaining('Last 30 Days'), earthquakes: [] }), undefined);
    expect(FeedSelector).toHaveBeenLastCalledWith(expect.objectContaining({ monthlyHasLoaded: true }), undefined);
  });

  it('shows unavailable rather than zero statistics after an initial extended-period failure', () => {
    render(<EarthquakeDataContext.Provider value={{ ...mockEarthquakeDataContextValue, hasAttemptedMonthlyLoad: true, monthlyHasLoaded: false, monthlyError: 'Unavailable' }}>
      <UIStateContext.Provider value={{ ...mockUIStateContextValue, activeFeedPeriod: 'last_30_days' }}><FeedsPageLayout {...mockProps} /></UIStateContext.Provider>
    </EarthquakeDataContext.Provider>);
    expect(screen.getByText(/This period is unavailable/)).toBeInTheDocument();
    expect(SummaryStatisticsCard).not.toHaveBeenCalled();
    expect(PaginatedEarthquakeTable).not.toHaveBeenCalled();
  });

  it('retries the month when a filtered 30-day feed fails to refresh', () => {
    const retry = vi.fn();
    render(<EarthquakeDataContext.Provider value={{ ...mockEarthquakeDataContextValue, monthlyHasLoaded: true, monthlyError: 'Unavailable', loadMonthlyData: retry }}>
      <UIStateContext.Provider value={{ ...mockUIStateContextValue, activeFeedPeriod: 'feelable_quakes' }}><FeedsPageLayout {...mockProps} /></UIStateContext.Provider>
    </EarthquakeDataContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Retry feed' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(PaginatedEarthquakeTable).toHaveBeenLastCalledWith(expect.objectContaining({ isLoading: false }), undefined);
  });

  it('offers an explicit retry for a failed selected feed', () => {
    const retry = vi.fn();
    render(<EarthquakeDataContext.Provider value={{ ...mockEarthquakeDataContextValue, dailyError: 'Unavailable', refreshData: retry }}>
      <UIStateContext.Provider value={mockUIStateContextValue}><FeedsPageLayout {...mockProps} /></UIStateContext.Provider>
    </EarthquakeDataContext.Provider>);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh');
    fireEvent.click(screen.getByRole('button', { name: 'Retry feed' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders without crashing and displays child components', () => {
    render(
      <EarthquakeDataContext.Provider value={mockEarthquakeDataContextValue}>
        <UIStateContext.Provider value={mockUIStateContextValue}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );

    expect(screen.getByText('Feeds & Details')).toBeInTheDocument();
    expect(screen.getByTestId('seo-metadata')).toBeInTheDocument();
    expect(screen.getByTestId('feed-selector')).toBeInTheDocument();
    expect(screen.getByTestId('summary-stats-card')).toBeInTheDocument();
    expect(screen.getByTestId('paginated-table')).toBeInTheDocument();
    expect(screen.getByTestId('load-more-button')).toBeInTheDocument();
  });

  it('passes correct props to FeedSelector', () => {
    render(
      <EarthquakeDataContext.Provider value={mockEarthquakeDataContextValue}>
        <UIStateContext.Provider value={mockUIStateContextValue}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );
    // Check props for FeedSelector
    const feedSelectorMock = vi.mocked(FeedSelector);
    expect(feedSelectorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeFeedPeriod: 'last_24_hours',
        setActiveFeedPeriod: mockUIStateContextValue.setActiveFeedPeriod,
        hasAttemptedMonthlyLoad: false,
        allEarthquakes: [], // This refers to the prop passed to FeedSelector, which is derived from context
        FEELABLE_QUAKE_THRESHOLD: 2.5, // Assuming this is passed from FeedsPageLayout
        MAJOR_QUAKE_THRESHOLD: 4.5,    // Assuming this is passed from FeedsPageLayout
      }),
      undefined // Explicitly expect undefined for the second argument if that's what it receives
    );
  });

  it('passes correct props to SummaryStatisticsCard', () => {
    const stats = { total: 5, maxMag: 5.5, avgMag: 2.0, change: 10, trend: 'up' };
    const calculateStatsMock = vi.fn(() => stats);
    const currentQuakes = [{id: 'eq1'}];
    render(
      <EarthquakeDataContext.Provider value={{ ...mockEarthquakeDataContextValue, earthquakesLast24Hours: currentQuakes }}>
        <UIStateContext.Provider value={mockUIStateContextValue}>
          <FeedsPageLayout {...mockProps} calculateStats={calculateStatsMock} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );

    // Check props for SummaryStatisticsCard
    const summaryStatsCardMock = vi.mocked(SummaryStatisticsCard);
    expect(summaryStatsCardMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({
        title: 'Statistics for (Last 24 Hours)', // Corrected title based on component logic
        currentPeriodData: currentQuakes,
        previousPeriodData: mockEarthquakeDataContextValue.prev24HourData,
        isLoading: false,
        calculateStats: calculateStatsMock, // FeedsPageLayout passes its own prop calculateStats directly
      }),
      undefined
    );
  });

  it('passes correct props to PaginatedEarthquakeTable', () => {
    const currentQuakes = [{ id: 'eq1', properties: { mag: 3.0, time: 12345, place: 'Test Place' } }];
    render(
      <EarthquakeDataContext.Provider value={{ ...mockEarthquakeDataContextValue, earthquakesLast24Hours: currentQuakes }}>
        <UIStateContext.Provider value={mockUIStateContextValue}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );
    // Check props for PaginatedEarthquakeTable
    const paginatedTableMock = vi.mocked(PaginatedEarthquakeTable);
    expect(paginatedTableMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({
        title: 'Earthquakes (Last 24 Hours)',
        earthquakes: currentQuakes,
        isLoading: false,
        onQuakeClick: mockProps.handleQuakeClick,
        itemsPerPage: 15, // Default itemsPerPage
        periodName: 'last 24 hours', // from getActiveFeedDetails
        getMagnitudeColorStyle: mockProps.getMagnitudeColorStyle,
        formatTimeAgo: mockProps.formatTimeAgo, // from FeedsPageLayout props
        formatDate: mockProps.formatDate, // from FeedsPageLayout props
      }),
      undefined
    );
  });

  it('passes correct props to LoadMoreDataButton', () => {
    render(
      <EarthquakeDataContext.Provider value={mockEarthquakeDataContextValue}>
        <UIStateContext.Provider value={mockUIStateContextValue}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );
    // Check props for LoadMoreDataButton
    const loadMoreButtonMock = vi.mocked(LoadMoreDataButton);
    expect(loadMoreButtonMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({
        hasAttemptedMonthlyLoad: mockEarthquakeDataContextValue.hasAttemptedMonthlyLoad,
        isLoadingMonthly: mockEarthquakeDataContextValue.isLoadingMonthly,
        loadMonthlyData: mockEarthquakeDataContextValue.loadMonthlyData,
      }),
      undefined
    );
  });

  it('updates title and data when activeFeedPeriod changes to "last_hour"', () => {
    const newUiState = { ...mockUIStateContextValue, activeFeedPeriod: 'last_hour' };
    const hourlyQuakes = [{id: 'eqHour'}];
    const newEarthquakeData = { ...mockEarthquakeDataContextValue, earthquakesLastHour: hourlyQuakes };
    render(
      <EarthquakeDataContext.Provider value={newEarthquakeData}>
        <UIStateContext.Provider value={newUiState}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );

    expect(screen.getByText('Feeds & Details')).toBeInTheDocument(); // Main title

    // Check title for SummaryStatisticsCard
    const summaryStatsCardMock = vi.mocked(SummaryStatisticsCard);
    expect(summaryStatsCardMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({ title: 'Statistics for (Last Hour)' }), // Corrected title
      undefined
    );

    // Check title for PaginatedEarthquakeTable
    const paginatedTableMock = vi.mocked(PaginatedEarthquakeTable);
    expect(paginatedTableMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({ title: 'Earthquakes (Last Hour)', earthquakes: hourlyQuakes }),
      undefined
    );
  });

  it('shows loading state correctly for daily data (last_24_hours)', () => {
    const loadingEarthquakeData = { ...mockEarthquakeDataContextValue, isLoadingDaily: true, earthquakesLast24Hours: [] }; // earthquakesLast24Hours is empty
    render(
      <EarthquakeDataContext.Provider value={loadingEarthquakeData}>
        <UIStateContext.Provider value={{...mockUIStateContextValue, activeFeedPeriod: 'last_24_hours'}}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );

    const summaryStatsCardMock = vi.mocked(SummaryStatisticsCard);
    expect(summaryStatsCardMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({ isLoading: true }),
      undefined
    );
    const paginatedTableMock = vi.mocked(PaginatedEarthquakeTable);
    expect(paginatedTableMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({ isLoading: true }),
      undefined
    );
  });

  it('shows loading state correctly for weekly data (last_7_days)', () => {
    const loadingEarthquakeData = { ...mockEarthquakeDataContextValue, isLoadingWeekly: true, earthquakesLast7Days: [] }; // earthquakesLast7Days is empty
    const uiState = { ...mockUIStateContextValue, activeFeedPeriod: 'last_7_days' };
    render(
      <EarthquakeDataContext.Provider value={loadingEarthquakeData}>
        <UIStateContext.Provider value={uiState}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );

    const summaryStatsCardMock = vi.mocked(SummaryStatisticsCard);
    expect(summaryStatsCardMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({ isLoading: true }),
      undefined
    );
    const paginatedTableMock = vi.mocked(PaginatedEarthquakeTable);
    expect(paginatedTableMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({ isLoading: true }),
      undefined
    );
  });

   it('shows loading state correctly for monthly data (last_30_days)', () => {
    const loadingEarthquakeData = { ...mockEarthquakeDataContextValue, isLoadingMonthly: true, allEarthquakes: [], earthquakesLast30Days: [], prev30DayData: [], hasAttemptedMonthlyLoad: true };
    const uiState = { ...mockUIStateContextValue, activeFeedPeriod: 'last_30_days' };
    render(
      <EarthquakeDataContext.Provider value={loadingEarthquakeData}>
        <UIStateContext.Provider value={uiState}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );

    const summaryStatsCardMock = vi.mocked(SummaryStatisticsCard);
    expect(summaryStatsCardMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({ isLoading: true }),
      undefined
    );
    const paginatedTableMock = vi.mocked(PaginatedEarthquakeTable);
    expect(paginatedTableMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({ isLoading: true }),
      undefined
    );
  });

  it('calls getFeedPageSeoInfo with correct parameters', () => {
    render(
      <EarthquakeDataContext.Provider value={mockEarthquakeDataContextValue}>
        <UIStateContext.Provider value={mockUIStateContextValue}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );
    expect(mockProps.getFeedPageSeoInfo).toHaveBeenLastCalledWith('Earthquakes (Last 24 Hours)', 'last_24_hours'); // Changed to assertLastCalledWith
  });

  it('uses feelable_quakes feed correctly', () => {
    const feelableQuakesData = [
      { properties: { mag: 2.5, place: 'Near A', time: 1 } }, // Should be included (assuming threshold is 2.5)
      { properties: { mag: 2.0, place: 'Near B', time: 2 } }, // Should be filtered out
    ];
    const earthquakeData = {
      ...mockEarthquakeDataContextValue,
      earthquakesLast7Days: feelableQuakesData,
      hasAttemptedMonthlyLoad: false, // Ensure it uses 7-day data
      allEarthquakes: [], // Ensure it doesn't use 30-day data by mistake
    };
    const uiState = { ...mockUIStateContextValue, activeFeedPeriod: 'feelable_quakes' };
    render(
      <EarthquakeDataContext.Provider value={earthquakeData}>
        <UIStateContext.Provider value={uiState}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );

    const paginatedTableMock = vi.mocked(PaginatedEarthquakeTable);
    expect(paginatedTableMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({
        title: 'Feelable Quakes (M2.5+) (Last 7 Days)', // Adjusted based on likely constant
        earthquakes: [feelableQuakesData[0]],
      }),
      undefined
    );
  });

  it('uses significant_quakes feed correctly with monthly data', () => {
    const significantQuakesData = [
      { properties: { mag: 4.5, place: 'Far C', time: 3 } }, // Should be included (assuming threshold is 4.5)
      { properties: { mag: 4.0, place: 'Far D', time: 4 } }, // Should be filtered out
    ];
    const earthquakeData = {
      ...mockEarthquakeDataContextValue,
      allEarthquakes: significantQuakesData, // Corrected context variable name
      hasAttemptedMonthlyLoad: true,
    };
    const uiState = { ...mockUIStateContextValue, activeFeedPeriod: 'significant_quakes' };
    render(
      <EarthquakeDataContext.Provider value={earthquakeData}>
        <UIStateContext.Provider value={uiState}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );

    const paginatedTableMock = vi.mocked(PaginatedEarthquakeTable);
    expect(paginatedTableMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({
        title: 'Significant Quakes (M4.5+) (Last 30 Days)',
        earthquakes: [significantQuakesData[0]],
      }),
      undefined
    );
  });

  // Test for last_14_days when monthly data is not yet loaded (should be null or empty)
  it('handles last_14_days feed when monthly data is not loaded', () => {
    const earthquakeData = { ...mockEarthquakeDataContextValue, earthquakesLast14Days: null, hasAttemptedMonthlyLoad: false };
    const uiState = { ...mockUIStateContextValue, activeFeedPeriod: 'last_14_days' };
    render(
      <EarthquakeDataContext.Provider value={earthquakeData}>
        <UIStateContext.Provider value={uiState}>
          <FeedsPageLayout {...mockProps} />
        </UIStateContext.Provider>
      </EarthquakeDataContext.Provider>
    );
    const paginatedTableMock = vi.mocked(PaginatedEarthquakeTable);
    expect(paginatedTableMock).toHaveBeenLastCalledWith( // Changed to assertLastCalledWith
      expect.objectContaining({
        title: 'Earthquakes (Last 14 Days)',
        earthquakes: [],
        isLoading: true,
      }),
      undefined
    );
    expect(mockEarthquakeDataContextValue.loadMonthlyData).toHaveBeenCalledOnce();
  });
});
