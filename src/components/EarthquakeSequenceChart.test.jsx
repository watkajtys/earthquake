import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest'; // Import vi for Vitest mocks
import '@testing-library/jest-dom';
import EarthquakeSequenceChart from './EarthquakeSequenceChart';
import { getMagnitudeColor, formatDate, formatNumber } from '../utils/utils'; // Corrected path

// Mock constants from the component for verification (not ideal, but useful for specific checks like radius)
const mainshockRadius = 8;
const eventRadius = 5;

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


const mockClusterData = {
    ...mockClusterBase,
    properties: {
        ...mockClusterBase.properties,
        originalQuakes: [
            mockQuake("eq1", foreshockTime, 2.5, "10km N of Testville"),
            mockQuake("eq2", mainshockTime, 4.5, "5km E of Testville"), // Mainshock
            mockQuake("eq3", aftershockTime1, 3.0, "Testville"),
            mockQuake("eq4", aftershockTime2, 2.8, "2km S of Testville"),
        ]
    }
};

const mockClusterSingleQuake = {
    ...mockClusterBase,
    properties: {
        ...mockClusterBase.properties,
        max_mag: 3.3,
        originalQuakes: [
            mockQuake("single1", singleQuakeTime, 3.3, "Lone Mountain")
        ]
    }
};

const mockEmptyClusterData = {
    ...mockClusterBase,
    properties: {
        ...mockClusterBase.properties,
        originalQuakes: []
    }
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
        expect(screen.getByText('When quakes and aftershocks occurred')).toBeInTheDocument();
    });

    test('renders "No data available" message when originalQuakes is empty', () => {
        render(<EarthquakeSequenceChart cluster={mockEmptyClusterData} />);
        expect(screen.getByText('No data available for chart.')).toBeInTheDocument();
    });

    test('renders "No data available" message when cluster is null', () => {
        render(<EarthquakeSequenceChart cluster={null} />);
        expect(screen.getByText('No data available for chart.')).toBeInTheDocument();
    });

    test('renders "No data available" message when cluster.properties is missing', () => {
        render(<EarthquakeSequenceChart cluster={{...mockClusterBase, properties: undefined }} />);
        expect(screen.getByText('No data available for chart.')).toBeInTheDocument();
    });


    describe('With Data', () => {
        let container;
        beforeEach(() => {
            const { container: renderedContainer } = render(<EarthquakeSequenceChart cluster={mockClusterData} />);
            container = renderedContainer;
        });

        test('renders mainshock with specific styling and label', () => {
            const mainshockData = mockClusterData.properties.originalQuakes[1]; // eq2 is mainshock
            const expectedLabel = `Magnitude ${formatNumber(mainshockData.properties.mag,1)} earthquake`;
            expect(screen.getByText(expectedLabel)).toBeInTheDocument();

            // Find all circles, then identify mainshock by associated text or properties
            // This is a bit indirect. A data-testid on the mainshock group would be better.
            const allCircles = container.querySelectorAll('circle');
            let mainshockCircle;
            allCircles.forEach(circle => {
                const parentGroup = circle.closest('g');
                if (parentGroup && within(parentGroup).queryByText(expectedLabel)) {
                    mainshockCircle = circle;
                }
            });

            expect(mainshockCircle).toBeInTheDocument();
            expect(mainshockCircle).toHaveAttribute('r', String(mainshockRadius));
            expect(mainshockCircle).toHaveAttribute('fill', 'none');
            expect(mainshockCircle).toHaveAttribute('stroke', getMagnitudeColor(mainshockData.properties.mag));
            expect(mainshockCircle).toHaveAttribute('stroke-width', '2');
        });

        test('renders aftershocks/foreshocks with correct styling', () => {
            const otherQuakes = [
                mockClusterData.properties.originalQuakes[0], // foreshock
                mockClusterData.properties.originalQuakes[2], // aftershock
                mockClusterData.properties.originalQuakes[3], // aftershock
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
                if (circle) { // to satisfy typescript if TS were used
                    expect(circle).toHaveAttribute('r', String(eventRadius));
                    expect(circle).toHaveAttribute('fill', getMagnitudeColor(quake.properties.mag));
                    expect(circle).not.toHaveAttribute('fill', 'none');
                }
            });
        });

        test('renders Y-axis label "Mag."', () => {
            expect(screen.getByText('Mag.')).toBeInTheDocument();
        });

        test('renders some Y-axis tick labels (e.g., 0, 1, 2, 3, 4)', () => {
            // Check for presence of a few expected integer tick labels
            // The exact ticks depend on the magDomain, which is [0, Math.ceil(maxMag)]
            // For mockClusterData, maxMag is 4.5, so domain is [0,5]. Expect 0,1,2,3,4,5
            const svgElement = getSvgContainer(container);
            if (!svgElement) throw new Error("SVG container not found for Y-axis ticks test");

            expect(within(svgElement).getByText('0')).toBeInTheDocument();
            expect(within(svgElement).getByText('1')).toBeInTheDocument();
            expect(within(svgElement).getByText('2')).toBeInTheDocument();
            expect(within(svgElement).getByText('3')).toBeInTheDocument();
            expect(within(svgElement).getByText('4')).toBeInTheDocument();
            expect(within(svgElement).getByText('5')).toBeInTheDocument(); // Since maxMag is 4.5, ceil is 5
        });

        test('renders some X-axis tick labels (formatted time)', () => {
            // Check for text elements that are X-axis ticks.
            // This is harder to be specific about due to dynamic generation.
            // We check for presence of multiple text elements at y = height + 20 (approx)
            const svgElement = getSvgContainer(container);
            if (!svgElement) throw new Error("SVG container not found for X-axis ticks test");

            // Example formatted times from mock data:
            // foreshockTime: Jan 01, 11AM
            // mainshockTime: Jan 01, 12PM
            // aftershockTime1: Jan 01, 12PM (might be combined with mainshock if ticks are sparse)
            // aftershockTime2: Jan 01, 01PM
            // The exact ticks depend on d3.ticks() behavior.
            // We look for at least two distinct time labels.
            const xTickTexts = within(svgElement)
                .getAllByText(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{1,2}(AM|PM)$/i);
            expect(xTickTexts.length).toBeGreaterThanOrEqual(2); // Expect at least a couple of time labels
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
            const mainshockData = mockClusterData.properties.originalQuakes[1];
            const expectedMainshockTooltip = `Mag ${formatNumber(mainshockData.properties.mag,1)} ${mainshockData.properties.place} - ${formatDate(mainshockData.properties.time)}`;

            const aftershockData = mockClusterData.properties.originalQuakes[2];
            const expectedAftershockTooltip = `Mag ${formatNumber(aftershockData.properties.mag,1)} ${aftershockData.properties.place} - ${formatDate(aftershockData.properties.time)}`;

            const svgElement = getSvgContainer(container);
            if (!svgElement) throw new Error("SVG container not found for tooltips test");

            const titles = Array.from(svgElement.querySelectorAll('circle title'));
            const titleTexts = titles.map(t => t.textContent);

            expect(titleTexts).toContain(expectedMainshockTooltip);
            expect(titleTexts).toContain(expectedAftershockTooltip);
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
        expect(screen.queryByText('When quakes and aftershocks occurred')).not.toBeInTheDocument();
    });
});
