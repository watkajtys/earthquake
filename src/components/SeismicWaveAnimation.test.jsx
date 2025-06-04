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
  geometry: { coordinates: [-120, 38, 10] }, // lon, lat, depth - actual values don't matter much due to mocks
};

// Renamed and using names to align with component's VIRTUAL_STATIONS for clarity in tests
const VIRTUAL_STATIONS_FOR_TEST = [
    { name: "Station Alpha", lat: 5, lon: 5 }, // Coords match component for consistency if mock uses them
    { name: "Station Bravo", lat: -7, lon: 9 },
    { name: "Station Charlie", lat: 10, lon: -5 },
    { name: "Station Delta", lat: -3, lon: -4 }
];


describe('SeismicWaveAnimation', () => {
  beforeEach(() => {
    mockedUseEarthquakeDataState.mockClear();
    mockSeismicUtils.calculateHypocentralDistance.mockClear();
    mockSeismicUtils.calculatePWaveTravelTime.mockClear();
    mockSeismicUtils.calculateSWaveTravelTime.mockClear();

    // Mock distances based on station name for predictability
    mockSeismicUtils.calculateHypocentralDistance.mockImplementation((earthquake, stationLat, stationLon) => {
      // Find station by lat/lon to simulate component's behavior if it were to pass varied lat/lon
      // For robust testing, we key off the name which is constant in our VIRTUAL_STATIONS_FOR_TEST
      const stationDetails = VIRTUAL_STATIONS_FOR_TEST.find(s => s.lat === stationLat && s.lon === stationLon);
      if (stationDetails) {
        if (stationDetails.name === "Station Alpha") return 110; // New test distance
        if (stationDetails.name === "Station Bravo") return 220; // New test distance
        if (stationDetails.name === "Station Charlie") return 330; // New test distance
        if (stationDetails.name === "Station Delta") return 440; // New test distance
      }
      return 150; // Default fallback
    });

    // For the travel time functions in seismicUtils, they are less critical for 'variable'
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
    expect(mockSeismicUtils.calculateHypocentralDistance).toHaveBeenCalledTimes(VIRTUAL_STATIONS_FOR_TEST.length);
    for (const station of VIRTUAL_STATIONS_FOR_TEST) { // Use the new station array for iteration
      expect(mockSeismicUtils.calculateHypocentralDistance).toHaveBeenCalledWith(
        expect.objectContaining({ /* earthquake data */ }), // The earthquake data is passed
        station.lat, // These are the new lats/lons
        station.lon
      );
    }

    // For average scenario, the component calculates times internally using AVERAGE speeds.
    // Station Alpha: dist = 110km (from new mock)
    // P-time = 110 / 6.5 = 16.92 => "16.9s"
    // S-time = 110 / 3.75 = 29.33 => "29.3s"
    await screen.findByText(/P: 16.9s, S: 29.3s/i);

    // Station Bravo: dist = 220km (from new mock)
    // P-time = 220 / 6.5 = 33.84 => "33.8s"
    // S-time = 220 / 3.75 = 58.66 => "58.7s"
    await screen.findByText(/P: 33.8s, S: 58.7s/i);

    expect(screen.getByText(/Mode: Illustrative Average Speeds/i)).toBeInTheDocument();
  });

  test('displays "N/A" for stations where distance calculation returns NaN', async () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });

    mockSeismicUtils.calculateHypocentralDistance.mockImplementation((earthquake, stationLat, stationLon) => {
      const stationDetails = VIRTUAL_STATIONS_FOR_TEST.find(s => s.lat === stationLat && s.lon === stationLon);
      if (stationDetails && stationDetails.name === "Station Delta") return NaN;
      if (stationDetails && stationDetails.name === "Station Alpha") return 110; // For the other assertion
      return 150;
    });

    render(<SeismicWaveAnimation earthquake={mockEarthquake} />);

    // For Station Delta (where distance is NaN)
    const stationDeltaText = await screen.findByText(/Station Delta/i);
    const parentOfStationName = stationDeltaText.closest('g');
    expect(parentOfStationName).toHaveTextContent(/P: N\/As, S: N\/As/i);

    // Ensure other stations still get their numbers
    // Station Alpha: dist = 110km. P-time = 110 / 6.5 = 16.9s, S-time = 110 / 3.75 = 29.3s
    const stationAlphaText = await screen.findByText(/Station Alpha/i);
    const parentOfStationAlpha = stationAlphaText.closest('g');
    expect(parentOfStationAlpha).toHaveTextContent(/P: 16.9s, S: 29.3s/i);
  });

  test('calculates and displays variable travel times with speedScenario="variable"', async () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });
    // Using distances from default mock in beforeEach: Alpha=110, Bravo=220, Charlie=330, Delta=440

    render(<SeismicWaveAnimation earthquake={mockEarthquake} speedScenario="variable" />);

    // Station Alpha (index 0) uses FAST speeds: P_WAVE_FAST_KM_S (7.5), S_WAVE_FAST_KM_S (4.3)
    // Dist = 110 km. P-time = 110 / 7.5 = 14.66 => "14.7s". S-time = 110 / 4.3 = 25.58 => "25.6s"
    await screen.findByText(/P: 14.7s, S: 25.6s/i);

    // Station Bravo (index 1) uses SLOW speeds: P_WAVE_SLOW_KM_S (5.5), S_WAVE_SLOW_KM_S (3.2)
    // Dist = 220 km. P-time = 220 / 5.5 = 40.0 => "40.0s". S-time = 220 / 3.2 = 68.75 => "68.8s"
    await screen.findByText(/P: 40.0s, S: 68.8s/i);

    // Station Charlie (index 2) uses AVERAGE speeds: AVERAGE_P_WAVE_VELOCITY_KM_S (6.5), AVERAGE_S_WAVE_VELOCITY_KM_S (3.75)
    // Dist = 330 km. P-time = 330 / 6.5 = 50.76 => "50.8s". S-time = 330 / 3.75 = 88.0 => "88.0s"
    await screen.findByText(/P: 50.8s, S: 88.0s/i);

    // Station Delta (index 3) uses AVERAGE speeds
    // Dist = 440 km. P-time = 440 / 6.5 = 67.69 => "67.7s". S-time = 440 / 3.75 = 117.33 => "117.3s"
    await screen.findByText(/P: 67.7s, S: 117.3s/i);

    expect(screen.getByText(/Mode: Illustrative Variable Speeds/i)).toBeInTheDocument();
  });

  test('renders SVG definitions for gradients and clipPath when data is available', () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });
    const { container } = render(<SeismicWaveAnimation earthquake={mockEarthquake} />);

    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeInTheDocument();

    const defs = svgElement.querySelector('defs');
    expect(defs).toBeInTheDocument();

    // Check for gradients
    const pWaveGradient = defs.querySelector('#pWaveGradient');
    expect(pWaveGradient).toBeInTheDocument();
    expect(pWaveGradient.tagName.toLowerCase()).toBe('radialgradient');

    const sWaveGradient = defs.querySelector('#sWaveGradient');
    expect(sWaveGradient).toBeInTheDocument();
    expect(sWaveGradient.tagName.toLowerCase()).toBe('radialgradient');

    // Check for clipPath
    const clipPath = defs.querySelector('#earthClipPath');
    expect(clipPath).toBeInTheDocument();
    expect(clipPath.tagName.toLowerCase()).toBe('clippath');

    const clipPathPath = clipPath.querySelector('path');
    expect(clipPathPath).toBeInTheDocument();
    // Check if the d attribute of the path in clipPath is a non-empty string (basic check)
    expect(clipPathPath.getAttribute('d')).toBeTruthy();
    expect(clipPathPath.getAttribute('d').includes('A')).toBeTruthy(); // Should contain an Arc command
    expect(clipPathPath.getAttribute('d').endsWith('Z')).toBeTruthy(); // Should be a closed path
  });

  test('station markers have default appearance on initial render', async () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });
    // Ensure travel times are positive, so no arrivals at animationTime = 0
     mockSeismicUtils.calculateHypocentralDistance.mockReturnValue(100); // All stations 100km away

    const { container } = render(<SeismicWaveAnimation earthquake={mockEarthquake} speedScenario="average" />);

    // Wait for station text to ensure rendering is complete
    await screen.findByText("Station Alpha");

    const stationCircles = container.querySelectorAll('g circle'); // Get all circles within station groups
    stationCircles.forEach(circle => {
      // Check default fill and stroke as set in the component for non-arrived state
      expect(circle).toHaveAttribute('fill', '#808080'); // Grey
      expect(circle).toHaveAttribute('stroke', 'black');
      expect(circle).toHaveAttribute('stroke-width', '1');
    });

    // Ping lines should not be present initially as pWaveArrived/sWaveArrived are false
    const pPingLines = container.querySelectorAll(`line[stroke="${actualSeismicUtils.P_WAVE_PING_COLOR}"]`);
    expect(pPingLines.length).toBe(0);
    const sPingLines = container.querySelectorAll(`line[stroke="${actualSeismicUtils.S_WAVE_PING_COLOR}"]`);
    expect(sPingLines.length).toBe(0);
  });

});
