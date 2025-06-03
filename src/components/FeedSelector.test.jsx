import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FeedSelector from './FeedSelector'; // Adjust path as necessary
import { vi } from 'vitest';

// Mock constants used by the component
const FEELABLE_QUAKE_THRESHOLD = 2.5;
const MAJOR_QUAKE_THRESHOLD = 5.0;

describe('FeedSelector', () => {
  let setActiveFeedPeriodMock;

  beforeEach(() => {
    setActiveFeedPeriodMock = vi.fn();
  });

  const baseProps = { // Renamed to avoid confusion, though not strictly necessary
    activeFeedPeriod: 'last_hour',
    // setActiveFeedPeriod will be overridden in tests that need to check calls
    hasAttemptedMonthlyLoad: false,
    allEarthquakes: [],
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
  };

  it('renders all standard feed buttons', () => {
    render(<FeedSelector {...baseProps} setActiveFeedPeriod={vi.fn()} />); // Pass a dummy fn
    expect(screen.getByRole('button', { name: 'Last Hour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Feelable (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Significant (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last 24hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last 7day' })).toBeInTheDocument();
  });

  it('calls setActiveFeedPeriod with correct params when a button is clicked', () => {
    // Explicitly pass the mock for this test
    render(<FeedSelector {...baseProps} setActiveFeedPeriod={setActiveFeedPeriodMock} />);

    fireEvent.click(screen.getByRole('button', { name: 'Last Hour' }));
    expect(setActiveFeedPeriodMock).toHaveBeenCalledWith('last_hour');

    fireEvent.click(screen.getByRole('button', { name: `Feelable (M${FEELABLE_QUAKE_THRESHOLD.toFixed(1)}+)` }));
    expect(setActiveFeedPeriodMock).toHaveBeenCalledWith('feelable_quakes');

    fireEvent.click(screen.getByRole('button', { name: `Significant (M${MAJOR_QUAKE_THRESHOLD.toFixed(1)}+)` }));
    expect(setActiveFeedPeriodMock).toHaveBeenCalledWith('significant_quakes');

    fireEvent.click(screen.getByRole('button', { name: 'Last 24hr' }));
    expect(setActiveFeedPeriodMock).toHaveBeenCalledWith('last_24_hours');

    fireEvent.click(screen.getByRole('button', { name: 'Last 7day' }));
    expect(setActiveFeedPeriodMock).toHaveBeenCalledWith('last_7_days');
  });

  it('highlights the active feed button', () => {
    render(<FeedSelector {...baseProps} setActiveFeedPeriod={vi.fn()} activeFeedPeriod="last_24_hours" />);
    const last24hrButton = screen.getByRole('button', { name: 'Last 24hr' });
    expect(last24hrButton).toHaveClass('bg-indigo-500'); // Active class
    const lastHourButton = screen.getByRole('button', { name: 'Last Hour' });
    expect(lastHourButton).toHaveClass('bg-slate-600'); // Inactive class
  });

  it('does not render 14-day and 30-day buttons if hasAttemptedMonthlyLoad is false', () => {
    render(<FeedSelector {...baseProps} setActiveFeedPeriod={vi.fn()} hasAttemptedMonthlyLoad={false} />);
    expect(screen.queryByRole('button', { name: '14-Day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '30-Day' })).not.toBeInTheDocument();
  });

  it('does not render 14-day and 30-day buttons if allEarthquakes is empty', () => {
    render(<FeedSelector {...baseProps} setActiveFeedPeriod={vi.fn()} hasAttemptedMonthlyLoad={true} allEarthquakes={[]} />);
    expect(screen.queryByRole('button', { name: '14-Day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '30-Day' })).not.toBeInTheDocument();
  });

  it('renders 14-day and 30-day buttons if hasAttemptedMonthlyLoad is true and allEarthquakes has data', () => {
    render(<FeedSelector {...baseProps} setActiveFeedPeriod={vi.fn()} hasAttemptedMonthlyLoad={true} allEarthquakes={[{ id: '1' }]} />);
    expect(screen.getByRole('button', { name: '14-Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30-Day' })).toBeInTheDocument();
  });

  it('calls setActiveFeedPeriod for 14-day and 30-day buttons when clicked', () => {
    // Explicitly pass the mock for this test
    render(<FeedSelector {...baseProps} setActiveFeedPeriod={setActiveFeedPeriodMock} hasAttemptedMonthlyLoad={true} allEarthquakes={[{ id: '1' }]} />);

    fireEvent.click(screen.getByRole('button', { name: '14-Day' }));
    expect(setActiveFeedPeriodMock).toHaveBeenCalledWith('last_14_days');

    fireEvent.click(screen.getByRole('button', { name: '30-Day' }));
    expect(setActiveFeedPeriodMock).toHaveBeenCalledWith('last_30_days');
  });

  it('highlights active 14-day or 30-day button', () => {
    render(<FeedSelector {...baseProps} setActiveFeedPeriod={vi.fn()} activeFeedPeriod="last_14_days" hasAttemptedMonthlyLoad={true} allEarthquakes={[{ id: '1' }]} />);
    const fourteenDayButton = screen.getByRole('button', { name: '14-Day' });
    expect(fourteenDayButton).toHaveClass('bg-indigo-500');
  });
});
