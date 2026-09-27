import { describe, expect, it } from 'vitest';
import { describeFaultMotion, formatFaultSlipRate, getFaultMapCategory } from './faultMapUtils.js';

describe('fault map information', () => {
    it('retains geological sense for transforms, thrusts, and mixed motion', () => {
        expect(getFaultMapCategory('Dextral_Transform')).toEqual(getFaultMapCategory('Dextral'));
        expect(getFaultMapCategory('Subduction_Thrust')).toEqual(getFaultMapCategory('Reverse'));
        expect(getFaultMapCategory('Reverse-Dextral').label).toBe('Oblique');
        expect(getFaultMapCategory('Normal-Sinistral').label).toBe('Oblique');
        expect(getFaultMapCategory('Spreading_Ridge').label).toBe('Spreading ridge');
        expect(getFaultMapCategory(null).label).toBe('Fold / other / unspecified');
        expect(getFaultMapCategory('Anticline')).toEqual(getFaultMapCategory(null));
    });

    it('expresses lateral movement relative to the observer across the fault', () => {
        expect(describeFaultMotion('Dextral_Transform')).toContain('opposite side moves to your right when looking across');
        expect(describeFaultMotion('Sinistral-Normal')).toContain('opposite side moves to your left when looking across');
        expect(describeFaultMotion('Sinistral-Normal')).toContain('hanging wall moves down relative to the footwall');
        expect(describeFaultMotion('Subduction_Thrust')).toContain('hanging wall moves up relative to the footwall');
        expect(describeFaultMotion('Anticline')).toContain('mapped fold; fault slip sense unspecified');
    });

    it('labels GEM tuple members and their annual units', () => {
        expect(formatFaultSlipRate('(1.55,0.8,2.22)')).toBe('most likely 1.55; minimum 0.8; maximum 2.22 mm/year');
        expect(formatFaultSlipRate('(0.59999999999999998, 0.2, 1.0)')).toBe('most likely 0.6; minimum 0.2; maximum 1 mm/year');
    });

    it('keeps absent bounds distinct from zero slip', () => {
        expect(formatFaultSlipRate('(5.00,,)')).toBe('most likely 5 mm/year');
        expect(formatFaultSlipRate('(0.0,,)')).toBe('most likely 0 mm/year');
        expect(formatFaultSlipRate('(,0.1,0.5)')).toBe('minimum 0.1; maximum 0.5 mm/year');
    });

    it.each([null, '', '(,,)', '(1,2)', '(1,-1,2)', '(1,3,2)', '(Infinity,,)', 'Some slip rate may be on neighboring faults'])('omits unsupported slip rates: %s', value => {
        expect(formatFaultSlipRate(value)).toBeNull();
    });
});
