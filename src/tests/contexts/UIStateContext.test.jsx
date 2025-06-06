import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { UIStateProvider, useUIState } from '../../contexts/UIStateContext';
// import { useSearchParams } from 'react-router-dom'; // Unused direct import
import { vi } from 'vitest'; // Import vi for Vitest specific functions

// Mock react-router-dom's useSearchParams
const mockSetSearchParams = vi.fn();
let mockSearchParamsGet;

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useSearchParams: () => {
      const searchParams = {
        get: mockSearchParamsGet,
      };
      return [searchParams, mockSetSearchParams];
    },
  };
});

// Wrapper component to provide the UIStateProvider
const TestWrapper = ({ children }) => (
  <UIStateProvider>{children}</UIStateProvider>
);

describe('UIStateContext', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockSetSearchParams.mockReset(); // Resets mock state, implementation, and calls
    // Default mock for searchParams.get, can be overridden in specific tests
    mockSearchParamsGet = vi.fn().mockReturnValue(null);
  });

  it('should provide the correct initial state', () => {
    const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });

    expect(result.current.activeSidebarView).toBe('overview_panel');
    expect(result.current.activeFeedPeriod).toBe('last_24_hours');
    expect(result.current.globeFocusLng).toBe(0);
    expect(result.current.focusedNotableQuake).toBeNull();
  });

  it('should read initial activeSidebarView from URL search params', () => {
    mockSearchParamsGet = vi.fn(param => {
      if (param === 'sidebarActiveView') return 'details_panel';
      return null;
    });
    const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });
    expect(result.current.activeSidebarView).toBe('details_panel');
  });

  it('should read initial activeFeedPeriod from URL search params', () => {
    mockSearchParamsGet = vi.fn(param => {
      if (param === 'activeFeedPeriod') return 'last_7_days';
      return null;
    });
    const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });
    expect(result.current.activeFeedPeriod).toBe('last_7_days');
  });

  describe('changeSidebarView function', () => {
    it('should update activeSidebarView and URL search params', () => {
      const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });
      const newView = 'stats_panel';

      act(() => {
        result.current.setActiveSidebarView(newView);
      });

      expect(result.current.activeSidebarView).toBe(newView);
      expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
      // Check what setSearchParams was called with. It's a function that takes prevParams.
      // We can inspect the call to the function passed to setSearchParams.
      const setSearchParamsUpdater = mockSetSearchParams.mock.calls[0][0];
      const prevParams = new URLSearchParams(); // Simulate empty previous params
      const newSearchQuery = setSearchParamsUpdater(prevParams);
      expect(newSearchQuery.get('sidebarActiveView')).toBe(newView);
    });

    it('should default to overview_panel if no view is provided and update URL', () => {
        const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });

        act(() => {
          result.current.setActiveSidebarView(null); // or undefined
        });

        expect(result.current.activeSidebarView).toBe('overview_panel');
        expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
        const setSearchParamsUpdater = mockSetSearchParams.mock.calls[0][0];
        const prevParams = new URLSearchParams();
        const newSearchQuery = setSearchParamsUpdater(prevParams);
        expect(newSearchQuery.get('sidebarActiveView')).toBe('overview_panel');
    });

    it('should not call setSearchParams if view is already set in URL (but still update state)', () => {
        mockSearchParamsGet = vi.fn(param => {
            if (param === 'sidebarActiveView') return 'stats_panel';
            return null;
          });
        const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });

        // Initial state should be from URL due to useEffect in provider.
        // Note: The useEffect in the provider might run after initial render.
        // For a robust test of this, one might need to wait for effects or structure the mock differently.
        // However, the core logic of `changeSidebarView` itself is `if (searchParams.get() !== newView)`.
        // So, if `searchParams.get()` returns the newView, it won't call.
        // The useEffect might also call setActiveSidebarView_internal, which doesn't call setSearchParams.
        // Let's assume the initial state is correctly set by the time changeSidebarView is called by the test.
        // The hook's internal state `activeSidebarView` is initialized from `searchParams.get('sidebarActiveView')`.
        // So, it will be 'stats_panel' at the start of this test.
        expect(result.current.activeSidebarView).toBe('stats_panel');

        act(() => {
            result.current.setActiveSidebarView('stats_panel');
        });

        expect(result.current.activeSidebarView).toBe('stats_panel');
        expect(mockSetSearchParams).not.toHaveBeenCalled();
    });
  });

  describe('changeActiveFeedPeriod function', () => {
    it('should update activeFeedPeriod and URL search params', () => {
      const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });
      const newPeriod = 'last_30_days';

      act(() => {
        result.current.setActiveFeedPeriod(newPeriod);
      });

      expect(result.current.activeFeedPeriod).toBe(newPeriod);
      expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
      const setSearchParamsUpdater = mockSetSearchParams.mock.calls[0][0];
      const prevParams = new URLSearchParams();
      const newSearchQuery = setSearchParamsUpdater(prevParams);
      expect(newSearchQuery.get('activeFeedPeriod')).toBe(newPeriod);
    });

    it('should default to last_24_hours if no period is provided and update URL', () => {
        const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });

        act(() => {
          result.current.setActiveFeedPeriod(null); // or undefined
        });

        expect(result.current.activeFeedPeriod).toBe('last_24_hours');
        expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
        const setSearchParamsUpdater = mockSetSearchParams.mock.calls[0][0];
        const prevParams = new URLSearchParams();
        const newSearchQuery = setSearchParamsUpdater(prevParams);
        expect(newSearchQuery.get('activeFeedPeriod')).toBe('last_24_hours');
    });

    it('should not call setSearchParams if period is already set in URL (but still update state)', () => {
        mockSearchParamsGet = vi.fn(param => {
            if (param === 'activeFeedPeriod') return 'last_7_days';
            return null;
          });
        const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });

        // Similar to the sidebar test, activeFeedPeriod is initialized from the URL param.
        expect(result.current.activeFeedPeriod).toBe('last_7_days');

        act(() => {
            result.current.setActiveFeedPeriod('last_7_days');
        });

        expect(result.current.activeFeedPeriod).toBe('last_7_days');
        expect(mockSetSearchParams).not.toHaveBeenCalled();
    });
  });

  describe('setGlobeFocusLng function', () => {
    it('should update globeFocusLng', () => {
      const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });
      const newLng = -122.4194; // San Francisco longitude

      act(() => {
        result.current.setGlobeFocusLng(newLng);
      });

      expect(result.current.globeFocusLng).toBe(newLng);
      expect(mockSetSearchParams).not.toHaveBeenCalled(); // Should not affect URL params
    });
  });

  describe('setFocusedNotableQuake function', () => {
    it('should update focusedNotableQuake', () => {
      const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });
      const mockQuake = { id: 'testquake1', properties: { mag: 5.5, place: 'Test Place, CA' } };

      act(() => {
        result.current.setFocusedNotableQuake(mockQuake);
      });

      expect(result.current.focusedNotableQuake).toEqual(mockQuake);
      expect(mockSetSearchParams).not.toHaveBeenCalled(); // Should not affect URL params
    });

    it('should allow setting focusedNotableQuake to null', () => {
        const { result } = renderHook(() => useUIState(), { wrapper: TestWrapper });
        const mockQuake = { id: 'testquake1', properties: { mag: 5.5, place: 'Test Place, CA' } };

        act(() => {
          result.current.setFocusedNotableQuake(mockQuake);
        });
        expect(result.current.focusedNotableQuake).toEqual(mockQuake);

        act(() => {
            result.current.setFocusedNotableQuake(null);
        });
        expect(result.current.focusedNotableQuake).toBeNull();
      });
  });
});
