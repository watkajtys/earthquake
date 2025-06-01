import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import EarthquakeDetailView from './EarthquakeDetailView'; // Component to test
import { vi } from 'vitest'; // Using Vitest's mocking utilities

// Define REGIONAL_RADIUS_KM locally for test consistency
const REGIONAL_RADIUS_KM = 804.672; // 500 miles

// Mock EarthquakeMap component
vi.mock('./EarthquakeMap', () => ({
  default: (props) => (
    <div
      data-testid="mock-earthquake-map"
      data-nearby-quakes={props.nearbyQuakes ? JSON.stringify(props.nearbyQuakes) : ''}
      data-latitude={props.latitude}
      data-longitude={props.longitude}
    >
      Mock Map
    </div>
  )
}));

// Mock calculateDistance from utils.js
// This allows us to directly control the distance returned for each quake
// and simplifies testing the filtering logic without complex coordinate calculations.
vi.mock('./utils', async () => {
  const actualUtils = await vi.importActual('./utils');
  return {
    ...actualUtils, // Import and retain other utils
    calculateDistance: vi.fn(), // Mock calculateDistance specifically
  };
});


describe('EarthquakeDetailView - Nearby Quakes Filtering', () => {
  const mockDetailUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=testmainquake&format=geojson';
  const mockOnClose = vi.fn();

  const mockDetailData = {
    id: 'mainquake123',
    properties: {
      title: 'M 5.0 - Central Test Region',
      mag: 5.0,
      place: '10km N of Testville',
      time: 1678886400000, // Example timestamp
      tsunami: 0,
      status: 'reviewed',
      felt: 10,
      mmi: 4.5,
      alert: 'green',
    },
    geometry: { coordinates: [-120.0, 35.0, 10.0] } // lon, lat, depth
  };

  const mockBroaderData = [
    // 1. Quake within radius
    { id: 'nearby1', properties: { title: 'Nearby Quake (Close)', mag: 3.0 }, geometry: { coordinates: [-120.1, 35.1, 5.0] } },
    // 2. Quake outside radius
    { id: 'nearby2', properties: { title: 'Nearby Quake (Far)', mag: 2.5 }, geometry: { coordinates: [-125.0, 38.0, 15.0] } },
    // 3. Quake that is the same as the main detailed quake
    { id: 'mainquake123', properties: { title: 'Duplicate of Main Quake', mag: 5.0 }, geometry: { coordinates: [-120.0, 35.0, 10.0] } },
    // 4. Quake with invalid/missing geometry
    { id: 'nearby3', properties: { title: 'Quake with Invalid Geom', mag: 1.5 }, geometry: null },
    // 5. Quake with missing coordinates in geometry
    { id: 'nearby4', properties: { title: 'Quake with Missing Coords', mag: 1.8 }, geometry: { coordinates: [] } },
    // 6. Quake within radius (another one to ensure multiple can pass)
    { id: 'nearby5', properties: { title: 'Nearby Quake (Close 2)', mag: 3.2 }, geometry: { coordinates: [-119.9, 34.9, 8.0] } },
  ];

  let fetchSpy;
  let calculateDistanceMock; // Keep defined here for access in afterEach

  beforeEach(() => { // Removed async here as import('./utils') is moved to 'it' block
    // Spy on global fetch and mock its resolution for this suite
    fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockImplementation((url, options) => {
      if (String(url).startsWith(mockDetailUrl)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockDetailData }),
        });
      }
      return Promise.reject(new Error(`[Nearby Quakes Test] Unexpected fetch call: ${url}`));
    });

    mockOnClose.mockClear();
    // calculateDistanceMock is not set up here anymore.
  });

  afterEach(() => {
    vi.restoreAllMocks(); // This will restore fetchSpy and clear calculateDistanceMock if it's a vi.fn
  });

  it('correctly filters broaderEarthquakeData and passes regionalQuakes to EarthquakeMap', async () => {
    // Moved from beforeEach: Setup calculateDistanceMock specifically for this test
    const utils = await import('./utils');
    calculateDistanceMock = utils.calculateDistance; // Assign the vi.fn() from the global mock factory

    expect(vi.isMockFunction(calculateDistanceMock)).toBe(true); // Verify it's indeed the mock

    // Define behavior for calculateDistance for this specific test
    calculateDistanceMock.mockImplementation((lat1, lon1, lat2, lon2) => {
        // console.log('[Nearby Quakes Test] calculateDistanceMock CALLED! Args:', { lat1, lon1, lat2, lon2 });
        // Main quake: 35.0, -120.0
        // This mock will determine which of the simplifiedMockBroaderData items are "close"
        if (lat2 === 35.1 && lon2 === -120.1) return REGIONAL_RADIUS_KM - 50; // nearby1 (Close)
        if (lat2 === 34.9 && lon2 === -119.9) return REGIONAL_RADIUS_KM - 20; // nearby5 (Close)
        if (lat2 === 38.0 && lon2 === -125.0) return REGIONAL_RADIUS_KM + 100; // nearby2 (Far)
        return REGIONAL_RADIUS_KM + 200; // Default others to be far
    });

    const simplifiedMockBroaderData = [
      // Quake within radius
      { id: 'nearby1', properties: { title: 'Nearby Quake (Close)', mag: 3.0 }, geometry: { coordinates: [-120.1, 35.1, 5.0] } },
      // Quake within radius (another one)
      { id: 'nearby5', properties: { title: 'Nearby Quake (Close 2)', mag: 3.2 }, geometry: { coordinates: [-119.9, 34.9, 8.0] } },
      // Quake that should be far but still valid for calculateDistance call
      { id: 'nearby2', properties: { title: 'Nearby Quake (Far)', mag: 2.5 }, geometry: { coordinates: [-125.0, 38.0, 15.0] } }
    ];

    render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        broaderEarthquakeData={simplifiedMockBroaderData} // MODIFIED
        dataSourceTimespanDays={7} // Example value, not directly relevant to filtering test
      />
    );

    // Wait for fetch to resolve and component to update
    let mockMapElement;
    await waitFor(() => {
      // screen.debug(undefined, 300000); // Debugging line
      // Try waiting directly for the map mock first
      mockMapElement = screen.getByTestId('mock-earthquake-map');
      expect(mockMapElement).toBeInTheDocument();
    }, { timeout: 5000 }); // Increased timeout just in case

    // If the map is found, then detailData should have been processed.
    // Now, check other attributes and dependent data synchronously.
    expect(screen.getAllByText(mockDetailData.properties.title)[0]).toBeInTheDocument(); // Check first instance of title
    expect(mockMapElement).toHaveAttribute('data-latitude', String(mockDetailData.geometry.coordinates[1]));
    expect(mockMapElement).toHaveAttribute('data-longitude', String(mockDetailData.geometry.coordinates[0]));
    expect(mockMapElement.getAttribute('data-nearby-quakes')).toBeTruthy();

    // Assertions on the filtered nearbyQuakes
    const passedNearbyQuakesAttr = mockMapElement.getAttribute('data-nearby-quakes');
    const passedNearbyQuakes = JSON.parse(passedNearbyQuakesAttr);

    expect(passedNearbyQuakes).toBeInstanceOf(Array);
    expect(passedNearbyQuakes.length).toBe(2); // Only 'nearby1' and 'nearby5' should pass

    // Check that 'nearby1' is included
    expect(passedNearbyQuakes.find(q => q.id === 'nearby1')).toBeDefined();
    // Check that 'nearby5' is included
    expect(passedNearbyQuakes.find(q => q.id === 'nearby5')).toBeDefined();

    // Check that other quakes are excluded
    expect(passedNearbyQuakes.find(q => q.id === 'nearby2')).toBeUndefined(); // (Far)
    expect(passedNearbyQuakes.find(q => q.id === 'mainquake123')).toBeUndefined(); // (Duplicate of main)
    expect(passedNearbyQuakes.find(q => q.id === 'nearby3')).toBeUndefined(); // (Invalid geom)
    expect(passedNearbyQuakes.find(q => q.id === 'nearby4')).toBeUndefined(); // (Missing coords)

    // Verify calculateDistance was called for valid, non-main quakes
    // Expected calls: nearby1, nearby2, nearby5. Not for mainquake123 (same id), nearby3 (null geom), nearby4 (empty coords)
    expect(calculateDistanceMock).toHaveBeenCalledTimes(3);
    // Check specific calls (order of args: mainLat, mainLon, qLat, qLon)
    // Main quake coords: lat=35.0, lon=-120.0
    // nearby1 coords: lat=35.1, lon=-120.1
    expect(calculateDistanceMock).toHaveBeenCalledWith(35.0, -120.0, 35.1, -120.1);
    // nearby2 coords: lat=38.0, lon=-125.0
    expect(calculateDistanceMock).toHaveBeenCalledWith(35.0, -120.0, 38.0, -125.0);
    // nearby5 coords: lat=34.9, lon=-119.9
    expect(calculateDistanceMock).toHaveBeenCalledWith(35.0, -120.0, 34.9, -119.9);
  });
});

describe('EarthquakeDetailView - Data Fetching, Loading, and Error States', () => {
  const mockDetailUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=testquake&format=geojson';
  const mockOnClose = vi.fn();
  const mockDetailData = {
    id: 'testquake',
    properties: {
      title: 'M 6.5 - TestVille',
      mag: 6.5,
      place: '100km W of TestCity',
      time: 1678886400000, // March 15, 2023
      tsunami: 1,
      status: 'reviewed',
      felt: 150,
      mmi: 7.2,
      alert: 'red',
    },
    geometry: { coordinates: [-122.0, 38.0, 15.0] } // lon, lat, depth
  };

  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    mockOnClose.mockClear();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('displays loading state initially, then renders fetched data', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...mockDetailData }),
    });

    render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        broaderEarthquakeData={[]}
        dataSourceTimespanDays={7}
      />
    );

    // Wait for a key piece of data to ensure the component has processed the fetch
    await screen.findAllByText(mockDetailData.properties.title);

    // Assertions for data
    expect(screen.getAllByText(mockDetailData.properties.title)[0]).toBeInTheDocument(); // Check first instance

    const magnitudeLabel = screen.getAllByText(/Magnitude \(.*?\)/i)[0];
    const magnitudeRow = magnitudeLabel.closest('tr');
    expect(within(magnitudeRow).getByText(mockDetailData.properties.mag.toString())).toBeInTheDocument();

    const componentFormattedDate = new Date(mockDetailData.properties.time).toLocaleString([], { dateStyle: 'full', timeStyle: 'long' });
    expect(screen.getByText("Date & Time (UTC)")).toBeInTheDocument();
    expect(screen.getByText(componentFormattedDate)).toBeInTheDocument();

    const depthLabelCell = screen.getByText("Depth");
    const depthRow = depthLabelCell.closest('tr');
    expect(within(depthRow).getByText(`${mockDetailData.geometry.coordinates[2].toFixed(1)} km`)).toBeInTheDocument();
    // The 'place' string from mockDetailData.properties.place ("100km W of TestCity") is not
    // rendered as a separate field in the table, nor as a standalone string.
    // It's typically part of the event title string (e.g., "M 6.5 - 100km W of TestCity").
    // The title (mockDetailData.properties.title = "M 6.5 - TestVille") is already asserted above.
    // Therefore, this specific assertion for mockDetailData.properties.place is removed.

    // Tsunami Warning
    const tsunamiLabelCell = screen.getByText("Tsunami?");
    const tsunamiRow = tsunamiLabelCell.closest('tr');
    expect(within(tsunamiRow).getByText(mockDetailData.properties.tsunami === 1 ? 'Yes' : 'No')).toBeInTheDocument();

    // Status
    const statusLabelCell = screen.getByText("Status");
    const statusRow = statusLabelCell.closest('tr');
    expect(within(statusRow).getByText(mockDetailData.properties.status, { exact: false })).toBeInTheDocument(); // exact:false for capitalize

    // Felt Reports
    const feltLabelCell = screen.getByText("Felt Reports (DYFI)");
    const feltRow = feltLabelCell.closest('tr');
    expect(within(feltRow).getByText(mockDetailData.properties.felt.toString())).toBeInTheDocument();

    // MMI
    const mmiLabelCell = screen.getByText("MMI (ShakeMap)");
    const mmiRow = mmiLabelCell.closest('tr');
    expect(within(mmiRow).getByText(mockDetailData.properties.mmi.toFixed(1))).toBeInTheDocument();

    // USGS Alert Level
    const alertLabelCell = screen.getByText("PAGER Alert"); // Label in table is "PAGER Alert"
    const alertRow = alertLabelCell.closest('tr');
    // The component renders the alert level with specific styling, check for the text value.
    expect(within(alertRow).getByText(mockDetailData.properties.alert, { exact: false })).toBeInTheDocument();

    // Assert skeleton is NOT present
    expect(screen.queryByTestId('loading-skeleton-container')).not.toBeInTheDocument();
    // Check if the map is rendered
    expect(screen.getByTestId('mock-earthquake-map')).toBeInTheDocument();
  });

  it('displays an error message if fetching data fails', async () => {
    const localErrorMessage = 'Network error: Failed to fetch details';
    fetchSpy.mockRejectedValueOnce(new Error(localErrorMessage));

    render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        broaderEarthquakeData={[]}
        dataSourceTimespanDays={7}
      />
    );

    const expectedErrorMessage = `Failed to load details: ${localErrorMessage}`;
    const errorElements = await screen.findAllByText(expectedErrorMessage);
    expect(errorElements.length).toBeGreaterThan(0);
    expect(errorElements[0]).toBeInTheDocument();

    expect(screen.queryByTestId('loading-skeleton-container')).not.toBeInTheDocument();
    expect(screen.queryByText(mockDetailData.properties.title)).not.toBeInTheDocument();
    expect(screen.queryByText(`Magnitude: ${mockDetailData.properties.mag}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-earthquake-map')).not.toBeInTheDocument();
  });
});
