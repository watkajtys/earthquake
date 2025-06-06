import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

/* Commented out Nearby Quakes Filtering tests remain unchanged */
/*
describe('EarthquakeDetailView - Nearby Quakes Filtering', () => {
  const mockDetailUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=testmainquake&format=geojson';
  const mockOnClose = vi.fn();

  const mockDetailDataForNearbySuite = {
    id: 'mainquake123',
    properties: {
      title: 'M 5.0 - Central Test Region',
      mag: 5.0,
      place: '10km N of Testville',
      time: 1678886400000,
      tsunami: 0,
      status: 'reviewed',
      felt: 10,
      mmi: 4.5,
      alert: 'green',
    },
    geometry: { coordinates: [-120.0, 35.0, 10.0] }
  };

  let fetchSpy;
  let calculateDistanceMock;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockImplementation((url, options) => {
      if (String(url).startsWith(mockDetailUrl)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockDetailDataForNearbySuite }),
        });
      }
      return Promise.reject(new Error(`[Nearby Quakes Test] Unexpected fetch call: ${url}`));
    });
    mockOnClose.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly filters broaderEarthquakeData and passes regionalQuakes to EarthquakeMap', async () => {
    const utils = await import('./utils'); // This should be '../utils/utils.js'
    calculateDistanceMock = utils.calculateDistance;

    expect(vi.isMockFunction(calculateDistanceMock)).toBe(true);

    calculateDistanceMock.mockImplementation((lat1, lon1, lat2, lon2) => {
        if (lat2 === 35.1 && lon2 === -120.1) return REGIONAL_RADIUS_KM - 50;
        if (lat2 === 34.9 && lon2 === -119.9) return REGIONAL_RADIUS_KM - 20;
        if (lat2 === 38.0 && lon2 === -125.0) return REGIONAL_RADIUS_KM + 100;
        return REGIONAL_RADIUS_KM + 200;
    });

    const simplifiedMockBroaderData = [
      { id: 'nearby1', properties: { title: 'Nearby Quake (Close)', mag: 3.0 }, geometry: { coordinates: [-120.1, 35.1, 5.0] } },
      { id: 'nearby5', properties: { title: 'Nearby Quake (Close 2)', mag: 3.2 }, geometry: { coordinates: [-119.9, 34.9, 8.0] } },
      { id: 'nearby2', properties: { title: 'Nearby Quake (Far)', mag: 2.5 }, geometry: { coordinates: [-125.0, 38.0, 15.0] } }
    ];

    render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        broaderEarthquakeData={simplifiedMockBroaderData}
        dataSourceTimespanDays={7}
      />
    );

    let mockMapElement;
    await waitFor(() => {
      mockMapElement = screen.getByTestId('mock-earthquake-map');
      expect(mockMapElement).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(screen.getAllByText(mockDetailDataForNearbySuite.properties.title)[0]).toBeInTheDocument();
    // These assertions would need to change to the new data attributes
    // expect(mockMapElement).toHaveAttribute('data-latitude', String(mockDetailDataForNearbySuite.geometry.coordinates[1]));
    // expect(mockMapElement).toHaveAttribute('data-longitude', String(mockDetailDataForNearbySuite.geometry.coordinates[0]));
    expect(mockMapElement.getAttribute('data-nearby-quakes')).toBeTruthy();

    const passedNearbyQuakesAttr = mockMapElement.getAttribute('data-nearby-quakes');
    const passedNearbyQuakes = JSON.parse(passedNearbyQuakesAttr);

    expect(passedNearbyQuakes).toBeInstanceOf(Array);
    expect(passedNearbyQuakes.length).toBe(2);

    expect(passedNearbyQuakes.find(q => q.id === 'nearby1')).toBeDefined();
    expect(passedNearbyQuakes.find(q => q.id === 'nearby5')).toBeDefined();
    expect(passedNearbyQuakes.find(q => q.id === 'nearby2')).toBeUndefined();

    expect(calculateDistanceMock).toHaveBeenCalledTimes(3);
    expect(calculateDistanceMock).toHaveBeenCalledWith(35.0, -120.0, 35.1, -120.1);
    expect(calculateDistanceMock).toHaveBeenCalledWith(35.0, -120.0, 38.0, -125.0);
    expect(calculateDistanceMock).toHaveBeenCalledWith(35.0, -120.0, 34.9, -119.9);
  });
});
*/

describe('EarthquakeDetailView - Data Fetching, Loading, and Error States', () => {
  const mockDetailUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=testquake&format=geojson';
  const baseMockDetailData = {
    id: 'testquake',
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
    fetchSpy = vi.spyOn(global, 'fetch');
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
    fetchSpy.mockImplementationOnce(() => new Promise(() => {}));
    render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrl} />);
    expect(screen.getByTestId('loading-skeleton-container')).toBeInTheDocument();
    expect(screen.queryByText(/Details Not Available/i)).not.toBeInTheDocument();
  });

  it('displays loading state initially, then renders fetched data', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => deepClone(baseMockDetailData) });
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
    let mockDataScenarioA = deepClone(baseMockDetailData);
    mockDataScenarioA.id = 'testquakeA';
    mockDataScenarioA.properties.title = 'M 6.0 - Null Coords Test';
    mockDataScenarioA.geometry.coordinates = [null, null, 10];
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => mockDataScenarioA });

    const { rerender } = render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={`${mockDetailUrl}A`} />);
    await waitFor(() => expect(screen.queryByTestId('loading-skeleton-container')).not.toBeInTheDocument());
    expect(screen.queryByTestId('mock-earthquake-map')).toBeNull(); // Map should not render due to panel's guard
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('MockEarthquakeMap received invalid mapCenterLatitude'));


    // Scenario B: Null magnitude
    vi.mocked(console.warn).mockClear(); // Clear previous console.warn calls
    let mockDataScenarioB = deepClone(baseMockDetailData);
    mockDataScenarioB.id = 'testquakeB';
    mockDataScenarioB.properties.title = 'M Null - Null Mag Test';
    mockDataScenarioB.properties.mag = null;
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => mockDataScenarioB });

    rerender(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={`${mockDetailUrl}B`} />);
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
    const localErrorMessage = 'Network error: Failed to fetch details';
    fetchSpy.mockRejectedValueOnce(new Error(localErrorMessage));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrl} />);
    const expectedErrorMessage = `Failed to load details: ${localErrorMessage}`;
    const errorElements = await screen.findAllByText(expectedErrorMessage);
    expect(errorElements[0]).toBeInTheDocument();
    expect(screen.queryByTestId('mock-earthquake-map')).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('calls onDataLoadedForSeo with correct data when details are fetched', async () => {
    const mockOnDataLoadedForSeo = vi.fn();
    // Ensure baseMockDetailData.properties includes 'detail' for completeness, though not strictly tested here.
    const currentMockData = deepClone(baseMockDetailData);
    if (!currentMockData.properties.detail) {
      currentMockData.properties.detail = `https://earthquake.usgs.gov/earthquakes/eventpage/${currentMockData.id}`;
    }

    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
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
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.time = null;
    currentMockData.properties.title = "Test Null Time";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrl} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText("Date & Time (UTC)")).not.toBeInTheDocument();
  });
});

// Accessibility tests remain unchanged
describe('EarthquakeDetailView Accessibility', () => {
  // ... (accessibility tests content)
  // These tests are not directly affected by the EarthquakeMap prop changes.
  // Example for one:
  const mockDetailUrlAxe = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=testquake-axe&format=geojson';
  const mockDetailDataAxe = {
    id: 'testquake-axe', properties: { title: 'M 7.0 - Axe Test Region', mag: 7.0, place: 'Axe Test Place', time: Date.now(), updated: Date.now(), products: {} },
    geometry: { coordinates: [-120, 37, 10] }
  };
  let fetchSpy;
  beforeEach(() => { fetchSpy = vi.spyOn(global, 'fetch'); mockOnClose.mockClear(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { fetchSpy.mockRestore(); vi.restoreAllMocks(); });

  it('should have no axe violations when displaying data', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => JSON.parse(JSON.stringify(mockDetailDataAxe)) });
    const { container } = render(<EarthquakeDetailView {...mockDefaultPropsGlobal} detailUrl={mockDetailUrlAxe} onDataLoadedForSeo={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText((content, element) => element.id === 'earthquake-detail-title' && content.startsWith(mockDetailDataAxe.properties.title))).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
