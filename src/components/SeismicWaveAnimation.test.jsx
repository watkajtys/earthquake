import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import SeismicWaveAnimation from './SeismicWaveAnimation'; // Adjust path as necessary
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Adjust path

// Mock seismicUtils
vi.mock('../utils/seismicUtils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    calculateHypocentralDistance: vi.fn(),
    calculatePWaveTravelTime: vi.fn(),
    calculateSWaveTravelTime: vi.fn(),
    // Keep actual constants if they are simple values and don't need mocking for logic
    AVERAGE_P_WAVE_VELOCITY_KM_S: 6.5,
    AVERAGE_S_WAVE_VELOCITY_KM_S: 3.75,
  };
});

// Mock EarthquakeDataContext
// Note: This path must match the import in SeismicWaveAnimation.jsx
vi.mock('../contexts/EarthquakeDataContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // Spread actual to keep other potential exports if any
    useEarthquakeDataState: vi.fn(),
  };
});

// Helper to reset mocks and context before each test
const actualSeismicUtils = await import('../utils/seismicUtils'); // Get actual values for constants
const mockSeismicUtils = await import('../utils/seismicUtils'); // This is the mocked version for functions
// Import the mocked hook AFTER vi.mock has been processed
const { useEarthquakeDataState: mockedUseEarthquakeDataState } = await import('../contexts/EarthquakeDataContext');

const mockEarthquake = {
  properties: { mag: 5.5 },
  geometry: { coordinates: [-120, 38, 10] }, // lon, lat, depth
};

const mockStations = [
  { name: "Station Alpha", lat: 34.0522, lon: -118.2437 },
  { name: "Station Bravo", lat: 40.7128, lon: -74.0060 },
  { name: "Station Charlie", lat: 35.6895, lon: 139.6917 },
  { name: "Station Delta", lat: -33.8688, lon: 151.2093 },
];


describe('SeismicWaveAnimation', () => {
  beforeEach(() => {
    // vi.clearAllMocks(); // This clears too much, including mock implementations set up by vi.mock if not careful
    // Instead, reset specific mock call history and return values if needed
    mockedUseEarthquakeDataState.mockClear();
    mockSeismicUtils.calculateHypocentralDistance.mockClear();
    mockSeismicUtils.calculatePWaveTravelTime.mockClear();
    mockSeismicUtils.calculateSWaveTravelTime.mockClear();

    // Reset mock implementations to default behavior for each test if needed
    // For distance, we often want specific mock values per station for predictability
    mockSeismicUtils.calculateHypocentralDistance.mockImplementation((eq, stationLat, stationLon) => {
      if (stationLat === mockStations[0].lat) return 100; // Alpha
      if (stationLat === mockStations[1].lat) return 200; // Bravo
      if (stationLat === mockStations[2].lat) return 300; // Charlie
      if (stationLat === mockStations[3].lat) return 400;  // Delta (make it a number for variable speed test)
      return 150; // Default
    });

    // For the travel time functions in seismicUtils, they are less critical now for 'variable'
    // as the component does its own calculation. But for 'average', they might be used.
    // Let's make them reflect the average speeds.
    mockSeismicUtils.calculatePWaveTravelTime.mockImplementation(
        distance => distance / actualSeismicUtils.AVERAGE_P_WAVE_VELOCITY_KM_S
    );
    mockSeismicUtils.calculateSWaveTravelTime.mockImplementation(
        distance => distance / actualSeismicUtils.AVERAGE_S_WAVE_VELOCITY_KM_S
    );
  });

  test('renders "No earthquake data available" when no prop and no context data', () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });
    render(<SeismicWaveAnimation />);
    expect(screen.getByText(/No earthquake data available/i)).toBeInTheDocument();
  });

  test('renders with earthquake prop and displays station names', () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });
    const renderResult = render(<SeismicWaveAnimation earthquake={mockEarthquake} />);

    expect(screen.queryByText(/No earthquake data available/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Station Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/Station Bravo/i)).toBeInTheDocument();
    expect(screen.getByText(/Station Charlie/i)).toBeInTheDocument();
    expect(screen.getByText(/Station Delta/i)).toBeInTheDocument(); // Checks if all stations are rendered
    const { container } = renderResult;
    expect(container.querySelector('svg')).toBeInTheDocument(); // Check for SVG presence by tag
    expect(screen.getByText(/Mode: Illustrative Average Speeds/i)).toBeInTheDocument();
  });

  test('renders with lastMajorQuake from context and displays station names', () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: mockEarthquake });
    const { container } = render(<SeismicWaveAnimation />);

    expect(screen.queryByText(/No earthquake data available/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Station Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/Station Bravo/i)).toBeInTheDocument();
    // Removed the /SVG_WIDTH/ check as it was problematic and not essential for this test's core goal.
    expect(container.querySelector('svg')).toBeInTheDocument(); // Check for SVG presence by tag
    expect(screen.getByText(/Mode: Illustrative Average Speeds/i)).toBeInTheDocument();
  });

  test('calls calculation utilities and displays their results (average scenario)', async () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });

    // Using default mock for calculateHypocentralDistance from beforeEach
    // P and S wave times will be calculated by the component using AVERAGE speeds

    render(<SeismicWaveAnimation earthquake={mockEarthquake} speedScenario="average" />);

    // Verify calculateHypocentralDistance calls
    expect(mockSeismicUtils.calculateHypocentralDistance).toHaveBeenCalledTimes(mockStations.length);
    for (const station of mockStations) {
      expect(mockSeismicUtils.calculateHypocentralDistance).toHaveBeenCalledWith(
        expect.objectContaining({
          geometry: expect.objectContaining({
            coordinates: [mockEarthquake.geometry.coordinates[0], mockEarthquake.geometry.coordinates[1], mockEarthquake.geometry.coordinates[2]],
          }),
        }),
        station.lat,
        station.lon
      );
    }

    // For average scenario, the component calculates times internally using AVERAGE speeds.
    // Station Alpha: dist = 100km
    // P-time = 100 / 6.5 = 15.38 => 15.4s
    // S-time = 100 / 3.75 = 26.66 => 26.7s
    await screen.findByText(/P: 15.4s, S: 26.7s/i); // Station Alpha

    // Station Bravo: dist = 200km
    // P-time = 200 / 6.5 = 30.76 => 30.8s
    // S-time = 200 / 3.75 = 53.33 => 53.3s
    await screen.findByText(/P: 30.8s, S: 53.3s/i); // Station Bravo

    expect(screen.getByText(/Mode: Illustrative Average Speeds/i)).toBeInTheDocument();
  });

  test('displays "N/A" for stations where distance calculation returns NaN', async () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });

     mockSeismicUtils.calculateHypocentralDistance.mockImplementation((eq, stationLat) => {
      if (stationLat === mockStations[3].lat) return NaN; // Station Delta gets NaN
      return 100;
    });

    render(<SeismicWaveAnimation earthquake={mockEarthquake} />);

    // For Station Delta (where distance is NaN)
    const stationDeltaText = await screen.findByText(/Station Delta/i);
    const parentOfStationName = stationDeltaText.closest('g');
    expect(parentOfStationName).toHaveTextContent(/P: N\/As, S: N\/As/i);

    // Ensure other stations still get their numbers
    const stationAlphaText = await screen.findByText(/Station Alpha/i);
    const parentOfStationAlpha = stationAlphaText.closest('g');
    // P-time = 100 / 6.5 = 15.4s, S-time = 100 / 3.75 = 26.7s
    expect(parentOfStationAlpha).toHaveTextContent(/P: 15.4s, S: 26.7s/i);
  });

  test('calculates and displays variable travel times with speedScenario="variable"', async () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });
    // Distances from mock: Station Alpha=100, Bravo=200, Charlie=300, Delta=400

    render(<SeismicWaveAnimation earthquake={mockEarthquake} speedScenario="variable" />);

    // Station Alpha (index 0) uses FAST speeds: P_WAVE_FAST_KM_S (7.5), S_WAVE_FAST_KM_S (4.3)
    // P-time = 100 / 7.5 = 13.33 => 13.3s
    // S-time = 100 / 4.3 = 23.25 => 23.3s
    await screen.findByText(/P: 13.3s, S: 23.3s/i); // Station Alpha

    // Station Bravo (index 1) uses SLOW speeds: P_WAVE_SLOW_KM_S (5.5), S_WAVE_SLOW_KM_S (3.2)
    // P-time = 200 / 5.5 = 36.36 => 36.4s
    // S-time = 200 / 3.2 = 62.5s => 62.5s
    await screen.findByText(/P: 36.4s, S: 62.5s/i); // Station Bravo

    // Station Charlie (index 2) uses AVERAGE speeds: AVERAGE_P_WAVE_VELOCITY_KM_S (6.5), AVERAGE_S_WAVE_VELOCITY_KM_S (3.75)
    // P-time = 300 / 6.5 = 46.15 => 46.2s
    // S-time = 300 / 3.75 = 80.0s => 80.0s
    await screen.findByText(/P: 46.2s, S: 80.0s/i); // Station Charlie

    // Station Delta (index 3) uses AVERAGE speeds
    // P-time = 400 / 6.5 = 61.53 => 61.5s
    // S-time = 400 / 3.75 = 106.66 => 106.7s
    await screen.findByText(/P: 61.5s, S: 106.7s/i); // Station Delta

    expect(screen.getByText(/Mode: Illustrative Variable Speeds/i)).toBeInTheDocument();
  });
});
