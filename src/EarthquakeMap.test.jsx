import React from 'react';
import { render, screen, within } from '@testing-library/react';
import EarthquakeMap from './EarthquakeMap';
import { describe, it, expect, vi } from 'vitest';
import L from 'leaflet';

// Mock Leaflet's imagePath to prevent console errors during tests
// L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.7.1/dist/images/';

// Mock TectonicPlateBoundaries.json
vi.mock('./TectonicPlateBoundaries.json', () => ({
  default: { // Ensure this is a default export
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      },
    ],
  }
}));

// Mock react-leaflet components to simplify testing and avoid actual map rendering
vi.mock('react-leaflet', async () => {
  const actual = await vi.importActual('react-leaflet');
  return {
    ...actual,
    MapContainer: ({ children, center, zoom, style }) => (
      <div data-testid="map-container" data-center={center ? JSON.stringify(center) : undefined} data-zoom={zoom} style={style}>
        {children}
      </div>
    ),
    TileLayer: ({ url, attribution }) => (
      <div data-testid="tile-layer" data-url={url} data-attribution={attribution}></div>
    ),
    Marker: ({ position, children }) => (
      <div data-testid="marker" data-position={position ? JSON.stringify(position) : undefined}>
        {children}
      </div>
    ),
    Popup: ({ children }) => <div data-testid="popup">{children}</div>,
    GeoJSON: ({ data, style }) => (
      // Check if data and data.features exist before accessing length
      <div data-testid="geojson-layer" data-style={style ? JSON.stringify(style) : undefined} data-features={data && data.features ? data.features.length : 0}></div>
    ),
    ImageOverlay: ({ url, bounds, opacity, attribution }) => (
      <div data-testid="image-overlay" data-url={url} data-bounds={bounds ? JSON.stringify(bounds) : undefined} data-opacity={opacity} data-attribution={attribution}></div>
    )
  };
});


describe('EarthquakeMap Component', () => {
  const defaultProps = {
    latitude: 34.0522,
    longitude: -118.2437,
    title: 'Test Earthquake',
    shakeMapUrl: 'https://example.com/shakemap.jpg',
  };

  it('renders the map container', () => {
    render(<EarthquakeMap {...defaultProps} />);
    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer).toBeInTheDocument();
  });

  it('renders the map with correct center and zoom', () => {
    render(<EarthquakeMap {...defaultProps} />);
    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer).toHaveAttribute('data-center', JSON.stringify([defaultProps.latitude, defaultProps.longitude]));
    expect(mapContainer).toHaveAttribute('data-zoom', '5'); // Default zoom
  });

  it('applies grayscale and other theme styles to the map container', () => {
    render(<EarthquakeMap {...defaultProps} />);
    const mapContainer = screen.getByTestId('map-container');
    expect(mapContainer.style.filter).toContain('grayscale(100%)');
    expect(mapContainer.style.filter).toContain('brightness(90%)');
    expect(mapContainer.style.filter).toContain('contrast(120%)');
    expect(mapContainer.style.height).toBe('100vh');
  });

  it('renders a marker at the correct coordinates', () => {
    render(<EarthquakeMap {...defaultProps} />);
    const marker = screen.getByTestId('marker');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveAttribute('data-position', JSON.stringify([defaultProps.latitude, defaultProps.longitude]));
  });

  it('displays the earthquake title in the marker popup', () => {
    render(<EarthquakeMap {...defaultProps} />);
    const popup = screen.getByTestId('popup');
    expect(popup).toBeInTheDocument();
    expect(within(popup).getByText(defaultProps.title)).toBeInTheDocument();
  });

  it('displays a link to the ShakeMap in the popup if shakeMapUrl is provided', () => {
    render(<EarthquakeMap {...defaultProps} />);
    const popup = screen.getByTestId('popup');
    const shakeMapLink = within(popup).getByRole('link', { name: /ShakeMap Details/i });
    expect(shakeMapLink).toBeInTheDocument();
    expect(shakeMapLink).toHaveAttribute('href', defaultProps.shakeMapUrl);
  });

  it('does NOT display a ShakeMap link in the popup if shakeMapUrl is not provided', () => {
    render(<EarthquakeMap {...defaultProps} shakeMapUrl={null} />);
    const popup = screen.getByTestId('popup');
    const shakeMapLink = within(popup).queryByRole('link', { name: /ShakeMap Details/i });
    expect(shakeMapLink).not.toBeInTheDocument();
  });

  it('renders the TileLayer with CARTO light theme', () => {
    render(<EarthquakeMap {...defaultProps} />);
    const tileLayer = screen.getByTestId('tile-layer');
    expect(tileLayer).toBeInTheDocument();
    expect(tileLayer).toHaveAttribute('data-url', 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png');
  });

  it('renders the GeoJSON layer for tectonic plates', () => {
    render(<EarthquakeMap {...defaultProps} />);
    const geoJsonLayer = screen.getByTestId('geojson-layer');
    expect(geoJsonLayer).toBeInTheDocument();
    expect(geoJsonLayer).toHaveAttribute('data-features', '1'); // From our mock
    const style = JSON.parse(geoJsonLayer.getAttribute('data-style'));
    expect(style.color).toBe('#555');
    expect(style.weight).toBe(2);
  });

  // Note: The current EarthquakeMap component does not directly render an ImageOverlay for ShakeMap.
  // The shakeMapUrl is used for a link in the Popup.
  // If an ImageOverlay for ShakeMap was a requirement, these tests would be relevant.
  // For now, these will be commented out or adapted if functionality changes.

  // it('renders ShakeMap ImageOverlay if shakeMapUrl and bounds are provided', () => {
  //   // This test would require bounds to be passed to EarthquakeMap or derived.
  //   // For simplicity, let's assume bounds are passed if this feature existed.
  //   const propsWithShakeMap = {
  //     ...defaultProps,
  //     shakeMapUrl: 'https://example.com/shakemap.jpg',
  //     // shakeMapBounds: [[30, -120], [40, -110]] // Example bounds
  //   };
  //   // IF EarthquakeMap rendered an <ImageOverlay> component:
  //   // render(<EarthquakeMap {...propsWithShakeMap} />);
  //   // const imageOverlay = screen.getByTestId('image-overlay');
  //   // expect(imageOverlay).toBeInTheDocument();
  //   // expect(imageOverlay).toHaveAttribute('data-url', propsWithShakeMap.shakeMapUrl);
  // });

  // it('does NOT render ShakeMap ImageOverlay if shakeMapUrl is not provided', () => {
  //   // render(<EarthquakeMap {...defaultProps} shakeMapUrl={null} />);
  //   // const imageOverlay = screen.queryByTestId('image-overlay');
  //   // expect(imageOverlay).not.toBeInTheDocument();
  // });
});
