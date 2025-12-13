
import { describe, it, expect } from 'vitest';
import { isEventSignificant, MIN_SIGNIFICANT_MAGNITUDE } from './significanceUtils.js';

describe('isEventSignificant', () => {
  it('returns true if magnitude is above MIN_SIGNIFICANT_MAGNITUDE', () => {
    const event = { magnitude: MIN_SIGNIFICANT_MAGNITUDE, geojson_feature: null };
    expect(isEventSignificant(event)).toBe(true);
  });

  it('returns true if magnitude is greater than MIN_SIGNIFICANT_MAGNITUDE', () => {
    const event = { magnitude: MIN_SIGNIFICANT_MAGNITUDE + 0.5, geojson_feature: null };
    expect(isEventSignificant(event)).toBe(true);
  });

  it('returns false if magnitude is low and no faulting data', () => {
    const event = { magnitude: 3.0, geojson_feature: null };
    expect(isEventSignificant(event)).toBe(false);
  });

  // This test checks the NEW desired behavior
  it('returns true if magnitude is low but has_moment_tensor is true', () => {
    const event = {
      magnitude: 3.0,
      has_moment_tensor: true,
      // Pass empty geojson_feature to ensure it's not using it
      geojson_feature: ""
    };
    expect(isEventSignificant(event)).toBe(true);
  });

  it('returns true if magnitude is low but has_focal_mechanism is true', () => {
      const event = {
        magnitude: 3.0,
        has_focal_mechanism: true,
        geojson_feature: ""
      };
      expect(isEventSignificant(event)).toBe(true);
    });

  it('supports legacy geojson_feature check for frontend compatibility', () => {
      const event = {
          magnitude: 3.0,
          geojson_feature: {
              properties: {
                  products: {
                      "moment-tensor": [{}]
                  }
              }
          }
      };
      expect(isEventSignificant(event)).toBe(true);
  });

  it('returns false if magnitude is low and only shakemap (need tensor or focal mechanism)', () => {
      const event = {
          magnitude: 3.0,
          has_shakemap: true,
          has_moment_tensor: false,
          has_focal_mechanism: false,
          geojson_feature: ""
      };
      expect(isEventSignificant(event)).toBe(false);
  });
});
