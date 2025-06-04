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

// Mock global fetch
global.fetch = vi.fn();

// Mock matchMedia
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

describe('HomePage Accessibility', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch.mockReset();

    // Provide default successful mocks for initial data load by EarthquakeDataContext
    global.fetch.mockImplementation(async (url) => {
      if (url.includes('/api/overview')) {
        return {
          ok: true,
          json: async () => ({
            lastUpdated: Date.now(),
            keyStatsForGlobe: { lastHourCount: 1, count24h: 10, count72h: 20, strongest24h: { mag: 5, title: 'Test' } },
            topActiveRegionsOverview: [],
            latestFeelableQuakesSnippet: [],
            recentSignificantQuakesForOverview: [],
            overviewClusters: [],
            lastMajorQuake: null,
            previousMajorQuake: null,
            timeBetweenPreviousMajorQuakes: null,
          }),
        };
      }
      if (url.includes('/api/feed')) { // Default feed call
        return {
          ok: true,
          json: async () => ({
            period: 'last_7_days', // Or whatever the default is
            lastUpdated: Date.now(),
            earthquakes: [],
            statistics: { count: 0 },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'Unhandled API call in HomePage test mock' }) };
    });
  });

  it('should have no axe violations on initial render', async () => {
    let container;
    // No need to suppress console.error for fetchDataCb as it's no longer used.
    // However, we might see errors from the new fetch if mocks are not perfectly aligned.

    await act(async () => {
      const renderResult = render(
        <MemoryRouter initialEntries={['/']}>
          <EarthquakeDataProvider>
            <UIStateProvider>
              <App />
            </UIStateProvider>
          </EarthquakeDataProvider>
        </MemoryRouter>
      );
      container = renderResult.container;
      // Allow time for context to fetch and update state
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    const results = await axe(container); // axe can be run outside act if DOM is stable
    expect(results).toHaveNoViolations();
  }, 15000);
});
