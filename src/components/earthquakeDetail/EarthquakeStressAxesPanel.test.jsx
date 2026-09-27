import React from 'react';
import { render, screen } from '@testing-library/react';
import EarthquakeStressAxesPanel from './EarthquakeStressAxesPanel.jsx';

function pointPosition(name) {
    const point = screen.getByTestId(`${name}-axis-point`);
    return [Number(point.getAttribute('cx')), Number(point.getAttribute('cy'))];
}

describe('earthquake P and T axis orientations', () => {
    it('plots horizontal north and east axes on the corresponding rim', () => {
        render(<EarthquakeStressAxesPanel pAxis={{ azimuth: 0, plunge: 0 }} tAxis={{ azimuth: 90, plunge: 0 }} />);
        const [px, py] = pointPosition('p');
        const [tx, ty] = pointPosition('t');
        expect(px).toBeCloseTo(100);
        expect(py).toBeCloseTo(28);
        expect(tx).toBeCloseTo(172);
        expect(ty).toBeCloseTo(100);
    });

    it('places a vertical axis at the center regardless of azimuth', () => {
        render(<EarthquakeStressAxesPanel pAxis={{ azimuth: 251, plunge: 90 }} />);
        const [x, y] = pointPosition('p');
        expect(x).toBeCloseTo(100);
        expect(y).toBeCloseTo(100);
    });

    it('uses equal-area radius and clockwise azimuth for an oblique axis', () => {
        render(<EarthquakeStressAxesPanel tAxis={{ azimuth: 45, plunge: 30 }} />);
        const [x, y] = pointPosition('t');
        expect(x).toBeCloseTo(136);
        expect(y).toBeCloseTo(64);
    });

    it('moves a point when the supplied axis changes', () => {
        const { rerender } = render(<EarthquakeStressAxesPanel pAxis={{ azimuth: 0, plunge: 0 }} />);
        rerender(<EarthquakeStressAxesPanel pAxis={{ azimuth: 270, plunge: 0 }} />);
        const [x, y] = pointPosition('p');
        expect(x).toBeCloseTo(28);
        expect(y).toBeCloseTo(100);
    });

    it('does not assume a plunge or discard a complete companion axis', () => {
        render(<EarthquakeStressAxesPanel pAxis={{ azimuth: 50 }} tAxis={{ azimuth: 180, plunge: 0 }} />);
        expect(screen.queryByTestId('p-axis-point')).not.toBeInTheDocument();
        expect(screen.getByTestId('t-axis-point')).toBeInTheDocument();
        expect(screen.getByText(/Not plotted: a valid azimuth and plunge/)).toBeInTheDocument();
        expect(screen.getByText(/not direct measurements of regional stress/)).toBeInTheDocument();
    });

    it('does not plot invalid plunge or infinite values', () => {
        render(<EarthquakeStressAxesPanel pAxis={{ azimuth: 0, plunge: 91 }} tAxis={{ azimuth: Infinity, plunge: 30 }} />);
        expect(screen.queryByTestId('p-axis-point')).not.toBeInTheDocument();
        expect(screen.queryByTestId('t-axis-point')).not.toBeInTheDocument();
    });

    it('omits the panel if no axis values are available', () => {
        const { container } = render(<EarthquakeStressAxesPanel pAxis={{ azimuth: NaN, plunge: NaN }} />);
        expect(container).toBeEmptyDOMElement();
    });
});
