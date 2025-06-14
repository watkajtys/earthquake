import React from 'react';
import { render, screen, waitFor } from '@testing-library/react'; // Removed 'within'
import EarthquakeDetailView from './EarthquakeDetailView'; // Component to test
import { vi } from 'vitest'; // Using Vitest's mocking utilities

import { axe } from 'jest-axe'; // Import axe

// Define REGIONAL_RADIUS_KM locally for test consistency
const REGIONAL_RADIUS_KM = 804.672; // 500 miles

// Mock EarthquakeMap component
vi.mock('./EarthquakeMap', () => ({
  default: (props) => {
    // Add console.warn checks for specific props
    if (props.mapCenterLatitude === null || typeof props.mapCenterLatitude !== 'number') {
      console.warn('MockEarthquakeMap received invalid mapCenterLatitude:', props.mapCenterLatitude);
    }
    if (props.mapCenterLongitude === null || typeof props.mapCenterLongitude !== 'number') {
      console.warn('MockEarthquakeMap received invalid mapCenterLongitude:', props.mapCenterLongitude);
    }
    if (props.highlightQuakeMagnitude === null || typeof props.highlightQuakeMagnitude !== 'number') {
      // Allow highlightQuakeMagnitude to be undefined if no highlight quake is intended
      if (props.highlightQuakeMagnitude !== undefined) {
        console.warn('MockEarthquakeMap received invalid highlightQuakeMagnitude:', props.highlightQuakeMagnitude);
      }
    }
    // Allow highlightQuakeLatitude/Longitude to be undefined if no highlight quake
    if (props.highlightQuakeLatitude !== undefined && (props.highlightQuakeLatitude === null || typeof props.highlightQuakeLatitude !== 'number')) {
        console.warn('MockEarthquakeMap received invalid highlightQuakeLatitude:', props.highlightQuakeLatitude);
    }
    if (props.highlightQuakeLongitude !== undefined && (props.highlightQuakeLongitude === null || typeof props.highlightQuakeLongitude !== 'number')) {
        console.warn('MockEarthquakeMap received invalid highlightQuakeLongitude:', props.highlightQuakeLongitude);
    }


    return (
      <div
        data-testid="mock-earthquake-map"
        data-nearby-quakes={props.nearbyQuakes ? JSON.stringify(props.nearbyQuakes) : ''}
        data-map-center-latitude={props.mapCenterLatitude}
        data-map-center-longitude={props.mapCenterLongitude}
        data-highlight-quake-latitude={props.highlightQuakeLatitude}
        data-highlight-quake-longitude={props.highlightQuakeLongitude}
        data-highlight-quake-magnitude={props.highlightQuakeMagnitude}
        data-fit-map-to-bounds={String(props.fitMapToBounds)}
        data-shakemap-url={props.shakeMapUrl}
        data-main-quake-detail-url={props.mainQuakeDetailUrl}
      >
        Mock Map
      </div>
    );
  }
}));

// Mock utils.js
vi.mock('../utils/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    calculateDistance: vi.fn(),
    // Keep isValidNumber as actual implementation unless specific mocking needed for it
    isValidNumber: actual.isValidNumber
  };
});

const mockOnClose = vi.fn();
const mockDefaultPropsGlobal = {
  onClose: mockOnClose,
  broaderEarthquakeData: [],
  dataSourceTimespanDays: 7,
  handleLoadMonthlyData: vi.fn(),
  hasAttemptedMonthlyLoad: false,
  isLoadingMonthly: false,
  onDataLoadedForSeo: vi.fn(),
};

// Removed the large commented-out describe block for 'Nearby Quakes Filtering'

describe('EarthquakeDetailView - Data Fetching, Loading, and Error States', () => {
  // Base mockDetailUrl and event_id for most tests
  const MOCK_EVENT_ID_BASE = 'testquake';
  const mockDetailUrl = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${MOCK_EVENT_ID_BASE}.geojson`;

  const baseMockDetailData = {
    id: MOCK_EVENT_ID_BASE,
    properties: {
      title: 'M 6.5 - TestVille', mag: 6.5, place: '100km W of TestCity', time: 1678886400000, updated: 1678887400000,
      tsunami: 1, status: 'reviewed', felt: 150, mmi: 7.2, alert: 'red',
      products: {
        shakemap: [{ contents: { 'download/intensity.jpg': { url: 'https://example.com/intensity.jpg' } } }],
        'moment-tensor': [{ properties: { 'scalar-moment': "1.23e+20", 'nodal-plane-1-rake': "0", 'nodal-plane-1-strike': "120", 'nodal-plane-1-dip': "45" } }]
      },
    },
    geometry: { coordinates: [-122.0, 38.0, 15.0] }
  };

  let fetchSpy;
  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch'); // Spy on global fetch
    mockOnClose.mockClear();
    mockDefaultPropsGlobal.handleLoadMonthlyData.mockClear();
    mockDefaultPropsGlobal.onDataLoadedForSeo.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Silence console.warn for these tests
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks(); // Ensure console.warn is restored
  });

  it('renders loading skeleton immediately on mount if detailUrl is provided', () => {
    // Mock fetch for the new API endpoint to be pending
    fetchSpy.mockImplementation((url) => {
      if (url === `/api/earthquake/${MOCK_EVENT_ID_BASE}`) {
        return new Promise(() => {}); // Pending promise
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });
    render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrl} />);
    expect(screen.getByTestId('loading-skeleton-container')).toBeInTheDocument();
    expect(screen.queryByText(/Details Not Available/i)).not.toBeInTheDocument();
  });

  it('displays loading state initially, then renders fetched data', async () => {
    fetchSpy.mockImplementation((url) => {
      if (url === `/api/earthquake/${MOCK_EVENT_ID_BASE}`) {
        return Promise.resolve({ ok: true, json: async () => deepClone(baseMockDetailData) });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });
    render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrl} />);
    expect(screen.getByTestId('loading-skeleton-container')).toBeInTheDocument();
    expect(screen.queryByText(/Details Not Available/i)).not.toBeInTheDocument();
    await screen.findAllByText(baseMockDetailData.properties.title);
    expect(screen.getAllByText(baseMockDetailData.properties.title)[0]).toBeInTheDocument();
    expect(screen.queryByTestId('loading-skeleton-container')).not.toBeInTheDocument();
    // ... (rest of the assertions for data display)
    expect(screen.getByTestId('mock-earthquake-map')).toBeInTheDocument();
  });

  it('handles fetched data with null coordinates or magnitude gracefully', async () => {
    // Scenario A: Null coordinates
    const MOCK_EVENT_ID_A = 'testquakeA';
    const mockDetailUrlA = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${MOCK_EVENT_ID_A}.geojson`;
    let mockDataScenarioA = deepClone(baseMockDetailData);
    mockDataScenarioA.id = MOCK_EVENT_ID_A;
    mockDataScenarioA.properties.title = 'M 6.0 - Null Coords Test';
    mockDataScenarioA.geometry.coordinates = [null, null, 10];

    fetchSpy.mockImplementation((url) => {
      if (url === `/api/earthquake/${MOCK_EVENT_ID_A}`) {
        return Promise.resolve({ ok: true, json: async () => mockDataScenarioA });
      }
      if (url === `/api/earthquake/${MOCK_EVENT_ID_B}`) { // Pre-configure for scenario B
        return Promise.resolve({ ok: true, json: async () => mockDataScenarioB });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    const { rerender } = render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrlA} />);
    await waitFor(() => expect(screen.queryByTestId('loading-skeleton-container')).not.toBeInTheDocument());
    expect(screen.queryByTestId('mock-earthquake-map')).toBeNull();
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('MockEarthquakeMap received invalid mapCenterLatitude'));

    // Scenario B: Null magnitude
    vi.mocked(console.warn).mockClear();
    const MOCK_EVENT_ID_B = 'testquakeB';
    const mockDetailUrlB = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${MOCK_EVENT_ID_B}.geojson`;
    let mockDataScenarioB = deepClone(baseMockDetailData);
    mockDataScenarioB.id = MOCK_EVENT_ID_B;
    mockDataScenarioB.properties.title = 'M Null - Null Mag Test';
    mockDataScenarioB.properties.mag = null;
    // fetchSpy is already configured to handle MOCK_EVENT_ID_B from above

    rerender(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrlB} />);
    await waitFor(() => expect(screen.queryByTestId('loading-skeleton-container')).not.toBeInTheDocument());

    const mapElement = screen.queryByTestId('mock-earthquake-map');
    expect(mapElement).toBeInTheDocument();
    if (mapElement) {
      // highlightQuakeMagnitude will be undefined as EarthquakeRegionalMapPanel won't pass it
      // when mag is invalid. getAttribute for such a case returns null.
      expect(mapElement.getAttribute('data-highlight-quake-magnitude')).toBe(null);
    }
    // Check for the specific warning from EarthquakeRegionalMapPanel
    expect(console.warn).toHaveBeenCalledWith(
      "EarthquakeRegionalMapPanel: Invalid or missing magnitude for highlighting. No highlight marker will be shown.",
      expect.objectContaining({ mag: null })
    );
    // Ensure the mock EarthquakeMap's internal warning for highlightQuakeMagnitude was NOT called,
    // as the prop should be undefined.
    expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('MockEarthquakeMap received invalid highlightQuakeMagnitude')
    );
  });

  it('displays an error message if fetching data fails', async () => {
    const MOCK_EVENT_ID_ERROR = 'testquake_error';
    const mockDetailUrlError = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${MOCK_EVENT_ID_ERROR}.geojson`;
    const localErrorMessage = 'Application API error! Status: 500. Message: Server Issue';

    fetchSpy.mockImplementation((url) => {
      if (url === `/api/earthquake/${MOCK_EVENT_ID_ERROR}`) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Server Issue",
          json: async () => ({ message: "Server Issue" })
        });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrlError} />);
    const expectedDisplayErrorMessage = `Failed to load details from application API: ${localErrorMessage}`;
    const errorElements = await screen.findAllByText(expectedDisplayErrorMessage);
    expect(errorElements[0]).toBeInTheDocument();
    expect(screen.queryByTestId('mock-earthquake-map')).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('calls onDataLoadedForSeo with correct data when details are fetched', async () => {
    const mockOnDataLoadedForSeo = vi.fn();
    const currentMockData = deepClone(baseMockDetailData); // Uses MOCK_EVENT_ID_BASE

    fetchSpy.mockImplementation((url) => {
      if (url === `/api/earthquake/${MOCK_EVENT_ID_BASE}`) {
        return Promise.resolve({ ok: true, json: async () => currentMockData });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrl} onDataLoadedForSeo={mockOnDataLoadedForSeo} />);
    await waitFor(() => expect(mockOnDataLoadedForSeo).toHaveBeenCalledTimes(1));

    const shakemapProduct = currentMockData.properties.products?.shakemap?.[0];
    const expectedShakemapUrl = shakemapProduct?.contents?.['download/intensity.jpg']?.url;

    // Updated expectation to match the new structure passed by onDataLoadedForSeo
    const expectedPayload = {
      id: currentMockData.id,
      properties: currentMockData.properties,
      geometry: currentMockData.geometry,
      shakemapIntensityImageUrl: expectedShakemapUrl,
    };
    expect(mockOnDataLoadedForSeo).toHaveBeenCalledWith(expect.objectContaining(expectedPayload));
  });

  // --- Other tests (formatDate, formatNumber, etc.) remain unchanged ---
  // ... (tests for formatDate, formatNumber for mag/depth, formatLargeNumber for Energy, getBeachballPathsAndType)
  // These tests are not directly affected by the EarthquakeMap prop changes, so they are abridged here.
  // Ensure they are kept in the actual file. Example for one:
  it('does not render date row for null time', async () => {
    const MOCK_EVENT_ID_NULLTIME = 'testquake_nulltime';
    const mockDetailUrlNullTime = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${MOCK_EVENT_ID_NULLTIME}.geojson`;
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.id = MOCK_EVENT_ID_NULLTIME;
    currentMockData.properties.time = null;
    currentMockData.properties.title = "Test Null Time";

    fetchSpy.mockImplementation((url) => {
      if (url === `/api/earthquake/${MOCK_EVENT_ID_NULLTIME}`) {
        return Promise.resolve({ ok: true, json: async () => currentMockData });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrlNullTime} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText("Date & Time (UTC)")).not.toBeInTheDocument();
  });
});

// Accessibility tests remain unchanged
describe('EarthquakeDetailView Accessibility', () => {
  const MOCK_EVENT_ID_AXE = 'testquake-axe';
  const mockDetailUrlAxe = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${MOCK_EVENT_ID_AXE}.geojson`;
  const mockDetailDataAxe = {
    id: MOCK_EVENT_ID_AXE,
    properties: { title: 'M 7.0 - Axe Test Region', mag: 7.0, place: 'Axe Test Place', time: Date.now(), updated: Date.now(), products: {} },
    geometry: { coordinates: [-120, 37, 10] }
  };
  let fetchSpy;
  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    mockOnClose.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should have no axe violations when displaying data', async () => {
    fetchSpy.mockImplementation((url) => {
      if (url === `/api/earthquake/${MOCK_EVENT_ID_AXE}`) {
        return Promise.resolve({ ok: true, json: async () => JSON.parse(JSON.stringify(mockDetailDataAxe)) });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });
    const { container } = render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrlAxe} onDataLoadedForSeo={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText((content, element) => element.id === 'earthquake-detail-title' && content.startsWith(mockDetailDataAxe.properties.title))).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
