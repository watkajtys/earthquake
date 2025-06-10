import { describe, it, expect, vi } from 'vitest';
import { calculatePWaveTravelTime, calculateSWaveTravelTime } from './seismicUtils';

// Constants from the source file for verification
const AVERAGE_P_WAVE_VELOCITY_KM_S = 6.5;
const AVERAGE_S_WAVE_VELOCITY_KM_S = 3.75;

describe('seismicUtils', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    // Spy on console.warn to check for warnings on invalid input
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console.warn
    consoleWarnSpy.mockRestore();
  });

  describe('calculatePWaveTravelTime', () => {
    it('should calculate P-wave travel time for a valid positive distance', () => {
      const distance = 100; // km
      const expectedTime = distance / AVERAGE_P_WAVE_VELOCITY_KM_S;
      expect(calculatePWaveTravelTime(distance)).toBeCloseTo(expectedTime);
    });

    it('should return 0 for a distance of 0 km', () => {
      expect(calculatePWaveTravelTime(0)).toBe(0);
    });

    it('should return 0 and log a warning for a negative distance', () => {
      const distance = -50;
      expect(calculatePWaveTravelTime(distance)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid distanceKm: ${distance}. Returning 0.`);
    });

    it('should return 0 and log a warning for a non-numeric distance', () => {
      const distance = 'not a number';
      expect(calculatePWaveTravelTime(distance)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid distanceKm: ${distance}. Returning 0.`);
    });

    it('should return 0 and log a warning for null distance', () => {
      const distance = null;
      expect(calculatePWaveTravelTime(distance)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid distanceKm: ${distance}. Returning 0.`);
    });

    it('should return 0 and log a warning for undefined distance', () => {
      const distance = undefined;
      expect(calculatePWaveTravelTime(distance)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid distanceKm: ${distance}. Returning 0.`);
    });
  });

  describe('calculateSWaveTravelTime', () => {
    it('should calculate S-wave travel time for a valid positive distance', () => {
      const distance = 100; // km
      const expectedTime = distance / AVERAGE_S_WAVE_VELOCITY_KM_S;
      expect(calculateSWaveTravelTime(distance)).toBeCloseTo(expectedTime);
    });

    it('should return 0 for a distance of 0 km', () => {
      expect(calculateSWaveTravelTime(0)).toBe(0);
    });

    it('should return 0 and log a warning for a negative distance', () => {
      const distance = -50;
      expect(calculateSWaveTravelTime(distance)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid distanceKm: ${distance}. Returning 0.`);
    });

    it('should return 0 and log a warning for a non-numeric distance', () => {
      const distance = 'a string';
      expect(calculateSWaveTravelTime(distance)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid distanceKm: ${distance}. Returning 0.`);
    });

    it('should return 0 and log a warning for null distance', () => {
      const distance = null;
      expect(calculateSWaveTravelTime(distance)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid distanceKm: ${distance}. Returning 0.`);
    });

    it('should return 0 and log a warning for undefined distance', () => {
      const distance = undefined;
      expect(calculateSWaveTravelTime(distance)).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Invalid distanceKm: ${distance}. Returning 0.`);
    });
  });
});
