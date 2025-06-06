import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom'; // Import MemoryRouter
import { UIStateProvider } from '../../contexts/UIStateContext'; // Import UIStateProvider
import FeedSelector from './FeedSelector'; // Adjust path as necessary
import { vi } from 'vitest';

// Mock react-router-dom's useSearchParams
const mockSetSearchParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
  };
});

// Mock constants used by the component
const FEELABLE_QUAKE_THRESHOLD = 2.5;
const MAJOR_QUAKE_THRESHOLD = 5.0;

describe('FeedSelector', () => {
  // let setActiveFeedPeriodMock; // No longer needed as prop

  beforeEach(() => {
    // setActiveFeedPeriodMock = vi.fn(); // No longer needed
    mockSetSearchParams.mockClear(); // Clear mock before each test
  });

  const baseProps = {
    // activeFeedPeriod is now handled by UIStateProvider via MemoryRouter
    // setActiveFeedPeriod is now handled by UIStateProvider
    hasAttemptedMonthlyLoad: false,
    allEarthquakes: [],
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
  };

  it('renders all standard feed buttons', () => {
    render(
      <MemoryRouter initialEntries={['/?activeFeedPeriod=last_hour']}>
        <UIStateProvider>
          <FeedSelector {...baseProps} />
        </UIStateProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Last Hour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Feelable (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Significant (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last 24hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last 7day' })).toBeInTheDocument();
  });

  it('calls setSearchParams with correct params when a button is clicked', () => {
    render(
      <MemoryRouter initialEntries={['/?activeFeedPeriod=initial_period']}>
        <UIStateProvider>
          <FeedSelector {...baseProps} />
        </UIStateProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Last Hour' }));
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(mockSetSearchParams.mock.calls[0][0].get('activeFeedPeriod')).toBe('last_hour');
    mockSetSearchParams.mockClear(); // Clear for next assertion

    fireEvent.click(screen.getByRole('button', { name: `Feelable (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)` }));
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(mockSetSearchParams.mock.calls[0][0].get('activeFeedPeriod')).toBe('feelable_quakes');
    mockSetSearchParams.mockClear();

    fireEvent.click(screen.getByRole('button', { name: `Significant (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)` }));
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(mockSetSearchParams.mock.calls[0][0].get('activeFeedPeriod')).toBe('significant_quakes');
    mockSetSearchParams.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Last 24hr' }));
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(mockSetSearchParams.mock.calls[0][0].get('activeFeedPeriod')).toBe('last_24_hours');
    mockSetSearchParams.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Last 7day' }));
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(mockSetSearchParams.mock.calls[0][0].get('activeFeedPeriod')).toBe('last_7_days');
  });

  it('highlights the active feed button based on URL search param', () => {
    render(
      <MemoryRouter initialEntries={['/?activeFeedPeriod=last_24_hours']}>
        <UIStateProvider>
          <FeedSelector {...baseProps} />
        </UIStateProvider>
      </MemoryRouter>
    );
    const last24hrButton = screen.getByRole('button', { name: 'Last 24hr' });
    expect(last24hrButton).toHaveClass('bg-indigo-500'); // Active class
    const lastHourButton = screen.getByRole('button', { name: 'Last Hour' });
    expect(lastHourButton).toHaveClass('bg-slate-600'); // Inactive class
  });

  // The following tests need similar wrapping and adjustments.
  // I will address them in subsequent steps.

  it('does not render 14-day and 30-day buttons if hasAttemptedMonthlyLoad is false', () => {
    render(
      <MemoryRouter>
        <UIStateProvider>
          <FeedSelector {...baseProps} hasAttemptedMonthlyLoad={false} />
        </UIStateProvider>
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: '14-Day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '30-Day' })).not.toBeInTheDocument();
  });

  it('does not render 14-day and 30-day buttons if allEarthquakes is empty', () => {
    render(
      <MemoryRouter>
        <UIStateProvider>
          <FeedSelector {...baseProps} hasAttemptedMonthlyLoad={true} allEarthquakes={[]} />
        </UIStateProvider>
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: '14-Day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '30-Day' })).not.toBeInTheDocument();
  });

  it('renders 14-day and 30-day buttons if hasAttemptedMonthlyLoad is true and allEarthquakes has data', () => {
    render(
      <MemoryRouter>
        <UIStateProvider>
          <FeedSelector {...baseProps} hasAttemptedMonthlyLoad={true} allEarthquakes={[{ id: '1' }]} />
        </UIStateProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: '14-Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30-Day' })).toBeInTheDocument();
  });

  it('calls setSearchParams for 14-day and 30-day buttons when clicked', () => {
    render(
      <MemoryRouter initialEntries={['/?activeFeedPeriod=initial_period']}>
        <UIStateProvider>
          <FeedSelector {...baseProps} hasAttemptedMonthlyLoad={true} allEarthquakes={[{ id: '1' }]} />
        </UIStateProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '14-Day' }));
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(mockSetSearchParams.mock.calls[0][0].get('activeFeedPeriod')).toBe('last_14_days');
    mockSetSearchParams.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '30-Day' }));
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(mockSetSearchParams.mock.calls[0][0].get('activeFeedPeriod')).toBe('last_30_days');
  });

  it('highlights active 14-day or 30-day button based on URL search param', () => {
    render(
      <MemoryRouter initialEntries={['/?activeFeedPeriod=last_14_days']}>
        <UIStateProvider>
          <FeedSelector {...baseProps} hasAttemptedMonthlyLoad={true} allEarthquakes={[{ id: '1' }]} />
        </UIStateProvider>
      </MemoryRouter>
    );
    const fourteenDayButton = screen.getByRole('button', { name: '14-Day' });
    expect(fourteenDayButton).toHaveClass('bg-indigo-500');
  });
});


// New describe block for "Clear Filters" button tests
describe('FeedSelector - Clear Filters Button', () => {
  const baseProps = {
    hasAttemptedMonthlyLoad: false,
    allEarthquakes: [],
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
  };

  beforeEach(() => {
    mockSetSearchParams.mockClear();
  });

  it('renders the "Clear Filters" button', () => {
    render(
      <MemoryRouter>
        <UIStateProvider>
          <FeedSelector {...baseProps} />
        </UIStateProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Clear active feed filter and reset to default' })).toBeInTheDocument();
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('clicking "Clear Filters" calls setSearchParams to reset activeFeedPeriod to default', () => {
    render(
      <MemoryRouter initialEntries={['/?activeFeedPeriod=last_hour']}> {/* Start with a non-default period */}
        <UIStateProvider>
          <FeedSelector {...baseProps} />
        </UIStateProvider>
      </MemoryRouter>
    );

    // Verify initial state (optional, but good for sanity)
    const lastHourButton = screen.getByRole('button', { name: 'Last Hour' });
    expect(lastHourButton).toHaveClass('bg-indigo-500'); // Should be active initially

    const clearButton = screen.getByRole('button', { name: 'Clear active feed filter and reset to default' });
    fireEvent.click(clearButton);

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams));
    // Check that the searchParam was set to the default value
    const lastCallArgs = mockSetSearchParams.mock.calls[0][0];
    expect(lastCallArgs.get('activeFeedPeriod')).toBe('last_24_hours');

    // Optional: Verify UI update if possible, though setSearchParams is the primary check here
    // To do this effectively, you might need to re-render or use a more complex setup
    // to observe the state change within UIStateContext directly.
    // For now, checking setSearchParams is sufficient as per requirements.

    // Example of checking the button's active state after click (requires component to re-render based on new URL state)
    // This part might be tricky without a full integration test setup or specific testing utilities for context updates reflected from URL.
    // If we re-render with the new URL state:
    // render(
    //   <MemoryRouter initialEntries={['/?activeFeedPeriod=last_24_hours']}>
    //     <UIStateProvider>
    //       <FeedSelector {...baseProps} />
    //     </UIStateProvider>
    //   </MemoryRouter>
    // );
    // const defaultButton = screen.getByRole('button', { name: 'Last 24hr' });
    // expect(defaultButton).toHaveClass('bg-indigo-500'); // Default should now be active
  });
});
