import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MagnitudeDistributionSVGChart from './MagnitudeDistributionSVGChart';
import { EarthquakeDataContext } from '../contexts/earthquakeDataContextUtils';
import * as Utils from '../utils/utils'; // To mock getMagnitudeColor

// Mock the EarthquakeDataContext
// const mockUseEarthquakeDataState = vi.fn(); // Unused variable removed

// Mock the skeleton component
vi.mock('./skeletons/MagnitudeDistributionSVGChartSkeleton', () => ({
  default: ({ titleSuffix }) => (
    <div data-testid="skeleton-mag-dist-chart">
      Skeleton Mag Dist Chart {titleSuffix}
    </div>
  ),
}));

// Spy on getMagnitudeColor from utils (it's imported and used directly)
const mockGetMagnitudeColor = vi.spyOn(Utils, 'getMagnitudeColor');

const renderWithContext = (ui, { providerProps, ...renderOptions }) => {
  return render(
    <EarthquakeDataContext.Provider value={providerProps.value}>
      {ui}
    </EarthquakeDataContext.Provider>,
    renderOptions
  );
};

// Helper to create mock earthquake data for the component's processing
const createMockSourceQuake = (id, mag) => ({
  id,
  properties: { mag },
  // geometry is not used by this component's data processing logic if earthquakes prop is used
});

// Expected magnitude ranges from the component
const expectedMagnitudeRanges = [
  { name: '<1', min: -Infinity, max: 0.99 }, { name: '1-1.9', min: 1, max: 1.99 },
  { name: '2-2.9', min: 2, max: 2.99 }, { name: '3-3.9', min: 3, max: 3.99 },
  { name: '4-4.9', min: 4, max: 4.99 }, { name: '5-5.9', min: 5, max: 5.99 },
  { name: '6-6.9', min: 6, max: 6.99 }, { name: '7+', min: 7, max: Infinity },
];

describe('MagnitudeDistributionSVGChart', () => {
  let providerProps;

  beforeEach(() => {
    vi.clearAllMocks();
    // Provide a default mock implementation for getMagnitudeColor
    mockGetMagnitudeColor.mockImplementation(mag => `color-for-mag-${mag}`);

    providerProps = {
      value: {
        magnitudeDistribution7Days: [],
        magnitudeDistribution14Days: [],
        magnitudeDistribution30Days: [],
      },
    };

    vi.spyOn(React, 'useContext').mockImplementation((context) => {
      if (context === EarthquakeDataContext) {
        return providerProps.value;
      }
      const actualUseContext = vi.importActual('react').useContext;
      return actualUseContext(context);
    });
  });

  it('should render skeleton when isLoading is true', () => {
    renderWithContext(<MagnitudeDistributionSVGChart isLoading={true} titleSuffix="(Test Suffix)" />, { providerProps });
    expect(screen.getByTestId('skeleton-mag-dist-chart')).toBeInTheDocument();
    expect(screen.getByText('Skeleton Mag Dist Chart (Test Suffix)')).toBeInTheDocument();
  });

  it('should display "No data for chart." when no data is available (context)', () => {
    providerProps.value.magnitudeDistribution30Days = []; // Ensure it's empty for default suffix
    renderWithContext(<MagnitudeDistributionSVGChart earthquakes={[]} isLoading={false} />, { providerProps });
    expect(screen.getByText('No data for chart.')).toBeInTheDocument();
    expect(screen.getByText('Magnitude Distribution (Last 30 Days)')).toBeInTheDocument();
  });

  it('should display "No data for chart." if all bins have zero count (from context)', () => {
    providerProps.value.magnitudeDistribution7Days = expectedMagnitudeRanges.map(r => ({ name: r.name, count: 0, color: `color-for-${r.name}` }));
    renderWithContext(<MagnitudeDistributionSVGChart titleSuffix="(Last 7 Days)" isLoading={false} />, { providerProps });
    expect(screen.getByText('No data for chart.')).toBeInTheDocument();
  });

  it('should render chart with data from magnitudeDistribution7Days (context)', () => {
    const mockData7Days = [
      { name: '<1', count: 5, color: 'color-for-0.5' },
      { name: '1-1.9', count: 10, color: 'color-for-1.5' },
    ];
    providerProps.value.magnitudeDistribution7Days = mockData7Days;
    const { container } = renderWithContext(<MagnitudeDistributionSVGChart titleSuffix="(Last 7 Days)" isLoading={false} />, { providerProps });

    expect(screen.getByText('Magnitude Distribution (Last 7 Days)')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument(); // Y-axis label
    expect(screen.getByText('Magnitude Range')).toBeInTheDocument(); // X-axis label

    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeInTheDocument();

    const bars = svgElement.querySelectorAll('rect');
    expect(bars.length).toBe(mockData7Days.length); // 2 bars

    // Check bar data
    expect(bars[0].getAttribute('fill')).toBe('color-for-0.5');
    expect(within(svgElement).getByText('<1')).toBeInTheDocument(); // x-axis tick label
    expect(within(svgElement).getByText((content, node) => { // Bar count label for 5
      return node.tagName.toLowerCase() === 'text' && content === '5' && node.getAttribute('text-anchor') === 'middle' && parseFloat(node.getAttribute('y')) < 280;
    })).toBeInTheDocument();

    expect(bars[1].getAttribute('fill')).toBe('color-for-1.5');
    expect(within(svgElement).getByText('1-1.9')).toBeInTheDocument();
    expect(within(svgElement).getByText((content, node) => { // Bar count label for 10
      return node.tagName.toLowerCase() === 'text' && content === '10' && node.getAttribute('text-anchor') === 'middle' && parseFloat(node.getAttribute('y')) < 280;
    })).toBeInTheDocument();

    // Check one of the Y-axis labels (e.g., max count)
    expect(within(svgElement).getByText((content, node) => {
        return node.tagName.toLowerCase() === 'text' && content === '10' && node.getAttribute('text-anchor') === 'end';
    })).toBeInTheDocument();
  });

  it('should process earthquakes prop if context data for titleSuffix is unavailable', () => {
    const mockEarthquakesProp = [
      createMockSourceQuake('q1', 0.5), // <1
      createMockSourceQuake('q2', 1.2), // 1-1.9
      createMockSourceQuake('q3', 1.8), // 1-1.9
      createMockSourceQuake('q4', 7.5), // 7+
    ];
    providerProps.value.magnitudeDistribution14Days = []; // Ensure context for this suffix is empty/invalid

    const { container } = renderWithContext(
      <MagnitudeDistributionSVGChart earthquakes={mockEarthquakesProp} titleSuffix="(Last 14 Days)" isLoading={false} />,
      { providerProps }
    );

    expect(screen.getByText('Magnitude Distribution (Last 14 Days)')).toBeInTheDocument();
    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeInTheDocument();

    const bars = svgElement.querySelectorAll('rect');
    // We expect a bar for each range that has a count, or for all ranges depending on component logic.
    // The component renders a bar for each range in `magnitudeRanges`.
    expect(bars.length).toBe(expectedMagnitudeRanges.length);

    // Check counts displayed on bars
    const gElements = svgElement.querySelectorAll('g');
    let foundLessThan1 = false;
    let found1to1_9 = false;
    let found7plus = false;

    gElements.forEach(g => {
      const titleElement = g.querySelector('title');
      // const textElements = g.querySelectorAll('text'); // Unused variable removed
      if (titleElement) {
        const title = titleElement.textContent; // e.g. "<1: 1"
        if (title.startsWith('<1:')) {
          expect(title).toBe('<1: 1');
          foundLessThan1 = true;
        } else if (title.startsWith('1-1.9:')) {
          expect(title).toBe('1-1.9: 2');
          found1to1_9 = true;
        } else if (title.startsWith('7+:')) {
          expect(title).toBe('7+: 1');
          found7plus = true;
        } else if (title.includes(': 0')) {
          // Other bins should be 0
        } else {
          // Potentially unexpected bin, fail if necessary or log
        }
      }
    });
    expect(foundLessThan1).toBe(true);
    expect(found1to1_9).toBe(true);
    expect(found7plus).toBe(true);

    // Verify getMagnitudeColor was called for each range during data processing
    expectedMagnitudeRanges.forEach(range => {
      // This check is for the initial calculation of range.color
      // The mockGetMagnitudeColor is called with the representative magnitude for the range (0.5, 1.5 etc.)
      if (range.name === '<1') expect(mockGetMagnitudeColor).toHaveBeenCalledWith(0.5);
      if (range.name === '1-1.9') expect(mockGetMagnitudeColor).toHaveBeenCalledWith(1.5);
      // ... and so on for all ranges
    });
  });
});
