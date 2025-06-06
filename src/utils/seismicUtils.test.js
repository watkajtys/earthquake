import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { calculatePWaveTravelTime, calculateSWaveTravelTime } from './seismicUtils';

// Constants from the source file (for verification)
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
    it('should calculate travel time for a valid positive distance', () => {
      const distance = 100;
      const expectedTime = distance / AVERAGE_P_WAVE_VELOCITY_KM_S;
      expect(calculatePWaveTravelTime(distance)).toBeCloseTo(expectedTime);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return 0 for a distance of 0', () => {
      expect(calculatePWaveTravelTime(0)).toBe(0);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return 0 and warn for a negative distance', () => {
      expect(calculatePWaveTravelTime(-100)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: -100. Returning 0.');
    });

    it('should return 0 and warn for string input', () => {
      expect(calculatePWaveTravelTime('abc')).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: abc. Returning 0.');
    });

    it('should return 0 and warn for null input', () => {
      expect(calculatePWaveTravelTime(null)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: null. Returning 0.');
    });

    it('should return 0 and warn for undefined input', () => {
      expect(calculatePWaveTravelTime(undefined)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: undefined. Returning 0.');
    });

    // This test is based on the subtask's expectation.
    // The current implementation will return NaN and not warn.
    it('should return 0 and warn for NaN input (subtask expectation)', () => {
      expect(calculatePWaveTravelTime(NaN)).toBe(0); // Current code returns NaN
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: NaN. Returning 0.'); // Current code does not warn
    });
  });

  describe('calculateSWaveTravelTime', () => {
    it('should calculate travel time for a valid positive distance', () => {
      const distance = 100;
      const expectedTime = distance / AVERAGE_S_WAVE_VELOCITY_KM_S;
      expect(calculateSWaveTravelTime(distance)).toBeCloseTo(expectedTime);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return 0 for a distance of 0', () => {
      expect(calculateSWaveTravelTime(0)).toBe(0);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return 0 and warn for a negative distance', () => {
      expect(calculateSWaveTravelTime(-100)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: -100. Returning 0.');
    });

    it('should return 0 and warn for string input', () => {
      expect(calculateSWaveTravelTime('abc')).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: abc. Returning 0.');
    });

    it('should return 0 and warn for null input', () => {
      expect(calculateSWaveTravelTime(null)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: null. Returning 0.');
    });

    it('should return 0 and warn for undefined input', () => {
      expect(calculateSWaveTravelTime(undefined)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: undefined. Returning 0.');
    });

    // This test is based on the subtask's expectation.
    // The current implementation will return NaN and not warn.
    it('should return 0 and warn for NaN input (subtask expectation)', () => {
      expect(calculateSWaveTravelTime(NaN)).toBe(0); // Current code returns NaN
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid distanceKm: NaN. Returning 0.'); // Current code does not warn
    });
  });
});
