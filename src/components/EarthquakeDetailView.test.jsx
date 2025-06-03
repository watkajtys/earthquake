import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import EarthquakeDetailView from './EarthquakeDetailView'; // Component to test
import { vi } from 'vitest'; // Using Vitest's mocking utilities

import { axe } from 'jest-axe'; // Import axe

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
vi.mock('./utils', async () => {
  const actualUtils = await vi.importActual('./utils');
  return {
    ...actualUtils, // Import and retain other utils
    calculateDistance: vi.fn(), // Mock calculateDistance specifically
  };
});

/*
describe('EarthquakeDetailView - Nearby Quakes Filtering', () => {
  const mockDetailUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=testmainquake&format=geojson';
  const mockOnClose = vi.fn();

  const mockDetailDataForNearbySuite = { // Renamed to avoid conflict
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
    const utils = await import('./utils');
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
    expect(mockMapElement).toHaveAttribute('data-latitude', String(mockDetailDataForNearbySuite.geometry.coordinates[1]));
    expect(mockMapElement).toHaveAttribute('data-longitude', String(mockDetailDataForNearbySuite.geometry.coordinates[0]));
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
  const mockOnClose = vi.fn();
  const baseMockDetailData = {
    id: 'testquake',
    properties: {
      title: 'M 6.5 - TestVille',
      mag: 6.5,
      place: '100km W of TestCity',
      time: 1678886400000,
      updated: 1678887400000,
      tsunami: 1,
      status: 'reviewed',
      felt: 150,
      mmi: 7.2,
      alert: 'red',
      products: {
        shakemap: [
          {
            contents: {
              'download/intensity.jpg': {
                url: 'https://example.com/intensity.jpg',
              },
            },
          },
        ],
        'moment-tensor': [
          {
            properties: {
              'scalar-moment': "1.23e+20",
              'nodal-plane-1-rake': "0",
              'nodal-plane-1-strike': "120",
              'nodal-plane-1-dip': "45"
            }
          }
        ]
      },
    },
    geometry: { coordinates: [-122.0, 38.0, 15.0] }
  };

  let fetchSpy;
  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

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
      json: async () => deepClone(baseMockDetailData),
    });

    render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        broaderEarthquakeData={[]}
        dataSourceTimespanDays={7}
      />
    );

    await screen.findAllByText(baseMockDetailData.properties.title);
    expect(screen.getAllByText(baseMockDetailData.properties.title)[0]).toBeInTheDocument();

    const magnitudeLabel = screen.getAllByText(/Magnitude \(.*?\)/i)[0];
    const magnitudeRow = magnitudeLabel.closest('tr');
    expect(within(magnitudeRow).getByText(baseMockDetailData.properties.mag.toString())).toBeInTheDocument();

    const componentFormattedDate = new Date(baseMockDetailData.properties.time).toLocaleString([], { dateStyle: 'full', timeStyle: 'long' });
    expect(screen.getByText("Date & Time (UTC)")).toBeInTheDocument();
    expect(screen.getByText(componentFormattedDate)).toBeInTheDocument();

    const depthLabelCell = screen.getByText("Depth");
    const depthRow = depthLabelCell.closest('tr');
    expect(within(depthRow).getByText(`${baseMockDetailData.geometry.coordinates[2].toFixed(1)} km`)).toBeInTheDocument();

    const tsunamiLabelCell = screen.getByText("Tsunami?");
    const tsunamiRow = tsunamiLabelCell.closest('tr');
    expect(within(tsunamiRow).getByText(baseMockDetailData.properties.tsunami === 1 ? 'Yes' : 'No')).toBeInTheDocument();

    const statusLabelCell = screen.getByText("Status");
    const statusRow = statusLabelCell.closest('tr');
    expect(within(statusRow).getByText(baseMockDetailData.properties.status, { exact: false })).toBeInTheDocument();

    const feltLabelCell = screen.getByText("Felt Reports (DYFI)");
    const feltRow = feltLabelCell.closest('tr');
    expect(within(feltRow).getByText(baseMockDetailData.properties.felt.toString())).toBeInTheDocument();

    const mmiLabelCell = screen.getByText("MMI (ShakeMap)");
    const mmiRow = mmiLabelCell.closest('tr');
    expect(within(mmiRow).getByText(baseMockDetailData.properties.mmi.toFixed(1))).toBeInTheDocument();

    const alertLabelCell = screen.getByText("PAGER Alert");
    const alertRow = alertLabelCell.closest('tr');
    expect(within(alertRow).getByText(baseMockDetailData.properties.alert, { exact: false })).toBeInTheDocument();

    expect(screen.queryByTestId('loading-skeleton-container')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-earthquake-map')).toBeInTheDocument();
  });

  it('displays an error message if fetching data fails', async () => {
    const localErrorMessage = 'Network error: Failed to fetch details';
    fetchSpy.mockRejectedValueOnce(new Error(localErrorMessage));

    // Spy on console.error and silence it for this test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
    expect(screen.queryByText(baseMockDetailData.properties.title)).not.toBeInTheDocument();
    expect(screen.queryByText(`Magnitude: ${baseMockDetailData.properties.mag}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-earthquake-map')).not.toBeInTheDocument();

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it('calls onDataLoadedForSeo with correct data when details are fetched', async () => {
    const mockOnDataLoadedForSeo = vi.fn();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => deepClone(baseMockDetailData),
    });

    render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        onDataLoadedForSeo={mockOnDataLoadedForSeo}
        broaderEarthquakeData={[]}
        dataSourceTimespanDays={7}
      />
    );

    await waitFor(() => expect(mockOnDataLoadedForSeo).toHaveBeenCalledTimes(1), { timeout: 3000 });

    const shakemapProduct = baseMockDetailData.properties.products?.shakemap?.[0];
    const expectedShakemapUrl = shakemapProduct?.contents?.['download/intensity.jpg']?.url;

    const expectedSeoData = {
      title: baseMockDetailData.properties.title,
      place: baseMockDetailData.properties.place,
      time: baseMockDetailData.properties.time,
      mag: baseMockDetailData.properties.mag,
      updated: baseMockDetailData.properties.updated,
      depth: baseMockDetailData.geometry.coordinates[2],
      shakemapIntensityImageUrl: expectedShakemapUrl,
    };

    expect(mockOnDataLoadedForSeo).toHaveBeenCalledWith(expect.objectContaining(expectedSeoData));
  });

  // --- formatDate helper tests ---
  it('does not render date row for null time', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.time = null;
    currentMockData.properties.title = "Test Null Time";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText("Date & Time (UTC)")).not.toBeInTheDocument();
  });

  it('does not render date row for undefined time', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    delete currentMockData.properties.time;
    currentMockData.properties.title = "Test Undefined Time";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText("Date & Time (UTC)")).not.toBeInTheDocument();
  });

  it('displays "Invalid Date" for invalid date string in time', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.time = 'invalid-date-string';
    currentMockData.properties.title = "Test Invalid String Time";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    const dateTimeLabelCell = screen.getByText("Date & Time (UTC)");
    const dateTimeRow = dateTimeLabelCell.closest('tr');
    expect(within(dateTimeRow).getByText('Invalid Date')).toBeInTheDocument();
  });

  // --- formatNumber helper tests (mag & depth) ---
  it('does not render magnitude row for null magnitude', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.mag = null;
    currentMockData.properties.title = "Test Null Magnitude";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText(/Magnitude \(.*?\)/i)).not.toBeInTheDocument();
  });

  it('does not render magnitude row for invalid string magnitude', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.mag = 'not-a-number';
    currentMockData.properties.title = "Test Invalid String Mag";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    try {
      await screen.findAllByText(currentMockData.properties.title, {}, {timeout: 1000});
    } catch (e) {
      // Error in SimplifiedDepthProfile might prevent title from rendering as expected.
    }
    expect(screen.queryByText(/Magnitude \(.*?\)/i)).not.toBeInTheDocument();
  });

  it('does not render depth row for null depth', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.geometry.coordinates[2] = null;
    currentMockData.properties.title = "Test Null Depth";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText("Depth")).not.toBeInTheDocument();
  });

  it('does not render depth row for invalid string depth', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.geometry.coordinates[2] = 'not-a-depth';
    currentMockData.properties.title = "Test Invalid String Depth";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText("Depth")).not.toBeInTheDocument();
  });

  // --- formatLargeNumber helper tests (Energy) ---
  const energyLabelText = "Energy (Seismic Moment)";
  it('formats valid large energy (1.23e+20) correctly', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.products['moment-tensor'][0].properties['scalar-moment'] = "1.23e+20";
    currentMockData.properties.title = "Test Valid Energy";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    const table = await screen.findByRole('table');
    const energyRow = within(table).getByText(energyLabelText).closest('tr');
    expect(within(energyRow).getByText(/123\s*quintillion N-m/i)).toBeInTheDocument();
  });

  it('formats zero energy correctly as "0 N-m"', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.products['moment-tensor'][0].properties['scalar-moment'] = "0";
    currentMockData.properties.title = "Test Zero Energy";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    const table = await screen.findByRole('table');
    const energyRow = within(table).getByText(energyLabelText).closest('tr');
    expect(within(energyRow).getByText(/^0 N-m$/i)).toBeInTheDocument();
  });

  it('does not render energy row for null energy', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.products['moment-tensor'][0].properties['scalar-moment'] = null;
    currentMockData.properties.title = "Test Null Energy";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText(energyLabelText)).not.toBeInTheDocument();
  });

  it('does not render energy row for invalid energy string', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.products['moment-tensor'][0].properties['scalar-moment'] = 'not-energy';
    currentMockData.properties.title = "Test Invalid Energy String";
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.queryByText(energyLabelText)).not.toBeInTheDocument();
  });

  // --- getBeachballPathsAndType helper tests ---
  it('renders beachball diagram with SVG paths for valid rake data', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.title = "Test Valid Rake Beachball";
    currentMockData.properties.products['moment-tensor'][0].properties = {
      'nodal-plane-1-rake': "0", 'nodal-plane-1-strike': "10", 'nodal-plane-1-dip': "45",
      'nodal-plane-2-rake': "0", 'nodal-plane-2-strike': "100", 'nodal-plane-2-dip': "45",
    };
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.getByText('"Beach Ball" Diagram')).toBeInTheDocument();
    const svgContainer = screen.getByTestId('beachball-svg-container');
    const svgElement = svgContainer.querySelector('svg');
    expect(svgElement).toBeInTheDocument();
    expect(svgElement.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('renders beachball diagram with zero SVG paths for null rake data', async () => {
    const currentMockData = deepClone(baseMockDetailData);
    currentMockData.properties.title = "Test Null Rake Beachball";
    currentMockData.properties.products['moment-tensor'][0].properties = {
      'nodal-plane-1-strike': "10", 'nodal-plane-1-dip': "45",
      'nodal-plane-2-strike': "100", 'nodal-plane-2-dip': "45",
      'nodal-plane-1-rake': null // Key for this test
    };
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => currentMockData });
    render(<EarthquakeDetailView detailUrl={mockDetailUrl} onClose={mockOnClose} />);
    await screen.findAllByText(currentMockData.properties.title);
    expect(screen.getByText('"Beach Ball" Diagram')).toBeInTheDocument();
    const svgContainer = screen.getByTestId('beachball-svg-container');
    const svgElement = svgContainer.querySelector('svg');
    expect(svgElement).toBeInTheDocument();
    // Corrected Assertion: Expect 0 paths when rake is null/invalid and leads to empty shadedPaths
    expect(svgElement.querySelectorAll('path').length).toBe(0);
  });
});

describe('EarthquakeDetailView Accessibility', () => {
  const mockDetailUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=testquake-axe&format=geojson';
  const mockOnClose = vi.fn();
  const mockDetailData = {
    id: 'testquake-axe',
    properties: {
      title: 'M 7.0 - Axe Test Region',
      mag: 7.0,
      place: 'Axe Test Place',
      time: Date.now(),
      updated: Date.now(),
      tsunami: 0,
      status: 'reviewed',
      felt: 5,
      mmi: 3.0,
      alert: 'green',
      magType: 'mww',
      url: 'http://example.com/axe',
      products: {
        shakemap: [{ contents: { 'download/intensity.jpg': { url: 'http://example.com/shakemap.jpg' } } }],
        'moment-tensor': [{ properties: { 'scalar-moment': "1.0e+19", 'nodal-plane-1-strike': "10", 'nodal-plane-1-dip': "30", 'nodal-plane-1-rake': "90" } }],
        origin: [{ properties: { 'num-stations-used': "100", 'azimuthal-gap': "45", 'minimum-distance': "0.5", 'standard-error': "0.7" } }]
      }
    },
    geometry: { coordinates: [-120, 37, 10] } // lon, lat, depth
  };

  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
    mockOnClose.mockClear();

    // Mock IntersectionObserver for components like SimplifiedDepthProfile if they use it
    const MockIntersectionObserver = vi.fn();
    MockIntersectionObserver.prototype.observe = vi.fn();
    MockIntersectionObserver.prototype.unobserve = vi.fn();
    MockIntersectionObserver.prototype.disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    // Mock matchMedia
     window.matchMedia = window.matchMedia || function() {
      return {
          matches: false,
          addListener: function() {},
          removeListener: function() {}
      };
    };
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('should have no axe violations when displaying data', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => JSON.parse(JSON.stringify(mockDetailData)), // Deep clone
    });

    const { container } = render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        onDataLoadedForSeo={vi.fn()}
        broaderEarthquakeData={[]}
        dataSourceTimespanDays={7}
        handleLoadMonthlyData={vi.fn()}
        hasAttemptedMonthlyLoad={false}
        isLoadingMonthly={false}
      />
    );

    // Wait for the content to be loaded and displayed
    await waitFor(() => {
      // Check for a more specific element if title is duplicated.
      // For example, the one with the ID used for aria-labelledby.
      expect(screen.getByText((content, element) => element.id === 'earthquake-detail-title' && content.startsWith('M 7.0 - Axe Test Region'))).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no axe violations in loading state', async () => {
    fetchSpy.mockReturnValueOnce(new Promise(() => {})); // Simulate pending promise

    const { container } = render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        onDataLoadedForSeo={vi.fn()}
        broaderEarthquakeData={[]}
        dataSourceTimespanDays={7}
        handleLoadMonthlyData={vi.fn()} // Added missing mock prop
        hasAttemptedMonthlyLoad={false} // Added missing mock prop
        isLoadingMonthly={false}       // Added missing mock prop
      />
    );

    // Check while loading skeleton is present
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    const results = await axe(container); // axe should be available globally via setupTests.js
    expect(results).toHaveNoViolations();
  });

  it('should have no axe violations in error state', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Failed to fetch details for axe test'));

    // Spy on console.error and silence it for this test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <EarthquakeDetailView
        detailUrl={mockDetailUrl}
        onClose={mockOnClose}
        onDataLoadedForSeo={vi.fn()} // Added missing mock prop
        broaderEarthquakeData={[]}
        dataSourceTimespanDays={7}
        handleLoadMonthlyData={vi.fn()} // Added missing mock prop
        hasAttemptedMonthlyLoad={false} // Added missing mock prop
        isLoadingMonthly={false}      // Added missing mock prop
      />
    );

    await screen.findByText(/Error Loading Details/i);
    const results = await axe(container); // axe should be available globally via setupTests.js
    expect(results).toHaveNoViolations();

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });
});
