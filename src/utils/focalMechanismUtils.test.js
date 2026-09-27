import { describe, it, expect } from 'vitest';
import { beachballGeometry, directionOnFocalSphere, faultVectors, finiteNumber, projectAxis, radiationAmplitude, readAxis, readNodalPlane, selectFocalMechanism } from './focalMechanismUtils.js';

const amplitude = (plane, x, y) => radiationAmplitude(faultVectors(plane), directionOnFocalSphere(x, y));
const properties = (strike = '0', dip = '45', rake = '90', number = 1) => ({
    [`nodal-plane-${number}-strike`]: strike, [`nodal-plane-${number}-dip`]: dip, [`nodal-plane-${number}-rake`]: rake,
});

describe('scientific numeric inputs and coherent solution selection', () => {
    it.each([null, undefined, '', ' ', '12deg', Infinity, true, []])('rejects invalid value %s', value => {
        expect(finiteNumber(value)).toBeNaN();
    });
    it('preserves true zero and supports numeric USGS strings', () => {
        expect(finiteNumber('0')).toBe(0);
        expect(finiteNumber('1.2e+19')).toBe(1.2e19);
        expect(readNodalPlane(properties('0', '0', '0'), 1)).toEqual({ strike: 0, dip: 0, rake: 0 });
    });
    it('validates angle ranges and supports the documented slip alias', () => {
        expect(readNodalPlane(properties('361', '91', '-181'), 1)).toEqual({ strike: NaN, dip: NaN, rake: NaN });
        expect(readNodalPlane({ ...properties(), 'nodal-plane-1-rake': undefined, 'nodal-plane-1-slip': '-90' }, 1).rake).toBe(-90);
        expect(readAxis({ 'p-axis-azimuth': '0', 'p-axis-plunge': '91' }, 'p')).toEqual({ azimuth: 0, plunge: NaN });
    });
    it('falls back to a focal-only solution without mixing tensor axes', () => {
        const focal = { properties: properties(), source: 'ci' };
        const selected = selectFocalMechanism({ 'moment-tensor': [{ properties: { 'p-axis-azimuth': '180' } }], 'focal-mechanism': [focal] });
        expect(selected.type).toBe('focal-mechanism');
        expect(selected.properties).toBe(focal.properties);
        expect(readAxis(selected.properties, 'p').azimuth).toBeNaN();
    });
    it('keeps preferred complete tensor, skips deleted products, and accepts NP2 only', () => {
        const preferred = { properties: properties('120', '30', '90', 2) };
        const selected = selectFocalMechanism({ 'moment-tensor': [{ status: 'DELETE', properties: properties() }, preferred], 'focal-mechanism': [{ properties: properties() }] });
        expect(selected.properties).toBe(preferred.properties);
    });
});

describe('equal-area projection', () => {
    it('puts horizontal north/east at rim and vertical at center', () => {
        expect(projectAxis({ azimuth: 0, plunge: 0 })).toEqual({ x: 60, y: 10 });
        expect(projectAxis({ azimuth: 90, plunge: 0 })).toEqual({ x: 110, y: 60 });
        expect(projectAxis({ azimuth: 123, plunge: 90 })).toEqual({ x: 60, y: 60 });
        expect(projectAxis({ azimuth: 0, plunge: 30 }).y).toBeCloseTo(60 - 50 / Math.sqrt(2));
    });
    it('folds upper-hemisphere axes and refuses unknown plunge', () => {
        expect(projectAxis({ azimuth: 0, plunge: -30 }).y).toBeCloseTo(60 + 50 / Math.sqrt(2));
        expect(projectAxis({ azimuth: 0 })).toBeNull();
        expect(projectAxis()).toBeNull();
    });
    it('inverse maps center down and perimeter north/east to horizontal unit vectors', () => {
        expect(directionOnFocalSphere(0, 0)).toEqual([-0, 0, 1]);
        expect(directionOnFocalSphere(0, -1)).toEqual([1, 0, 0]);
        expect(directionOnFocalSphere(1, 0)).toEqual([-0, 1, 0]);
        expect(directionOnFocalSphere(1, 1)).toBeNull();
    });
});

describe('double-couple beachball polarity and geometry', () => {
    it('shades the center for reverse and leaves it white for normal faulting', () => {
        expect(amplitude({ strike: 0, dip: 45, rake: 90 }, 0, 0)).toBeCloseTo(1);
        expect(amplitude({ strike: 0, dip: 45, rake: -90 }, 0, 0)).toBeCloseTo(-1);
        expect(amplitude({ strike: 0, dip: 45, rake: 90 }, 0.99, 0)).toBeLessThan(0);
        expect(amplitude({ strike: 0, dip: 45, rake: -90 }, 0.99, 0)).toBeGreaterThan(0);
    });
    it('reverses quadrants between left- and right-lateral north-striking faults', () => {
        for (const [x, y, sign] of [[0.5, -0.5, 1], [-0.5, -0.5, -1], [-0.5, 0.5, 1], [0.5, 0.5, -1]]) {
            expect(Math.sign(amplitude({ strike: 0, dip: 90, rake: 0 }, x, y))).toBe(sign);
            expect(Math.sign(amplitude({ strike: 0, dip: 90, rake: 180 }, x, y))).toBe(-sign);
        }
    });
    it('gives the same radiation for equivalent alternative nodal planes', () => {
        for (const [one, two] of [
            [{ strike: 0, dip: 90, rake: 0 }, { strike: 90, dip: 90, rake: 180 }],
            [{ strike: 0, dip: 30, rake: 90 }, { strike: 180, dip: 60, rake: 90 }],
            [{ strike: 0, dip: 30, rake: -90 }, { strike: 180, dip: 60, rake: -90 }],
        ]) {
            for (const [x, y] of [[0, 0], [0.2, -0.6], [-0.6, 0.4], [0.8, 0.1]]) {
                expect(amplitude(one, x, y)).toBeCloseTo(amplitude(two, x, y), 10);
            }
            expect(beachballGeometry(one).shadedPath).toBe(beachballGeometry(two).shadedPath);
        }
    });
    it('uses dip and oblique rake continuously instead of fixed templates', () => {
        const shallow = beachballGeometry({ strike: 12, dip: 20, rake: 40 });
        const steep = beachballGeometry({ strike: 12, dip: 75, rake: 40 });
        const oblique = beachballGeometry({ strike: 12, dip: 20, rake: 55 });
        expect(shallow.shadedPath).not.toBe(steep.shadedPath);
        expect(shallow.shadedPath).not.toBe(oblique.shadedPath);
        expect(shallow.nodalPaths).not.toEqual(steep.nodalPaths);
        expect(beachballGeometry({ strike: 0, rake: 0 })).toBeNull();
    });
    it('keeps all projected nodal points inside the focal circle', () => {
        for (const dip of [0, 1, 45, 89, 90]) {
            const { nodalPaths } = beachballGeometry({ strike: 123, dip, rake: -37 });
            for (const path of nodalPaths) {
                for (const match of path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)) {
                    expect(Math.hypot(Number(match[1]) - 60, Number(match[2]) - 60)).toBeLessThanOrEqual(50.001);
                }
            }
        }
    });
});
