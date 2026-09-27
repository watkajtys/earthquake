/**
 * Approximate radiated seismic energy in joules from the reported magnitude.
 * This empirical scaling is for context; seismic moment is a different quantity,
 * and actual energy varies by event and magnitude scale.
 * Source: https://pubs.usgs.gov/of/1998/ofr-98-0767/
 */
export function estimateRadiatedEnergyJoules(magnitude) {
    if (typeof magnitude !== 'number' || !Number.isFinite(magnitude)) return NaN;

    const estimate = 10 ** (1.5 * magnitude + 4.8);
    return Number.isFinite(estimate) && estimate > 0 ? estimate : NaN;
}
