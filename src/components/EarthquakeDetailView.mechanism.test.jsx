import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { describe, it, expect, vi } from 'vitest';
import EarthquakeDetailView from './EarthquakeDetailView.jsx';

vi.mock('./earthquakeDetail/EarthquakeRegionalMapPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeSeismicWavesPanel', () => ({ default: () => null }));
const onClose = vi.fn();
const url = id => `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`;
const plane = (number, strike, dip, rake) => ({
    [`nodal-plane-${number}-strike`]: `${strike}`, [`nodal-plane-${number}-dip`]: `${dip}`, [`nodal-plane-${number}-rake`]: `${rake}`,
});
function fixture(id, products) {
    return { id, geometry: { coordinates: [0, 0, 10] }, properties: { title: id, mag: 6, magType: 'mw', time: 1600000000000, products } };
}
function serve(data) {
    server.use(http.get(`/api/earthquake/${data.id}`, () => HttpResponse.json(data)));
}

describe('event-specific mechanism data integration', () => {
    it('renders focal-only NP2 and resets an explicit plane selection on a new event', async () => {
        serve(fixture('both', { 'focal-mechanism': [{ source: 'ci', properties: { ...plane(1, 0, 90, 0), ...plane(2, 90, 90, 180) } }] }));
        serve(fixture('second', { 'focal-mechanism': [{ source: 'ci', properties: plane(2, 180, 45, -90) }] }));
        const { rerender } = render(<EarthquakeDetailView detailUrl={url('both')} onClose={onClose} />);
        await screen.findByRole('button', { name: 'Nodal Plane 1' });
        expect(screen.getByRole('button', { name: 'Nodal Plane 1' })).toHaveAttribute('aria-pressed', 'true');
        const beachball = screen.getByTestId('beachball-compression').getAttribute('d');
        fireEvent.click(screen.getByRole('button', { name: 'Nodal Plane 2' }));
        expect(screen.getByRole('button', { name: 'Nodal Plane 2' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('beachball-compression')).toHaveAttribute('d', beachball);
        rerender(<EarthquakeDetailView detailUrl={url('second')} onClose={onClose} />);
        await screen.findByRole('heading', { name: 'second' });
        expect(screen.getByRole('button', { name: 'Nodal Plane 2' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('beachball-compression').getAttribute('d')).not.toBe(beachball);
        expect(screen.getByText(/focal mechanism, CI/)).toBeInTheDocument();
    });
    it('lets a user inspect an incomplete alternative without inventing its motion', async () => {
        serve(fixture('partial', { 'moment-tensor': [{ properties: { ...plane(2, 90, 90, 180), 'nodal-plane-1-strike': '0' } }] }));
        render(<EarthquakeDetailView detailUrl={url('partial')} onClose={onClose} />);
        await screen.findByRole('button', { name: 'Nodal Plane 1' });
        expect(screen.getByRole('button', { name: 'Nodal Plane 2' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Nodal Plane 1' }));
        expect(screen.getByRole('button', { name: 'Nodal Plane 1' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText(/Slip diagram unavailable/)).toBeInTheDocument();
        expect(screen.queryByTestId('fault-map-slip')).not.toBeInTheDocument();
    });
    it('keeps seismic moment separate from the magnitude-based radiated energy estimate', async () => {
        serve(fixture('energy', { 'moment-tensor': [{ properties: { 'scalar-moment': '1e20' } }] }));
        render(<EarthquakeDetailView detailUrl={url('energy')} onClose={onClose} />);
        await screen.findByRole('heading', { name: 'energy' });
        expect(screen.getByRole('row', { name: /Estimated Radiated Energy/ })).toHaveTextContent('~63.1 trillion J (from magnitude)');
        expect(screen.getByText(/Reported scalar seismic moment:/)).toHaveTextContent('N·m');
        expect(screen.queryByTestId('beachball-svg-container')).not.toBeInTheDocument();
    });
});
