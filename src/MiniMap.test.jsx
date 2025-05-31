import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MiniMap from './MiniMap';

// This variable will hold the 'L' mock that the component uses,
// allowing tests to access and assert against its methods.
let LMockForTests;

vi.mock('leaflet', () => {
  const LInternalSpies = {
    latLng: vi.fn((lat, lng) => ({ lat, lng })),
    latLngBounds: vi.fn(points => ({
      pad: vi.fn(() => ({_southWest: points?.[0], _northEast: points?.[points.length-1]}))
    })),
    featureGroup: vi.fn(), // To be fully defined with spies in beforeEach
    circleMarker: vi.fn(), // To be fully defined with spies in beforeEach
    Icon: {
      Default: {
          prototype: { _getIconUrl: null },
          mergeOptions: vi.fn(),
      }
    },
    DivIcon: vi.fn(),
  };
  LMockForTests = LInternalSpies; // Assign to outer scope variable for test access
  return {
    __esModule: true,
    default: LInternalSpies,
  };
});

const mockMapInstanceSpies = {
  fitBounds: vi.fn(),
  setView: vi.fn(),
  addLayer: vi.fn(),
};

vi.mock('react-leaflet', async () => {
  const actual = await vi.importActual('react-leaflet');
  const ReactActual = await vi.importActual('react');

  return {
    ...actual,
    MapContainer: vi.fn(({ children, center, zoom, whenCreated }) => {
      ReactActual.useEffect(() => {
        if (whenCreated) {
          whenCreated(mockMapInstanceSpies);
        }
      }, [whenCreated]);

      return (
        <div data-testid="map-container" data-center={center?.join(',')} data-zoom={zoom}>
          {children}
        </div>
      );
    }),
    TileLayer: vi.fn(() => <div data-testid="tile-layer"></div>),
    GeoJSON: vi.fn(() => <div data-testid="geojson-layer"></div>),
    Marker: vi.fn(({ position }) => (
      <div data-testid="marker" data-position={position?.join(',')}></div>
    )),
    Tooltip: vi.fn(({ children }) => <div data-testid="tooltip">{children}</div>),
    CircleMarker: vi.fn(({ children }) => <div data-testid="rl-circle-marker">{children}</div>),
  };
});


describe('MiniMap Component', () => {
  beforeEach(() => {
    // Clear call history for map instance spies
    mockMapInstanceSpies.fitBounds.mockClear();
    mockMapInstanceSpies.setView.mockClear();
    mockMapInstanceSpies.addLayer.mockClear();

    // Reset/re-initialize spies on LMockForTests
    LMockForTests.latLng.mockImplementation((lat, lng) => ({ lat, lng }));
    LMockForTests.latLngBounds.mockImplementation(points => ({
      pad: vi.fn(() => ({_southWest: points?.[0], _northEast: points?.[points.length-1]}))
    }));
    LMockForTests.Icon.Default.mergeOptions.mockClear();
    LMockForTests.Icon.Default.prototype._getIconUrl = null;
    LMockForTests.DivIcon.mockClear();

    const mockLayerGroup = {
        addTo: vi.fn().mockReturnThis(),
        clearLayers: vi.fn(),
        addLayer: vi.fn(),
    };
    LMockForTests.featureGroup = vi.fn(() => mockLayerGroup);

    LMockForTests.circleMarker = vi.fn().mockImplementation(() => {
        const newMockMarkerInstance = {
            bindTooltip: vi.fn().mockReturnThis(),
            addTo: vi.fn().mockImplementation(function(group) {
                if (group && typeof group.addLayer === 'function') {
                    group.addLayer(this);
                }
                return this;
            }),
        };
        return newMockMarkerInstance;
    });
  });

  const sampleClusterQuakes = [
    {
      id: 'quake1',
      geometry: { coordinates: [-122.4194, 37.7749, 10] },
      properties: { mag: 5.0, place: 'San Francisco Bay Area' },
    },
    {
      id: 'quake2',
      geometry: { coordinates: [-122.6765, 45.5231, 15] },
      properties: { mag: 4.5, place: 'Portland, Oregon' },
    },
  ];

  it('renders correctly and displays cluster quakes when clusterQuakes prop is provided', async () => {
    render(<MiniMap clusterQuakes={sampleClusterQuakes} />);

    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockMapInstanceSpies.fitBounds).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(LMockForTests.circleMarker).toHaveBeenCalledTimes(sampleClusterQuakes.length);
    });

    await waitFor(() => {
      sampleClusterQuakes.forEach(quake => {
        const expectedTooltipContent = `M ${quake.properties.mag?.toFixed(1) || 'N/A'} - ${quake.properties.place || 'Unknown'}`;
        const allCircleMarkerMockResults = LMockForTests.circleMarker.mock.results;
        const foundInstanceWithTooltip = allCircleMarkerMockResults.some(result =>
          result.value.bindTooltip.mock.calls.some(callArgs => callArgs[0] === expectedTooltipContent)
        );
        expect(foundInstanceWithTooltip).toBe(true);
      });
    });

    expect(screen.queryByTestId('marker')).not.toBeInTheDocument();
  });

  it('renders single point markers when clusterQuakes is not provided', async () => {
    const mainQuakeCoords = { lat: 10, lng: 20 };
    const antipodalCoords = { lat: -10, lng: -160 };

    render(
      <MiniMap
        mainQuakeCoordinates={mainQuakeCoords}
        antipodalMarkerCoordinates={antipodalCoords}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
      expect(mockMapInstanceSpies.setView).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();

    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute('data-position', `${mainQuakeCoords.lat},${mainQuakeCoords.lng}`);
    expect(markers[1]).toHaveAttribute('data-position', `${antipodalCoords.lat},${antipodalCoords.lng}`);

    expect(LMockForTests.circleMarker).not.toHaveBeenCalled();
  });

  it('renders with default props when no specific coordinates or clusters are given', async () => {
    render(<MiniMap />);
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
      expect(mockMapInstanceSpies.setView).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('map-container')).toHaveAttribute('data-center', '0,0');
    expect(screen.getByTestId('map-container')).toHaveAttribute('data-zoom', '1');
    expect(screen.getByTestId('geojson-layer')).toBeInTheDocument();
    expect(screen.queryByTestId('marker')).not.toBeInTheDocument();
    expect(LMockForTests.circleMarker).not.toHaveBeenCalled();
  });
});
