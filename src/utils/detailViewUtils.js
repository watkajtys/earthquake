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
