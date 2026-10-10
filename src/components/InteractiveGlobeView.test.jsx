import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Globe from 'react-globe.gl';
import InteractiveGlobeView from './InteractiveGlobeView';
import { EarthquakeDataContext } from '../contexts/earthquakeDataContextUtils';

// Mock react-globe.gl
const mockGlobeRefActions = {
  pointOfView: vi.fn(),
  controls: vi.fn(() => ({
    autoRotate: true,
    autoRotateSpeed: 0.1,
    enableRotate: true,
    enablePan: true,
    enableZoom: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
  // eslint-disable-next-line no-unused-vars
  toGlobeCoords: vi.fn((_x,_y) => ({lat: 0, lng: 0})), // Simulate returning some coords, params unused
};
vi.mock('react-globe.gl', () => ({
  default: vi.fn((props) => {
    // Expose the ref actions through a mock implementation
    if (props.ref && typeof props.ref === 'function') {
      props.ref(mockGlobeRefActions);
    } else if (props.ref && typeof props.ref === 'object') {
      props.ref.current = mockGlobeRefActions;
    }
    return (
      <div data-testid="mock-globe">
        {/* Render some props to allow inspection if needed */}
        <div data-testid="globe-points-count">{props.pointsData?.length || 0}</div>
        <div data-testid="globe-paths-count">{props.pathsData?.length || 0}</div>
        <div data-testid="globe-rings-count">{props.ringsData?.length || 0}</div>
        <button onClick={() => props.onPointClick(props.pointsData[0])}>
          Simulate Quake Click
        </button>
      </div>
    );
  }),
}));

// Mock context
// const mockUseEarthquakeDataState = vi.fn(); // Unused variable removed

const renderWithContext = (ui, { providerProps, ...renderOptions }) => {
  return render(
    <EarthquakeDataContext.Provider value={providerProps.value}>
      {ui}
    </EarthquakeDataContext.Provider>,
    renderOptions
  );
};


// Helper to create mock earthquake data
const createMockQuake = (id, mag, lat, lon, place = "Test Place", time = Date.now()) => ({
  id,
  properties: { mag, place, time, url: `http://example.com/${id}` },
  geometry: { type: "Point", coordinates: [lon, lat, 0] },
});

describe('InteractiveGlobeView', () => {
  let resizeCallback;
  let providerProps;
  let mockGetMagnitudeColorFunc;
  let mockOnQuakeClick;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { resizeCallback = callback; } observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 500, height: 500, top: 0, left: 0, right: 500, bottom: 500 });
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });

    // Reset the controls mock for each test to ensure clean state for add/removeEventListener
     mockGlobeRefActions.controls = vi.fn(() => ({
      autoRotate: true,
      autoRotateSpeed: 0.1,
      enableRotate: true,
      enablePan: true,
      enableZoom: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));


    mockGetMagnitudeColorFunc = vi.fn(mag => `rgba(255,0,0,${mag / 10})`);
    mockOnQuakeClick = vi.fn();

    providerProps = {
      value: {
        globeEarthquakes: [],
        lastMajorQuake: null,
        previousMajorQuake: null,
      },
    };

  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders initializing message until the container has dimensions', () => {
    HTMLElement.prototype.getBoundingClientRect.mockReturnValue({ width: 0, height: 0 });
    renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );
    expect(screen.getByText('Initializing Interactive Globe...')).toBeInTheDocument();
  });

  it('renders the Globe with measured dimensions and updates them after an observed resize', async () => {
    vi.useFakeTimers();
    renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );

    expect(screen.getByTestId('mock-globe')).toBeInTheDocument();
    expect(Globe.mock.lastCall[0]).toMatchObject({ width: 500, height: 500 });
    HTMLElement.prototype.getBoundingClientRect.mockReturnValue({ width: 640, height: 360 });
    act(() => resizeCallback([]));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(Globe.mock.lastCall[0]).toMatchObject({ width: 640, height: 360 });
  });

  it('processes globeEarthquakes from context into pointsData for the Globe', () => {
    providerProps.value.globeEarthquakes = [
      createMockQuake('q1', 5, 10, 20),
      createMockQuake('q2', 6, 30, 40),
    ];
    renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );

    expect(screen.getByTestId('globe-points-count').textContent).toBe('2');
    const GlobeComponent = vi.mocked(Globe);
    const globeProps = GlobeComponent.mock.lastCall[0];
    expect(globeProps.pointsData.length).toBe(2);
    expect(globeProps.pointsData[0].quakeData.id).toBe('q1');
    expect(globeProps.pointsData[1].quakeData.id).toBe('q2');
  });

  it('processes coastline and tectonic plates GeoJSON into pathsData', () => {
    const coastlineData = { type: "GeometryCollection", geometries: [{ type: "LineString", coordinates: [[1,1],[2,2]] }] };
    const tectonicData = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[3,3],[4,4]] }, properties: { Boundary_Type: 'Convergent' } }] };

    renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
        coastlineGeoJson={coastlineData}
        tectonicPlatesGeoJson={tectonicData}
      />, { providerProps }
    );

    expect(screen.getByTestId('globe-paths-count').textContent).toBe('2');
    const GlobeComponent = vi.mocked(Globe);
    const globeProps = GlobeComponent.mock.lastCall[0];
    expect(globeProps.pathsData.length).toBe(2);
    expect(globeProps.pathsData[0].label).toBe('Coastline');
    expect(globeProps.pathsData[1].label).toContain('Convergent');
  });

  it('generates ringsData for lastMajorQuake and previousMajorQuake', () => {
    providerProps.value.lastMajorQuake = createMockQuake('lmq1', 7, 50, 60);
    providerProps.value.previousMajorQuake = createMockQuake('pmq1', 6.5, 70, 80);

    renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );

    expect(screen.getByTestId('globe-rings-count').textContent).toBe('2');
    const GlobeComponent = vi.mocked(Globe);
    const globeProps = GlobeComponent.mock.lastCall[0];
    expect(globeProps.ringsData.length).toBe(2);
    expect(globeProps.ringsData.find(r => r.id.startsWith('major_quake_ring_latest_lmq1'))).toBeDefined();
    expect(globeProps.ringsData.find(r => r.id.startsWith('major_quake_ring_prev_pmq1'))).toBeDefined();
  });

  it('calls onQuakeClick when a point is clicked on the mock globe', () => {
    providerProps.value.globeEarthquakes = [createMockQuake('q1', 5, 10, 20)];
    renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );

    fireEvent.click(screen.getByText('Simulate Quake Click'));
    expect(mockOnQuakeClick).toHaveBeenCalledWith(providerProps.value.globeEarthquakes[0]);
  });

  it('updates globe pointOfView when defaultFocus props change', () => {
    const { rerender } = renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
        defaultFocusLat={10} defaultFocusLng={20} defaultFocusAltitude={2.0}
      />, { providerProps }
    );
    expect(mockGlobeRefActions.pointOfView).toHaveBeenCalledWith({ lat: 10, lng: 20, altitude: 2.0 }, 0);

    rerender(
       <EarthquakeDataContext.Provider value={providerProps.value}>
          <InteractiveGlobeView
            onQuakeClick={mockOnQuakeClick}
            getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
            defaultFocusLat={30} defaultFocusLng={40} defaultFocusAltitude={1.5}
          />
       </EarthquakeDataContext.Provider>
    );
    expect(mockGlobeRefActions.pointOfView).toHaveBeenCalledWith({ lat: 30, lng: 40, altitude: 1.5 }, 0);
  });
});
