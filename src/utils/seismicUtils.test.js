import { calculateGreatCircleDistance, calculateHypocentralDistance } from './seismicUtils';

describe('seismicUtils', () => {
  describe('calculateGreatCircleDistance', () => {
    // Test case 1: Distance between North Pole and South Pole
    test('should return the correct distance between North Pole and South Pole', () => {
      const lat1 = 90; // North Pole
      const lon1 = 0;
      const lat2 = -90; // South Pole
      const lon2 = 0;
      // Expected distance is roughly half the Earth's circumference
      const expectedDistance = Math.PI * 6371;
      expect(calculateGreatCircleDistance(lat1, lon1, lat2, lon2)).toBeCloseTo(expectedDistance, 0);
    });

    // Test case 2: Distance between two known cities (e.g., London and Paris)
    // Coordinates for London: 51.5074° N, 0.1278° W
    // Coordinates for Paris: 48.8566° N, 2.3522° E
    test('should return the correct distance between London and Paris', () => {
      const lat1 = 51.5074;
      const lon1 = -0.1278;
      const lat2 = 48.8566;
      const lon2 = 2.3522;
      const expectedDistance = 343.5; // Approximate distance in km
      expect(calculateGreatCircleDistance(lat1, lon1, lat2, lon2)).toBeCloseTo(expectedDistance, 0);
    });

    // Test case 3: Zero distance (same point)
    test('should return 0 for the same point', () => {
      const lat1 = 40.7128; // New York
      const lon1 = -74.0060;
      expect(calculateGreatCircleDistance(lat1, lon1, lat1, lon1)).toBe(0);
    });

    // Test case 4: Points on the equator (e.g., 0°N, 0°E and 0°N, 90°E)
    // This is a quarter of the Earth's circumference at the equator
    test('should return the correct distance for points on the equator', () => {
      const lat1 = 0;
      const lon1 = 0;
      const lat2 = 0;
      const lon2 = 90;
      const expectedDistance = (Math.PI * 6371) / 2;
      expect(calculateGreatCircleDistance(lat1, lon1, lat2, lon2)).toBeCloseTo(expectedDistance, 0);
    });

    // Test with some other values
    test('should calculate distance correctly for arbitrary points', () => {
      // Distance from (34, -118) to (36, -116) is approx 287.46 km
      expect(calculateGreatCircleDistance(34, -118, 36, -116)).toBeCloseTo(287.5, 1);
    });
  });

  describe('calculateHypocentralDistance', () => {
    const stationLat = 35.0;
    const stationLon = -110.0;

    // Test case 1: Earthquake at 0 depth
    test('should equal surface distance if depth is 0', () => {
      const earthquake = {
        geometry: { coordinates: [-115, 33, 0] }, // lon, lat, depth
      };
      const surfaceDistance = calculateGreatCircleDistance(
        earthquake.geometry.coordinates[1],
        earthquake.geometry.coordinates[0],
        stationLat,
        stationLon
      );
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeCloseTo(surfaceDistance, 5);
    });

    // Test case 2: Known earthquake depth and surface distance
    test('should calculate hypocentral distance correctly for known depth and surface distance', () => {
      const earthquake = {
        geometry: { coordinates: [-112, 34, 10] }, // lon, lat, depth = 10km
      };
      // Surface distance for these points (calculated separately or using the other function)
      // Roughly: calculateGreatCircleDistance(34, -112, 35, -110) is approx 246.5 km
      const surfaceDistance = calculateGreatCircleDistance(34, -112, stationLat, stationLon);
      const depth = 10;
      const expectedHypocentralDistance = Math.sqrt(surfaceDistance ** 2 + depth ** 2);
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeCloseTo(expectedHypocentralDistance, 0);
    });

    // Test case 3: Invalid earthquake data - missing geometry
    test('should return NaN if earthquake.geometry is missing', () => {
      const earthquake = {}; // Missing geometry
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeNaN();
    });

    // Test case 4: Invalid earthquake data - missing coordinates
    test('should return NaN if earthquake.geometry.coordinates is missing', () => {
      const earthquake = {
        geometry: {}, // Missing coordinates
      };
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeNaN();
    });

    // Test case 5: Invalid earthquake data - coordinates array too short
    test('should return NaN if coordinates array is too short', () => {
      const earthquake = {
        geometry: { coordinates: [-115, 33] }, // Missing depth
      };
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeNaN();
    });

    // Test case 6: Invalid earthquake data - depth is not a number
    test('should return NaN if depth is not a number', () => {
      const earthquake = {
        geometry: { coordinates: [-115, 33, 'not-a-number'] },
      };
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeNaN();
    });

    // Test case 7: Invalid earthquake data - lat is not a number
    test('should return NaN if latitude is not a number', () => {
      const earthquake = {
        geometry: { coordinates: [-115, 'not-a-number', 10] },
      };
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeNaN();
    });

    // Test case 8: Invalid earthquake data - lon is not a number
    test('should return NaN if longitude is not a number', () => {
      const earthquake = {
        geometry: { coordinates: ['not-a-number', 33, 10] },
      };
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeNaN();
    });

    // Test case 9: Invalid station data - stationLat is not a number
    test('should return NaN if stationLat is not a number', () => {
      const earthquake = {
        geometry: { coordinates: [-115, 33, 10] },
      };
      expect(calculateHypocentralDistance(earthquake, 'not-a-number', stationLon)).toBeNaN();
    });

    // Test case 10: Invalid station data - stationLon is not a number
    test('should return NaN if stationLon is not a number', () => {
      const earthquake = {
        geometry: { coordinates: [-115, 33, 10] },
      };
      expect(calculateHypocentralDistance(earthquake, stationLat, 'not-a-number')).toBeNaN();
    });

     // Test case 11: Negative depth
     test('should return NaN for negative depth', () => {
      const earthquake = {
        geometry: { coordinates: [-115, 33, -10] }, // lon, lat, depth
      };
      expect(calculateHypocentralDistance(earthquake, stationLat, stationLon)).toBeNaN();
    });
  });
});
