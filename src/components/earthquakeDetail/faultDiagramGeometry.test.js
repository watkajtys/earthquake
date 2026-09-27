import { getFaultDiagramGeometry } from './faultDiagramGeometry.js';

describe('fault slip using the USGS strike/dip/rake convention', () => {
    it.each([
        [0, 1], [180, -1], [-180, -1],
    ])('rake %s on a north-striking vertical plane has north slip %s', (rake, north) => {
        const geometry = getFaultDiagramGeometry({ strike: 0, dip: 90, rake });
        expect(geometry.slip).toEqual({ east: 0, north, up: 0 });
        expect(geometry.sectionSlip.x).toBe(0);
        expect(geometry.sectionSlip.y).toBe(0);
        expect(geometry.mapSlip.y).toBe(-north);
    });

    it.each([
        [-90, 1, -1], [90, -1, 1],
    ])('rake %s gives the correct horizontal and vertical hanging-wall motion', (rake, eastSign, upSign) => {
        const geometry = getFaultDiagramGeometry({ strike: 0, dip: 60, rake });
        expect(geometry.slip.east).toBeCloseTo(eastSign * 0.5);
        expect(geometry.slip.north).toBe(0);
        expect(geometry.slip.up).toBeCloseTo(upSign * Math.sqrt(3) / 2);
        expect(geometry.sectionSlip.x).toBeCloseTo(eastSign * 0.5);
        expect(geometry.sectionSlip.y).toBeCloseTo(-geometry.slip.up);
    });

    it('rotates clockwise from north and dips to the right of strike', () => {
        const strikeSlip = getFaultDiagramGeometry({ strike: 90, dip: 90, rake: 0 });
        const normal = getFaultDiagramGeometry({ strike: 90, dip: 45, rake: -90 });
        expect(strikeSlip.slip).toEqual({ east: 1, north: 0, up: 0 });
        expect(normal.dipDirection).toBe(180);
        expect(normal.slip.east).toBe(0);
        expect(normal.slip.north).toBeCloseTo(-Math.SQRT1_2);
        expect(normal.slip.up).toBeCloseTo(-Math.SQRT1_2);
    });

    it('projects continuous oblique slip along the plane without snapping to a fault category', () => {
        const geometry = getFaultDiagramGeometry({ strike: 37, dip: 52, rake: 21 });
        const { east, north, up } = geometry.slip;
        const strike = 37 * Math.PI / 180;
        const dip = 52 * Math.PI / 180;
        const normal = [Math.cos(strike) * Math.sin(dip), -Math.sin(strike) * Math.sin(dip), Math.cos(dip)];
        expect(Math.hypot(east, north, up)).toBeCloseTo(1);
        expect(east * normal[0] + north * normal[1] + up * normal[2]).toBeCloseTo(0);
        expect(up).toBeGreaterThan(0);
        expect(geometry.alongStrike).toBeCloseTo(Math.cos(21 * Math.PI / 180));
    });

    it('preserves a purely vertical slip without inventing a map arrow', () => {
        const geometry = getFaultDiagramGeometry({ strike: 235, dip: 90, rake: -90 });
        expect(geometry.slip).toEqual({ east: 0, north: 0, up: -1 });
        expect(geometry.sectionSlip).toEqual({ x: 0, y: 1 });
    });

    it('allows a horizontal plane and equivalent angle representations', () => {
        const geometry = getFaultDiagramGeometry({ strike: '360', dip: '0', rake: '270' });
        expect(geometry.strike).toBe(0);
        expect(geometry.rake).toBe(-90);
        expect(geometry.slip).toEqual({ east: 1, north: 0, up: 0 });
    });

    it.each([null, undefined, '', ' ', '90garbage', NaN, Infinity, true, []])('rejects missing or invalid rake %s instead of inventing motion', (rake) => {
        expect(getFaultDiagramGeometry({ strike: 0, dip: 45, rake })).toBeNull();
    });

    it.each([-1, 91, null, Infinity])('rejects invalid dip %s', (dip) => {
        expect(getFaultDiagramGeometry({ strike: 0, dip, rake: 0 })).toBeNull();
    });
});
