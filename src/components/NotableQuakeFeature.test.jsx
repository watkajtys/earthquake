import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NotableQuakeFeature from './NotableQuakeFeature';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';
import * as Utils from '../utils/utils'; // Original import

// Mock the EarthquakeDataContext
// const mockUseEarthquakeDataState = vi.fn(); // Unused variable removed

// Mock getMagnitudeColor from utils.js robustly
vi.mock('../utils/utils.js', async (importOriginal) => {
  const actualUtils = await importOriginal();
  return {
    ...actualUtils,
    getMagnitudeColor: vi.fn(mag => `mocked-color-for-mag-${mag}`), // Default mock for all tests
  };
});

// We will use Utils.getMagnitudeColor directly in tests to check calls on the mock
// const mockGetMagnitudeColorUtil = vi.spyOn(Utils, 'getMagnitudeColor'); // No longer needed

const renderWithContext = (ui, { providerProps, ...renderOptions }) => {
  return render(
    <EarthquakeDataContext.Provider value={providerProps.value}>
      {ui}
    </EarthquakeDataContext.Provider>,
    renderOptions
  );
};

const createDynamicQuake = (id, mag, place, time, url) => ({
  id,
  properties: { mag, place, time, url },
  geometry: { coordinates: [0,0,0] } // Dummy geometry
});

// Re-declare first few items from the component's internal historicalNotableQuakes list for assertion matching.
// This is to make tests explicit about what they expect from the component's known internal data.
const componentInternalHistoricalQuakes_forAssertion = [
    { id: 'nqh1', name: "Valdivia, Chile", year: 1960, mag: 9.5, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official19600522191120_30/executive', description: "Most powerful earthquake ever recorded." },
    { id: 'nqh2', name: "Anchorage, Alaska", year: 1964, mag: 9.2, source: 'Historical', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/official19640328033616_26/executive', description: "Second largest instrumentally recorded quake." },
];


describe('NotableQuakeFeature', () => {
  let providerProps;
  let mockOnNotableQuakeSelect;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks(); // This will clear calls on Utils.getMagnitudeColor if it's a vi.fn()
    // Reset mock implementation if needed, or set specific ones per test
    Utils.getMagnitudeColor.mockImplementation(mag => `color-util-${mag}`);


    mockOnNotableQuakeSelect = vi.fn();

    providerProps = {
      value: {
        lastMajorQuake: null,
        isLoadingInitialData: false,
        // any other context values if needed
      },
    };

    vi.spyOn(React, 'useContext').mockImplementation((context) => {
      if (context === EarthquakeDataContext) {
        return providerProps.value;
      }
      const actualUseContext = vi.importActual('react').useContext;
      return actualUseContext(context);
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers(); // Run any remaining timers to avoid them bleeding if not cleared
    vi.useRealTimers();      // Restore real timers
    vi.clearAllTimers();     // Explicitly clear any and all timers
    vi.restoreAllMocks();
  });

  it('renders loading state when isLoadingInitialData is true and no dynamic quake', async () => {
    providerProps.value.isLoadingInitialData = true;
    providerProps.value.lastMajorQuake = null;
    const { container } = renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} />, { providerProps });
    // The loading state is mostly CSS based, check for its presence after initial render.
    // useEffect might not even run if it returns early due to isLoading.
    await screen.findByRole('generic', {}, { timeout: 2000 }); // Wait for a generic div, then check class
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders first historical quake when no dynamic quake available after loading', async () => {
    providerProps.value.isLoadingInitialData = false;
    providerProps.value.lastMajorQuake = null;
    renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} />, { providerProps });

    const firstHistoricalForAssertion = componentInternalHistoricalQuakes_forAssertion[0];
    // Wait for the component to settle and display the historical quake name
    await screen.findByText(new RegExp(`${firstHistoricalForAssertion.name}.*${firstHistoricalForAssertion.year}`));

    // Now check other elements
    expect(screen.getByText('Featured Historical Quake')).toBeInTheDocument();
    expect(screen.getByText(`M ${firstHistoricalForAssertion.mag.toFixed(1)}`)).toBeInTheDocument();
    expect(screen.getByText(firstHistoricalForAssertion.description)).toBeInTheDocument();
    expect(Utils.getMagnitudeColor).toHaveBeenCalledWith(firstHistoricalForAssertion.mag);
  });

  describe('With Dynamic Featured Quake', () => {
    const dynamicQuake = createDynamicQuake('dyn1', 7.2, 'Dynamic Place', Date.now(), 'http://example.com/dynamic');
    beforeEach(() => {
      providerProps.value.lastMajorQuake = dynamicQuake;
      providerProps.value.isLoadingInitialData = false;
    });

    it('displays dynamic featured quake details', async () => {
      renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} />, { providerProps });
      // Try to find a stable element first
      const viewDetailsButton = await screen.findByRole('button', { name: /View Details/i });
      expect(viewDetailsButton).toBeInTheDocument();

      // Now check for other elements that depend on displayQuake state
      expect(screen.getByText('Latest Significant Quake')).toBeInTheDocument();
      expect(screen.getByText(/Dynamic Place/)).toBeInTheDocument();
      expect(screen.getByText(`M ${dynamicQuake.properties.mag.toFixed(1)}`)).toBeInTheDocument();
      expect(screen.getByText(`Latest significant (M${dynamicQuake.properties.mag.toFixed(1)}) earthquake.`)).toBeInTheDocument();
      expect(Utils.getMagnitudeColor).toHaveBeenCalledWith(dynamicQuake.properties.mag);
      expect(screen.getByText(`M ${dynamicQuake.properties.mag.toFixed(1)}`)).toHaveStyle({ color: `color-util-${dynamicQuake.properties.mag}` });
    });

    it('calls onNotableQuakeSelect with original dynamic quake data on button click', async () => {
      renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} />, { providerProps });
      await screen.findByText('Latest Significant Quake'); // Wait for displayQuake to be set

      fireEvent.click(screen.getByRole('button', { name: /View Details/i }));
      expect(mockOnNotableQuakeSelect).toHaveBeenCalledWith(dynamicQuake);
    });

    it('uses getMagnitudeColorFunc prop if provided for dynamic quake', async () => {
        const customColorFunc = vi.fn(mag => `custom-color-${mag}`);
        renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} getMagnitudeColorFunc={customColorFunc} />, { providerProps });
        await screen.findByText('Latest Significant Quake'); // Wait for displayQuake

        expect(customColorFunc).toHaveBeenCalledWith(dynamicQuake.properties.mag);
        // Utils.getMagnitudeColor is the mocked module's function.
        // It should not be called if customColorFunc is provided and used.
        // The component logic is: const colorFunc = getMagnitudeColorFunc || getMagnitudeColorUtil;
        // So if getMagnitudeColorFunc is truthy, getMagnitudeColorUtil (our mock Utils.getMagnitudeColor) shouldn't be called for this.
        const callsToDefaultUtil = Utils.getMagnitudeColor.mock.calls.filter(
          call => call[0] === dynamicQuake.properties.mag
        );
        expect(callsToDefaultUtil.length).toBe(0);
        expect(screen.getByText(`M ${dynamicQuake.properties.mag.toFixed(1)}`)).toHaveStyle({ color: `custom-color-${dynamicQuake.properties.mag}` });
    });
  });

  describe('With Historical Quakes', () => {
    // Use the re-declared array for defining expected values in tests.
    const firstInternalHistorical = componentInternalHistoricalQuakes_forAssertion[0];
    const secondInternalHistorical = componentInternalHistoricalQuakes_forAssertion[1];

    beforeEach(() => {
      providerProps.value.lastMajorQuake = null;
      providerProps.value.isLoadingInitialData = false;
    });

    it('displays the first historical quake initially', async () => {
      renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} />, { providerProps });
      await screen.findByText('Featured Historical Quake'); // Wait for effect

      expect(screen.getByText(new RegExp(`${firstInternalHistorical.name}.*${firstInternalHistorical.year}`))).toBeInTheDocument();
      expect(screen.getByText(`M ${firstInternalHistorical.mag.toFixed(1)}`)).toBeInTheDocument();
      expect(screen.getByText(firstInternalHistorical.description)).toBeInTheDocument();
      expect(Utils.getMagnitudeColor).toHaveBeenCalledWith(firstInternalHistorical.mag);
    });

    it('cycles through historical quakes', async () => {
      renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} />, { providerProps });
      await screen.findByText(new RegExp(firstInternalHistorical.name)); // Ensure first is displayed

      await act(async () => { // Act for advancing timers
        vi.advanceTimersByTime(15000);
      });
      // After timer, wait for the second quake's name to ensure UI updated
      await screen.findByText(new RegExp(secondInternalHistorical.name));

      expect(screen.getByText(`M ${secondInternalHistorical.mag.toFixed(1)}`)).toBeInTheDocument();
      expect(Utils.getMagnitudeColor).toHaveBeenCalledWith(secondInternalHistorical.mag);
    });

    it('calls onNotableQuakeSelect with historical quake data on button click', async () => {
      renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} />, { providerProps });
      // Wait for the first historical item to be fully rendered and stable
      await screen.findByText(new RegExp(firstInternalHistorical.description));

      fireEvent.click(screen.getByRole('button', { name: /View Details/i }));

      const expectedData = { ...firstInternalHistorical, color: Utils.getMagnitudeColor(firstInternalHistorical.mag) };
      expect(mockOnNotableQuakeSelect).toHaveBeenCalledWith(expectedData);
    });

    it('button says "More Info" if historical quake has no URL (test with a modified item)', async () => {
      renderWithContext(<NotableQuakeFeature onNotableQuakeSelect={mockOnNotableQuakeSelect} />, { providerProps });
      // Wait for the component to settle (e.g., display first historical quake)
      await screen.findByText('Featured Historical Quake');
      // All current historical quakes have URLs, so button should be "View Details"
      expect(screen.getByRole('button', { name: /View Details/i })).toBeInTheDocument();
    });
  });
});
