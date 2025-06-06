import { calculatePWaveTravelTime, calculateSWaveTravelTime } from './seismicUtils';
import { vi } from 'vitest';

// Defined constants from seismicUtils.js for verification
const AVERAGE_P_WAVE_VELOCITY_KM_S = 6.5;
const AVERAGE_S_WAVE_VELOCITY_KM_S = 3.75;

describe('seismicUtils', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    // Spy on console.warn before each test
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore the original console.warn after each test
    consoleWarnSpy.mockRestore();
  });

  describe('calculatePWaveTravelTime', () => {
    it('should correctly calculate P-wave travel time for a valid positive distance', () => {
      const distance = 100; // km
      const expectedTime = distance / AVERAGE_P_WAVE_VELOCITY_KM_S;
      expect(calculatePWaveTravelTime(distance)).toBeCloseTo(expectedTime);
    });

    it('should return 0 for zero distance', () => {
      expect(calculatePWaveTravelTime(0)).toBe(0);
    });

    it('should return 0 and log a warning for a negative distance', () => {
      expect(calculatePWaveTravelTime(-50)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: -50. Returning 0.');
    });

    it('should return 0 and log a warning for non-numeric input', () => {
      expect(calculatePWaveTravelTime('abc')).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: abc. Returning 0.');
    });

    it('should return 0 and log a warning for null input', () => {
      expect(calculatePWaveTravelTime(null)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: null. Returning 0.');
    });

    it('should return 0 and log a warning for undefined input', () => {
      expect(calculatePWaveTravelTime(undefined)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: undefined. Returning 0.');
    });
  });

  describe('calculateSWaveTravelTime', () => {
    it('should correctly calculate S-wave travel time for a valid positive distance', () => {
      const distance = 100; // km
      const expectedTime = distance / AVERAGE_S_WAVE_VELOCITY_KM_S;
      expect(calculateSWaveTravelTime(distance)).toBeCloseTo(expectedTime);
    });

    it('should return 0 for zero distance', () => {
      expect(calculateSWaveTravelTime(0)).toBe(0);
    });

    it('should return 0 and log a warning for a negative distance', () => {
      expect(calculateSWaveTravelTime(-75)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: -75. Returning 0.');
    });

    it('should return 0 and log a warning for non-numeric input', () => {
      expect(calculateSWaveTravelTime(true)).toBe(0); // boolean, also non-numeric for this function's purpose
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: true. Returning 0.');
    });

    it('should return 0 and log a warning for an object input', () => {
      expect(calculateSWaveTravelTime({})).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: [object Object]. Returning 0.');
    });
  });
});
