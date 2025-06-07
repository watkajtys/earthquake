import React from 'react';
import { render, act } from '@testing-library/react'; // Import act
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { expect, describe, it, vi } from 'vitest'; // Import vi
import App from './HomePage'; // Assuming HomePage is the default export from App.jsx or HomePage.jsx
import { EarthquakeDataProvider } from '../contexts/EarthquakeDataContext.jsx'; // Import the provider
import { UIStateProvider } from '../contexts/UIStateContext.jsx'; // Import the UIStateProvider

vi.mock('../utils/fetchUtils.js'); // Mock fetchDataCb

// Attempt to directly mock usgsApiService as well
vi.mock('../services/usgsApiService.js', async () => {
  const actual = await vi.importActual('../services/usgsApiService.js');
  return {
    ...actual,
    fetchUsgsData: vi.fn().mockResolvedValue({
      // Provide a generic successful response structure
      features: [{ id: 'mockedGlobalFetch', properties: {}, geometry: {} }],
      metadata: { count: 1 }
    }),
  };
});

// Mock IntersectionObserver
class IntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('IntersectionObserver', IntersectionObserver);

// --- Mock for processedDataService ---
// import { vi as jestVi } from 'vitest'; // No need for alias if vi is consistently used

// Mock the service and its function. vi.mock is hoisted.
vi.mock('../services/processedDataService', () => ({
  fetchProcessedEarthquakeData: vi.fn(),
}));

// Import the service AFTER vi.mock to get the mocked version.
// This handle will point to the vi.fn() defined in the factory above.
import { fetchProcessedEarthquakeData } from '../services/processedDataService';

const getMockContextData = () => ({
  data: {
    isLoadingData: false,
    isInitialAppLoad: false,
    error: null,
    dataFetchTime: Date.now(),
    lastUpdated: new Date().toISOString(),
    earthquakesLastHour: [], earthquakesPriorHour: [], earthquakesLast24Hours: [],
    earthquakesLast72Hours: [], earthquakesLast7Days: [], earthquakesLast14Days: [],
    earthquakesLast30Days: [],
    allEarthquakesMonth: { features: [] }, // Corrected: ensure this matches expected structure if it's not an array
    prev24HourData: [], prev7DayData: [], prev14DayData: [],
    globeEarthquakes: [], hasRecentTsunamiWarning: false, highestRecentAlert: null,
    activeAlertTriggeringQuakes: [], lastMajorQuake: null, previousMajorQuake: null,
    timeBetweenPreviousMajorQuakes: null, tsunamiTriggeringQuake: null,
    dailyCounts7Days: [], dailyCounts14Days: [], dailyCounts30Days: [],
    sampledEarthquakesLast7Days: [], sampledEarthquakesLast14Days: [], sampledEarthquakesLast30Days: [],
    magnitudeDistribution7Days: [], magnitudeDistribution14Days: [], magnitudeDistribution30Days: [],
    feelableQuakes7Days_ctx: [], significantQuakes7Days_ctx: [],
    feelableQuakes30Days_ctx: [], significantQuakes30Days_ctx: [],
  },
  error: null,
});

// Default mock implementation before each test in the suite
beforeEach(() => {
  fetchProcessedEarthquakeData.mockResolvedValue(getMockContextData());
});

afterEach(() => {
  fetchProcessedEarthquakeData.mockReset();
});
// --- End Mock for processedDataService ---

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

    let container;
    await act(async () => {
      const renderResult = render(
        <MemoryRouter initialEntries={['/']}>
          <EarthquakeDataProvider>
            <UIStateProvider> {/* Added UIStateProvider */}
              <App />
            </UIStateProvider>
          </EarthquakeDataProvider>
        </MemoryRouter>
      );
      container = renderResult.container;
      // Wait for initial data loading to settle, if possible, or use a timeout.
      // For critical async content, ideally wait for elements to appear.
      // Here, we'll test the initial state which includes loading states.
      // Let's give a brief moment for initial effects.
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    const results = await act(async () => await axe(container));
    expect(results).toHaveNoViolations();

    // Restore console.error
    console.error = originalConsoleError;
  }, 15000); // Increase timeout for this test due to potential async operations
});
