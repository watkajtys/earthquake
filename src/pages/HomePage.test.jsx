import React from 'react';
import { render, act } from '@testing-library/react'; // Import act
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { expect, describe, it, vi } from 'vitest'; // Import vi
import App from './HomePage'; // Assuming HomePage is the default export from App.jsx or HomePage.jsx
import { EarthquakeDataProvider } from '../contexts/EarthquakeDataContext.jsx'; // Import the provider
import { UIStateProvider } from '../contexts/UIStateContext.jsx'; // Import UIStateProvider

vi.mock('../utils/fetchUtils.js'); // Mock fetchDataCb

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

    let container;
    await act(async () => {
      const renderResult = render(
        <MemoryRouter initialEntries={['/']}>
          <EarthquakeDataProvider>
            <UIStateProvider> {/* Wrap with UIStateProvider */}
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
