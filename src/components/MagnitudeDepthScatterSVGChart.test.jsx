import React from 'react';
import { render, screen, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MagnitudeDepthScatterSVGChart from './MagnitudeDepthScatterSVGChart';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext';
import * as Utils from '../utils/utils'; // To mock getMagnitudeColor

// Mock the EarthquakeDataContext
// const mockUseEarthquakeDataState = vi.fn(); // Unused

// Mock the skeleton component
vi.mock('./skeletons/MagnitudeDepthScatterSVGChartSkeleton', () => ({
  default: ({ titleSuffix }) => (
    <div data-testid="skeleton-scatter-chart">
      Skeleton Scatter Chart {titleSuffix}
    </div>
  ),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock getMagnitudeColor from utils
const mockGetMagnitudeColor = vi.spyOn(Utils, 'getMagnitudeColor');

const renderWithContext = (ui, { providerProps, ...renderOptions }) => {
  return render(
    <EarthquakeDataContext.Provider value={providerProps.value}>
      {ui}
    </EarthquakeDataContext.Provider>,
    renderOptions
  );
};

// Helper to create mock earthquake data for scatter plot
const createMockScatterQuake = (id, mag, depth, place = "Test Place") => ({
  id,
  properties: { mag, place },
  geometry: { type: "Point", coordinates: [0, 0, depth] }, // lon, lat, depth
});


describe('MagnitudeDepthScatterSVGChart', () => {
  let providerProps;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMagnitudeColor.mockImplementation(mag => `rgba(255,0,0,${mag / 10})`); // Default mock impl

    providerProps = {
      value: {
        sampledEarthquakesLast7Days: [],
        sampledEarthquakesLast14Days: [],
        sampledEarthquakesLast30Days: [],
        // any other context values if needed by the component directly
      },
    };

    // Ensure the component receives the mocked context value
    vi.spyOn(React, 'useContext').mockImplementation((context) => {
      if (context === EarthquakeDataContext) {
        return providerProps.value;
      }
      const actualUseContext = vi.importActual('react').useContext;
      return actualUseContext(context);
    });
  });

  it('should render skeleton when isLoading is true', () => {
    renderWithContext(<MagnitudeDepthScatterSVGChart isLoading={true} titleSuffix="(Test Suffix)" />, { providerProps });
    expect(screen.getByTestId('skeleton-scatter-chart')).toBeInTheDocument();
    expect(screen.getByText('Skeleton Scatter Chart (Test Suffix)')).toBeInTheDocument();
  });

  it('should display "No sufficient data for chart." when no data is available (context)', () => {
    providerProps.value.sampledEarthquakesLast30Days = []; // Ensure it's empty for default suffix
    renderWithContext(<MagnitudeDepthScatterSVGChart earthquakes={[]} isLoading={false} />, { providerProps });
    expect(screen.getByText('No sufficient data for chart.')).toBeInTheDocument();
    expect(screen.getByText('Magnitude vs. Depth (Last 30 Days)')).toBeInTheDocument(); // Title
  });

  it('should display "No sufficient data for chart." when earthquakes prop is null and context is empty', () => {
    renderWithContext(<MagnitudeDepthScatterSVGChart earthquakes={null} isLoading={false} />, { providerProps });
    expect(screen.getByText('No sufficient data for chart.')).toBeInTheDocument();
  });

  it('should render chart with data from sampledEarthquakesLast30Days (context by default)', async () => {
    providerProps.value.sampledEarthquakesLast30Days = [
      createMockScatterQuake('q1', 3.5, 10),
      createMockScatterQuake('q2', 4.0, 25),
    ];
    const { container } = renderWithContext(<MagnitudeDepthScatterSVGChart isLoading={false} />, { providerProps });

    // Simulate container having dimensions for ResizeObserver effect
    await act(async () => {
      const chartContainer = container.querySelector('div'); // First div is the chart container
      if (chartContainer) {
        Object.defineProperty(chartContainer, 'clientWidth', { configurable: true, value: 500 });
        // Trigger ResizeObserver logic manually if needed, or rely on useEffect's initial run
        // For this test, the default dimensions might be enough if clientWidth is picked up.
      }
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow effects to run
    });

    expect(screen.getByText('Magnitude vs. Depth (Last 30 Days)')).toBeInTheDocument();
    // Check for axis labels
    expect(screen.getByText('Magnitude')).toBeInTheDocument();
    expect(screen.getByText('Depth (km)')).toBeInTheDocument();

    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeInTheDocument();

    // Check for data points (circles)
    const circles = svgElement.querySelectorAll('circle');
    expect(circles.length).toBe(2);
    expect(mockGetMagnitudeColor).toHaveBeenCalledWith(3.5);
    expect(mockGetMagnitudeColor).toHaveBeenCalledWith(4.0);
    expect(circles[0].getAttribute('fill')).toBe('rgba(255,0,0,0.35)');
    expect(circles[1].getAttribute('fill')).toBe('rgba(255,0,0,0.4)');

    // Check for some tick labels (exact values depend on scaling logic)
    // For X ticks (Magnitude: 3.5, 4.0)
    expect(within(svgElement).getByText('3.5')).toBeInTheDocument();
    expect(within(svgElement).getByText(/^4$/)).toBeInTheDocument(); // Match "4" not "4.0" due to rendering
    // For Y ticks (Depth: 10, 25)
    expect(within(svgElement).getByText('10')).toBeInTheDocument();
    expect(within(svgElement).getByText('25')).toBeInTheDocument();
  });

  it('should use earthquakes prop if corresponding context data is unavailable', async () => {
    const mockEarthquakes = [
      createMockScatterQuake('qProp1', 2.0, 5),
      createMockScatterQuake('qProp2', 2.5, 15),
    ];
    providerProps.value.sampledEarthquakesLast7Days = null; // Ensure context is empty for this suffix
    const { container } = renderWithContext(
      <MagnitudeDepthScatterSVGChart earthquakes={mockEarthquakes} titleSuffix="(Last 7 Days)" isLoading={false} />,
      { providerProps }
    );
    await act(async () => {
      const chartContainer = container.querySelector('div');
       if (chartContainer) {
        Object.defineProperty(chartContainer, 'clientWidth', { configurable: true, value: 500 });
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.getByText('Magnitude vs. Depth (Last 7 Days)')).toBeInTheDocument();
    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeInTheDocument();
    const circles = svgElement.querySelectorAll('circle');
    expect(circles.length).toBe(2);
    expect(mockGetMagnitudeColor).toHaveBeenCalledWith(2.0);
    expect(mockGetMagnitudeColor).toHaveBeenCalledWith(2.5);
  });

  it('filters out earthquakes with null magnitude or depth', async () => {
    providerProps.value.sampledEarthquakesLast30Days = [
      createMockScatterQuake('q1', 3.5, 10),
      createMockScatterQuake('q2', null, 25), // Invalid mag
      createMockScatterQuake('q3', 4.0, null), // Invalid depth
      createMockScatterQuake('q4', undefined, 25), // Invalid mag
      createMockScatterQuake('q5', 4.0, undefined), // Invalid depth
      createMockScatterQuake('q6', 2.0, 5),
    ];
    const { container } = renderWithContext(<MagnitudeDepthScatterSVGChart isLoading={false} />, { providerProps });
    await act(async () => {
      const chartContainer = container.querySelector('div');
      if (chartContainer) {
        Object.defineProperty(chartContainer, 'clientWidth', { configurable: true, value: 500 });
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const svgElement = container.querySelector('svg');
    const circles = svgElement.querySelectorAll('circle');
    expect(circles.length).toBe(2); // Only q1 and q6 are valid
  });
});
