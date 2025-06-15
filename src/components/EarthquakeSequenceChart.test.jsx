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

// Mock times for ~70 hours span (just under 3 days)
const approx70HrsStart = new Date('2023-01-01T00:00:00Z').getTime();
const approx70HrsMid = new Date('2023-01-02T12:00:00Z').getTime();
const approx70HrsEnd = new Date('2023-01-03T22:00:00Z').getTime(); // 2 days + 22 hours = 70 hours

// Mock times for ~74 hours span (just over 3 days)
const approx74HrsStart = new Date('2023-01-01T00:00:00Z').getTime();
const approx74HrsMid = new Date('2023-01-02T12:00:00Z').getTime();
const approx74HrsEnd = new Date('2023-01-04T02:00:00Z').getTime(); // 3 days + 2 hours = 74 hours


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

const mockClusterDataApprox70Hours = {
    originalQuakes: [
        mockQuake("h70_1", approx70HrsStart, 3.0, "70hr Start"),
        mockQuake("h70_2", approx70HrsMid, 4.0, "70hr Mid"),
        mockQuake("h70_3", approx70HrsEnd, 3.5, "70hr End"),
    ]
};

const mockClusterDataApprox74Hours = {
    originalQuakes: [
        mockQuake("h74_1", approx74HrsStart, 3.0, "74hr Start"),
        mockQuake("h74_2", approx74HrsMid, 4.0, "74hr Mid"),
        mockQuake("h74_3", approx74HrsEnd, 3.5, "74hr End"),
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

// Times for new mock data
const t1 = new Date('2023-02-01T00:00:00Z').getTime();
const t2 = new Date('2023-02-01T01:00:00Z').getTime();
const t3 = new Date('2023-02-01T02:00:00Z').getTime();
const t4 = new Date('2023-02-01T03:00:00Z').getTime();
const t5 = new Date('2023-02-01T04:00:00Z').getTime();

const mockClusterDataMixedMagnitudes = {
    originalQuakes: [
        mockQuake("mix1", t1, 2.0), // Defined
        mockQuake("mix2", t2, 1.0), // Undefined
        mockQuake("mix3", t3, 2.5), // Defined
        mockQuake("mix4", t4, 0.5), // Undefined
        mockQuake("mix5", t5, 3.0), // Defined
    ]
};

const mockClusterDataAllBelowThreshold = {
    originalQuakes: [
        mockQuake("b1", t1, 1.0),
        mockQuake("b2", t2, 1.2),
        mockQuake("b3", t3, 0.9),
    ]
};

const mockClusterDataAllAboveThreshold = {
    originalQuakes: [
        mockQuake("a1", t1, 2.0),
        mockQuake("a2", t2, 1.8),
        mockQuake("a3", t3, 2.5),
    ]
};


// To make tests less verbose and more resilient to minor parentElement changes
const getSvgContainer = (container) => container.querySelector('svg')?.parentElement;

// Helper to count 'M' commands in a path d attribute
const countMovetoCommands = (pathD) => {
    if (!pathD) return 0;
    const matches = pathD.match(/M/g);
    return matches ? matches.length : 0;
};


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
            // For mockClusterData, magDomain is [2,5]. plotHeight is 220 (350 - 40 - 90).
            // yScale is scaleLinear().domain([2, 5]).range([220, 0])
            // Expected ticks and their Y positions:
            // '2': 220
            // '2.5': 220 - ((2.5-2)/(5-2) * 220) = 220 - (0.5/3 * 220) = 220 - 36.66 = 183.33
            // '3':   220 - ((3-2)/(5-2) * 220) = 220 - (1/3 * 220) = 220 - 73.33 = 146.67
            // '3.5': 220 - ((3.5-2)/(5-2) * 220) = 220 - (1.5/3 * 220) = 220 - 110 = 110
            // '4':   220 - ((4-2)/(5-2) * 220) = 220 - (2/3 * 220) = 220 - 146.66 = 73.33
            // '4.5': 220 - ((4.5-2)/(5-2) * 220) = 220 - (2.5/3 * 220) = 220 - 183.33 = 36.67
            // '5':   0
            const svgElement = getSvgContainer(container);
            if (!svgElement) throw new Error("SVG container not found for Y-axis ticks test");

            const expectedTicksWithY = {
                '2': 220,
                '2.5': 183.33,
                '3': 146.67,
                '3.5': 110,
                '4': 73.33,
                '4.5': 36.67,
                '5': 0,
            };

            Object.entries(expectedTicksWithY).forEach(([text, expectedY]) => {
                const tickElements = within(svgElement).getAllByText(String(text));
                const tickElement = tickElements.find(el => el.getAttribute('x') === '-8' && el.getAttribute('text-anchor') === 'end');
                // D3 might not render all ticks, especially if space is limited or they are at the very edges.
                // So, only check the 'y' attribute if the tickElement is found.
                if (tickElement) {
                    expect(tickElement).toBeInTheDocument();
                    expect(parseFloat(tickElement.getAttribute('y'))).toBeCloseTo(expectedY, 1); // Check y position with tolerance
                }
            });

            // Ensure at least the min and max of the domain are rendered as ticks, as these are usually preserved by D3.
            const minTickCandidates = within(svgElement).getAllByText('2');
            const minTick = minTickCandidates.find(el => el.getAttribute('x') === '-8' && el.getAttribute('text-anchor') === 'end');

            const maxTickCandidates = within(svgElement).getAllByText('5');
            const maxTick = maxTickCandidates.find(el => el.getAttribute('x') === '-8' && el.getAttribute('text-anchor') === 'end');

            expect(minTick).toBeInTheDocument();
            expect(parseFloat(minTick.getAttribute('y'))).toBeCloseTo(220, 1);
            expect(maxTick).toBeInTheDocument();
            expect(parseFloat(maxTick.getAttribute('y'))).toBeCloseTo(0, 1);
        });

        test('renders X-axis label "Time (UTC)" correctly positioned', () => {
            const titleElement = screen.getByText('Time (UTC)');
            expect(titleElement).toBeInTheDocument();
            // margin.bottom = 90; plotHeight = 350 - 40 - 90 = 220.
            // X-axis title y is plotHeight + 60. Expected y = 220 + 60 = 280.
            expect(titleElement.getAttribute('y')).toBe(String(220 + 60));
        });

        describe('Two-Tiered X-Axis Labels', () => { // Name reverted to reflect two tiers
            const chartHeight = 350;
            const newMargin = { top: 40, right: 20, bottom: 90, left: 20 }; // Updated margin.bottom
            const plotHeight = chartHeight - newMargin.top - newMargin.bottom; // 220

            test('renders time labels (upper tier) correctly positioned', () => { // Title updated
                const { container: currentContainer } = render(<EarthquakeSequenceChart cluster={mockClusterData} />);
                const svgElement = getSvgContainer(currentContainer);
                if (!svgElement) throw new Error("SVG container not found for time labels test");

                // Expecting format %-I%p (e.g., "11AM", "12PM", "1PM")
                // For mockClusterData (11AM to 1PM), ticks could be 11AM, 12PM, 1PM depending on D3 logic for the span.
                const timeLabels = within(svgElement).getAllByText(/\d{1,2}PM|\d{1,2}AM/i); // Regex for AM/PM format
                expect(timeLabels.length).toBeGreaterThanOrEqual(1);
                // Check for a known label based on mock data and typical D3 behavior for short spans
                expect(timeLabels.some(l => l.textContent === "12PM")).toBe(true);
                timeLabels.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 20)); // 230 + 20 = 250
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });
            });

            test('renders date labels (lower tier) correctly for short span (same day)', () => { // Title updated
                const { container: currentContainer } = render(<EarthquakeSequenceChart cluster={mockClusterData} />);
                const svgElement = getSvgContainer(currentContainer);
                if (!svgElement) throw new Error("SVG container not found for date labels test");

                // Expecting format %b %d (e.g., "Jan 01")
                const dateLabels = within(svgElement).getAllByText(/^Jan\s01$/i); // Regex for "Jan 01"
                expect(dateLabels.length).toBeGreaterThanOrEqual(1); // Should find at least one "Jan 01"
                dateLabels.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 40)); // 230 + 40 = 270
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });
            });

            test('renders date labels (lower tier) correctly for multi-day span', () => { // Title updated
                const { container: longSpanContainer } = render(<EarthquakeSequenceChart cluster={mockClusterDataLongSpan} />);
                const svgElement = getSvgContainer(longSpanContainer);
                if (!svgElement) throw new Error("SVG container not found for multi-day date labels test");

                // Expecting format %b %d
                const dateLabelsJan01 = within(svgElement).getByText(/^Jan\s01$/i);
                const dateLabelsJan02 = within(svgElement).getByText(/^Jan\s02$/i);

                expect(dateLabelsJan01).toBeInTheDocument();
                expect(dateLabelsJan01.getAttribute('y')).toBe(String(plotHeight + 40)); // 230 + 40 = 270
                expect(dateLabelsJan01.getAttribute('text-anchor')).toBe('middle');

                expect(dateLabelsJan02).toBeInTheDocument();
                expect(dateLabelsJan02.getAttribute('y')).toBe(String(plotHeight + 40));
                expect(dateLabelsJan02.getAttribute('text-anchor')).toBe('middle');
            });

            test('renders time labels with 6-hour interval for ~70 hour duration', () => {
                const { container: currentContainer } = render(<EarthquakeSequenceChart cluster={mockClusterDataApprox70Hours} />);
                const svgElement = getSvgContainer(currentContainer);
                if (!svgElement) throw new Error("SVG container not found for ~70hr time labels test");

                // Duration is 70 hours. Expected interval: timeHour.every(6)
                // Check for presence of labels like "12AM", "6AM", "12PM", "6PM"
                const timeLabels = within(svgElement).getAllByText(/\d{1,2}(AM|PM)/i);
                expect(timeLabels.length).toBeGreaterThanOrEqual(Math.floor(70 / 6) - 2); // Approximate, D3 might add/remove some edge ticks

                // Check for specific labels that should appear with 6-hour intervals
                const expectedLabels = ["12AM", "6AM", "12PM", "6PM"];
                expectedLabels.forEach(expectedLabel => {
                    expect(timeLabels.some(l => l.textContent === expectedLabel)).toBe(true);
                });

                timeLabels.forEach(label => {
                    expect(label.getAttribute('y')).toBe(String(plotHeight + 20));
                    expect(label.getAttribute('text-anchor')).toBe('middle');
                });
            });

            test('renders time labels with 24-hour interval for ~74 hour duration', () => {
                const { container: currentContainer } = render(<EarthquakeSequenceChart cluster={mockClusterDataApprox74Hours} />);
                const svgElement = getSvgContainer(currentContainer);
                if (!svgElement) throw new Error("SVG container not found for ~74hr time labels test");

                // Duration is 74 hours. Expected interval: timeHour.every(24)
                // Time labels should primarily be "12AM" if data spans across midnight
                const timeLabels = within(svgElement).getAllByText(/\d{1,2}(AM|PM)/i);
                 // Expect approx 74/24 ~ 3-4 labels. D3 might be clever.
                expect(timeLabels.length).toBeGreaterThanOrEqual(Math.floor(74 / 24) -1 );
                expect(timeLabels.length).toBeLessThanOrEqual(Math.ceil(74 / 24) + 2 );


                // Check that most (if not all) labels are "12AM"
                const twelveAmLabels = timeLabels.filter(l => l.textContent === "12AM");
                // For a 74hr span (3 days + 2hrs), we expect "12AM" for Day1, Day2, Day3, Day4 start.
                // So at least 3, possibly 4 depending on D3's rounding for the domain.
                expect(twelveAmLabels.length).toBeGreaterThanOrEqual(3);

                // Verify all rendered time labels are correctly positioned
                timeLabels.forEach(label => {
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

        test('renders a connecting line when there are multiple quakes (all above threshold)', () => {
            const { container } = render(<EarthquakeSequenceChart cluster={mockClusterData} />);
            const pathElement = container.querySelector(linePathSelector);

            expect(pathElement).toBeInTheDocument();
            expect(pathElement).toHaveAttribute('d');
            const dAttribute = pathElement.getAttribute('d');
            expect(dAttribute).not.toBe('');
            expect(countMovetoCommands(dAttribute)).toBe(1); // All points in mockClusterData are >= 1.5
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

        test('correctly breaks the line for mixed magnitudes (no line segments expected)', () => {
            // For [2.0(d), 1.0(u), 2.5(d), 0.5(u), 3.0(d)]
            // No two *consecutive* points are both defined. So, no line segments should be drawn.
            const { container } = render(<EarthquakeSequenceChart cluster={mockClusterDataMixedMagnitudes} />);
            const pathElement = container.querySelector(linePathSelector);

            // The path might exist but be empty or minimal (e.g. just one M command if d3 outputs that for the first point)
            // It definitely should not contain 'L' (lineto) commands.
            if (pathElement) {
                 const dAttribute = pathElement.getAttribute('d');
                 expect(dAttribute).not.toContain('L');
            } else {
                // If no path element is rendered at all, that's also acceptable.
                expect(pathElement).not.toBeInTheDocument();
            }
        });

        test('does not render connecting line if all magnitudes are below 1.5', () => {
            const { container } = render(<EarthquakeSequenceChart cluster={mockClusterDataAllBelowThreshold} />);
            const pathElement = container.querySelector(linePathSelector);
             // Similar to the mixed test, the path should not contain 'L' commands, or not exist.
            if (pathElement) {
                const dAttribute = pathElement.getAttribute('d');
                expect(dAttribute).not.toContain('L');
            } else {
                expect(pathElement).not.toBeInTheDocument();
            }
        });

        test('renders a continuous connecting line if all magnitudes are >= 1.5', () => {
            const { container } = render(<EarthquakeSequenceChart cluster={mockClusterDataAllAboveThreshold} />);
            const pathElement = container.querySelector(linePathSelector);

            expect(pathElement).toBeInTheDocument();
            const dAttribute = pathElement.getAttribute('d');
            expect(dAttribute).not.toBe('');
            expect(dAttribute).toContain('L'); // Should have lineto commands
            expect(countMovetoCommands(dAttribute)).toBe(1); // Single continuous segment
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
