import React from 'react';
import { render, screen } from '@testing-library/react';
import EarthquakeFaultParamsPanel from './EarthquakeFaultParamsPanel.jsx';

const renderPlane = (plane) => render(<EarthquakeFaultParamsPanel selectedFaultPlaneKey="np1" selectedFaultPlane={plane} />);

function endpoint(line) {
    return [Number(line.getAttribute('x2')), Number(line.getAttribute('y2'))];
}

describe('fault parameter diagrams', () => {
    it.each([
        [0, 90, 37],
        [90, 128, 75],
        [180, 90, 113],
        [270, 52, 75]
    ])('plots strike %s° clockwise from north', (strike, x, y) => {
        renderPlane({ strike, dip: 45 });
        const [actualX, actualY] = endpoint(screen.getByTestId('strike-line'));
        expect(actualX).toBeCloseTo(x);
        expect(actualY).toBeCloseTo(y);
    });

    it('places the dip tick on the right-hand side of a northward strike', () => {
        renderPlane({ strike: 0, dip: 45 });
        expect(endpoint(screen.getByTestId('dip-side-tick'))).toEqual([108, 75]);
        expect(screen.getByText(/Short tick: dip side \(90°\)/)).toBeInTheDocument();
    });

    it.each([[0, 108, 46], [30, 97.2820323, 86], [90, 28, 126]])('draws the actual %s° dip', (dip, x, y) => {
        renderPlane({ dip });
        const [actualX, actualY] = endpoint(screen.getByTestId('dip-line'));
        expect(actualX).toBeCloseTo(x);
        expect(actualY).toBeCloseTo(y);
    });

    it.each([
        [0, 132, 76],
        [90, 90, 34],
        [-90, 90, 118],
        [180, 48, 76],
        [-180, 48, 76],
        [135, 60.3015152, 46.3015152]
    ])('draws rake %s° from strike, positive toward up-dip', (rake, x, y) => {
        renderPlane({ rake });
        const [actualX, actualY] = endpoint(screen.getByTestId('rake-arrow'));
        expect(actualX).toBeCloseTo(x);
        expect(actualY).toBeCloseTo(y);
    });

    it('updates the geometry when the selected nodal plane changes', () => {
        const { rerender } = renderPlane({ strike: 0, dip: 30, rake: -90 });
        rerender(<EarthquakeFaultParamsPanel selectedFaultPlaneKey="np2" selectedFaultPlane={{ strike: 90, dip: 90, rake: 90 }} />);
        expect(screen.getByText('Nodal Plane 2')).toBeInTheDocument();
        expect(endpoint(screen.getByTestId('strike-line'))).toEqual([128, 75]);
        expect(endpoint(screen.getByTestId('rake-arrow'))).toEqual([90, 34]);
        expect(screen.getByText(/do not identify which plane ruptured/)).toBeInTheDocument();
    });

    it('does not invent angles from missing, infinite, or out-of-range parameters', () => {
        const { container } = renderPlane({ strike: Infinity, dip: 95, rake: null });
        expect(container).toBeEmptyDOMElement();
    });

    it('keeps SVG marker references unique across multiple panels', () => {
        const { container } = render(<><EarthquakeFaultParamsPanel selectedFaultPlane={{ strike: 0, rake: 90 }} /><EarthquakeFaultParamsPanel selectedFaultPlane={{ strike: 90, rake: -90 }} /></>);
        const markerIds = Array.from(container.querySelectorAll('marker'), (marker) => marker.id);
        expect(new Set(markerIds).size).toBe(markerIds.length);
    });
});
