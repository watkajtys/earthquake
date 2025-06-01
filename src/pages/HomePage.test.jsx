import React from 'react';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { expect, describe, it } from 'vitest';
import App from './HomePage'; // Assuming HomePage is the default export from App.jsx or HomePage.jsx

// Mock IntersectionObserver
class IntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('IntersectionObserver', IntersectionObserver);


// Mock matchMedia
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

describe('HomePage Accessibility', () => {
  it('should have no axe violations on initial render', async () => {
    // Suppress console.error output from "Error in fetchDataCb" during test
    const originalConsoleError = console.error;
    console.error = (...args) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('Error in fetchDataCb')) {
        return;
      }
      originalConsoleError(...args);
    };

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Wait for initial data loading to settle, if possible, or use a timeout.
    // For critical async content, ideally wait for elements to appear.
    // Here, we'll test the initial state which includes loading states.
    // Let's give a brief moment for initial effects.
    await new Promise(resolve => setTimeout(resolve, 500));


    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Restore console.error
    console.error = originalConsoleError;
  }, 15000); // Increase timeout for this test due to potential async operations
});

// New Integration Test Suite
import { screen, waitFor } from '@testing-library/react'; // Added screen, waitFor
// import { Routes, Route } from 'react-router-dom'; // Not needed directly here as HomePage has its own Routes
import useEarthquakeData from '../hooks/useEarthquakeData'; // Mock target
import useMonthlyEarthquakeData from '../hooks/useMonthlyEarthquakeData'; // Mock target

// Note: ClusterDetailModalWrapper is now eagerly loaded by HomePage for this test

// Mock the custom hooks used by HomePage with default implementations
const mockDefaultEarthquakeData = {
  isLoadingInitialData: true,
  error: null,
  earthquakesLast72Hours: [],
  overviewClusters: [],
  isLoadingDaily: true,
  isLoadingWeekly: true,
  dataFetchTime: null,
  lastUpdated: null,
  earthquakesLastHour: [],
  earthquakesPriorHour: [],
  earthquakesLast24Hours: [],
  earthquakesLast7Days: [],
  prev24HourData: [],
  globeEarthquakes: [],
  hasRecentTsunamiWarning: false,
  highestRecentAlert: null,
  activeAlertTriggeringQuakes: [],
  lastMajorQuake: null,
  previousMajorQuake: null,
  timeBetweenPreviousMajorQuakes: null,
  currentLoadingMessage: 'Loading default mock data...',
  isInitialAppLoad: true,
  setLastMajorQuake: vi.fn(),
  setPreviousMajorQuake: vi.fn(),
  setTimeBetweenPreviousMajorQuakes: vi.fn(),
};

const mockDefaultMonthlyEarthquakeData = {
  isLoadingMonthly: false,
  hasAttemptedMonthlyLoad: false,
  monthlyError: null,
  allEarthquakes: [],
  earthquakesLast14Days: [],
  earthquakesLast30Days: [],
  prev7DayData: [],
  prev14DayData: [],
  loadMonthlyData: vi.fn(),
};

vi.mock('../hooks/useEarthquakeData', () => ({
  __esModule: true,
  default: vi.fn(() => mockDefaultEarthquakeData), // Provide a default implementation
}));
vi.mock('../hooks/useMonthlyEarthquakeData', () => ({
  __esModule: true,
  default: vi.fn(() => mockDefaultMonthlyEarthquakeData), // Provide a default implementation
}));

describe('HomePage Routing Integration for Cluster Page (Eager Loaded)', () => {
  const mockUseEarthquakeData = vi.mocked(useEarthquakeData);
  const mockUseMonthlyEarthquakeData = vi.mocked(useMonthlyEarthquakeData);

  beforeEach(() => {
    // Reset mocks and then provide a baseline for this test suite
    // This ensures that if mockImplementationOnce is not used, or if there are more calls,
    // these values will be returned.
    mockUseEarthquakeData.mockReset().mockReturnValue({
      ...mockDefaultEarthquakeData, // Start with global defaults but override some for a typical "loaded" state
      isLoadingInitialData: false,
      isLoadingDaily: false,
      isLoadingWeekly: false,
      isInitialAppLoad: false,
      currentLoadingMessage: '',
      dataFetchTime: Date.now(), // make it seem loaded
      lastUpdated: new Date().toLocaleString(),
      // overviewClusters is already [] in mockDefaultEarthquakeData which is fine for default
    });

    mockUseMonthlyEarthquakeData.mockReset().mockReturnValue(mockDefaultMonthlyEarthquakeData);
  });

  it('should render "Cluster Not Found" for an old cluster URL with eager loading', async () => {
    const problematicUrl = '/cluster/overview_cluster_us6000qh1r_5';

    // Set the hook's return for the *initial* render to be the loading state.
    // This will clear any previous mockImplementationOnce calls from other tests if any, and set new base return.
    mockUseEarthquakeData.mockReturnValue({
      ...mockDefaultEarthquakeData,
      isLoadingInitialData: true,
      currentLoadingMessage: 'Loading initial data for test...',
       // overviewClusters is already [] in mockDefaultEarthquakeData
       // isLoadingDaily, isLoadingWeekly, isInitialAppLoad are already true in mockDefaultEarthquakeData
    });

    const { rerender } = render(
      <MemoryRouter initialEntries={[problematicUrl]}>
        <App /> {/* App is HomePage */}
      </MemoryRouter>
    );

    // Expect some loading state from ClusterDetailLoader
    // expect(screen.getByText(/loading cluster details.../i)).toBeInTheDocument(); // This was incorrect
    // Expect HomePage's full screen loader text
    expect(screen.getByText(/Loading initial data for test.../i)).toBeInTheDocument();


    // Now set up for the "loaded" state for the next render/hook call
    mockUseEarthquakeData.mockReturnValue({
      ...mockDefaultEarthquakeData,
      isLoadingInitialData: false,
      overviewClusters: [], // Still no matching cluster
      earthquakesLast72Hours: [{id: 'someotherquake', properties:{time: Date.now(), mag: 1, place: "Some Place"}, geometry:{coordinates:[1,2,3]}}],
      isLoadingDaily: false,
      isLoadingWeekly: false,
      isInitialAppLoad: false,
      currentLoadingMessage: '',
      dataFetchTime: Date.now(),
      lastUpdated: new Date().toLocaleString(),
    });

    // Rerender with the new mock state for useEarthquakeData
    // The MemoryRouter needs to be part of the rerender call to ensure context
    rerender(
      <MemoryRouter initialEntries={[problematicUrl]}>
        <App /> {/* App is HomePage */}
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/cluster not found/i)).toBeInTheDocument();
    });
  });
});
