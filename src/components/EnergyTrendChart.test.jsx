import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnergyTrendChart } from './EnergyTrendChart'; // Assuming named export
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext.jsx';

// Helper to render with mock context
const renderWithMockContext = (ui, contextValues) => {
    return render(
        <EarthquakeDataContext.Provider value={contextValues}>
            {ui}
        </EarthquakeDataContext.Provider>
    );
};

// Mock offsetWidth to allow chart rendering in JSDOM
let originalOffsetWidth;
let mockResizeObserver;

beforeAll(() => {
    originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        value: 500, // Provide a mock width
    });

    mockResizeObserver = class ResizeObserver {
        constructor(callback) {
            this.callback = callback;
        }
        observe(target) {
            // Immediately call the callback with mock dimensions
            // JSDOM doesn't have layout, so we simulate a resize event
            this.callback([{ contentRect: { width: 500, height: 220 } }], this);
        }
        unobserve() {
            // Do nothing in mock
        }
        disconnect() {
            // Do nothing in mock
        }
    };
    global.ResizeObserver = mockResizeObserver;
});

afterAll(() => {
    if (originalOffsetWidth) {
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    }
    delete global.ResizeObserver; // Clean up the global mock
});

// Mock initial state for context, focusing on what EnergyTrendChart uses
const mockBaseContextValue = {
    dailyEnergyTrend: [],
    energyComparisonError: null,
    // Add other properties from initialState if they are inadvertently accessed by the component
    // or any hooks it might use, even if not directly listed in its destructuring.
    // For this component, it seems to only directly use the two above.
};

describe('EnergyTrendChart', () => {
    it('renders a title if provided', () => {
        const customTitle = "Test Energy Trend";
        renderWithMockContext(
            <EnergyTrendChart title={customTitle} />,
            { ...mockBaseContextValue, dailyEnergyTrend: [{ dateString: 'Oct 26', energy: 100 }] } // Provide minimal data to render chart section
        );
        // Query for an h3 element specifically, then check its text content.
        const headingElement = screen.getByRole('heading', { level: 3 });
        expect(headingElement).toHaveTextContent(customTitle);
    });

    it('renders the default title if no title prop is provided', () => {
        renderWithMockContext(
            <EnergyTrendChart />,
            { ...mockBaseContextValue, dailyEnergyTrend: [{ dateString: 'Oct 26', energy: 100 }] }
        );
        const headingElement = screen.getByRole('heading', { level: 3 });
        expect(headingElement).toHaveTextContent("Daily Seismic Energy Trend (Last 30 Days)");
    });

    it('renders a loading/empty message if dailyEnergyTrend is empty', () => {
        renderWithMockContext(<EnergyTrendChart />, { ...mockBaseContextValue, dailyEnergyTrend: [] });
        expect(screen.getByText("Loading trend data or data unavailable...")).toBeInTheDocument();
        expect(screen.queryByRole('graphics-document')).not.toBeInTheDocument(); // SVG should not render
    });

    it('renders a loading/empty message if dailyEnergyTrend is null', () => {
        renderWithMockContext(<EnergyTrendChart />, { ...mockBaseContextValue, dailyEnergyTrend: null });
        expect(screen.getByText("Loading trend data or data unavailable...")).toBeInTheDocument();
        expect(screen.queryByRole('graphics-document')).not.toBeInTheDocument();
    });

    it('renders an error message if energyComparisonError is provided', () => {
        const errorMessage = "Failed to load comparisons.";
        renderWithMockContext(<EnergyTrendChart />, { ...mockBaseContextValue, energyComparisonError: errorMessage });
        expect(screen.getByRole('alert')).toBeInTheDocument();
        // Check for the prefix and the specific error message within the same span
        const alertSpan = screen.getByText((content, element) => {
            return element.tagName.toLowerCase() === 'span' &&
                   content.startsWith('Could not load energy trend data due to a previous error:') &&
                   content.includes(errorMessage);
        });
        expect(alertSpan).toBeInTheDocument();
        expect(screen.queryByRole('graphics-document')).not.toBeInTheDocument(); // SVG should not render
    });

    describe('when valid data is provided', () => {
        const mockTrendData = [
            { dateString: 'Oct 24', energy: 1000 },
            { dateString: 'Oct 25', energy: 2000000 }, // 2 MJ
            { dateString: 'Oct 26', energy: 3000000000 }, // 3 GJ
        ];
        const contextWithData = { ...mockBaseContextValue, dailyEnergyTrend: mockTrendData };

        it('renders an SVG element', () => {
            renderWithMockContext(<EnergyTrendChart />, contextWithData);
            expect(screen.getByRole('graphics-document')).toBeInTheDocument(); // Checks for <svg role="graphics-document">
        });

        it('renders the correct number of bars based on data length', () => {
            renderWithMockContext(<EnergyTrendChart />, contextWithData);
            const svg = screen.getByRole('graphics-document');
            // Find rect elements that are children of the main g transform group (excluding axis lines if they were rects)
            // A more specific selector might be needed if axis lines were also rects.
            // Current implementation uses <line> for axes.
            const bars = svg.querySelectorAll('g > rect');
            expect(bars.length).toBe(mockTrendData.length);
        });

        it('renders y-axis ticks with formatted energy values', () => {
            renderWithMockContext(<EnergyTrendChart />, contextWithData);
            expect(screen.getByText('0 J')).toBeInTheDocument(); // Assuming 0 is always a tick
            expect(screen.getByText('1.5 GJ')).toBeInTheDocument(); // Half of max (3 GJ)
            expect(screen.getByText('3.0 GJ')).toBeInTheDocument(); // Max energy
        });

        it('renders x-axis ticks with date labels', () => {
            renderWithMockContext(<EnergyTrendChart />, contextWithData);
            expect(screen.getByText('Oct 24')).toBeInTheDocument(); // First date
            // Middle date not rendered for only 3 data points based on current logic (length > 15)
            expect(screen.getByText('Oct 26')).toBeInTheDocument(); // Last date
        });

        it('bars have tooltips with formatted energy', () => {
            renderWithMockContext(<EnergyTrendChart />, contextWithData);
            const svg = screen.getByRole('graphics-document');
            const bars = svg.querySelectorAll('g > rect');

            expect(bars[0].querySelector('title').textContent).toBe('Oct 24: 1.00 kJ');
            expect(bars[1].querySelector('title').textContent).toBe('Oct 25: 2.00 MJ');
            expect(bars[2].querySelector('title').textContent).toBe('Oct 26: 3.00 GJ');
        });

        it('handles zero energy correctly in y-axis and tooltips', () => {
            const zeroEnergyData = [
                { dateString: 'Nov 1', energy: 0 },
                { dateString: 'Nov 2', energy: 0 },
            ];
            renderWithMockContext(<EnergyTrendChart />, { ...mockBaseContextValue, dailyEnergyTrend: zeroEnergyData });
            expect(screen.getByText('0 J')).toBeInTheDocument(); // Y-axis tick

            const svg = screen.getByRole('graphics-document');
            const bars = svg.querySelectorAll('g > rect');
            expect(bars[0].querySelector('title').textContent).toBe('Nov 1: 0 J');
            expect(bars[1].querySelector('title').textContent).toBe('Nov 2: 0 J');
            // Check that no other y-axis ticks like "NaN J" or "undefined J" are rendered
            expect(screen.queryByText("NaN J")).not.toBeInTheDocument();
            expect(screen.queryByText("undefined J")).not.toBeInTheDocument();
        });
    });
});
