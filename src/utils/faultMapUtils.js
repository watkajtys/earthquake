export const FAULT_MAP_CATEGORIES = {
    normal: { label: 'Normal', color: '#db2777' },
    reverse: { label: 'Reverse / thrust', color: '#16a34a' },
    dextral: { label: 'Right-lateral', color: '#0284c7' },
    sinistral: { label: 'Left-lateral', color: '#7c3aed' },
    strikeSlip: { label: 'Strike-slip, sense unspecified', color: '#4f46e5' },
    oblique: { label: 'Oblique', color: '#d97706' },
    spreading: { label: 'Spreading ridge', color: '#0d9488' },
    other: { label: 'Fold / other / unspecified', color: '#64748b' },
};

const faultCategories = {
    Normal: 'normal',
    Reverse: 'reverse',
    Subduction_Thrust: 'reverse',
    'Blind Thrust': 'reverse',
    Dextral: 'dextral',
    Dextral_Transform: 'dextral',
    Sinistral: 'sinistral',
    Sinistral_Transform: 'sinistral',
    'Strike-Slip': 'strikeSlip',
    'Dextral-Normal': 'oblique',
    'Normal-Dextral': 'oblique',
    'Sinistral-Normal': 'oblique',
    'Normal-Sinistral': 'oblique',
    'Dextral-Reverse': 'oblique',
    'Reverse-Dextral': 'oblique',
    'Sinistral-Reverse': 'oblique',
    'Reverse-Sinistral': 'oblique',
    'Reverse-Strike-Slip': 'oblique',
    'Normal-Strike-Slip': 'oblique',
    'Dextral-Oblique': 'oblique',
    Spreading_Ridge: 'spreading',
    Anticline: 'other',
    Syncline: 'other',
};

export function getFaultMapCategory(slipType) {
    const category = Object.hasOwn(faultCategories, slipType) ? faultCategories[slipType] : 'other';
    return FAULT_MAP_CATEGORIES[category];
}

export function describeFaultMotion(slipType) {
    if (typeof slipType !== 'string' || !slipType.trim()) return 'Motion unspecified';
    const descriptions = [];
    if (slipType.includes('Dextral')) descriptions.push('right-lateral: the opposite side moves to your right when looking across the fault');
    if (slipType.includes('Sinistral')) descriptions.push('left-lateral: the opposite side moves to your left when looking across the fault');
    if (slipType.includes('Normal')) descriptions.push('normal component: hanging wall moves down relative to the footwall');
    if (slipType.includes('Reverse') || slipType.includes('Thrust')) descriptions.push('reverse component: hanging wall moves up relative to the footwall');
    if (slipType.includes('Strike-Slip')) descriptions.push('horizontal component; lateral sense unspecified');
    if (slipType === 'Spreading_Ridge') descriptions.push('plates move apart at a spreading ridge');
    if (slipType === 'Anticline' || slipType === 'Syncline') descriptions.push('mapped fold; fault slip sense unspecified');
    return descriptions.join('; ') || 'Motion unspecified';
}

/**
 * GEM slip-rate tuples are (most likely, minimum, maximum), in mm/year.
 * Empty tuple members represent unreported values, never zero.
 * https://github.com/GEMScienceTools/gem-global-active-faults#data-types
 * https://doi.org/10.1177/8755293020944182
 */
export function formatFaultSlipRate(value) {
    if (typeof value !== 'string') return null;
    const tuple = value.trim().match(/^\(([^()]*)\)$/);
    if (!tuple) return null;
    const parts = tuple[1].split(',');
    if (parts.length !== 3) return null;
    const numbers = parts.map(part => part.trim() === '' ? null : Number(part));
    if (numbers.some(number => number !== null && (!Number.isFinite(number) || number < 0))) return null;
    const [mostLikely, minimum, maximum] = numbers;
    if (numbers.every(number => number === null)) return null;
    if (minimum !== null && maximum !== null && minimum > maximum) return null;
    const format = number => String(Number(number.toPrecision(4)));
    const labels = [];
    if (mostLikely !== null) labels.push(`most likely ${format(mostLikely)}`);
    if (minimum !== null) labels.push(`minimum ${format(minimum)}`);
    if (maximum !== null) labels.push(`maximum ${format(maximum)}`);
    return `${labels.join('; ')} mm/year`;
}
