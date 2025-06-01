import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
// Corrected path and ensure calculateDistance is directly mocked.
vi.mock('../utils/utils.js', () => ({
    calculateDistance: vi.fn(),
    getMagnitudeColor: vi.fn((mag) => '#FFFFFF'), // Provide a simple mock implementation
    // Add other functions from utils.js if they are directly called by EarthquakeDetailView
    // or its direct children other than SimplifiedDepthProfile, though for this test,
    // only what's needed to prevent crashes in children is essential.
}));

// Import the mocked function after setting up the mock
import { calculateDistance as calculateDistanceMock } from '../utils/utils.js';


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
  // calculateDistanceMock is now imported directly after vi.mock

  beforeEach(() => {
    // Spy on global fetch and mock its resolution
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockDetailData }),
    });

    // Reset mocks before each test
    mockOnClose.mockClear();
    calculateDistanceMock.mockClear(); // calculateDistanceMock is now directly available
  });

  afterEach(() => {
    // Restore original fetch implementation
    fetchSpy.mockRestore();
  });

  it('correctly filters broaderEarthquakeData and passes regionalQuakes to EarthquakeMap', async () => {
    // Define behavior for calculateDistance:
    // quake1 (nearby1) -> within radius
    calculateDistanceMock.mockImplementation((lat1, lon1, lat2, lon2) => {
        // A simple way to identify which quake is which for mocking,
        // assuming lat/lon are somewhat unique in mockBroaderData.
        // Main quake: 35.0, -120.0
        // nearby1: 35.1, -120.1 -> make it close
        if (lat2 === 35.1 && lon2 === -120.1) return REGIONAL_RADIUS_KM - 50; // within
        // nearby2: 38.0, -125.0 -> make it far
        if (lat2 === 38.0 && lon2 === -125.0) return REGIONAL_RADIUS_KM + 100; // outside
        // nearby5: 34.9, -119.9 -> make it close
        if (lat2 === 34.9 && lon2 === -119.9) return REGIONAL_RADIUS_KM - 20; // within
        return REGIONAL_RADIUS_KM + 200; // Default others to be far
    });

    render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        broaderEarthquakeData={mockBroaderData}
        dataSourceTimespanDays={7} // Example value, not directly relevant to filtering test
      />
    );

    // Wait for fetch to resolve and component to update
    let mockMapElement;
    await waitFor(() => {
      mockMapElement = screen.getByTestId('mock-earthquake-map');
      expect(mockMapElement).toBeInTheDocument();
      // Check if latitude/longitude from main quake are passed (confirms detailData is processed)
      expect(mockMapElement).toHaveAttribute('data-latitude', String(mockDetailData.geometry.coordinates[1]));
      expect(mockMapElement).toHaveAttribute('data-longitude', String(mockDetailData.geometry.coordinates[0]));
      // Check if nearbyQuakes attribute is present, indicating the filtering logic has run
      expect(mockMapElement.getAttribute('data-nearby-quakes')).toBeTruthy();
    });

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
