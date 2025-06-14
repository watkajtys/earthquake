import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest'; // Import vi for Vitest mocks
import '@testing-library/jest-dom';
import EarthquakeSequenceChart from './EarthquakeSequenceChart';
import { getMagnitudeColor, formatDate, formatNumber } from '../utils/utils'; // Corrected path

import { scaleSqrt } from 'd3-scale'; // Import for replicating scale logic in test

// Mock constants from the component for verification (not ideal, but useful for specific checks like radius)
// const mainshockRadius = 8; // No longer fixed
// const eventRadius = 5;   // No longer fixed

const mockClusterBase = {
    type: "Feature",
    properties: {
        cluster_id: "ci39695658_0",
        event_count: 3,
        max_mag: 4.5,
        min_mag: 2.0,
        avg_mag: 3.0,
        // other properties as needed by the component if any
    },
    geometry: { /* ... */ }
};

const mockQuake = (id, time, mag, place = "Test Place") => ({
    id: id,
    properties: {
        mag: mag,
        place: place,
        time: time,
        // other quake properties if needed
    },
    geometry: { type: "Point", coordinates: [-118.0, 34.0, 5.0] } // Example coordinates
});

const singleQuakeTime = new Date('2023-01-01T10:00:00Z').getTime();
const mainshockTime = new Date('2023-01-01T12:00:00Z').getTime();
const aftershockTime1 = new Date('2023-01-01T12:30:00Z').getTime();
const aftershockTime2 = new Date('2023-01-01T13:00:00Z').getTime();
const foreshockTime = new Date('2023-01-01T11:00:00Z').getTime();

// Mock times for long span data
const longSpanQuake1Time = new Date('2023-01-01T22:00:00Z').getTime(); // Jan 01, 10 PM
const longSpanQuake2Time = new Date('2023-01-02T00:00:00Z').getTime(); // Jan 02, 12 AM (Midnight)
const longSpanQuake3Time = new Date('2023-01-02T04:00:00Z').getTime(); // Jan 02, 4 AM

// Restructured mock data to align with component expecting cluster.originalQuakes directly
const mockClusterData = {
    // type: "Feature", // Not strictly needed by chart, but good for context
    // properties: { ...mockClusterBase.properties }, // If other base props are needed
    originalQuakes: [
        mockQuake("eq1", foreshockTime, 2.5, "10km N of Testville"),
        mockQuake("eq2", mainshockTime, 4.5, "5km E of Testville"), // Mainshock
        mockQuake("eq3", aftershockTime1, 3.0, "Testville"),
        mockQuake("eq4", aftershockTime2, 2.8, "2km S of Testville"),
    ]
};

const mockClusterDataLongSpan = {
    originalQuakes: [
        mockQuake("ls_eq1", longSpanQuake1Time, 3.0, "West End"),
        mockQuake("ls_eq2", longSpanQuake2Time, 4.0, "Midnight Point"), // Mainshock for this set
        mockQuake("ls_eq3", longSpanQuake3Time, 3.5, "East Bay"),
    ]
};

const mockClusterSingleQuake = {
    originalQuakes: [
        mockQuake("single1", singleQuakeTime, 3.3, "Lone Mountain")
    ]
    // properties: { max_mag: 3.3, ... } // If needed for other parts of cluster prop
};

const mockEmptyClusterData = {
    originalQuakes: []
};

// This mock is for the test: 'renders "No data available" message when cluster.properties is missing'
// which is now less relevant as originalQuakes is top-level.
// However, testing with a cluster object that *doesn't* have originalQuakes is still valid.
const mockClusterWithoutOriginalQuakes = {
    properties: {
        cluster_id: "some_id"
    }
    // no originalQuakes key
};

// To make tests less verbose and more resilient to minor parentElement changes
const getSvgContainer = (container) => container.querySelector('svg')?.parentElement;


describe('EarthquakeSequenceChart', () => {
    // Suppress console.error for d3-scale errors when width/height is 0 during initial test render
    let originalError;
    beforeAll(() => {
        originalError = console.error;
        console.error = (...args) => {
            if (typeof args[0] === 'string' && /Error: <rect> attribute width: Expected length, "NaN"/.test(args[0])) {
                return;
            }
            if (typeof args[0] === 'string' && /Error: <path> attribute d: Expected moveto path command/.test(args[0])) {
                return;
            }
            originalError(...args);
        };
        // Mock getBoundingClientRect for stable chart rendering dimensions in tests
        Element.prototype.getBoundingClientRect = vi.fn(() => ({ // Changed to vi.fn()
            width: 800, // Standard width used in component
            height: 350, // Standard height
            top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ""
        }));
    });

    afterAll(() => {
        console.error = originalError;
        vi.restoreAllMocks(); // Changed to vi.restoreAllMocks()
    });


    test('renders basic chart with title', () => {
        render(<EarthquakeSequenceChart cluster={mockClusterSingleQuake} />);
        expect(screen.getByText('Earthquake Sequence (UTC)')).toBeInTheDocument();
    });

    test('renders "No data available" message when originalQuakes is empty', () => {
        render(<EarthquakeSequenceChart cluster={mockEmptyClusterData} />);
        expect(screen.getByText('No data available for chart.')).toBeInTheDocument();
    });

    test('renders "No data available" message when cluster is null', () => {
        render(<EarthquakeSequenceChart cluster={null} />);
        expect(screen.getByText('No data available for chart.')).toBeInTheDocument();
    });

    test('renders "No data available" message when cluster.properties is missing or originalQuakes is not on cluster', () => {
        render(<EarthquakeSequenceChart cluster={mockClusterWithoutOriginalQuakes} />);
        expect(screen.getByText('No data available for chart.')).toBeInTheDocument();
    });


    describe('With Data', () => {
        let container;
        beforeEach(() => {
            const { container: renderedContainer } = render(<EarthquakeSequenceChart cluster={mockClusterData} />);
            container = renderedContainer;
        });

        test('renders mainshock with specific styling and label', () => {
            const mainshockData = mockClusterData.originalQuakes[1]; // eq2 is mainshock
            const expectedLabelText = `${formatNumber(mainshockData.properties.mag,1)}`; // Label is now just the magnitude

            // Find all circle elements. Iterate to find the mainshock circle based on its unique properties.
            const allCircles = container.querySelectorAll('circle');
            let mainshockCircle;
            let mainshockGroup;

            // Calculate expected radius for mainshock (mag 4.5 in domain [2,5] for these tests, radiusScale domain [0,5])
            // baseRadius = scaleSqrt().domain([0, 5.0]).range([2, 10])(4.5) approx 9.589
            // mainshock circleRadius = baseRadius + 2 = 11.589
            const expectedRadiusMainshockCalc = ((Math.sqrt(mainshockData.properties.mag) / Math.sqrt(5)) * (10 - 2)) + 2 + 2;


            allCircles.forEach(circle => {
                const r = parseFloat(circle.getAttribute('r'));
                // Check for properties unique to the mainshock: fill 'none' and its specific, larger radius.
                if (circle.getAttribute('fill') === 'none' && Math.abs(r - expectedRadiusMainshockCalc) < 0.1) {
                    mainshockCircle = circle;
                    mainshockGroup = circle.closest('g');
                }
            });

            expect(mainshockCircle).toBeInTheDocument();
            expect(mainshockGroup).toBeInTheDocument();

            // Once the mainshock group is identified, query for the label *within* that group.
            const mainshockLabelElement = within(mainshockGroup).getByText(expectedLabelText);
            expect(mainshockLabelElement).toBeInTheDocument();

            expect(parseFloat(mainshockCircle.getAttribute('r'))).toBeCloseTo(expectedRadiusMainshockCalc, 1);
            expect(mainshockCircle).toHaveAttribute('fill', 'none');
            expect(mainshockCircle).toHaveAttribute('stroke', getMagnitudeColor(mainshockData.properties.mag));
            expect(mainshockCircle).toHaveAttribute('stroke-width', '2');
            expect(mainshockCircle).toHaveAttribute('fill-opacity', '1');
            expect(mainshockCircle).toHaveAttribute('stroke-opacity', '1');
        });

        test('renders aftershocks/foreshocks with correct styling, radius and opacity', () => {
            const otherQuakes = [
                mockClusterData.originalQuakes[0], // foreshock
                mockClusterData.originalQuakes[2], // aftershock
                mockClusterData.originalQuakes[3], // aftershock
            ];
            const allCircles = Array.from(container.querySelectorAll('circle'));

            otherQuakes.forEach(quake => {
                // Find the circle corresponding to this quake. This relies on tooltips being unique enough.
                const titleContent = `Mag ${formatNumber(quake.properties.mag,1)} ${quake.properties.place} - ${formatDate(quake.properties.time)}`;
                const circle = allCircles.find(c => {
                    const titleElem = c.querySelector('title');
                    return titleElem && titleElem.textContent === titleContent;
                });

                expect(circle).toBeInTheDocument();
                if (circle) {
                    // Calculate expected radius for this quake
                    // Example for mag 2.5: (sqrt(2.5/5) * 8) + 2 ~ 7.65
                    const expectedR = ((Math.sqrt(quake.properties.mag) / Math.sqrt(5)) * 8 + 2);
                    expect(parseFloat(circle.getAttribute('r'))).toBeCloseTo(expectedR,1);
                    expect(circle).toHaveAttribute('fill', getMagnitudeColor(quake.properties.mag));
                    expect(circle).not.toHaveAttribute('fill', 'none');
                    expect(circle).toHaveAttribute('fill-opacity', '0.7');
                    expect(circle).toHaveAttribute('stroke-opacity', '0.7');
                }
            });
        });

        test('renders Y-axis label "Magnitude"', () => {
            expect(screen.getByText('Magnitude')).toBeInTheDocument();
        });

        test('renders some Y-axis tick labels (e.g., 0, 1, 2, 3, 4)', () => {
            // Check for presence of a few expected integer tick labels
            // The exact ticks depend on the magDomain, which is [0, Math.ceil(maxMag)]
            // For mockClusterData, magDomain is [2,5] based on new logic.
            // Expected ticks could be [2, 2.5, 3, 3.5, 4, 4.5, 5]
            const svgElement = getSvgContainer(container);
            if (!svgElement) throw new Error("SVG container not found for Y-axis ticks test");

            expect(within(svgElement).getByText('2')).toBeInTheDocument();
            expect(within(svgElement).queryByText('2.5')).toBeInTheDocument(); // d3 might produce this
            expect(within(svgElement).getByText('3')).toBeInTheDocument();
            // expect(within(svgElement).queryByText('3.5')).toBeInTheDocument();
            expect(within(svgElement).getByText('4')).toBeInTheDocument();
            // expect(within(svgElement).queryByText('4.5')).toBeInTheDocument();
            expect(within(svgElement).getByText('5')).toBeInTheDocument();
        });

        test('renders X-axis label "Time (UTC)" correctly positioned', () => {
            const titleElement = screen.getByText('Time (UTC)');
            expect(titleElement).toBeInTheDocument();
            // margin.bottom = 80; height = 350 - 40 - 80 = 230. Expected y = 230 + 65 = 295
            expect(titleElement.getAttribute('y')).toBe(String(230 + 65));
        });

        describe('Two-Tiered X-Axis Labels', () => {
            const chartHeight = 350;
            const margin = { top: 40, right: 50, bottom: 80, left: 60 };
            const plotHeight = chartHeight - margin.top - margin.bottom; // 230

            test('renders time labels (upper tier) correctly for short span', () => {
                // mockClusterData is rendered in beforeEach
                const svgElement = getSvgContainer(container);
                if (!svgElement) throw new Error("SVG container not found for time labels test");

                // foreshockTime: Aug 26 2021 11:00:00 GMT+0000
                // aftershockTime2: Aug 26 2021 13:00:00 GMT+0000
                // Duration 2hr -> interval 2hr. Expect "12PM"
                const timeLabels = within(svgElement).getAllByText(/^\d{1,2}(?:AM|PM)$/i);
                expect(timeLabels.length).toBeGreaterThanOrEqual(1);
                expect(timeLabels[0]).toHaveTextContent("12PM"); // Based on mock data and 2hr interval
                timeLabels.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 20)); // 230 + 20 = 250
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });
            });

            test('renders date labels (lower tier) correctly for short span (same day)', () => {
                // mockClusterData is rendered in beforeEach
                const svgElement = getSvgContainer(container);
                if (!svgElement) throw new Error("SVG container not found for date labels test");

                // Expect "Jan 01" for mockClusterData, as `foreshockTime` is Jan 01.
                const dateLabels = within(svgElement).getAllByText(/^Jan\s01$/i);
                expect(dateLabels.length).toBe(1); // Only one unique date
                dateLabels.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 40)); // 230 + 40 = 270
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });
            });

            test('renders date labels (lower tier) correctly for multi-day span', () => {
                const { container: longSpanContainer } = render(<EarthquakeSequenceChart cluster={mockClusterDataLongSpan} />);
                const svgElement = getSvgContainer(longSpanContainer);
                if (!svgElement) throw new Error("SVG container not found for multi-day date labels test");

                const dateLabelsJan01 = within(svgElement).getByText(/^Jan\s01$/i);
                const dateLabelsJan02 = within(svgElement).getByText(/^Jan\s02$/i);

                expect(dateLabelsJan01).toBeInTheDocument();
                expect(dateLabelsJan01.getAttribute('y')).toBe(String(plotHeight + 40));
                expect(dateLabelsJan01.getAttribute('text-anchor')).toBe('middle');

                expect(dateLabelsJan02).toBeInTheDocument();
                expect(dateLabelsJan02.getAttribute('y')).toBe(String(plotHeight + 40));
                expect(dateLabelsJan02.getAttribute('text-anchor')).toBe('middle');
            });
        });

        test('renders gridlines', () => {
             const svgElement = getSvgContainer(container);
             if (!svgElement) throw new Error("SVG container not found for gridlines test");
            const lines = within(svgElement).queryAllByRole('graphics-symbol', { hidden: true }); // Not standard role, need better query

            // Querying lines more directly by looking for stroke-dasharray
            const gridlines = Array.from(svgElement.querySelectorAll('line[stroke-dasharray="2,2"]'));
            expect(gridlines.length).toBeGreaterThan(0); // Should have multiple gridlines
        });

        test('renders tooltips for data points', () => {
            const mainshockData = mockClusterData.originalQuakes[1]; // Corrected path
            const expectedMainshockTooltip = `Mag ${formatNumber(mainshockData.properties.mag,1)} ${mainshockData.properties.place} - ${formatDate(mainshockData.properties.time)}`;

            const aftershockData = mockClusterData.originalQuakes[2]; // Corrected path
            const expectedAftershockTooltip = `Mag ${formatNumber(aftershockData.properties.mag,1)} ${aftershockData.properties.place} - ${formatDate(aftershockData.properties.time)}`;

            const svgElement = getSvgContainer(container);
            if (!svgElement) throw new Error("SVG container not found for tooltips test");

            const titles = Array.from(svgElement.querySelectorAll('circle title'));
            const titleTexts = titles.map(t => t.textContent);

            expect(titleTexts).toContain(expectedMainshockTooltip);
            expect(titleTexts).toContain(expectedAftershockTooltip);
        });
    });

    describe('Connecting Line', () => {
        const linePathSelector = 'svg g path[fill="none"][stroke-dasharray="3,3"]';

        test('renders a connecting line when there are multiple quakes', () => {
            const { container } = render(<EarthquakeSequenceChart cluster={mockClusterData} />);
            const pathElement = container.querySelector(linePathSelector);

            expect(pathElement).toBeInTheDocument();
            expect(pathElement).toHaveAttribute('d');
            expect(pathElement.getAttribute('d')).not.toBe('');
            expect(pathElement).toHaveAttribute('stroke-dasharray', '3,3');
            expect(pathElement).toHaveAttribute('stroke-width', '1');
            expect(pathElement).toHaveAttribute('fill', 'none');
            // Check for Tailwind classes for styling
            // The component uses: className={`stroke-current ${tickLabelColor} opacity-75`}
            // tickLabelColor is "text-slate-500"
            expect(pathElement).toHaveClass('stroke-current');
            expect(pathElement).toHaveClass('text-slate-500');
            expect(pathElement).toHaveClass('opacity-75');
        });

        test('does not render a connecting line when there is only one quake', () => {
            const { container } = render(<EarthquakeSequenceChart cluster={mockClusterSingleQuake} />);
            const pathElement = container.querySelector(linePathSelector);
            expect(pathElement).not.toBeInTheDocument();
        });

        test('does not render a connecting line when there are no quakes', () => {
            const { container } = render(<EarthquakeSequenceChart cluster={mockEmptyClusterData} />);
            const pathElement = container.querySelector(linePathSelector);
            expect(pathElement).not.toBeInTheDocument();
        });
    });

    test('renders skeleton when isLoading is true', () => {
        const { container } = render(<EarthquakeSequenceChart cluster={mockClusterData} isLoading={true} />);

        // Check for the main skeleton container's "animate-pulse" wrapper around the SVG
        const animatePulseDiv = container.querySelector('div.animate-pulse');
        expect(animatePulseDiv).toBeInTheDocument();

        // Check for a specific element within the skeleton, e.g., the placeholder for the plot area
        // This was: <rect x="0" y="0" width={width} height={height} className={`fill-current ${placeholderElementColor} opacity-30`} />
        // placeholderElementColor is bg-slate-600. In SVG, fill-current with bg-slate-600 on parent won't directly make rect bg-slate-600.
        // The className on rect is `fill-current ${placeholderElementColor} opacity-30`.
        // Let's query for the rect with opacity-30, assuming it's specific enough to the skeleton's plot area.
        const skeletonPlotAreaRect = container.querySelector('svg g rect.opacity-30');
        expect(skeletonPlotAreaRect).toBeInTheDocument();

        // Check for the skeleton title placeholder
        // It has classes: h-6 w-3/4 mb-4 bg-slate-600 rounded animate-pulse mx-auto
        const titlePlaceholder = container.querySelector('.h-6.w-3\\/4.bg-slate-600.animate-pulse');
        expect(titlePlaceholder).toBeInTheDocument();

        // Check for absence of actual chart title (which is not part of skeleton)
        expect(screen.queryByText('Earthquake Sequence (UTC)')).not.toBeInTheDocument();
    });
});
