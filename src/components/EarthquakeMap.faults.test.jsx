import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import EarthquakeMap from './EarthquakeMap';

const { faultLayers, map } = vi.hoisted(() => ({
    faultLayers: [],
    map: { setView: vi.fn(), invalidateSize: vi.fn() },
}));

vi.mock('../assets/TectonicPlateBoundaries.json', () => ({ default: { type: 'FeatureCollection', features: [] } }));
vi.mock('../assets/gem_active_faults_display.json', () => ({
    default: {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { name: 'Test transform', slip_type: 'Dextral_Transform', net_slip_rate: '(1.55,0.8,2.22)', catalog_name: 'Test catalog' },
            geometry: { type: 'LineString', coordinates: [[-118.2, 34], [-118.1, 34.1]] },
        }],
    },
}));
vi.mock('react-leaflet', () => ({
    MapContainer: React.forwardRef(({ children }, ref) => {
        React.useImperativeHandle(ref, () => map);
        return <div>{children}</div>;
    }),
    TileLayer: () => null,
    Marker: ({ children }) => <div>{children}</div>,
    CircleMarker: ({ children }) => <div>{children}</div>,
    Popup: ({ children }) => <div>{children}</div>,
    GeoJSON: ({ data, style, onEachFeature }) => {
        if (onEachFeature) {
            data.features.forEach(feature => {
                const layer = { bindPopup: vi.fn() };
                onEachFeature(feature, layer);
                faultLayers.push({ style: style(feature), popup: layer.bindPopup.mock.calls[0][0] });
            });
        }
        return <div data-testid="fault-layer" />;
    },
    useMap: () => map,
}));

describe('mapped fault popups', () => {
    it('shows observer-relative motion, annual rate bounds, and geological context', async () => {
        render(<MemoryRouter><EarthquakeMap mapCenterLatitude={34} mapCenterLongitude={-118.2} /></MemoryRouter>);
        await screen.findAllByTestId('fault-layer');
        await waitFor(() => expect(faultLayers.length).toBeGreaterThan(0));
        const { style, popup } = faultLayers.at(-1);
        expect(style.color).toBe('#0284c7');
        expect(popup.textContent).toContain('opposite side moves to your right when looking across the fault');
        expect(popup.textContent).toContain('most likely 1.55; minimum 0.8; maximum 2.22 mm/year');
        expect(popup.textContent).toContain('Proximity does not establish which fault ruptured');
        expect(popup.textContent).not.toContain('(1.55,0.8,2.22)');
    });
});
