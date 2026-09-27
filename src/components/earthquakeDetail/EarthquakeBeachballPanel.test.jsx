import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EarthquakeBeachballPanel from './EarthquakeBeachballPanel.jsx';

const props = { np1Data: { strike: 0, dip: 90, rake: 0 }, np2Data: { strike: 90, dip: 90, rake: 180 } };
describe('beachball scientific communication', () => {
    it('does not change the mechanism when the alternative plane is selected', () => {
        const { rerender } = render(<EarthquakeBeachballPanel {...props} selectedFaultPlaneKey="np1" />);
        const before = screen.getByTestId('beachball-compression').getAttribute('d');
        rerender(<EarthquakeBeachballPanel {...props} selectedFaultPlaneKey="np2" />);
        expect(screen.getByTestId('beachball-compression')).toHaveAttribute('d', before);
        expect(screen.getByRole('img')).toHaveAccessibleName(/lower hemisphere, north up and east right/);
        expect(screen.getByText(/does not show non-double-couple/)).toBeInTheDocument();
    });
    it('supports NP2 alone without requiring a moment tensor', () => {
        render(<EarthquakeBeachballPanel np2Data={props.np2Data} />);
        expect(screen.getByTestId('beachball-compression').getAttribute('d')).not.toBe('');
    });
    it('does not invent geometry from partial data', () => {
        const { container } = render(<EarthquakeBeachballPanel np1Data={{ strike: 0, rake: 90 }} />);
        expect(container).toBeEmptyDOMElement();
    });
});
