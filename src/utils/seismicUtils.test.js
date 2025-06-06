import { describe, it, expect, vi } from 'vitest';
import { calculatePWaveTravelTime, calculateSWaveTravelTime, calculateEnergyFromMagnitude, sumEnergyForEarthquakes } from './seismicUtils';

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

  describe('calculateEnergyFromMagnitude', () => {
    it('should calculate energy for a valid magnitude', () => {
      const magnitude = 5;
      // E = 10^(1.5 * 5 + 4.8) = 10^(7.5 + 4.8) = 10^12.3
      const expectedEnergy = Math.pow(10, 1.5 * magnitude + 4.8);
      expect(calculateEnergyFromMagnitude(magnitude)).toBeCloseTo(expectedEnergy);
    });

    it('should return 0 for null magnitude', () => {
      expect(calculateEnergyFromMagnitude(null)).toBe(0);
    });

    it('should return 0 for non-numeric magnitude', () => {
      expect(calculateEnergyFromMagnitude('not a number')).toBe(0);
    });

    it('should return 0 for NaN magnitude', () => {
      expect(calculateEnergyFromMagnitude(NaN)).toBe(0);
    });
  });

  describe('sumEnergyForEarthquakes', () => {
    it('should sum energies for an array of earthquakes with valid magnitudes', () => {
      const earthquakes = [
        { properties: { mag: 5 } },
        { properties: { mag: 6 } },
      ];
      const energy1 = Math.pow(10, 1.5 * 5 + 4.8);
      const energy2 = Math.pow(10, 1.5 * 6 + 4.8);
      const expectedTotalEnergy = energy1 + energy2;
      expect(sumEnergyForEarthquakes(earthquakes)).toBeCloseTo(expectedTotalEnergy);
    });

    it('should return 0 for an empty array', () => {
      expect(sumEnergyForEarthquakes([])).toBe(0);
    });

    it('should return 0 for non-array input', () => {
      expect(sumEnergyForEarthquakes('not an array')).toBe(0);
      expect(sumEnergyForEarthquakes(null)).toBe(0);
      expect(sumEnergyForEarthquakes(undefined)).toBe(0);
      expect(sumEnergyForEarthquakes({})).toBe(0);
    });

    it('should skip earthquakes with null or invalid magnitudes and sum valid ones', () => {
      const earthquakes = [
        { properties: { mag: 5 } },
        { properties: { mag: null } },
        { properties: { mag: 'invalid' } },
        { properties: { mag: 4 } },
        { properties: {} }, // missing mag
        {}, // missing properties
        null, // invalid earthquake object
      ];
      const energy1 = Math.pow(10, 1.5 * 5 + 4.8);
      const energy2 = Math.pow(10, 1.5 * 4 + 4.8);
      const expectedTotalEnergy = energy1 + energy2;
      expect(sumEnergyForEarthquakes(earthquakes)).toBeCloseTo(expectedTotalEnergy);
    });

     it('should handle earthquakes with magnitude 0 correctly', () => {
      const earthquakes = [{ properties: { mag: 0 } }];
      const expectedEnergy = Math.pow(10, 1.5 * 0 + 4.8);
      expect(sumEnergyForEarthquakes(earthquakes)).toBeCloseTo(expectedEnergy);
    });

    it('should handle earthquakes with negative magnitudes correctly (energy will be small but calculable)', () => {
      const earthquakes = [{ properties: { mag: -1 } }];
      const expectedEnergy = Math.pow(10, 1.5 * -1 + 4.8); // 10^(3.3)
      expect(sumEnergyForEarthquakes(earthquakes)).toBeCloseTo(expectedEnergy);
    });
  });
});
