// src/components/EarthquakeSummaryDisplay.test.jsx
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react'; // Import act
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import EarthquakeSummaryDisplay from './EarthquakeSummaryDisplay'; // Adjust path as necessary
import SkeletonText from './skeletons/SkeletonText'; // Import the actual SkeletonText

// Mock SkeletonText to simplify testing its presence
vi.mock('./skeletons/SkeletonText', () => ({
  default: ({ width, height, className }) => (
    <div data-testid="skeleton-text" className={`${width} ${height} ${className}`}></div>
  ),
}));

// Mock global.fetch
global.fetch = vi.fn();

// Utility to create a mock response for fetch
const createMockResponse = (body, ok = true, status = 200) => {
  return {
    ok,
    status,
    json: async () => body,
    statusText: ok ? 'OK' : 'Error',
  };
};

describe('EarthquakeSummaryDisplay', () => {
  beforeEach(() => {
    // vi.useFakeTimers(); // Using real timers for most tests
    // Provide a default successful mock for fetch before each test
    global.fetch = vi.fn(() =>
      Promise.resolve(createMockResponse({
        all_quakes_past_hour: { count: 0 },
        significant_quakes_past_day: { count: 0 },
      }))
    );
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore all mocks (includes fetch and SkeletonText)
    // Ensure real timers are restored if a specific test used fake timers
    // vi.useRealTimers(); // This might be needed if a test explicitly calls useFakeTimers
  });

  it('renders loading skeletons initially', () => {
    render(<EarthquakeSummaryDisplay />);
    expect(screen.getByText(/Last Hour:/i)).toBeInTheDocument();
    expect(screen.getByText(/Significant \(24h\):/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-text').length).toBe(2);
  });

  it('fetches and displays summary data successfully', async () => {
    const mockData = {
      all_quakes_past_hour: { count: 15 },
      significant_quakes_past_day: { count: 3 },
    };
    global.fetch.mockImplementationOnce(() => Promise.resolve(createMockResponse(mockData)));

    render(<EarthquakeSummaryDisplay />);

    await waitFor(() => {
      expect(screen.getByText('15')).toBeInTheDocument();
    }); // Default timeout, real timers
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryAllByTestId('skeleton-text').length).toBe(0);
  });

  it('displays N/A when data is missing or not a number', async () => {
    const mockData = {
      all_quakes_past_hour: { count: null },
      significant_quakes_past_day: { count: 'invalid' },
    };
    global.fetch.mockImplementationOnce(() => Promise.resolve(createMockResponse(mockData)));

    render(<EarthquakeSummaryDisplay />);

    await waitFor(() => {
      // Check for the first N/A
      expect(screen.getAllByText((content, element) => element.tagName.toLowerCase() === 'span' && content === 'N/A').length).toBeGreaterThanOrEqual(1);
    });
    // Check that both stats display N/A
    expect(screen.getAllByText((content, element) => element.tagName.toLowerCase() === 'span' && content === 'N/A').length).toBe(2);
  });

  it('displays an error message if fetch fails', async () => {
    global.fetch.mockImplementationOnce(() => Promise.resolve(createMockResponse({ message: 'Server Error' }, false, 500)));

    render(<EarthquakeSummaryDisplay />);

    await waitFor(() => {
      expect(screen.getByText(/Summary Error:/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/500 Server Error/i)).toBeInTheDocument();
  });

  it('displays a generic error message if error response is not valid JSON', async () => {
    global.fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => { throw new Error('Invalid JSON'); }
    }));

    render(<EarthquakeSummaryDisplay />);

    await waitFor(() => {
      expect(screen.getByText(/Summary Error:/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/503 Service Unavailable/i)).toBeInTheDocument();
  });

  it('refetches data at intervals', async () => {
    vi.useFakeTimers(); // Use fake timers specifically for this test

    const initialData = {
      all_quakes_past_hour: { count: 10 },
      significant_quakes_past_day: { count: 1 },
    };
    const updatedData = {
      all_quakes_past_hour: { count: 12 },
      significant_quakes_past_day: { count: 2 },
    };

    global.fetch
      .mockImplementationOnce(() => Promise.resolve(createMockResponse(initialData)))
      .mockImplementationOnce(() => Promise.resolve(createMockResponse(updatedData)));

    render(<EarthquakeSummaryDisplay />);

    await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
    expect(screen.getByText('1')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
      await vi.runOnlyPendingTimers(); // Run timers that are now due
    });

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers(); // Restore real timers
  });
});
