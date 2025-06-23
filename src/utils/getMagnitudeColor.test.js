import { describe, it, expect } from 'vitest';
import { getMagnitudeColor } from './utils.js';

describe('getMagnitudeColor', () => {
  // Test with null and undefined magnitude
  it('should return slate-400 for null magnitude', () => {
    expect(getMagnitudeColor(null)).toBe('#94A3B8');
  });

  it('should return slate-400 for undefined magnitude', () => {
    expect(getMagnitudeColor(undefined)).toBe('#94A3B8');
  });

  // Test with magnitudes at the lower bound of each color category
  it('should return cyan-300 for magnitude < 1.0 (e.g., 0.5)', () => {
    expect(getMagnitudeColor(0.5)).toBe('#67E8F9');
  });

  it('should return cyan-400 for magnitude 1.0', () => {
    expect(getMagnitudeColor(1.0)).toBe('#22D3EE');
  });

  it('should return emerald-400 for magnitude 2.5', () => {
    expect(getMagnitudeColor(2.5)).toBe('#34D399');
  });

  it('should return yellow-400 for magnitude 4.0', () => {
    expect(getMagnitudeColor(4.0)).toBe('#FACC15');
  });

  it('should return orange-400 for magnitude 5.0', () => {
    expect(getMagnitudeColor(5.0)).toBe('#FB923C');
  });

  it('should return red-400 for magnitude 6.0', () => {
    expect(getMagnitudeColor(6.0)).toBe('#F87171'); // Changed from red-500
  });

  it('should return slate-800 for magnitude 7.0', () => {
    expect(getMagnitudeColor(7.0)).toBe('#1E293B'); // Changed from red-500
  });

  it('should return slate-800 for magnitude 8.0', () => {
    expect(getMagnitudeColor(8.0)).toBe('#1E293B'); // Changed from red-700
  });

  // Test with magnitudes within each color category
  it('should return cyan-300 for magnitude 0.9', () => {
    expect(getMagnitudeColor(0.9)).toBe('#67E8F9');
  });

  it('should return cyan-400 for magnitude 1.5', () => {
    expect(getMagnitudeColor(1.5)).toBe('#22D3EE');
  });

  it('should return emerald-400 for magnitude 3.0', () => {
    expect(getMagnitudeColor(3.0)).toBe('#34D399');
  });

  it('should return yellow-400 for magnitude 4.5', () => {
    expect(getMagnitudeColor(4.5)).toBe('#FACC15');
  });

  it('should return orange-400 for magnitude 5.5', () => {
    expect(getMagnitudeColor(5.5)).toBe('#FB923C');
  });

  it('should return red-400 for magnitude 6.5', () => {
    expect(getMagnitudeColor(6.5)).toBe('#F87171'); // Changed from red-500
  });

  it('should return slate-800 for magnitude 7.5', () => {
    expect(getMagnitudeColor(7.5)).toBe('#1E293B'); // Changed from red-500
  });

  // Test with a very high magnitude (>= 8.0)
  it('should return slate-800 for magnitude 9.0 (very high)', () => {
    expect(getMagnitudeColor(9.0)).toBe('#1E293B'); // Changed from red-700
  });

  // Test with negative magnitudes
  // Based on the function, negative magnitudes will fall into the (magnitude < 1.0) category.
  it('should return cyan-300 for negative magnitude (e.g., -1.0)', () => {
    expect(getMagnitudeColor(-1.0)).toBe('#67E8F9');
  });
});
