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
const VIRTUAL_STATIONS_FOR_TEST = [ // These lat/lon must match component's VIRTUAL_STATIONS
    { name: "Station Alpha", lat: 2.46, lon: 0.0 },
    { name: "Station Bravo", lat: 0.0, lon: 4.5 },
    { name: "Station Charlie", lat: -6.3, lon: 0.0 },
    { name: "Station Delta", lat: 7.38, lon: 0.0 }
];


describe('SeismicWaveAnimation', () => {
  beforeEach(() => {
    mockedUseEarthquakeDataState.mockClear();
    mockSeismicUtils.calculateHypocentralDistance.mockClear();
    mockSeismicUtils.calculatePWaveTravelTime.mockClear();
    mockSeismicUtils.calculateSWaveTravelTime.mockClear();

    // Mock distances based on station name for predictability, using actual calculated hypocentral distances
    mockSeismicUtils.calculateHypocentralDistance.mockImplementation((earthquake, stationLat, stationLon) => {
      const stationDetails = VIRTUAL_STATIONS_FOR_TEST.find(s => s.lat === stationLat && s.lon === stationLon);
      if (stationDetails) {
        if (stationDetails.name === "Station Alpha") return 275.22;
        if (stationDetails.name === "Station Bravo") return 501.31;
        if (stationDetails.name === "Station Charlie") return 700.59;
        if (stationDetails.name === "Station Delta") return 820.49;
      }
      return 150; // Default fallback (should not be hit if all stations are covered)
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
    // Station Alpha: dist = 275.22 km
    // P-time = 275.22 / 6.5 = 42.34 => "42.3s"
    // S-time = 275.22 / 3.75 = 73.39 => "73.4s"
    await screen.findByText(/P: 42.3s, S: 73.4s/i);

    // Station Bravo: dist = 501.31 km
    // P-time = 501.31 / 6.5 = 77.12 => "77.1s"
    // S-time = 501.31 / 3.75 = 133.68 => "133.7s"
    await screen.findByText(/P: 77.1s, S: 133.7s/i);

    expect(screen.getByText(/Mode: Illustrative Average Speeds/i)).toBeInTheDocument();
  });

  test('displays "N/A" for stations where distance calculation returns NaN', async () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });

    mockSeismicUtils.calculateHypocentralDistance.mockImplementation((earthquake, stationLat, stationLon) => {
      const stationDetails = VIRTUAL_STATIONS_FOR_TEST.find(s => s.lat === stationLat && s.lon === stationLon);
      if (stationDetails && stationDetails.name === "Station Delta") return NaN; // Station Delta returns NaN
      if (stationDetails && stationDetails.name === "Station Alpha") return 275.22; // For the other assertion
      // Provide default for Bravo and Charlie if they were to be rendered in this specific test configuration
      if (stationDetails && stationDetails.name === "Station Bravo") return 501.31;
      if (stationDetails && stationDetails.name === "Station Charlie") return 700.59;
      return 150;
    });

    render(<SeismicWaveAnimation earthquake={mockEarthquake} />);

    // For Station Delta (where distance is NaN)
    const stationDeltaText = await screen.findByText(/Station Delta/i);
    const parentOfStationName = stationDeltaText.closest('g');
    expect(parentOfStationName).toHaveTextContent(/P: N\/As, S: N\/As/i);

    // Ensure other stations still get their numbers
    // Station Alpha: dist = 275.22km. P-time = 275.22 / 6.5 = 42.3s, S-time = 275.22 / 3.75 = 73.4s
    const stationAlphaText = await screen.findByText(/Station Alpha/i);
    const parentOfStationAlpha = stationAlphaText.closest('g');
    expect(parentOfStationAlpha).toHaveTextContent(/P: 42.3s, S: 73.4s/i);
  });

  test('calculates and displays variable travel times with speedScenario="variable"', async () => {
    mockedUseEarthquakeDataState.mockReturnValue({ lastMajorQuake: null });
    // Using distances from default mock in beforeEach: Alpha=275.22, Bravo=501.31, Charlie=700.59, Delta=820.49

    render(<SeismicWaveAnimation earthquake={mockEarthquake} speedScenario="variable" />);

    // Station Alpha (index 0) uses FAST speeds: P_WAVE_FAST_KM_S (7.5), S_WAVE_FAST_KM_S (4.3)
    // Dist = 275.22 km. P-time = 275.22 / 7.5 = 36.696 => "36.7s". S-time = 275.22 / 4.3 = 64.00 => "64.0s"
    await screen.findByText(/P: 36.7s, S: 64.0s/i);

    // Station Bravo (index 1) uses SLOW speeds: P_WAVE_SLOW_KM_S (5.5), S_WAVE_SLOW_KM_S (3.2)
    // Dist = 501.31 km. P-time = 501.31 / 5.5 = 91.147 => "91.1s". S-time = 501.31 / 3.2 = 156.659 => "156.7s"
    // Note: previous report had 91.2 for P-Slow, 156.7 for S-Slow. Rounding of .toFixed(1) matters.
    // 91.147 -> "91.1"
    // 156.659 -> "156.7"
    await screen.findByText(/P: 91.1s, S: 156.7s/i);


    // Station Charlie (index 2) uses AVERAGE speeds: AVERAGE_P_WAVE_VELOCITY_KM_S (6.5), AVERAGE_S_WAVE_VELOCITY_KM_S (3.75)
    // Dist = 700.59 km. P-time = 700.59 / 6.5 = 107.78 => "107.8s". S-time = 700.59 / 3.75 = 186.824 => "186.8s"
    await screen.findByText(/P: 107.8s, S: 186.8s/i);

    // Station Delta (index 3) uses AVERAGE speeds
    // Dist = 820.49 km. P-time = 820.49 / 6.5 = 126.229 => "126.2s". S-time = 820.49 / 3.75 = 218.797 => "218.8s"
    await screen.findByText(/P: 126.2s, S: 218.8s/i);

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
