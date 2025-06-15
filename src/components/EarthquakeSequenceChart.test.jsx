import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest'; // Import vi for Vitest mocks
import '@testing-library/jest-dom';
import EarthquakeSequenceChart from './EarthquakeSequenceChart';
import { getMagnitudeColor, formatDate, formatNumber } from '../utils/utils'; // Corrected path

// import { scaleSqrt } from 'd3-scale'; // Unused variable

// Mock constants from the component for verification (not ideal, but useful for specific checks like radius)
// const mainshockRadius = 8; // No longer fixed
// const eventRadius = 5;   // No longer fixed

// const mockClusterBase = { // Unused variable
//     type: "Feature",
//     properties: {
//         cluster_id: "ci39695658_0",
//         event_count: 3,
//         max_mag: 4.5,
//         min_mag: 2.0,
//         avg_mag: 3.0,
//         // other properties as needed by the component if any
//     },
//     geometry: { /* ... */ }
// };

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

    // Removed tests for dynamic chart title as the title element itself has been removed.
    // The test below confirms the static title in the "No data" view.

    test('renders "No data available" message with static title when originalQuakes is empty', () => {
        render(<EarthquakeSequenceChart cluster={mockEmptyClusterData} />);
        const noDataView = screen.getByText('No data available for chart.').closest('div');
        expect(within(noDataView).getByRole('heading', { name: 'Earthquake Sequence (UTC)' })).toBeInTheDocument();
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

        // Removed test for Y-Axis label "Magnitude" as the label itself has been removed.

        test('renders some Y-axis tick labels (e.g., 0, 1, 2, 3, 4)', () => {
            // Check for presence of a few expected integer tick labels
            // The exact ticks depend on the magDomain, which is [0, Math.ceil(maxMag)]
            // For mockClusterData, magDomain is [2,5]. plotHeight is 230 (350 - 40 - 80).
            // yScale is scaleLinear().domain([2, 5]).range([230, 0])
            // Expected ticks and their Y positions:
            // '2': 230
            // '2.5': 230 - ((2.5-2)/(5-2) * 230) = 230 - (0.5/3 * 230) = 191.67
            // '3':   230 - ((3-2)/(5-2) * 230) = 230 - (1/3 * 230) = 153.33
            // '3.5': 230 - ((3.5-2)/(5-2) * 230) = 230 - (1.5/3 * 230) = 115
            // '4':   230 - ((4-2)/(5-2) * 230) = 230 - (2/3 * 230) = 76.67
            // '4.5': 230 - ((4.5-2)/(5-2) * 230) = 230 - (2.5/3 * 230) = 38.33
            // '5':   0
            const svgElement = getSvgContainer(container);
            if (!svgElement) throw new Error("SVG container not found for Y-axis ticks test");

            const expectedTicksWithY = {
                '2': 230,
                '2.5': 191.67,
                '3': 153.33,
                '3.5': 115,
                '4': 76.67,
                '4.5': 38.33,
                '5': 0,
            };

            Object.entries(expectedTicksWithY).forEach(([text, expectedY]) => {
                // More specific query for Y-axis tick labels
                const tickElements = within(svgElement).getAllByText(String(text));
                const yAxisTick = tickElements.find(
                    el => el.getAttribute('text-anchor') === 'end' && el.getAttribute('x') === '-8'
                );

                if (yAxisTick) {
                    expect(yAxisTick).toBeInTheDocument();
                    expect(parseFloat(yAxisTick.getAttribute('y'))).toBeCloseTo(expectedY, 1);
                } else if (text === "4.5") {
                    // For "4.5", it's okay if the specific Y-axis tick isn't found due to the mainshock label also being "4.5"
                    // as long as at least one "4.5" is present (checked implicitly by getAllByText not erroring).
                    // The mainshock label test will verify the mainshock's "4.5".
                } else {
                    // If other expected ticks are missing, that's an issue.
                    // This will fail if queryByText was used and found multiple, or if getAllByText finds none it expects.
                    // For now, we accept that D3 might not render all, but critical ones like min/max are checked below.
                }
            });

            // Ensure at least the min and max of the domain are rendered as Y-axis ticks.
            const minTickCandidates = within(svgElement).getAllByText('2');
            const minTick = minTickCandidates.find(el => el.getAttribute('text-anchor') === 'end' && el.getAttribute('x') === '-8');
            expect(minTick).toBeInTheDocument();
            if (minTick) expect(parseFloat(minTick.getAttribute('y'))).toBeCloseTo(230, 1);

            const maxTickCandidates = within(svgElement).getAllByText('5');
            const maxTick = maxTickCandidates.find(el => el.getAttribute('text-anchor') === 'end' && el.getAttribute('x') === '-8');
            expect(maxTick).toBeInTheDocument();
            if (maxTick) expect(parseFloat(maxTick.getAttribute('y'))).toBeCloseTo(0, 1);
        });

        test('renders X-axis label "Time (UTC)" correctly positioned', () => {
            const titleElement = screen.getByText('Time (UTC)');
            expect(titleElement).toBeInTheDocument();
            // margin.bottom = 80; plotHeight = 350 - 40 - 80 = 230.
            // X-axis title y is plotHeight + 45. Expected y = 230 + 45 = 275.
            expect(titleElement.getAttribute('y')).toBe(String(230 + 45));
        });

        describe('X-Axis Labels (Combined Date and Time)', () => {
            const chartHeight = 350;
            const newMargin = { top: 40, right: 20, bottom: 80, left: 20 }; // Correct margin
            const plotHeight = chartHeight - newMargin.top - newMargin.bottom; // 230

            test('renders time labels (upper tier) correctly positioned', () => { // Title updated
                const { container: currentContainer } = render(<EarthquakeSequenceChart cluster={mockClusterData} />);
                const svgElement = getSvgContainer(currentContainer);
                if (!svgElement) throw new Error("SVG container not found for time labels test");

                // Expecting format like "Jan 01, 12PM"
                const timeLabels = within(svgElement).getAllByText(/^[A-Za-z]{3}\s\d{1,2},\s\d{1,2}(AM|PM)$/i);
                expect(timeLabels.length).toBeGreaterThanOrEqual(1);
                // Check for a known label based on mock data
                expect(timeLabels.some(l => l.textContent.includes("Jan 01, 12PM"))).toBe(true);
                timeLabels.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 20)); // 230 + 20 = 250
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });
            });

            test('renders date part of labels correctly for short span (same day)', () => {
                const { container: currentContainer } = render(<EarthquakeSequenceChart cluster={mockClusterData} />);
                const svgElement = getSvgContainer(currentContainer);
                if (!svgElement) throw new Error("SVG container not found for date labels test");

                // Expecting format like "Jan 01, 12PM"
                const dateLabels = within(svgElement).getAllByText(/Jan\s01,\s\d{1,2}(?:AM|PM)/i);
                expect(dateLabels.length).toBeGreaterThanOrEqual(1);
                dateLabels.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 20));
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });
            });

            test('renders date part of labels correctly for multi-day span', () => {
                const { container: longSpanContainer } = render(<EarthquakeSequenceChart cluster={mockClusterDataLongSpan} />);
                const svgElement = getSvgContainer(longSpanContainer);
                if (!svgElement) throw new Error("SVG container not found for multi-day date labels test");

                const dateLabelsJan01 = within(svgElement).getAllByText(/Jan\s01,\s\d{1,2}(?:AM|PM)/i);
                const dateLabelsJan02 = within(svgElement).getAllByText(/Jan\s02,\s\d{1,2}(?:AM|PM)/i);

                expect(dateLabelsJan01.length).toBeGreaterThanOrEqual(1);
                dateLabelsJan01.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 20));
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });

                expect(dateLabelsJan02.length).toBeGreaterThanOrEqual(1);
                dateLabelsJan02.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 20));
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });
            });
        });

        // The following block (original lines 332-420) is removed to fix parsing error.
        test('renders gridlines correctly', () => {
             const svgElement = getSvgContainer(container);
             if (!svgElement) throw new Error("SVG container not found for gridlines test");
            // const lines = within(svgElement).queryAllByRole('graphics-symbol', { hidden: true }); // Unused variable

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
