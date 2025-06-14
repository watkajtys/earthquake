import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EarthquakeMap from './EarthquakeMap';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import L from 'leaflet';

// --- Mocks ---
vi.mock('../assets/TectonicPlateBoundaries.json', () => ({
  default: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { Boundary_Type: 'Convergent' }, geometry: { type: 'LineString', coordinates: [[0,0],[1,1]] }}],
  }
}));

let mockFitBounds = vi.fn();
let mockSetView = vi.fn();
let mockInvalidateSize = vi.fn();

vi.mock('react-leaflet', async () => {
  const actual = await vi.importActual('react-leaflet');
  return {
    ...actual,
    MapContainer: React.forwardRef(({ children, center, zoom, style }, ref) => {
      React.useEffect(() => {
        if (ref) {
          ref.current = { fitBounds: mockFitBounds, setView: mockSetView, invalidateSize: mockInvalidateSize };
        }
      }, [ref]);
      return <div data-testid="map-container" data-center={center ? JSON.stringify(center) : undefined} data-zoom={zoom} style={style}>{children}</div>;
    }),
    TileLayer: ({ url, attribution }) => <div data-testid="tile-layer" data-url={url} data-attribution={attribution}></div>,
    Marker: ({ position, icon, children }) => (
      <div data-testid="marker" data-position={position ? JSON.stringify(position) : undefined} data-icon-classname={icon?.options?.className} data-icon-html={icon?.options?.html} data-icon-size={icon?.options?.iconSize ? JSON.stringify(icon.options.iconSize) : undefined}>
        {children}
      </div>
    ),
    Popup: ({ children }) => <div data-testid="popup">{children}</div>,
    GeoJSON: ({ data, style }) => <div data-testid="geojson-layer" data-style-function={style ? style.toString() : ''} data-features={data?.features?.length || 0} data-passed-style-type={typeof style}></div>,
  };
});

// --- Updated Default Props and Data ---
const baseProps = {
  mapCenterLatitude: 34.0522,
  mapCenterLongitude: -118.2437,
  highlightQuakeLatitude: 34.0522, // Often same as mapCenter for simple cases
  highlightQuakeLongitude: -118.2437,
  highlightQuakeMagnitude: 5.5,
  highlightQuakeTitle: 'Test Highlight Quake',
  shakeMapUrl: 'https://example.com/shakemap.jpg',
  mainQuakeDetailUrl: '/quake/test-quake-id',
  nearbyQuakes: [], // Default to empty, add in specific tests
  fitMapToBounds: false, // Default to false
  defaultZoom: 8,
};

const nearbyQuakesData = [
  { id: 'nq1', geometry: { coordinates: [-119.0, 35.0, 10] }, properties: { mag: 3.5, title: "Nearby Quake 1", time: Date.now() - 1000, detail: 'nq1_detail' } },
  { id: 'nq2', geometry: { coordinates: [-117.5, 33.5, 5] }, properties: { mag: 2.8, title: "Nearby Quake 2", time: Date.now() - 2000, detail: 'nq2_detail' } }
];

// --- Test Suites ---

describe('EarthquakeMap Component - Core Rendering', () => {
  beforeEach(() => {
    mockFitBounds.mockClear();
    mockSetView.mockClear();
    mockInvalidateSize.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Mock console.warn for all tests in this block
  });

  afterEach(() => { // Add afterEach to restore console.warn
    console.warn.mockRestore();
  });

  it('renders the map container', () => {
    render(<MemoryRouter><EarthquakeMap {...baseProps} /></MemoryRouter>);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders map with correct initial center and zoom from props', () => {
    render(<MemoryRouter><EarthquakeMap {...baseProps} /></MemoryRouter>);
    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer).toHaveAttribute('data-center', JSON.stringify([baseProps.mapCenterLatitude, baseProps.mapCenterLongitude]));
    expect(mapContainer).toHaveAttribute('data-zoom', baseProps.defaultZoom.toString());
    // useEffect will call setView
    expect(mockSetView).toHaveBeenCalledWith(L.latLng(baseProps.mapCenterLatitude, baseProps.mapCenterLongitude), baseProps.defaultZoom);
  });

  it('renders a marker with custom pulsing icon for the highlightQuake', () => {
    render(<MemoryRouter><EarthquakeMap {...baseProps} /></MemoryRouter>);
    const markers = screen.getAllByTestId('marker'); // Will be 1 if no nearbyQuakes
    const mainMarker = markers.find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    expect(mainMarker).toBeInTheDocument();
    expect(mainMarker).toHaveAttribute('data-position', JSON.stringify([baseProps.highlightQuakeLatitude, baseProps.highlightQuakeLongitude]));
  });

  it('does not render highlightQuake marker if coordinates are undefined', () => {
    render(<MemoryRouter><EarthquakeMap {...baseProps} highlightQuakeLatitude={undefined} highlightQuakeLongitude={undefined} /></MemoryRouter>);
    const markers = screen.queryAllByTestId('marker');
    const mainMarker = markers.find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    expect(mainMarker).toBeUndefined();
  });

  it('displays highlight quake title, magnitude, and detail link in popup', () => {
    render(<MemoryRouter><EarthquakeMap {...baseProps} /></MemoryRouter>);
    const mainMarker = screen.getAllByTestId('marker').find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    const popup = within(mainMarker).getByTestId('popup');
    expect(popup).toHaveTextContent(baseProps.highlightQuakeTitle);
    expect(popup).toHaveTextContent(`Magnitude: ${baseProps.highlightQuakeMagnitude}`);
    const detailLink = within(popup).getByRole('link', { name: /View Details/i });
    expect(detailLink).toHaveAttribute('href', `/quake/${encodeURIComponent(baseProps.mainQuakeDetailUrl)}`);
  });

  it('displays ShakeMap link if mainQuakeDetailUrl is not provided but shakeMapUrl is', () => {
    render(<MemoryRouter><EarthquakeMap {...baseProps} mainQuakeDetailUrl={null} shakeMapUrl="https://shakemap.example.com" /></MemoryRouter>);
    const mainMarker = screen.getAllByTestId('marker').find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    const popup = within(mainMarker).getByTestId('popup');
    const shakeMapLink = within(popup).getByRole('link', { name: /ShakeMap Details/i });
    expect(shakeMapLink).toHaveAttribute('href', "https://shakemap.example.com");
  });

  it('renders TileLayer and GeoJSON layer', async () => { // Made test async
    render(<MemoryRouter><EarthquakeMap {...baseProps} /></MemoryRouter>);
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
    // GeoJSON layer is now loaded asynchronously
    expect(await screen.findByTestId('geojson-layer')).toBeInTheDocument();
  });

  it('renders markers for nearby quakes', () => {
    render(<MemoryRouter><EarthquakeMap {...baseProps} nearbyQuakes={nearbyQuakesData} /></MemoryRouter>);
    const markers = screen.getAllByTestId('marker');
    const nearbyMarkers = markers.filter(m => m.getAttribute('data-icon-classname') === 'custom-nearby-quake-icon');
    expect(nearbyMarkers.length).toBe(nearbyQuakesData.length);
  });

  it('renders map and only valid nearbyQuakes when some have missing data, logging warnings', () => {
    const malformedNearbyQuakes = [
      { id: 'validNearby1', geometry: { coordinates: [-120.0, 36.0, 12] }, properties: { mag: 2.5, title: "Valid Nearby Quake 1", time: Date.now() - 3000, detail: 'vnq1_detail' } },
      { id: 'invalidNearbyNoGeom', properties: { mag: 3.0, title: "No Geometry", time: Date.now() - 4000 } }, // Missing geometry
      { id: 'invalidNearbyNoCoords', geometry: {}, properties: { mag: 3.1, title: "No Coords", time: Date.now() - 5000 } }, // Missing geometry.coordinates
      { id: 'invalidNearbyShortCoords', geometry: { coordinates: [-121.0] }, properties: { mag: 3.2, title: "Short Coords", time: Date.now() - 6000 } }, // Insufficient coordinates
      { id: 'invalidNearbyNoMag', geometry: { coordinates: [-122.0, 37.0, 15] }, properties: { title: "No Mag", time: Date.now() - 7000 } }, // Missing properties.mag
      { id: 'invalidNearbyNoTime', geometry: { coordinates: [-123.0, 38.0, 18] }, properties: { mag: 3.3, title: "No Time" } }, // Missing properties.time
    ];

    render(<MemoryRouter><EarthquakeMap {...baseProps} nearbyQuakes={malformedNearbyQuakes} /></MemoryRouter>);

    // Check map still renders
    expect(screen.getByTestId('map-container')).toBeInTheDocument();

    // Check markers: 1 main highlight marker + 1 valid nearby marker
    const markers = screen.getAllByTestId('marker');
    const mainMarker = markers.find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    const nearbyMarkers = markers.filter(m => m.getAttribute('data-icon-classname') === 'custom-nearby-quake-icon');

    expect(mainMarker).toBeInTheDocument();
    expect(nearbyMarkers.length).toBe(1); // Only 'validNearby1' should render as a nearby quake
    expect(nearbyMarkers[0]).toHaveAttribute('data-position', JSON.stringify([malformedNearbyQuakes[0].geometry.coordinates[1], malformedNearbyQuakes[0].geometry.coordinates[0]]));

    // Check warnings (adjust message based on actual implementation)
    expect(console.warn).toHaveBeenCalledWith("Skipping rendering of nearby quake due to missing data:", malformedNearbyQuakes[1]);
    expect(console.warn).toHaveBeenCalledWith("Skipping rendering of nearby quake due to missing data:", malformedNearbyQuakes[2]);
    expect(console.warn).toHaveBeenCalledWith("Skipping rendering of nearby quake due to missing data:", malformedNearbyQuakes[3]);
    expect(console.warn).toHaveBeenCalledWith("Skipping rendering of nearby quake due to missing data:", malformedNearbyQuakes[4]);
    expect(console.warn).toHaveBeenCalledWith("Skipping rendering of nearby quake due to missing data:", malformedNearbyQuakes[5]);
  });
});


describe('EarthquakeMap Component - Bounds Fitting', () => {
  beforeEach(() => {
    mockFitBounds.mockClear();
    mockSetView.mockClear();
    mockInvalidateSize.mockClear();
  });

  // This afterEach was missing, which would cause console.warn to remain mocked for other describe blocks.
  // However, since we are adding mock/restore to the 'Core Rendering' block specifically,
  // we don't need a global one here unless other describe blocks also mock console.warn.
  // For now, this change is not strictly needed by the PR's explicit changes but good for hygiene if other tests mock console.
  // afterEach(() => {
  //   if (vi.isMockFunction(console.warn)) { // Check if it's mocked before trying to restore
  //     console.warn.mockRestore();
  //   }
  // });

  it('fitMapToBounds={true} with highlight quake and nearby quakes: calls fitBounds', () => {
    render(
      <MemoryRouter>
        <EarthquakeMap {...baseProps} nearbyQuakes={nearbyQuakesData} fitMapToBounds={true} />
      </MemoryRouter>
    );

    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    const expectedPoints = [
      L.latLng(baseProps.highlightQuakeLatitude, baseProps.highlightQuakeLongitude),
      L.latLng(nearbyQuakesData[0].geometry.coordinates[1], nearbyQuakesData[0].geometry.coordinates[0]),
      L.latLng(nearbyQuakesData[1].geometry.coordinates[1], nearbyQuakesData[1].geometry.coordinates[0]),
    ];
    const expectedBounds = L.latLngBounds(expectedPoints);

    const calledBounds = mockFitBounds.mock.calls[0][0];
    expect(calledBounds.getSouthWest().equals(expectedBounds.getSouthWest())).toBe(true);
    expect(calledBounds.getNorthEast().equals(expectedBounds.getNorthEast())).toBe(true);
    expect(mockFitBounds).toHaveBeenCalledWith(expect.anything(), { padding: [50, 50] });
    expect(mockSetView).not.toHaveBeenCalled(); // fitBounds should be called instead of setView by the effect
  });

  it('fitMapToBounds={true} with only highlight quake: calls setView with highlight quake position and defaultZoom', () => {
    render(
      <MemoryRouter>
        <EarthquakeMap {...baseProps} nearbyQuakes={[]} fitMapToBounds={true} />
      </MemoryRouter>
    );
    expect(mockSetView).toHaveBeenCalledTimes(1);
    expect(mockSetView).toHaveBeenCalledWith(L.latLng(baseProps.highlightQuakeLatitude, baseProps.highlightQuakeLongitude), baseProps.defaultZoom);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('fitMapToBounds={true} with no highlight quake but with nearby quakes: calls fitBounds for nearby', () => {
    render(
      <MemoryRouter>
        <EarthquakeMap
          {...baseProps}
          highlightQuakeLatitude={undefined}
          highlightQuakeLongitude={undefined}
          highlightQuakeMagnitude={undefined}
          nearbyQuakes={nearbyQuakesData}
          fitMapToBounds={true}
        />
      </MemoryRouter>
    );
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    const expectedPoints = [
      L.latLng(nearbyQuakesData[0].geometry.coordinates[1], nearbyQuakesData[0].geometry.coordinates[0]),
      L.latLng(nearbyQuakesData[1].geometry.coordinates[1], nearbyQuakesData[1].geometry.coordinates[0]),
    ];
    const expectedBounds = L.latLngBounds(expectedPoints);
    const calledBounds = mockFitBounds.mock.calls[0][0];
    expect(calledBounds.getSouthWest().equals(expectedBounds.getSouthWest())).toBe(true);
    expect(calledBounds.getNorthEast().equals(expectedBounds.getNorthEast())).toBe(true);
    expect(mockSetView).not.toHaveBeenCalled();
  });

  it('fitMapToBounds={true} with no points at all: calls setView with mapCenter and defaultZoom', () => {
     render(
      <MemoryRouter>
        <EarthquakeMap
          {...baseProps}
          highlightQuakeLatitude={undefined}
          highlightQuakeLongitude={undefined}
          highlightQuakeMagnitude={undefined}
          nearbyQuakes={[]}
          fitMapToBounds={true}
        />
      </MemoryRouter>
    );
    expect(mockSetView).toHaveBeenCalledTimes(1);
    expect(mockSetView).toHaveBeenCalledWith(L.latLng(baseProps.mapCenterLatitude, baseProps.mapCenterLongitude), baseProps.defaultZoom);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });


  it('fitMapToBounds={false}: calls setView with mapCenter and defaultZoom', () => {
    render(
      <MemoryRouter>
        <EarthquakeMap {...baseProps} nearbyQuakes={nearbyQuakesData} fitMapToBounds={false} />
      </MemoryRouter>
    );
    expect(mockSetView).toHaveBeenCalledTimes(1);
    expect(mockSetView).toHaveBeenCalledWith(L.latLng(baseProps.mapCenterLatitude, baseProps.mapCenterLongitude), baseProps.defaultZoom);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('map centers on mapCenter props even if highlightQuake is different, when fitMapToBounds is false', () => {
    const differentCenterProps = {
      ...baseProps,
      mapCenterLatitude: 40.7128, // New York
      mapCenterLongitude: -74.0060,
      highlightQuakeLatitude: 34.0522, // LA
      highlightQuakeLongitude: -118.2437,
      fitMapToBounds: false,
    };
    render(<MemoryRouter><EarthquakeMap {...differentCenterProps} /></MemoryRouter>);

    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer).toHaveAttribute('data-center', JSON.stringify([differentCenterProps.mapCenterLatitude, differentCenterProps.mapCenterLongitude]));

    const markers = screen.getAllByTestId('marker');
    const mainMarker = markers.find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    expect(mainMarker).toBeInTheDocument();
    expect(mainMarker).toHaveAttribute('data-position', JSON.stringify([differentCenterProps.highlightQuakeLatitude, differentCenterProps.highlightQuakeLongitude]));

    expect(mockSetView).toHaveBeenCalledTimes(1);
    expect(mockSetView).toHaveBeenCalledWith(L.latLng(differentCenterProps.mapCenterLatitude, differentCenterProps.mapCenterLongitude), differentCenterProps.defaultZoom);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('fitMapToBounds={true} includes highlightQuake and nearbyQuakes even if mapCenter is different', () => {
    const differentCenterProps = {
      ...baseProps,
      mapCenterLatitude: 0,
      mapCenterLongitude: 0, // Center of the world
      highlightQuakeLatitude: 34.0522, // LA
      highlightQuakeLongitude: -118.2437,
      nearbyQuakes: nearbyQuakesData, // from California
      fitMapToBounds: true,
    };
    render(<MemoryRouter><EarthquakeMap {...differentCenterProps} /></MemoryRouter>);

    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    const expectedPoints = [
      L.latLng(differentCenterProps.highlightQuakeLatitude, differentCenterProps.highlightQuakeLongitude),
      L.latLng(nearbyQuakesData[0].geometry.coordinates[1], nearbyQuakesData[0].geometry.coordinates[0]),
      L.latLng(nearbyQuakesData[1].geometry.coordinates[1], nearbyQuakesData[1].geometry.coordinates[0]),
    ];
    const expectedBounds = L.latLngBounds(expectedPoints);

    const calledBounds = mockFitBounds.mock.calls[0][0];
    expect(calledBounds.getSouthWest().equals(expectedBounds.getSouthWest())).toBe(true);
    expect(calledBounds.getNorthEast().equals(expectedBounds.getNorthEast())).toBe(true);
    expect(mockSetView).not.toHaveBeenCalled();
  });
});
