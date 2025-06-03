import { getFaultType } from './detailViewUtils';

describe('getFaultType', () => {
  const unknownFault = {
    name: "Unknown Fault Type",
    icon: "❓",
    description: "Fault movement details are unclear or rake angle is not provided.",
  };

  const unknownFaultWithRake = (rake) => ({
    name: "Unknown Fault Type",
    icon: "❓",
    description: `Fault movement details are unclear for rake angle: ${rake}.`,
  });


  // Test valid inputs
  test('should return Normal Fault for rake -90', () => {
    const result = getFaultType(-90);
    expect(result.name).toBe('Normal Fault');
    expect(result.icon).toBe('⬇️⬆️');
    expect(result.description).toBe('One block of earth moves down relative to the other, typically due to tensional forces.');
  });

  test('should return Reverse/Thrust Fault for rake 90', () => {
    const result = getFaultType(90);
    expect(result.name).toBe('Reverse/Thrust Fault');
    expect(result.icon).toBe('⬆️⬇️');
    expect(result.description).toBe('One block of earth is pushed up over the other, typically due to compressional forces.');
  });

  // Strike-Slip Left-Lateral
  test('should return Left-Lateral Strike-Slip Fault for rake 0', () => {
    const result = getFaultType(0);
    expect(result.name).toBe('Left-Lateral Strike-Slip Fault');
    expect(result.icon).toBe('⬅️➡️');
  });
  test('should return Left-Lateral Strike-Slip Fault for rake 10', () => {
    const result = getFaultType(10);
    expect(result.name).toBe('Left-Lateral Strike-Slip Fault');
  });
    test('should return Left-Lateral Strike-Slip Fault for rake -10', () => {
    const result = getFaultType(-10);
    expect(result.name).toBe('Left-Lateral Strike-Slip Fault');
  });
   test('should return Left-Lateral Strike-Slip Fault for rake -340 (equivalent to 20)', () => {
    // (r > -360 && r <= -337.5) OR (r >= 337.5 && r < 360)
    // This case is for r <= -337.5 (e.g. -340 is like 20, which is left-lateral)
    // The condition (r > -360 && r <= -337.5) is for angles like -350 (equiv. 10), -340 (equiv. 20)
    // The condition (r >= 337.5 && r < 360) is for angles like 340 (equiv. -20), 350 (equiv. -10)
    // The original prompt ranges for left-lateral strike slip were:
    // rake >= -22.5 and rake <= 22.5 (e.g., 0) OR (rake > -360 && rake <= -337.5) OR (rake >= 337.5 && rake < 360)
    // -340 is within (rake > -360 && r <= -337.5)
    // 350 is within (r >= 337.5 && r < 360)
    const result = getFaultType(-350); // equivalent to 10 degrees
    expect(result.name).toBe('Left-Lateral Strike-Slip Fault');
  });
   test('should return Left-Lateral Strike-Slip Fault for rake 350 (equivalent to -10)', () => {
    const result = getFaultType(350); // equivalent to -10 degrees
    expect(result.name).toBe('Left-Lateral Strike-Slip Fault');
  });


  // Strike-Slip Right-Lateral
  test('should return Right-Lateral Strike-Slip Fault for rake 180', () => {
    const result = getFaultType(180);
    expect(result.name).toBe('Right-Lateral Strike-Slip Fault');
    expect(result.icon).toBe('➡️⬅️');
  });
  test('should return Right-Lateral Strike-Slip Fault for rake -170', () => {
    // (rake < -157.5 && rake > -202.5) e.g. -180
    const result = getFaultType(-170);
    expect(result.name).toBe('Right-Lateral Strike-Slip Fault');
  });
    test('should return Right-Lateral Strike-Slip Fault for rake 170', () => {
    // (rake > 157.5 && rake < 202.5) e.g. 180
    const result = getFaultType(170);
    expect(result.name).toBe('Right-Lateral Strike-Slip Fault');
  });

  // Oblique-Normal (Left-Lateral)
  test('should return Oblique Normal Fault (Left-Lateral component) for rake -45', () => {
    const result = getFaultType(-45);
    expect(result.name).toBe('Oblique Normal Fault (Left-Lateral component)');
    expect(result.icon).toBe('↙️↗️');
    expect(result.description).toBe('A combination of downward (normal) and leftward-horizontal (strike-slip) movement.');
  });

  // Oblique-Normal (Right-Lateral)
  test('should return Oblique Normal Fault (Right-Lateral component) for rake -135', () => {
    const result = getFaultType(-135);
    expect(result.name).toBe('Oblique Normal Fault (Right-Lateral component)');
    expect(result.icon).toBe('↘️↖️');
  });

  // Oblique-Reverse (Left-Lateral)
  test('should return Oblique Reverse Fault (Left-Lateral component) for rake 45', () => {
    const result = getFaultType(45);
    expect(result.name).toBe('Oblique Reverse Fault (Left-Lateral component)');
    expect(result.icon).toBe('↖️↘️');
  });

  // Oblique-Reverse (Right-Lateral)
  test('should return Oblique Reverse Fault (Right-Lateral component) for rake 135', () => {
    const result = getFaultType(135);
    expect(result.name).toBe('Oblique Reverse Fault (Right-Lateral component)');
    expect(result.icon).toBe('↗️↙️');
  });

  // Edge cases
  test('should handle rake -22.5 (boundary of LL Strike-Slip and Oblique Normal LL)', () => {
    const result = getFaultType(-22.5); // Should be LL Strike-Slip (>= -22.5)
    expect(result.name).toBe('Left-Lateral Strike-Slip Fault');
  });
  test('should handle rake 22.5 (boundary of LL Strike-Slip and Oblique Reverse LL)', () => {
    const result = getFaultType(22.5); // Should be LL Strike-Slip (<= 22.5)
    expect(result.name).toBe('Left-Lateral Strike-Slip Fault');
  });
   test('should handle rake 67.5 (boundary of Oblique Reverse LL and Reverse)', () => {
    const result = getFaultType(67.5); // Should be Oblique Reverse LL (<= 67.5)
    expect(result.name).toBe('Oblique Reverse Fault (Left-Lateral component)');
  });
  test('should handle rake -67.5 (boundary of Oblique Normal LL and Normal)', () => {
    const result = getFaultType(-67.5); // Should be Oblique Normal LL (>= -67.5)
    expect(result.name).toBe('Oblique Normal Fault (Left-Lateral component)');
  });
   test('should handle rake 157.5 (boundary of Oblique Reverse RL and RL Strike-Slip)', () => {
    const result = getFaultType(157.5); // Should be Oblique Reverse RL (< 157.5)
    // So 157.5 itself is not Oblique Reverse RL. It should be RL Strike-Slip (>= 157.5, if we adjust for that)
    // Original condition for RL Strike-Slip: (rake > 157.5 && rake < 202.5)
    // Original condition for Oblique Reverse (RL): (rake >= 112.5 && rake < 157.5)
    // So, 157.5 is exactly on the boundary, the Oblique Reverse RL is < 157.5, so it won't match.
    // The RL Strike-Slip is > 157.5, so it also won't match.
    // This means 157.5 should fall into the final 'unknown' category.
    expect(result).toEqual(unknownFaultWithRake(157.5));
  });


  // Test invalid inputs
  test('should return Unknown Fault Type for null rake', () => {
    expect(getFaultType(null)).toEqual(unknownFault);
  });

  test('should return Unknown Fault Type for undefined rake', () => {
    expect(getFaultType(undefined)).toEqual(unknownFault);
  });

  test('should return Unknown Fault Type for string rake', () => {
    expect(getFaultType('not a number')).toEqual(unknownFault);
  });

  test('should return Unknown Fault Type for NaN rake', () => {
    expect(getFaultType(NaN)).toEqual(unknownFault);
  });

  test('should return Unknown Fault Type for rake values not fitting any category (e.g. very large)', () => {
    expect(getFaultType(1000)).toEqual(unknownFaultWithRake(1000));
    expect(getFaultType(-1000)).toEqual(unknownFaultWithRake(-1000));
  });
    test('should return Unknown Fault Type for rake -300 (not in specific ranges)', () => {
    // This value is not explicitly covered by any specific category.
    // It's not in normal, reverse, standard strike-slip, or oblique ranges.
    expect(getFaultType(-300)).toEqual(unknownFaultWithRake(-300));
  });
});
