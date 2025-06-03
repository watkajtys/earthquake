// Helper Functions

// This function is used by getBeachballPathsAndType
const isValidNumber = (num) => {
    const parsedNum = parseFloat(num);
    return typeof parsedNum === 'number' && !isNaN(parsedNum);
};

export const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString([], { dateStyle: 'full', timeStyle: 'long' });
};

export { isValidNumber }; // Exporting it separately as it's used by another function in this file

export const isValidString = (str) => {
    return typeof str === 'string' && str.trim() !== '';
};

export const isValuePresent = (value) => {
    return value !== null && value !== undefined;
};

export const formatNumber = (num, precision = 1) => {
    const number = parseFloat(num);
    if (Number.isNaN(number)) return 'N/A';
    return number.toFixed(precision);
};

export const formatLargeNumber = (num) => {
    if (!isValidNumber(num)) return 'N/A'; // Uses local isValidNumber
    if (num === 0) return '0';
    const numAbs = Math.abs(num);
    let value; let suffix = '';
    if (numAbs < 1e3) { value = num.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
    else if (numAbs < 1e6) { value = (num / 1e3).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' thousand'; }
    else if (numAbs < 1e9) { value = (num / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' million'; }
    else if (numAbs < 1e12) { value = (num / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' billion'; }
    else if (numAbs < 1e15) { value = (num / 1e12).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' trillion'; }
    else if (numAbs < 1e18) { value = (num / 1e15).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' quadrillion';}
    else if (numAbs < 1e21) { value = (num / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 }); suffix = ' quintillion';}
    else { const expFormat = num.toExponential(2); const parts = expFormat.split('e+'); return parts.length === 2 ? `${parts[0]} x 10^${parts[1]}` : expFormat; }
    return value + suffix;
};

export const getBeachballPathsAndType = (rake, dip = 45) => {
    let faultType = 'UNKNOWN';
    const r = parseFloat(rake);

    if (!isValidNumber(r)) return { shadedPaths: [], faultType, nodalPlanes: [] }; // Uses local isValidNumber

    if ((r >= -22.5 && r <= 22.5) || r > 157.5 || r < -157.5) {
        faultType = 'STRIKE_SLIP';
    } else if (r >= 67.5 && r <= 112.5) {
        faultType = 'REVERSE';
    } else if (r <= -67.5 && r >= -112.5) {
        faultType = 'NORMAL';
    } else if (r > 22.5 && r < 67.5) {
        faultType = 'OBLIQUE_REVERSE';
    } else if (r > 112.5 && r < 157.5) {
        faultType = 'OBLIQUE_REVERSE';
    } else if (r < -22.5 && r > -67.5) {
        faultType = 'OBLIQUE_NORMAL';
    } else if (r < -112.5 && r > -157.5) {
        faultType = 'OBLIQUE_NORMAL';
    }

    let shadedPaths = [];
    let nodalPlanes = [];
    const R = 50; 
    const C = 60; 

    switch (faultType) {
        case 'STRIKE_SLIP':
        case 'OBLIQUE_REVERSE':
        case 'OBLIQUE_NORMAL':
            shadedPaths = [
                `M${C},${C-R} A${R},${R} 0 0 1 ${C+R},${C} L${C},${C} Z`,
                `M${C},${C+R} A${R},${R} 0 0 1 ${C-R},${C} L${C},${C} Z`
            ];
            nodalPlanes = [
                { type: 'line', x1: C, y1: C - R, x2: C, y2: C + R },
                { type: 'line', x1: C - R, y1: C, x2: C + R, y2: C }
            ];
            faultType = 'STRIKE_SLIP_LIKE';
            break;
        case 'NORMAL':
            shadedPaths = [
                `M${C},${C-R} C ${C-R*1.5},${C-R*0.5}, ${C-R*1.5},${C+R*0.5}, ${C},${C+R} C ${C-R*0.5},${C+R*0.5}, ${C-R*0.5},${C-R*0.5}, ${C},${C-R} Z`,
                `M${C},${C-R} C ${C+R*1.5},${C-R*0.5}, ${C+R*1.5},${C+R*0.5}, ${C},${C+R} C ${C+R*0.5},${C+R*0.5}, ${C+R*0.5},${C-R*0.5}, ${C},${C-R} Z`
            ];
            nodalPlanes = [
                { type: 'path', d: `M${C-R*0.8},${C-R*0.6} Q${C},${C} ${C-R*0.8},${C+R*0.6}` },
                { type: 'path', d: `M${C+R*0.8},${C-R*0.6} Q${C},${C} ${C+R*0.8},${C+R*0.6}` }
            ];
            break;
        case 'REVERSE':
            shadedPaths = [
                `M${C-R},${C} C ${C-R*0.5},${C-R*1.5}, ${C+R*0.5},${C-R*1.5}, ${C+R},${C} C ${C+R*0.5},${C-R*0.5}, ${C-R*0.5},${C-R*0.5}, ${C-R},${C} Z`,
                `M${C-R},${C} C ${C-R*0.5},${C+R*1.5}, ${C+R*0.5},${C+R*1.5}, ${C+R},${C} C ${C+R*0.5},${C+R*0.5}, ${C-R*0.5},${C+R*0.5}, ${C-R},${C} Z`
            ];
            nodalPlanes = [
                { type: 'path', d: `M${C-R*0.6},${C-R*0.8} Q${C},${C} ${C+R*0.6},${C-R*0.8}` },
                { type: 'path', d: `M${C-R*0.6},${C+R*0.8} Q${C},${C} ${C+R*0.6},${C+R*0.8}` }
            ];
            break;
        default:
            faultType = 'STRIKE_SLIP_LIKE';
            shadedPaths = [
                `M${C-R},${C} A${R},${R} 0 0 1 ${C},${C-R} L${C},${C} Z`,
                `M${C+R},${C} A${R},${R} 0 0 1 ${C},${C+R} L${C},${C} Z`
            ];
            nodalPlanes = [
                { type: 'line', x1: C, y1: C - R, x2: C, y2: C + R },
                { type: 'line', x1: C - R, y1: C, x2: C + R, y2: C }
            ];
            break;
    }
    return { shadedPaths, faultType, nodalPlanes };
};

/**
 * Determines the fault type based on the rake angle.
 * @param {number} rake - The rake angle in degrees.
 * @returns {object} An object containing the fault name, icon, and description.
 */
export const getFaultType = (rake) => {
  const defaultFault = {
    name: "Unknown Fault Type",
    icon: "❓",
    description: "Fault movement details are unclear or rake angle is not provided.",
  };

  if (!isValidNumber(rake)) {
    return defaultFault;
  }

  const r = parseFloat(rake);

  // Normalize rake to -180 to 180 for simpler conditions if needed,
  // but the provided ranges are mostly explicit.
  // let normalizedRake = r;
  // while (normalizedRake <= -180) normalizedRake += 360;
  // while (normalizedRake > 180) normalizedRake -= 360;
  // For this implementation, direct use of r with provided ranges.

  // Normal Faults
  if (r > -112.5 && r < -67.5) { // e.g., -90
    return {
      name: "Normal Fault",
      icon: "⬇️⬆️", // Blocks move apart vertically, one drops down
      description: "One block of earth moves down relative to the other, typically due to tensional forces.",
    };
  }
  // Reverse/Thrust Faults
  if (r > 67.5 && r < 112.5) { // e.g., 90
    return {
      name: "Reverse/Thrust Fault",
      icon: "⬆️⬇️", // Blocks move towards each other vertically, one pushed up
      description: "One block of earth is pushed up over the other, typically due to compressional forces.",
    };
  }

  // Strike-Slip Faults
  // Left-Lateral (sinistral)
  if ((r >= -22.5 && r <= 22.5) || (r > -360 && r <= -337.5) || (r >= 337.5 && r < 360)) { // e.g., 0 or very close to it
    return {
      name: "Left-Lateral Strike-Slip Fault",
      icon: "⬅️➡️", // Top block (opposite viewer) moves left
      description: "Blocks slide past each other horizontally. The block opposite you moves to the left.",
    };
  }
  // Right-Lateral (dextral)
  // Note: USGS uses 180 +/- 20 for strike-slip, which is 160 to 200 (or -160 to -200)
  // The prompt has (rake > 157.5 && rake < 202.5) OR (rake < -157.5 && rake > -202.5)
  if ((r > 157.5 && r < 202.5) || (r < -157.5 && r > -202.5)) { // e.g., 180, -180
    return {
      name: "Right-Lateral Strike-Slip Fault",
      icon: "➡️⬅️", // Top block (opposite viewer) moves right
      description: "Blocks slide past each other horizontally. The block opposite you moves to the right.",
    };
  }

  // Oblique-Normal Faults
  // Left-Lateral Dominant Oblique-Normal (Normal component + Left-lateral strike-slip)
  if (r >= -67.5 && r < -22.5) { // e.g., -45
    return {
      name: "Oblique Normal Fault (Left-Lateral component)",
      icon: "↙️↗️", // Downward and leftward
      description: "A combination of downward (normal) and leftward-horizontal (strike-slip) movement.",
    };
  }
  // Right-Lateral Dominant Oblique-Normal (Normal component + Right-lateral strike-slip)
  if (r <= -112.5 && r > -157.5) { // e.g., -135
    return {
      name: "Oblique Normal Fault (Right-Lateral component)",
      icon: "↘️↖️", // Downward and rightward
      description: "A combination of downward (normal) and rightward-horizontal (strike-slip) movement.",
    };
  }

  // Oblique-Reverse/Thrust Faults
  // Left-Lateral Dominant Oblique-Reverse (Reverse component + Left-lateral strike-slip)
  if (r <= 67.5 && r > 22.5) { // e.g., 45
    return {
      name: "Oblique Reverse Fault (Left-Lateral component)",
      icon: "↖️↘️", // Upward and leftward
      description: "A combination of upward (reverse) and leftward-horizontal (strike-slip) movement.",
    };
  }
  // Right-Lateral Dominant Oblique-Reverse (Reverse component + Right-lateral strike-slip)
  if (r >= 112.5 && r < 157.5) { // e.g., 135
    return {
      name: "Oblique Reverse Fault (Right-Lateral component)",
      icon: "↗️↙️", // Upward and rightward
      description: "A combination of upward (reverse) and rightward-horizontal (strike-slip) movement.",
    };
  }

  // If rake angle doesn't fit any category, return default.
  // This can happen if rake is exactly on a boundary like -67.5, 22.5 etc. if not caught by >= or <=
  // Or if it's an unexpected value.
  return {
      ...defaultFault,
      description: `Fault movement details are unclear for rake angle: ${r}.`
  };
};
