import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InteractiveGlobeView from './InteractiveGlobeView'; // Assuming path is correct
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';

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
        <button onClick={() => props.onPointClick({ quakeData: { id: 'test-quake' } })}>
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

// Mock ResizeObserver
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Helper to create mock earthquake data
const createMockQuake = (id, mag, lat, lon, place = "Test Place", time = Date.now()) => ({
  id,
  properties: { mag, place, time, url: `http://example.com/${id}` },
  geometry: { type: "Point", coordinates: [lon, lat, 0] },
});

describe('InteractiveGlobeView', () => {
  let providerProps;
  let mockGetMagnitudeColorFunc;
  let mockOnQuakeClick;

  beforeEach(() => {
    vi.clearAllMocks(); // Clears all mocks including react-globe.gl and its ref actions

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

    // Mock window.load behavior - assume loaded for most tests unless specified
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
    global.window.dispatchEvent(new Event('load')); // Trigger load event
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore actual implementations
  });

  it('renders initializing message initially', () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'loading', // Simulate document not yet loaded
    });
    // Prevent Jest from considering the 'load' event as "fired" too early
    // We need a fresh window object for this test or to manage listeners carefully.
    // For simplicity, we assume the initial state will show "Initializing"
    // if dimensions are not set, which happens before 'load' or if ResizeObserver doesn't fire quickly.

    // To properly test this, we need to ensure dimensions are null.
    // The useEffect for resize fires based on initialLayoutComplete which depends on document.readyState or window load.
    // We can achieve this by not providing a container ref with dimensions.

    renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );
    expect(screen.getByText('Initializing Interactive Globe...')).toBeInTheDocument();
  });

  it('renders the Globe component after layout is complete', async () => {
    const { container } = renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );

    // Simulate container having dimensions
    // We need to use `act` because ResizeObserver callback and subsequent state updates will happen
    await act(async () => {
      const globeContainer = container.firstChild; // The div with ref="containerRef"
      Object.defineProperty(globeContainer, 'offsetWidth', { configurable: true, value: 500 });
      Object.defineProperty(globeContainer, 'offsetHeight', { configurable: true, value: 500 });
      // Manually trigger what ResizeObserver would do
      // This is tricky because ResizeObserver is mocked.
      // The internal `updateDimensions` is called, which sets `globeDimensions`.
      // Let's rely on the `useEffect` for `initialLayoutComplete` and `window.load`.
      // Since `document.readyState` is 'complete' by default in beforeEach,
      // `initialLayoutComplete` should become true, and dimensions should be set.
      // We might need a small timeout if there are async operations.
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow microtasks to flush
    });

    expect(screen.getByTestId('mock-globe')).toBeInTheDocument();
  });

  it('processes globeEarthquakes from context into pointsData for the Globe', async () => {
    providerProps.value.globeEarthquakes = [
      createMockQuake('q1', 5, 10, 20),
      createMockQuake('q2', 6, 30, 40),
    ];
    const { container } = renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );
    await act(async () => {
      const globeContainer = container.firstChild;
      Object.defineProperty(globeContainer, 'offsetWidth', { configurable: true, value: 500 });
      Object.defineProperty(globeContainer, 'offsetHeight', { configurable: true, value: 500 });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('globe-points-count').textContent).toBe('2');
    const GlobeComponent = vi.mocked(require('react-globe.gl').default);
    const globeProps = GlobeComponent.mock.calls[0][0];
    expect(globeProps.pointsData.length).toBe(2);
    expect(globeProps.pointsData[0].quakeData.id).toBe('q1');
    expect(globeProps.pointsData[1].quakeData.id).toBe('q2');
  });

  it('processes coastline and tectonic plates GeoJSON into pathsData', async () => {
    const coastlineData = { type: "GeometryCollection", geometries: [{ type: "LineString", coordinates: [[1,1],[2,2]] }] };
    const tectonicData = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[3,3],[4,4]] }, properties: { Boundary_Type: 'Convergent' } }] };

    const { container } = renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
        coastlineGeoJson={coastlineData}
        tectonicPlatesGeoJson={tectonicData}
      />, { providerProps }
    );
     await act(async () => {
      const globeContainer = container.firstChild;
      Object.defineProperty(globeContainer, 'offsetWidth', { configurable: true, value: 500 });
      Object.defineProperty(globeContainer, 'offsetHeight', { configurable: true, value: 500 });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('globe-paths-count').textContent).toBe('2');
    const GlobeComponent = vi.mocked(require('react-globe.gl').default);
    const globeProps = GlobeComponent.mock.calls[0][0];
    expect(globeProps.pathsData.length).toBe(2);
    expect(globeProps.pathsData[0].label).toBe('Coastline');
    expect(globeProps.pathsData[1].label).toContain('Convergent');
  });

  it('generates ringsData for lastMajorQuake and previousMajorQuake', async () => {
    providerProps.value.lastMajorQuake = createMockQuake('lmq1', 7, 50, 60);
    providerProps.value.previousMajorQuake = createMockQuake('pmq1', 6.5, 70, 80);

    const { container } = renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );
    await act(async () => {
      const globeContainer = container.firstChild;
      Object.defineProperty(globeContainer, 'offsetWidth', { configurable: true, value: 500 });
      Object.defineProperty(globeContainer, 'offsetHeight', { configurable: true, value: 500 });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('globe-rings-count').textContent).toBe('2');
    const GlobeComponent = vi.mocked(require('react-globe.gl').default);
    const globeProps = GlobeComponent.mock.calls[0][0];
    expect(globeProps.ringsData.length).toBe(2);
    expect(globeProps.ringsData.find(r => r.id.startsWith('major_quake_ring_latest_lmq1'))).toBeDefined();
    expect(globeProps.ringsData.find(r => r.id.startsWith('major_quake_ring_prev_pmq1'))).toBeDefined();
  });

  it('calls onQuakeClick when a point is clicked on the mock globe', async () => {
    providerProps.value.globeEarthquakes = [createMockQuake('q1', 5, 10, 20)];
    const { container } = renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
      />, { providerProps }
    );
    await act(async () => {
      const globeContainer = container.firstChild;
      Object.defineProperty(globeContainer, 'offsetWidth', { configurable: true, value: 500 });
      Object.defineProperty(globeContainer, 'offsetHeight', { configurable: true, value: 500 });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    fireEvent.click(screen.getByText('Simulate Quake Click'));
    expect(mockOnQuakeClick).toHaveBeenCalledWith({ id: 'test-quake' });
  });

  it('updates globe pointOfView when defaultFocus props change', async () => {
    const { rerender, container } = renderWithContext(
      <InteractiveGlobeView
        onQuakeClick={mockOnQuakeClick}
        getMagnitudeColorFunc={mockGetMagnitudeColorFunc}
        defaultFocusLat={10} defaultFocusLng={20} defaultFocusAltitude={2.0}
      />, { providerProps }
    );
    await act(async () => {
      const globeContainer = container.firstChild;
      Object.defineProperty(globeContainer, 'offsetWidth', { configurable: true, value: 500 });
      Object.defineProperty(globeContainer, 'offsetHeight', { configurable: true, value: 500 });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
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
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow effects to run
    });
    expect(mockGlobeRefActions.pointOfView).toHaveBeenCalledWith({ lat: 30, lng: 40, altitude: 1.5 }, 0);
  });
});
