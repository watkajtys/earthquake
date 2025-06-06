import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SeismicEnergyDisplay } from './SeismicEnergyDisplay';
import { EarthquakeDataContext } from '../contexts/EarthquakeDataContext.jsx';

// Helper to render with mock context
const renderWithMockContext = (ui, contextValues) => {
    return render(
        <EarthquakeDataContext.Provider value={contextValues}>
            {ui}
        </EarthquakeDataContext.Provider>
    );
};

// Mock initial state for context (subset relevant to this component)
const mockInitialState = {
    energyToday: 0,
    energyYesterday: 0,
    energyThisWeek: 0,
    energyLastWeek: 0,
    energyComparisonError: null,
    // other state properties that might be accessed by hooks/components if not careful
    // for this component, only the above are directly used.
};


describe('SeismicEnergyDisplay', () => {
    it('renders correctly with all zero energy values', () => {
        renderWithMockContext(<SeismicEnergyDisplay />, mockInitialState);
        expect(screen.getByText('Seismic Energy Release Comparison')).toBeInTheDocument();
        expect(screen.getByText('Today:')).toBeInTheDocument();
        expect(screen.getAllByText('0 J').length).toBeGreaterThanOrEqual(4); // Today, Yesterday, This Week, Last Week
        // Check for the new simplified message for no significant energy
        expect(screen.getAllByText('No significant energy recorded.').length).toBe(2);
        expect(screen.queryByText('Factor: N/A')).not.toBeInTheDocument();
    });

    it('formats and displays energy values correctly (e.g., MJ, GJ, TJ, PJ)', () => {
        const testValues = {
            ...mockInitialState,
            energyToday: 1.5e7,    // 15 MJ
            energyYesterday: 2.5e9, // 2.50 GJ
            energyThisWeek: 3.5e12, // 3.50 TJ
            energyLastWeek: 4.5e15, // 4.50 PJ
        };
        renderWithMockContext(<SeismicEnergyDisplay />, testValues);
        expect(screen.getByText('15.00 MJ')).toBeInTheDocument();
        expect(screen.getByText('2.50 GJ')).toBeInTheDocument();
        expect(screen.getByText('3.50 TJ')).toBeInTheDocument();
        expect(screen.getByText('4.50 PJ')).toBeInTheDocument();
    });

    it('formats very small energy values as Joules and kJs', () => {
        const testValues = {
            ...mockInitialState,
            energyToday: 500,    // 500 J
            energyYesterday: 1500, // 1.50 kJ
        };
        renderWithMockContext(<SeismicEnergyDisplay />, testValues);
        expect(screen.getByText('500 J')).toBeInTheDocument();
        expect(screen.getByText('1.50 kJ')).toBeInTheDocument();
    });


    it('calculates and displays ratios correctly', () => {
        const testValues = {
            ...mockInitialState,
            energyToday: 1000,
            energyYesterday: 500, // Ratio: 2.00x
            energyThisWeek: 2000,
            energyLastWeek: 1000, // Ratio: 2.00x
        };
        renderWithMockContext(<SeismicEnergyDisplay />, testValues);
        // Custom text matcher for "Factor: 2.00x" where "2.00x" is in a child span
        const factorElements = screen.getAllByText((content, element) => {
            // Check if the element itself or its parent contains "Factor:"
            // and if the element's content is "2.00x" and it's a span
            const parent = element.parentElement;
            const parentText = parent ? parent.textContent : '';
            return parentText.startsWith('Factor:') && content === '2.00x' && element.tagName.toLowerCase() === 'span';
        });
        expect(factorElements.length).toBe(2); // Expect two such elements (daily and weekly)
        factorElements.forEach(el => expect(el).toBeInTheDocument());
    });

    it('handles division by zero when yesterday/last week energy is zero but current is not', () => {
        const testValues = {
            ...mockInitialState,
            energyToday: 1000,
            energyYesterday: 0,
            energyThisWeek: 2000,
            energyLastWeek: 0,
        };
        renderWithMockContext(<SeismicEnergyDisplay />, testValues);
        expect(screen.getAllByText('Significantly more than yesterday')[0]).toBeInTheDocument();
        expect(screen.getAllByText('Significantly more than last week')[0]).toBeInTheDocument();
    });

    it('displays "N/A" for ratio when both current and previous period energies are zero', () => {
        const testValues = {
            ...mockInitialState,
            energyToday: 0,
            energyYesterday: 0,
            energyThisWeek: 0,
            energyLastWeek: 0,
        };
        renderWithMockContext(<SeismicEnergyDisplay />, testValues);
        // For daily, the specific "No significant energy..." message is shown instead of "Factor: N/A" directly under the numbers
        expect(screen.getByText('No significant energy recorded for today or yesterday.')).toBeInTheDocument();
        // For weekly
        expect(screen.getByText('No significant energy recorded for this or last week.')).toBeInTheDocument();
        // Check that "Factor: N/A" is still present due to the logic in todayYesterdayRatio/thisWeekLastWeekRatio for the factor line itself
        const factorElements = screen.queryAllByText((content, element) => {
            // Check if the parent element has the specific class for factor lines
            // and if the content starts with "Factor: N/A"
            const hasFactorClass = element.classList.contains('text-slate-400'); // Or more specific if needed
            const isFactorNA = content.trim() === "Factor: N/A";
            return hasFactorClass && isFactorNA;
        });
        // This test needs refinement if the "No significant energy..." message replaces the "Factor: N/A" line entirely.
        // Based on current JSX, the "Factor: N/A" is still rendered if both are zero, but it's within a conditional block.
        // Let's re-check JSX:
        // {energyYesterday === 0 && energyToday === 0 ? specific_message : general_factor_line }
        // So "Factor: N/A" should NOT be there if both are zero.
        // This assertion was already correct. The specific messages above were the primary change.
        expect(screen.queryByText('Factor: N/A')).not.toBeInTheDocument();
    });


    it('displays an error message if energyComparisonError is provided', () => {
        const errorMessage = "Failed to calculate energy data.";
        const testValues = {
            ...mockInitialState,
            energyComparisonError: errorMessage,
        };
        renderWithMockContext(<SeismicEnergyDisplay />, testValues);
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(`Error:`)).toBeInTheDocument();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
        expect(screen.queryByText('Seismic Energy Release Comparison')).not.toBeInTheDocument();
    });

    it('renders titles and labels correctly', () => {
        renderWithMockContext(<SeismicEnergyDisplay />, mockInitialState);
        expect(screen.getByText('Seismic Energy Release Comparison')).toBeInTheDocument();
        expect(screen.getByText('Daily Energy (Today vs. Yesterday)')).toBeInTheDocument();
        expect(screen.getByText('Weekly Energy (This Week vs. Last Week)')).toBeInTheDocument();
        expect(screen.getByText('Today:')).toBeInTheDocument();
        expect(screen.getByText('Yesterday:')).toBeInTheDocument();
        expect(screen.getByText('This Week:')).toBeInTheDocument();
        expect(screen.getByText('Last Week:')).toBeInTheDocument();
    });
});
