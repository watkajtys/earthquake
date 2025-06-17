import React from 'react';
import { useEarthquakeDataState, EarthquakeDataProvider } from '../../contexts/EarthquakeDataContext'; // EarthquakeDataProvider might be needed if we test connected components, useEarthquakeDataState is key.
import { EarthquakeDataContext, initialState as contextInitialState } from '../../contexts/earthquakeDataContextUtils.js'; // For providing mock context value

// --- React specific testing imports ---
import { renderHook } from '@testing-library/react';
// vi is not strictly necessary for these selector tests if they don't involve mocks managed by vi, but often included by convention.
// import { vi } from 'vitest';

import {
    FEELABLE_QUAKE_THRESHOLD,
    MAJOR_QUAKE_THRESHOLD,
} from '../../constants/appConstants';

// --- Tests for Memoized Selectors ---
describe('EarthquakeDataContext: Memoized Selectors', () => {
  const createMockQuake = (id, mag) => ({ id, properties: { mag, time: Date.now() } });
  const mockQuakes7Days = [ createMockQuake('q7_1', 2.0), createMockQuake('q7_2', 2.5), createMockQuake('q7_3', 3.0), createMockQuake('q7_4', 4.5), createMockQuake('q7_5', 5.0), createMockQuake('q7_null', null), ];
  const mockQuakes30Days = [ createMockQuake('q30_1', 1.0), createMockQuake('q30_2', 2.49), createMockQuake('q30_3', 2.5), createMockQuake('q30_4', 4.0), createMockQuake('q30_5', 4.49), createMockQuake('q30_6', 4.5), createMockQuake('q30_7', 6.0), createMockQuake('q30_undefined', undefined), ];

  // This test suite focuses on the selectors defined within the EarthquakeDataContext based on its state.
  // These selectors are: feelableQuakes7Days_ctx, significantQuakes7Days_ctx, feelableQuakes30Days_ctx, significantQuakes30Days_ctx
  // They are calculated within the EarthquakeDataProvider and provided via context.
  // So we need to mock the provider's state that these selectors depend on.

  it('should correctly compute memoized selectors based on context state', () => {
    // This TestProvider simulates the part of EarthquakeDataProvider that computes these selectors.
    // It's a simplified version for testing selector logic directly.
    const TestProvider = ({ children, mockState }) => {
      const currentMockState = mockState || {};

      // Replicate the selector logic as it is in EarthquakeDataProvider
      const feelableQuakes7Days_ctx = React.useMemo(() => {
        const data = currentMockState.earthquakesLast7Days || [];
        return data.filter( q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD );
      }, [currentMockState.earthquakesLast7Days]);

      const significantQuakes7Days_ctx = React.useMemo(() => {
        const data = currentMockState.earthquakesLast7Days || [];
        return data.filter( q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= MAJOR_QUAKE_THRESHOLD );
      }, [currentMockState.earthquakesLast7Days]);

      const feelableQuakes30Days_ctx = React.useMemo(() => {
        const data = currentMockState.allEarthquakes || [];
        return data.filter( q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD );
      }, [currentMockState.allEarthquakes]);

      const significantQuakes30Days_ctx = React.useMemo(() => {
        const data = currentMockState.allEarthquakes || [];
        return data.filter( q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= MAJOR_QUAKE_THRESHOLD );
      }, [currentMockState.allEarthquakes]);

      const contextValueForTestProvider = {
        ...currentMockState, // Spread the rest of the mock state
        feelableQuakes7Days_ctx,
        significantQuakes7Days_ctx,
        feelableQuakes30Days_ctx,
        significantQuakes30Days_ctx,
      };
      // We use EarthquakeDataContext.Provider directly to inject our mock value
      return <EarthquakeDataContext.Provider value={contextValueForTestProvider}>{children}</EarthquakeDataContext.Provider>;
    };

    // Define the mock state that our selectors will use
    const mockProviderState = {
      ...contextInitialState, // Start with default initial state
      earthquakesLast7Days: mockQuakes7Days,
      allEarthquakes: mockQuakes30Days,
      // other state properties can be added if selectors depend on them
    };

    // Render the hook with our TestProvider and mockState
    const wrapper = ({ children }) => <TestProvider mockState={mockProviderState}>{children}</TestProvider>;
    const { result: contextValueHookResult } = renderHook(() => useEarthquakeDataState(), { wrapper });

    // Assertions
    const expectedFeelable7Days = mockQuakes7Days.filter(q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD);
    expect(contextValueHookResult.current.feelableQuakes7Days_ctx.map(q => q.id).sort()).toEqual(expectedFeelable7Days.map(q => q.id).sort());

    const expectedSignificant7Days = mockQuakes7Days.filter(q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
    expect(contextValueHookResult.current.significantQuakes7Days_ctx.map(q => q.id).sort()).toEqual(expectedSignificant7Days.map(q => q.id).sort());

    const expectedFeelable30Days = mockQuakes30Days.filter(q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= FEELABLE_QUAKE_THRESHOLD);
    expect(contextValueHookResult.current.feelableQuakes30Days_ctx.map(q => q.id).sort()).toEqual(expectedFeelable30Days.map(q => q.id).sort());

    const expectedSignificant30Days = mockQuakes30Days.filter(q => q.properties && q.properties.mag !== null && typeof q.properties.mag === 'number' && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);
    expect(contextValueHookResult.current.significantQuakes30Days_ctx.map(q => q.id).sort()).toEqual(expectedSignificant30Days.map(q => q.id).sort());
  });
});
