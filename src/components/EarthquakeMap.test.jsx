import React from 'react';
import { render, screen, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom'; // Import MemoryRouter
import EarthquakeMap from './EarthquakeMap';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import L from 'leaflet';

// --- Mocks ---

// Mock TectonicPlateBoundaries.json
vi.mock('../assets/TectonicPlateBoundaries.json', () => ({ // Corrected path
  default: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { Boundary_Type: 'Convergent' }, geometry: { type: 'LineString', coordinates: [[0,0],[1,1]] }},
    ],
  }
}));

// Variables for map instance methods, to be accessible in tests
// Initialize them here so they are defined when the vi.mock factory is hoisted and executed.
let mockFitBounds = vi.fn();
let mockSetView = vi.fn();
let mockInvalidateSize = vi.fn();

vi.mock('react-leaflet', async () => {
  const actual = await vi.importActual('react-leaflet');
  // mockFitBounds, mockSetView, mockInvalidateSize are already vi.fn() instances here

  return {
    ...actual,
    MapContainer: React.forwardRef(({ children, center, zoom, style }, ref) => {
      // Simulate Leaflet's map instance being available on ref.current
      // Use useEffect to assign to ref.current after initial render, similar to how Leaflet does.
      React.useEffect(() => {
        if (ref) {
          ref.current = {
            fitBounds: mockFitBounds,
            setView: mockSetView,
            invalidateSize: mockInvalidateSize,
            // Add other map methods if your component uses them
          };
        }
      }, [ref]); // Rerun if ref object itself changes, though unlikely

      return (
        <div data-testid="map-container" data-center={center ? JSON.stringify(center) : undefined} data-zoom={zoom} style={style}>
          {children}
        </div>
      );
    }),
    TileLayer: ({ url, attribution }) => (
      <div data-testid="tile-layer" data-url={url} data-attribution={attribution}></div>
    ),
    Marker: ({ position, icon, children }) => (
      <div
        data-testid="marker"
        data-position={position ? JSON.stringify(position) : undefined}
        data-icon-classname={icon?.options?.className}
        data-icon-html={icon?.options?.html}
        data-icon-size={icon?.options?.iconSize ? JSON.stringify(icon.options.iconSize) : undefined}
      >
        {children}
      </div>
    ),
    Popup: ({ children }) => <div data-testid="popup">{children}</div>,
    GeoJSON: ({ data, style }) => (
      <div
        data-testid="geojson-layer"
        data-style-function={style ? style.toString() : ''}
        data-features={data && data.features ? data.features.length : 0}
        data-passed-style-type={typeof style}
      ></div>
    ),
  };
});

// --- Default Props and Data ---
const defaultProps = {
  latitude: 34.0522,
  longitude: -118.2437,
  magnitude: 5.5,
  title: 'Test Earthquake',
  shakeMapUrl: 'https://example.com/shakemap.jpg',
  mainQuakeDetailUrl: '/quake/test-quake-id',
};

const nearbyQuakesData = [
  { id: 'nq1', geometry: { coordinates: [-119.0, 35.0, 10] }, properties: { mag: 3.5, title: "Nearby Quake 1", time: Date.now() - 1000, detail: 'nq1_detail' } },
  { id: 'nq2', geometry: { coordinates: [-117.5, 33.5, 5] }, properties: { mag: 2.8, title: "Nearby Quake 2", time: Date.now() - 2000, detail: 'nq2_detail' } }
];

const defaultZoom = 8; // As defined in EarthquakeMap.jsx

// --- Test Suites ---

describe('EarthquakeMap Component - Core Rendering', () => {
  beforeEach(() => {
    mockFitBounds.mockClear();
    mockSetView.mockClear();
    mockInvalidateSize.mockClear();
  });

  it('renders the map container', () => {
    render(<MemoryRouter><EarthquakeMap {...defaultProps} /></MemoryRouter>);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders the map with correct initial center and zoom when fitMapToBounds is false', () => {
    render(<MemoryRouter><EarthquakeMap {...defaultProps} fitMapToBounds={false} /></MemoryRouter>);
    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer).toHaveAttribute('data-center', JSON.stringify([defaultProps.latitude, defaultProps.longitude]));
    expect(mapContainer).toHaveAttribute('data-zoom', defaultZoom.toString());
    // setView is called by useEffect even when fitMapToBounds is false
    expect(mockSetView).toHaveBeenCalledWith(L.latLng(defaultProps.latitude, defaultProps.longitude), defaultZoom);
  });

  it('renders a marker with custom pulsing icon for the main quake', () => {
    render(<MemoryRouter><EarthquakeMap {...defaultProps} /></MemoryRouter>);
    const markers = screen.getAllByTestId('marker');
    const mainMarker = markers.find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    expect(mainMarker).toBeInTheDocument();
    expect(mainMarker).toHaveAttribute('data-position', JSON.stringify([defaultProps.latitude, defaultProps.longitude]));
  });

  it('displays main quake title, magnitude, and detail link in popup', () => {
    render(<MemoryRouter><EarthquakeMap {...defaultProps} /></MemoryRouter>);
    const mainMarker = screen.getAllByTestId('marker').find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    const popup = within(mainMarker).getByTestId('popup');
    expect(popup).toHaveTextContent(defaultProps.title);
    expect(popup).toHaveTextContent(`Magnitude: ${defaultProps.magnitude}`);
    const detailLink = within(popup).getByRole('link', { name: /View Details/i });
    expect(detailLink).toHaveAttribute('href', `/quake/${encodeURIComponent(defaultProps.mainQuakeDetailUrl)}`);
  });

  it('displays ShakeMap link if mainQuakeDetailUrl is not provided but shakeMapUrl is', () => {
    render(<MemoryRouter><EarthquakeMap {...defaultProps} mainQuakeDetailUrl={null} shakeMapUrl="https://shakemap.example.com" /></MemoryRouter>);
    const mainMarker = screen.getAllByTestId('marker').find(m => m.getAttribute('data-icon-classname') === 'custom-pulsing-icon');
    const popup = within(mainMarker).getByTestId('popup');
    const shakeMapLink = within(popup).getByRole('link', { name: /ShakeMap Details/i });
    expect(shakeMapLink).toHaveAttribute('href', "https://shakemap.example.com");
  });

  it('renders TileLayer and GeoJSON layer', () => {
    render(<MemoryRouter><EarthquakeMap {...defaultProps} /></MemoryRouter>);
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
    expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
  });

  it('renders markers for nearby quakes', () => {
    render(<MemoryRouter><EarthquakeMap {...defaultProps} nearbyQuakes={nearbyQuakesData} /></MemoryRouter>);
    const markers = screen.getAllByTestId('marker');
    const nearbyMarkers = markers.filter(m => m.getAttribute('data-icon-classname') === 'custom-nearby-quake-icon');
    expect(nearbyMarkers.length).toBe(nearbyQuakesData.length);
  });
});


describe('EarthquakeMap Component - Bounds Fitting', () => {
  beforeEach(() => {
    mockFitBounds.mockClear();
    mockSetView.mockClear();
    mockInvalidateSize.mockClear();
  });

  it('fitMapToBounds={true} with multiple quakes: calls fitBounds and not setView for zoom', () => {
    render(
      <MemoryRouter>
        <EarthquakeMap {...defaultProps} nearbyQuakes={nearbyQuakesData} fitMapToBounds={true} />
      </MemoryRouter>
    );

    expect(mockFitBounds).toHaveBeenCalledTimes(1);

    const expectedPoints = [
      L.latLng(defaultProps.latitude, defaultProps.longitude),
      L.latLng(nearbyQuakesData[0].geometry.coordinates[1], nearbyQuakesData[0].geometry.coordinates[0]),
      L.latLng(nearbyQuakesData[1].geometry.coordinates[1], nearbyQuakesData[1].geometry.coordinates[0]),
    ];
    const expectedBounds = L.latLngBounds(expectedPoints);

    // Compare bounds by their string representation or individual components
    const calledBounds = mockFitBounds.mock.calls[0][0];
    expect(calledBounds.getSouthWest().equals(expectedBounds.getSouthWest())).toBe(true);
    expect(calledBounds.getNorthEast().equals(expectedBounds.getNorthEast())).toBe(true);
    expect(mockFitBounds).toHaveBeenCalledWith(expect.anything(), { padding: [50, 50] });

    // setView might be called initially by MapContainer, but should not be called by the effect for zooming
    // The effect for fitMapToBounds=true with multiple points should prioritize fitBounds.
    // If an initial setView happens from MapContainer itself, that's fine.
    // We are checking that *our effect* doesn't call setView for zooming.
    // Let's assume initial render might call setView once.
    // The critical part is that fitBounds is called.
    // If the effect for fitMapToBounds=false (which calls setView) also runs,
    // it might lead to multiple setView calls. The current logic in EarthquakeMap
    // has an if/else if for fitMapToBounds, so only one path should execute.
    // Thus, setView should not be called by the effect IF fitBounds is called.
    // However, MapContainer itself takes 'center' and 'zoom' props. If these trigger a setView internally
    // in the mocked component or in a real one, that's separate. The test should focus on our effect's behavior.
    // Given the mock, setView is NOT called by the MapContainer mock directly.
    // The useEffect in EarthquakeMap with fitMapToBounds=true and multiple points calls fitBounds.
    // The else if for fitMapToBounds=false calls setView. So setView should not be called here from the effect.
    expect(mockSetView).not.toHaveBeenCalled();
  });

  it('fitMapToBounds={true} with only main quake: calls setView and not fitBounds', () => {
    render(
      <MemoryRouter>
        <EarthquakeMap {...defaultProps} nearbyQuakes={[]} fitMapToBounds={true} />
      </MemoryRouter>
    );

    expect(mockSetView).toHaveBeenCalledTimes(1);
    expect(mockSetView).toHaveBeenCalledWith(L.latLng(defaultProps.latitude, defaultProps.longitude), defaultZoom);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('fitMapToBounds={false}: calls setView and not fitBounds', () => {
    render(
      <MemoryRouter>
        <EarthquakeMap {...defaultProps} nearbyQuakes={nearbyQuakesData} fitMapToBounds={false} />
      </MemoryRouter>
    );

    expect(mockSetView).toHaveBeenCalledTimes(1);
    // The setView call in the useEffect for fitMapToBounds=false should use L.latLng
    expect(mockSetView).toHaveBeenCalledWith(L.latLng(defaultProps.latitude, defaultProps.longitude), defaultZoom);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });
});
