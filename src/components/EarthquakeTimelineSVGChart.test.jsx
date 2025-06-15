import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EarthquakeTimelineSVGChart from './EarthquakeTimelineSVGChart';
import { EarthquakeDataContext } from '../contexts/earthquakeDataContextUtils';

// Mock the EarthquakeDataContext
const mockUseEarthquakeDataState = vi.fn();

// Mock the skeleton component
vi.mock('./skeletons/EarthquakeTimelineSVGChartSkeleton', () => ({
  default: ({ days, titleSuffix }) => (
    <div data-testid="skeleton-chart">
      Skeleton for {days} days {titleSuffix}
    </div>
  ),
}));

// Helper to provide context
const renderWithContext = (ui, { providerProps, ...renderOptions }) => {
  return render(
    <EarthquakeDataContext.Provider value={providerProps.value}>
      {ui}
    </EarthquakeDataContext.Provider>,
    renderOptions
  );
};

describe('EarthquakeTimelineSVGChart', () => {
  let providerProps;

  beforeEach(() => {
    // Reset mocks and default provider props for each test
    mockUseEarthquakeDataState.mockReset();
    providerProps = {
      value: {
        dailyCounts7Days: [],
        dailyCounts14Days: [],
        dailyCounts30Days: [],
        earthquakesLast7Days: [],
        // Mock any other values returned by useEarthquakeDataState if needed by the component
      },
    };
    // Ensure the mock implementation of useEarthquakeDataState returns the providerProps value
    // This is important if the component *directly* calls useEarthquakeDataState
    // For this setup, we are wrapping with the Provider, so direct mocking of the hook
    // might not be strictly necessary if the component consumes context via <Context.Consumer> or useContext(Context).
    // However, it's good practice if the component *could* use the hook directly.
    vi.spyOn(React, 'useContext').mockImplementation(context => {
      if (context === EarthquakeDataContext) {
        return providerProps.value;
      }
      return React.useContext(context); // Default to original useContext for other contexts
    });
  });

  it('should render skeleton when isLoading is true', () => {
    renderWithContext(<EarthquakeTimelineSVGChart isLoading={true} days={7} titleSuffix="(Test Suffix)" />, { providerProps });
    expect(screen.getByTestId('skeleton-chart')).toBeInTheDocument();
    expect(screen.getByText('Skeleton for 7 days (Test Suffix)')).toBeInTheDocument();
  });

  it('should display "No data for chart." when no data is available (using context)', () => {
    providerProps.value.dailyCounts7Days = []; // Ensure it's empty
    renderWithContext(<EarthquakeTimelineSVGChart earthquakes={[]} days={7} isLoading={false} />, { providerProps });
    expect(screen.getByText('No data for chart.')).toBeInTheDocument();
    expect(screen.getByText('Earthquake Frequency (Last 7 Days)')).toBeInTheDocument(); // Title should still render
  });

  it('should display "No data for chart." when earthquake prop is null and context is empty', () => {
    renderWithContext(<EarthquakeTimelineSVGChart earthquakes={null} days={7} isLoading={false} />, { providerProps });
    expect(screen.getByText('No data for chart.')).toBeInTheDocument();
  });

  it('should display "No data for chart." when earthquake prop is empty and context is empty', () => {
    renderWithContext(<EarthquakeTimelineSVGChart earthquakes={[]} days={7} isLoading={false} />, { providerProps });
    expect(screen.getByText('No data for chart.')).toBeInTheDocument();
  });

  it('should render chart with data from dailyCounts7Days (context)', () => {
    providerProps.value.dailyCounts7Days = [
      { dateString: 'Jan 1', count: 5 },
      { dateString: 'Jan 2', count: 10 },
    ];
    renderWithContext(<EarthquakeTimelineSVGChart earthquakes={null} days={7} isLoading={false} />, { providerProps });

    expect(screen.getByText('Earthquake Frequency (Last 7 Days)')).toBeInTheDocument();
    // Check for axis labels
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();

    // Check for bars (rect elements)
    const svgElement = screen.getByTestId('timeline-svg-chart');
    const barRects = svgElement.querySelectorAll('g > rect'); // Selects rects that are children of g (groups for each bar)
    expect(barRects.length).toBe(providerProps.value.dailyCounts7Days.length); // Should be 2 bars

    // Check for date labels (x-axis ticks)
    expect(within(svgElement).getByText('Jan 1')).toBeInTheDocument();
    expect(within(svgElement).getByText('Jan 2')).toBeInTheDocument();

    // Check for count labels on bars
    // For "5"
    expect(within(svgElement).getByText((content, element) => {
      return content === '5' && element.getAttribute('text-anchor') === 'middle' && element.classList.contains('text-slate-300');
    })).toBeInTheDocument();
    // For "10" (bar count)
    expect(within(svgElement).getByText((content, element) => {
      return content === '10' && element.getAttribute('text-anchor') === 'middle' && element.classList.contains('text-slate-300');
    })).toBeInTheDocument();

    // Check for y-axis tick labels
    // For "0"
    expect(within(svgElement).getByText((content, element) => {
      return content === '0' && element.getAttribute('text-anchor') === 'end' && element.classList.contains('text-slate-500');
    })).toBeInTheDocument();
    // For "10" (y-axis tick)
    // Max count is 10, so 10 should be a label.
    // Steps are Math.ceil(maxC / numL), numL=5. ceil(10/5)=2. Labels: 0, 2, 4, 6, 8, 10
     expect(within(svgElement).getByText((content, element) => {
      return content === '10' && element.getAttribute('text-anchor') === 'end' && element.classList.contains('text-slate-500');
    })).toBeInTheDocument();
  });

  it('should render chart using earthquakes prop if context data for specific days is not available', () => {
    const mockEarthquakes = [
      { properties: { time: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString() }, /* ... other properties */ },
      { properties: { time: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString() }, /* ... other properties */ },
      { properties: { time: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString() }, /* ... other properties */ },
    ];
    // Simulate context having no data for 'days=3'
    providerProps.value.dailyCounts7Days = null; // or undefined
    renderWithContext(<EarthquakeTimelineSVGChart earthquakes={mockEarthquakes} days={3} isLoading={false} titleSuffix="(Last 3 Days)" />, { providerProps });

    expect(screen.getByText('Earthquake Frequency (Last 3 Days)')).toBeInTheDocument();
    const svgElement = screen.getByTestId('timeline-svg-chart');

    // Expect 3 bars based on the logic (1 for today, 1 for yesterday, 1 for two days ago)
    // The component generates date strings like "Jan 1"
    // We need to know what dates these will be.
    const today = new Date();
    const d1 = new Date(today); d1.setDate(today.getDate() - 0);
    const d2 = new Date(today); d2.setDate(today.getDate() - 1);
    const d3 = new Date(today); d3.setDate(today.getDate() - 2);

    const format = (date) => date.toLocaleDateString([], {month: 'short', day: 'numeric'});

    expect(within(svgElement).getByText(format(d1))).toBeInTheDocument();
    expect(within(svgElement).getByText(format(d2))).toBeInTheDocument();
    expect(within(svgElement).getByText(format(d3))).toBeInTheDocument();

    // Check counts: 2 for yesterday, 1 for two days ago, 0 for today (in this test data)
    // The order of text matters for getByText if counts are same.
    // This test is a bit fragile if date strings or counts are not exact.
    // A more robust way would be to check the bar heights or associated <title> elements.
    const barTexts = within(svgElement).getAllByText((content, element) => {
        return element.tagName.toLowerCase() === 'text' && (content === '1' || content === '2' || content === '');
    }).map(el => el.textContent);

    // We expect counts '2' (for yesterday) and '1' (for two days ago). Today has 0, so its label is ''.
    expect(barTexts).toContain('2');
    expect(barTexts).toContain('1');
    // There should be a text element for the count on each bar.
    // For count 0, it renders an empty string.
    // So, 3 bars -> 3 count texts.
    const countElements = within(svgElement).getAllByText((content, element) => {
        const parentNode = element.parentNode;
        // Check if it's a text element for bar count (y - 5 or 10, specific class)
        if (element.tagName.toLowerCase() === 'text' && parentNode.tagName.toLowerCase() === 'g') {
            const yPos = parseFloat(element.getAttribute('y'));
            // const xPos = parseFloat(element.getAttribute('x')); // Unused variable removed
            // Heuristic: bar count labels are above the bar or at y=10.
            // Date labels are at chartHeight + 15.
            // Y-axis labels are at x=yOffset-5.
            // This is still a bit fragile.
            return yPos < 280; // chartHeight is 280
        }
        return false;
    }).filter(el => el.getAttribute('text-anchor') === 'middle' && !isNaN(parseFloat(el.textContent)) || el.textContent === '');
    expect(countElements.length).toBe(3); // One count label per bar
  });

  it('should handle titleSuffix correctly', () => {
    providerProps.value.dailyCounts7Days = [{ dateString: 'Jan 1', count: 1 }];
    renderWithContext(<EarthquakeTimelineSVGChart earthquakes={null} days={7} isLoading={false} titleSuffix="(Custom Suffix)" />, { providerProps });
    expect(screen.getByText('Earthquake Frequency (Custom Suffix)')).toBeInTheDocument();
  });
});
