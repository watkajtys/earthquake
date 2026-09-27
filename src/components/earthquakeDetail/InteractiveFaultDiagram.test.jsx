import React from 'react';
import { render, screen } from '@testing-library/react';
import InteractiveFaultDiagram from './InteractiveFaultDiagram.jsx';
import EarthquakeFaultDiagramPanel from './EarthquakeFaultDiagramPanel.jsx';

const endpoints = (element) => ({
    dx: Number(element.getAttribute('x2')) - Number(element.getAttribute('x1')),
    dy: Number(element.getAttribute('y2')) - Number(element.getAttribute('y1')),
});

describe('fault movement views', () => {
    it('draws north-striking left-lateral motion along the fault, not across it', () => {
        render(<InteractiveFaultDiagram planeData={{ strike: 0, dip: 90, rake: 0 }} planeKey="np1"/>);
        expect(endpoints(screen.getByTestId('fault-map-slip'))).toEqual({ dx: 0, dy: -60 });
        expect(screen.queryByTestId('fault-section-slip')).not.toBeInTheDocument();
        expect(screen.getByText('Slip is along strike, out of this section')).toBeInTheDocument();
    });

    it('draws normal movement down the actual dip and shows only its horizontal part on the map', () => {
        render(<InteractiveFaultDiagram planeData={{ strike: 0, dip: 60, rake: -90 }} planeKey="np1"/>);
        const mapArrow = endpoints(screen.getByTestId('fault-map-slip'));
        const sectionArrow = endpoints(screen.getByTestId('fault-section-slip'));
        expect(mapArrow.dx).toBeCloseTo(30);
        expect(mapArrow.dy).toBe(0);
        expect(sectionArrow.dx).toBeCloseTo(30);
        expect(sectionArrow.dy).toBeCloseTo(30 * Math.sqrt(3));
        expect(screen.getByTestId('fault-section-plane').parentElement).toHaveAttribute('transform', 'rotate(60 150 137)');
    });

    it('omits the map arrow for purely vertical movement', () => {
        render(<InteractiveFaultDiagram planeData={{ strike: 20, dip: 90, rake: 90 }} planeKey="np2"/>);
        expect(screen.queryByTestId('fault-map-slip')).not.toBeInTheDocument();
        expect(screen.getByText('No horizontal slip component')).toBeInTheDocument();
        expect(endpoints(screen.getByTestId('fault-section-slip')).dy).toBe(-60);
    });

    it('does not imply a surface trace for a horizontal plane', () => {
        render(<InteractiveFaultDiagram planeData={{ strike: 0, dip: 0, rake: -90 }} planeKey="np1"/>);
        expect(screen.queryByTestId('fault-map-trace')).not.toBeInTheDocument();
        expect(screen.getByText('Horizontal plane: no unique map trace')).toBeInTheDocument();
    });

    it('shows an unavailable state instead of making up a missing rake', () => {
        render(<InteractiveFaultDiagram planeData={{ strike: 0, dip: 45 }} planeKey="np1"/>);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.getByText(/Slip diagram unavailable/)).toBeInTheDocument();
    });

    it('keeps arrow and clipping references unique across displayed diagrams', () => {
        const planeData = { strike: 0, dip: 45, rake: -90 };
        const { container } = render(<><InteractiveFaultDiagram planeData={planeData} planeKey="np1"/><InteractiveFaultDiagram planeData={planeData} planeKey="np2"/></>);
        const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('describes nodal planes as alternatives and exposes the active selection', () => {
        const plane = { strike: 0, dip: 45, rake: -90 };
        render(<EarthquakeFaultDiagramPanel selectedFaultPlane={plane} selectedFaultPlaneKey="np2" np1Data={plane} np2Data={plane}/>);
        expect(screen.getByText(/Additional evidence is needed to identify which plane slipped/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Nodal Plane 2' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Nodal Plane 1' })).toHaveAttribute('aria-pressed', 'false');
    });
});
