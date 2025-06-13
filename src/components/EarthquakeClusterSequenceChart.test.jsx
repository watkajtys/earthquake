import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import EarthquakeClusterSequenceChart from './EarthquakeClusterSequenceChart.jsx'; // Corrected import path and name

// No longer need to mock react-loader-spinner

const mockData = [
  {
    id: 'evt1',
    properties: { time: '2023-01-01T10:00:00Z', mag: 3.5, place: 'Location A', status: 'reviewed' },
    geometry: { coordinates: [0, 0, 10] }
  },
  {
    id: 'evt2',
    properties: { time: '2023-01-01T12:00:00Z', mag: 5.0, place: 'Location B', status: 'reviewed' }, // Mainshock
    geometry: { coordinates: [0, 0, 12] }
  },
  {
    id: 'evt3',
    properties: { time: '2023-01-01T14:00:00Z', mag: 4.0, place: 'Location C', status: 'reviewed' },
    geometry: { coordinates: [0, 0, 8] }
  },
  {
    id: 'evt4',
    properties: { time: '2023-01-02T08:00:00Z', mag: 3.0, place: 'Location D', status: 'reviewed' },
    geometry: { coordinates: [0, 0, 15] }
  },
];

const mockMainshock = mockData[1]; // id: 'evt2', properties.mag: 5.0

const mockDataSingle = [
  {
    id: 'evt1',
    properties: { time: '2023-01-01T12:00:00Z', mag: 4.5, place: 'Location A', status: 'reviewed' }, // Mainshock
    geometry: { coordinates: [0, 0, 10] }
  },
];

// Mock offsetWidth for consistent chart rendering
const mockOffsetWidth = (width = 800) => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    value: width,
  });
};

describe('EarthquakeClusterSequenceChart', () => {
  beforeEach(() => {
    mockOffsetWidth(); // Set a default offsetWidth before each test
  });

  test('renders no data message when data is null', () => {
    render(<EarthquakeClusterSequenceChart data={null} />);
    expect(screen.getByText('No earthquake data available for this sequence.')).toBeInTheDocument();
  });

  test('renders no data message when data is empty', () => {
    render(<EarthquakeClusterSequenceChart data={[]} />);
    expect(screen.getByText('No earthquake data available for this sequence.')).toBeInTheDocument();
  });

  test('renders chart subtitle correctly when mainshock time is invalid', () => {
    const dataWithInvalidMainshockTime = [
      {
        id: 'evt1',
        properties: { time: '2023-01-01T10:00:00Z', mag: 3.5, place: 'Location A', status: 'reviewed' },
        geometry: { coordinates: [0, 0, 10] }
      },
      {
        id: 'evt2_no_time',
        properties: { time: null, mag: 5.0, place: 'Location B (No Time)', status: 'reviewed' },
        geometry: { coordinates: [0, 0, 12] }
      }
    ];
    render(<EarthquakeClusterSequenceChart data={dataWithInvalidMainshockTime} />);
    // The title text element contains EITHER "Sequence started: ..." OR "Earthquake Sequence"
    const titleTextElement = screen.getByTestId('earthquake-sequence-chart-svg').querySelector('text.text-lg.font-bold.text-gray-800');
    expect(titleTextElement).toBeInTheDocument();
    expect(titleTextElement.textContent).toBe('Earthquake Sequence');
    // Ensure the "Sequence started:" part is not present by querying the whole document
    expect(screen.queryByText(/Sequence started:/i)).not.toBeInTheDocument();
  });

  describe('With Data Rendered', () => {
    let view;
    beforeEach(() => {
      view = render(<EarthquakeClusterSequenceChart data={mockData} />);
    });

    test('renders chart title', () => {
      expect(screen.getByText('Earthquake Sequence: Time vs. Magnitude')).toBeInTheDocument();
    });

    test('renders sequence start date in title', () => {
        const mainshockTime = new Date(mockMainshock.properties.time);
        // Format date as MM/DD/YYYY (toLocaleDateString might vary by environment, adjust if needed)
        const expectedDateString = mainshockTime.toLocaleDateString();
        expect(screen.getByText(`Sequence started: ${expectedDateString}`)).toBeInTheDocument();
    });

    test('renders X-axis label "Days from Mainshock"', () => {
      expect(screen.getByText('Days from Mainshock')).toBeInTheDocument();
    });

    test('renders Y-axis label "Magnitude"', () => {
      expect(screen.getByText('Magnitude')).toBeInTheDocument();
    });

    test('renders correct number of event circles', () => {
      const svg = screen.getByTestId('earthquake-sequence-chart-svg');
      const circles = svg.querySelectorAll('circle'); // Query for circle elements directly
      expect(circles.length).toBe(mockData.length);
    });

    test('identifies and distinctly renders the mainshock', () => {
      const svg = screen.getByTestId('earthquake-sequence-chart-svg');
      const circles = svg.querySelectorAll('circle'); // Query for circle elements

      let mainshockCircle = null;
      circles.forEach(circle => {
        const titleElement = circle.querySelector('title'); // Get title content
        if (titleElement && titleElement.textContent.includes('(Mainshock)')) {
          mainshockCircle = circle;
        }
      });

      expect(mainshockCircle).not.toBeNull();
      expect(mainshockCircle.getAttribute('fill')).toBe('rgba(255, 0, 0, 0.7)');
      expect(mainshockCircle.getAttribute('stroke')).toBe('rgba(200, 0, 0, 1)');

      // Check for mainshock label within SVG, distinct from legend
      const svgMainshockLabel = within(svg).getByText((content, element) =>
        element.tagName.toLowerCase() === 'text' &&
        element.classList.contains('text-red-600') &&
        content === 'Mainshock'
      );
      expect(svgMainshockLabel).toBeInTheDocument();
    });

    test('renders aftershocks/foreshocks correctly', () => {
      const svg = screen.getByTestId('earthquake-sequence-chart-svg');
      const circles = svg.querySelectorAll('circle'); // Query for circle elements

      const aftershocks = Array.from(circles).filter(circle => {
        const titleElement = circle.querySelector('title'); // Get title content
        return titleElement && !titleElement.textContent.includes('(Mainshock)');
      });

      expect(aftershocks.length).toBe(mockData.length - 1);
      aftershocks.forEach(shock => {
        expect(shock.getAttribute('fill')).toBe('rgba(0, 100, 255, 0.5)');
        expect(shock.getAttribute('stroke')).toBe('rgba(0, 80, 200, 0.8)');
      });
    });

    test('renders Y-axis ticks (checks for some expected values)', () => {
      const svg = screen.getByTestId('earthquake-sequence-chart-svg');
      const yAxisTickTexts = Array.from(svg.querySelectorAll("g.text-gray-600 text[text-anchor='end']"))
        .map(el => el.textContent);
      // yScale domain is [0, 5] for mockData.
      expect(yAxisTickTexts).toEqual(expect.arrayContaining(["0", "1", "2", "3", "4", "5"]));
    });

    test('renders X-axis ticks (checks for some expected values)', () => {
        const svg = screen.getByTestId('earthquake-sequence-chart-svg');
        const xAxisTickTexts = Array.from(svg.querySelectorAll("g.text-gray-600 text[text-anchor='middle']"))
          .map(el => el.textContent)
          .filter(text => !["Days from Mainshock", "Magnitude"].includes(text) && !text.startsWith("Sequence started:")); // Filter out axis/chart titles

        // For mockData, domain is [-1, 1]. D3 generates ticks like -1, -0.8, ..., 0, ..., 0.8, 1.
        expect(xAxisTickTexts).toContain("0");
        expect(xAxisTickTexts).toContain("0.2"); // Adjusted from 0.5 based on actual output
        expect(xAxisTickTexts).toContain("-0.2"); // Check for a negative fractional tick
    });

    test('renders legend correctly', () => {
        // Check for legend items specifically (not the SVG label for mainshock here)
        // The component uses divs for legend items, not LIs.
        const mainshockLegend = screen.getByText((content, element) => {
            return element.tagName.toLowerCase() === 'span' && content === 'Mainshock' && element.previousElementSibling?.classList.contains('bg-red-500');
        });
        const aftershockLegend = screen.getByText((content, element) => {
            return element.tagName.toLowerCase() === 'span' && content === 'Aftershock/Foreshock' && element.previousElementSibling?.classList.contains('bg-blue-500');
        });
        expect(mainshockLegend).toBeInTheDocument();
        expect(aftershockLegend).toBeInTheDocument();
    });

    test('renders tooltip content on circle hover (conceptual)', () => {
        // @testing-library/react doesn't directly support hover simulation to show native <title> tooltips.
        // However, we can verify the <title> element and its content is correctly associated with each circle.
        const svg = screen.getByTestId('earthquake-sequence-chart-svg');
        const circles = svg.querySelectorAll('circle');
        const firstCircle = circles[0];
        const titleElement = firstCircle.querySelector('title'); // Get title content

        expect(titleElement).not.toBeNull();
        const eventData = mockData[0]; // eventData here refers to the item from the *original* flat mockData structure for comparison
        expect(titleElement.textContent).toContain(`Time: ${new Date(eventData.properties.time).toLocaleString()}`);
        expect(titleElement.textContent).toContain(`Magnitude: ${eventData.properties.mag}`);
        expect(titleElement.textContent).toContain(`Depth: ${eventData.geometry.coordinates[2]} km`);
        expect(titleElement.textContent).toContain(`Place: ${eventData.properties.place}`);
        expect(titleElement.textContent).toContain(`Status: ${eventData.properties.status}`);
    });
  });

  describe('With Single Data Point (Mainshock only)', () => {
    beforeEach(() => {
        render(<EarthquakeClusterSequenceChart data={mockDataSingle} />);
    });

    test('renders chart title and axis labels', () => {
        expect(screen.getByText('Earthquake Sequence: Time vs. Magnitude')).toBeInTheDocument();
        const mainshockTime = new Date(mockDataSingle[0].properties.time);
        const expectedDateString = mainshockTime.toLocaleDateString();
        expect(screen.getByText(`Sequence started: ${expectedDateString}`)).toBeInTheDocument();
        expect(screen.getByText('Days from Mainshock')).toBeInTheDocument();
        expect(screen.getByText('Magnitude')).toBeInTheDocument();
    });

    test('renders the single event as mainshock', () => {
        const svg = screen.getByTestId('earthquake-sequence-chart-svg');
        const circles = svg.querySelectorAll('circle'); // Query for circle elements
        expect(circles.length).toBe(1);

        const mainshockCircle = circles[0];
        const titleElement = mainshockCircle.querySelector('title'); // Get title content
        expect(titleElement).not.toBeNull();
        expect(titleElement.textContent).toContain('(Mainshock)');
        expect(mainshockCircle.getAttribute('fill')).toBe('rgba(255, 0, 0, 0.7)');

        // Check for mainshock label within SVG for the single data point
        const svgMainshockLabel = within(svg).getByText((content, element) =>
          element.tagName.toLowerCase() === 'text' &&
          element.classList.contains('text-red-600') &&
          content === 'Mainshock'
        );
        expect(svgMainshockLabel).toBeInTheDocument();
    });

    test('renders Y-axis ticks correctly for single data point', () => {
        const svg = screen.getByTestId('earthquake-sequence-chart-svg');
        const yAxisTickTexts = Array.from(svg.querySelectorAll("g.text-gray-600 text[text-anchor='end']"))
          .map(el => el.textContent);
        // Magnitude is 4.5. yScale domain [0, 5]
        expect(yAxisTickTexts).toEqual(expect.arrayContaining(["0", "1", "2", "3", "4", "5"]));
    });

    test('renders X-axis ticks correctly for single data point (mainshock at day 0)', () => {
        const svg = screen.getByTestId('earthquake-sequence-chart-svg');
        const xAxisTickTexts = Array.from(svg.querySelectorAll("g.text-gray-600 text[text-anchor='middle']"))
          .map(el => el.textContent)
          .filter(text => !["Days from Mainshock", "Magnitude"].includes(text) && !text.startsWith("Sequence started:")); // Filter out axis/chart titles
        // Mainshock is at day 0. xScale domain is effectively [-0.5, 0.5] due to single point handling, or [-1,1] with padding.
        expect(xAxisTickTexts).toContain("0"); // Mainshock day
    });
  });

});
