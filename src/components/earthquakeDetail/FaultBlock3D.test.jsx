import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import FaultBlock3D from './FaultBlock3D.jsx';

const plane = { strike: 32, dip: 60, rake: -90 };

afterEach(() => vi.restoreAllMocks());

describe('interactive 3D fault block', () => {
    it('exposes labeled keyboard controls and distinguishes illustrative slip from measurements', async () => {
        const { container } = render(<FaultBlock3D planeData={plane} planeKey="np1"/>);
        expect(screen.getByRole('img', { name: /Nodal plane 1: rotatable 3D fault block/ })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: /View azimuth/ })).toHaveValue('167');
        expect(screen.getByRole('slider', { name: /View elevation/ })).toHaveValue('28');
        expect(screen.getByText(/not a surface rupture reconstruction or a displacement estimate/)).toBeInTheDocument();
        expect(screen.getByText(/hanging wall \(above the plane\)/)).toBeInTheDocument();
        expect(await axe(container)).toHaveNoViolations();
    });

    it('scrubs slip, restores it, and offers north-up and along-strike views', () => {
        render(<FaultBlock3D planeData={plane} planeKey="np2"/>);
        fireEvent.change(screen.getByRole('slider', { name: /Illustrative slip/ }), { target: { value: '75' } });
        expect(screen.getByTestId('fault-block-3d')).toHaveAttribute('data-slip', '0.75');
        fireEvent.click(screen.getByRole('button', { name: 'North-up top view' }));
        expect(screen.getByRole('slider', { name: /View azimuth/ })).toHaveValue('180');
        expect(screen.getByRole('slider', { name: /View elevation/ })).toHaveValue('90');
        fireEvent.click(screen.getByRole('button', { name: 'Along strike' }));
        expect(screen.getByRole('slider', { name: /View azimuth/ })).toHaveValue('212');
        fireEvent.click(screen.getByRole('button', { name: 'Reset slip' }));
        expect(screen.getByTestId('fault-block-3d')).toHaveAttribute('data-slip', '0');
    });

    it('allows manual exploration with motion disabled and never autoplays', () => {
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
        render(<FaultBlock3D planeData={plane} planeKey="np1"/>);
        expect(screen.getByRole('button', { name: 'Play slip' })).toBeDisabled();
        expect(screen.getByText(/Reduced motion is enabled/)).toBeInTheDocument();
        fireEvent.change(screen.getByRole('slider', { name: /Illustrative slip/ }), { target: { value: '100' } });
        expect(screen.getByTestId('fault-block-3d')).toHaveAttribute('data-slip', '1');
    });

    it('starts and cancels animation on user input', () => {
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
        const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(41);
        const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
        render(<FaultBlock3D planeData={plane} planeKey="np1"/>);
        expect(request).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Play slip' }));
        expect(request).toHaveBeenCalledOnce();
        expect(screen.getByRole('button', { name: 'Pause slip' })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('slider', { name: /Illustrative slip/ }), { target: { value: '40' } });
        expect(cancel).toHaveBeenCalledWith(41);
        expect(screen.getByRole('button', { name: 'Play slip' })).toBeInTheDocument();
    });

    it('does not call the sides hanging wall and footwall on a vertical fault', () => {
        render(<FaultBlock3D planeData={{ strike: 0, dip: 90, rake: 0 }} planeKey="np1"/>);
        expect(screen.getByText(/A: right side facing along strike/)).toBeInTheDocument();
        expect(screen.getByText(/A vertical fault has no distinct hanging wall or footwall/)).toBeInTheDocument();
    });

    it('withholds geometry when the mechanism is incomplete', () => {
        render(<FaultBlock3D planeData={{ strike: 0, dip: 45 }} planeKey="np1"/>);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.getByText(/3D fault model unavailable/)).toBeInTheDocument();
    });
});
