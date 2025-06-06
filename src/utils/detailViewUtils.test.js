import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getBeachballPathsAndType } from './detailViewUtils';
import * as utils from './utils';

// Mock isValidNumber from ../utils.js (adjust path if necessary based on actual structure)
// Assuming detailViewUtils.js and utils.js are in the same directory as per the import in detailViewUtils.js
vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isValidNumber: vi.fn(),
  };
});

describe('getBeachballPathsAndType', () => {
  const R = 50; // Radius
  const C = 60; // Center offset

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior for isValidNumber for most tests
    utils.isValidNumber.mockImplementation(val => typeof val === 'number' && !isNaN(val));
  });

  describe('Invalid Inputs for rake', () => {
    const expectedInvalidOutput = { shadedPaths: [], faultType: 'UNKNOWN', nodalPlanes: [] };

    it('should return UNKNOWN for non-numeric string rake', () => {
      utils.isValidNumber.mockReturnValue(false);
      expect(getBeachballPathsAndType('not a number')).toEqual(expectedInvalidOutput);
      expect(utils.isValidNumber).toHaveBeenCalledWith(NaN); // parseFloat('not a number') is NaN
    });

    it('should return UNKNOWN for null rake', () => {
      utils.isValidNumber.mockReturnValue(false);
      expect(getBeachballPathsAndType(null)).toEqual(expectedInvalidOutput);
      // parseFloat(null) results in NaN, so isValidNumber is called with NaN
      expect(utils.isValidNumber).toHaveBeenCalledWith(NaN);
    });

    it('should return UNKNOWN for undefined rake', () => {
      utils.isValidNumber.mockReturnValue(false);
      expect(getBeachballPathsAndType(undefined)).toEqual(expectedInvalidOutput);
      expect(utils.isValidNumber).toHaveBeenCalledWith(NaN); // parseFloat(undefined) is NaN
    });

    it('should return UNKNOWN for NaN rake', () => {
      utils.isValidNumber.mockReturnValue(false);
      expect(getBeachballPathsAndType(NaN)).toEqual(expectedInvalidOutput);
      // This one was correct, ensuring it stays correct
      expect(utils.isValidNumber).toHaveBeenCalledWith(NaN);
    });
  });

  describe('Fault Type Categories and Paths', () => {
    // Expected paths for STRIKE_SLIP_LIKE (covers STRIKE_SLIP, OBLIQUE_REVERSE, OBLIQUE_NORMAL initial types)
    const strikeSlipLikePaths = {
      shadedPaths: [
        `M${C},${C - R} A${R},${R} 0 0 1 ${C + R},${C} L${C},${C} Z`,
        `M${C},${C + R} A${R},${R} 0 0 1 ${C - R},${C} L${C},${C} Z`
      ],
      nodalPlanes: [
        { type: 'line', x1: C, y1: C - R, x2: C, y2: C + R },
        { type: 'line', x1: C - R, y1: C, x2: C + R, y2: C }
      ],
      faultType: 'STRIKE_SLIP_LIKE'
    };

    const normalPaths = {
      shadedPaths: [
        `M${C},${C-R} C ${C-R*1.5},${C-R*0.5}, ${C-R*1.5},${C+R*0.5}, ${C},${C+R} C ${C-R*0.5},${C+R*0.5}, ${C-R*0.5},${C-R*0.5}, ${C},${C-R} Z`,
        `M${C},${C-R} C ${C+R*1.5},${C-R*0.5}, ${C+R*1.5},${C+R*0.5}, ${C},${C+R} C ${C+R*0.5},${C+R*0.5}, ${C+R*0.5},${C-R*0.5}, ${C},${C-R} Z`
      ],
      nodalPlanes: [
          { type: 'path', d: `M${C-R*0.8},${C-R*0.6} Q${C},${C} ${C-R*0.8},${C+R*0.6}` },
          { type: 'path', d: `M${C+R*0.8},${C-R*0.6} Q${C},${C} ${C+R*0.8},${C+R*0.6}` }
      ],
      faultType: 'NORMAL'
    };

    const reversePaths = {
        shadedPaths: [
            `M${C-R},${C} C ${C-R*0.5},${C-R*1.5}, ${C+R*0.5},${C-R*1.5}, ${C+R},${C} C ${C+R*0.5},${C-R*0.5}, ${C-R*0.5},${C-R*0.5}, ${C-R},${C} Z`,
            `M${C-R},${C} C ${C-R*0.5},${C+R*1.5}, ${C+R*0.5},${C+R*1.5}, ${C+R},${C} C ${C+R*0.5},${C+R*0.5}, ${C-R*0.5},${C+R*0.5}, ${C-R},${C} Z`
        ],
        nodalPlanes: [
            { type: 'path', d: `M${C-R*0.6},${C-R*0.8} Q${C},${C} ${C+R*0.6},${C-R*0.8}` },
            { type: 'path', d: `M${C-R*0.6},${C+R*0.8} Q${C},${C} ${C+R*0.6},${C+R*0.8}` }
        ],
        faultType: 'REVERSE'
    };


    // STRIKE_SLIP (initial) -> STRIKE_SLIP_LIKE (final)
    [0, 20, -20, 160, -160, 180, -180].forEach(rake => {
      it(`should classify rake ${rake} as STRIKE_SLIP_LIKE (initially STRIKE_SLIP)`, () => {
        expect(getBeachballPathsAndType(rake)).toEqual(strikeSlipLikePaths);
      });
    });

    // REVERSE (initial & final)
    [90, 70, 110, 67.5, 112.5].forEach(rake => {
      it(`should classify rake ${rake} as REVERSE`, () => {
        expect(getBeachballPathsAndType(rake)).toEqual(reversePaths);
      });
    });

    // NORMAL (initial & final)
    [-90, -70, -110, -67.5, -112.5].forEach(rake => {
      it(`should classify rake ${rake} as NORMAL`, () => {
        expect(getBeachballPathsAndType(rake)).toEqual(normalPaths);
      });
    });

    // OBLIQUE_REVERSE (initial) -> STRIKE_SLIP_LIKE (final)
    [45, 135, 22.6, 67.4, 112.6, 157.4].forEach(rake => {
      it(`should classify rake ${rake} as STRIKE_SLIP_LIKE (initially OBLIQUE_REVERSE)`, () => {
        expect(getBeachballPathsAndType(rake)).toEqual(strikeSlipLikePaths);
      });
    });

    // OBLIQUE_NORMAL (initial) -> STRIKE_SLIP_LIKE (final)
    [-45, -135, -22.6, -67.4, -112.6, -157.4].forEach(rake => {
      it(`should classify rake ${rake} as STRIKE_SLIP_LIKE (initially OBLIQUE_NORMAL)`, () => {
        expect(getBeachballPathsAndType(rake)).toEqual(strikeSlipLikePaths);
      });
    });
  });

  describe('Boundary Conditions for rake values', () => {
    // Boundaries for STRIKE_SLIP
    it('rake at -22.5 should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(-22.5).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake at 22.5 should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(22.5).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake at 157.5 should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(157.5).faultType).toBe('STRIKE_SLIP_LIKE');
    });
     it('rake > 157.5 (e.g. 157.6) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(157.6).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake < -157.5 (e.g. -157.6) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(-157.6).faultType).toBe('STRIKE_SLIP_LIKE');
    });

    // Boundaries for REVERSE
    it('rake at 67.5 should be REVERSE', () => {
      expect(getBeachballPathsAndType(67.5).faultType).toBe('REVERSE');
    });
    it('rake at 112.5 should be REVERSE', () => {
      expect(getBeachballPathsAndType(112.5).faultType).toBe('REVERSE');
    });

    // Boundaries for NORMAL
    it('rake at -67.5 should be NORMAL', () => {
      expect(getBeachballPathsAndType(-67.5).faultType).toBe('NORMAL');
    });
    it('rake at -112.5 should be NORMAL', () => {
      expect(getBeachballPathsAndType(-112.5).faultType).toBe('NORMAL');
    });

    // Boundaries for OBLIQUE_REVERSE -> STRIKE_SLIP_LIKE
    it('rake just above 22.5 (e.g. 22.6) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(22.6).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake just below 67.5 (e.g. 67.4) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(67.4).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake just above 112.5 (e.g. 112.6) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(112.6).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake just below 157.5 (e.g. 157.4) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(157.4).faultType).toBe('STRIKE_SLIP_LIKE');
    });

    // Boundaries for OBLIQUE_NORMAL -> STRIKE_SLIP_LIKE
    it('rake just below -22.5 (e.g. -22.6) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(-22.6).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake just above -67.5 (e.g. -67.4) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(-67.4).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake just below -112.5 (e.g. -112.6) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(-112.6).faultType).toBe('STRIKE_SLIP_LIKE');
    });
    it('rake just above -157.5 (e.g. -157.4) should be STRIKE_SLIP_LIKE', () => {
      expect(getBeachballPathsAndType(-157.4).faultType).toBe('STRIKE_SLIP_LIKE');
    });
  });

  // The function covers all ranges for valid numbers, so a specific "default" case test for an unhandled valid number isn't applicable.
  // Any valid number will fall into one of the defined categories.
});
