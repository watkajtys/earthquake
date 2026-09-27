import { describe, expect, it } from 'vitest';
import { estimateRadiatedEnergyJoules } from './earthquakeEnergy.js';

describe('estimateRadiatedEnergyJoules', () => {
    it('matches the USGS energy scale for small and large earthquakes', () => {
        // USGS reference table rounds M -1 to 2,000 J and M 6 to 63.1 trillion J.
        expect(estimateRadiatedEnergyJoules(-1)).toBeCloseTo(1995.2623, 3);
        expect(estimateRadiatedEnergyJoules(6) / 1e12).toBeCloseTo(63.0957, 3);
        expect(estimateRadiatedEnergyJoules(0)).toBeGreaterThan(0);
    });

    it('scales by about 32 for a one-unit magnitude increase', () => {
        expect(estimateRadiatedEnergyJoules(6) / estimateRadiatedEnergyJoules(5)).toBeCloseTo(31.6228, 3);
    });

    it.each([null, undefined, '', '6', NaN, Infinity, -Infinity, 1e6, -1e6])(
        'does not invent an energy estimate for invalid or unrepresentable magnitude %s',
        magnitude => {
            expect(estimateRadiatedEnergyJoules(magnitude)).toBeNaN();
        }
    );
});
