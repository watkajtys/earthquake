// Right-hand strike/dip/rake in North, East, Down coordinates.
// https://docs.obspy.org/packages/autogen/obspy.imaging.beachball.beach.html
const RAD = Math.PI / 180;

export function finiteNumber(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
}

export function readNodalPlane(properties, number) {
    const prefix = `nodal-plane-${number}-`;
    const strike = finiteNumber(properties?.[`${prefix}strike`]);
    const dip = finiteNumber(properties?.[`${prefix}dip`]);
    const rake = finiteNumber(properties?.[`${prefix}rake`] ?? properties?.[`${prefix}slip`]);
    return {
        strike: strike >= 0 && strike <= 360 ? strike : NaN,
        dip: dip >= 0 && dip <= 90 ? dip : NaN,
        rake: rake >= -180 && rake <= 180 ? rake : NaN,
    };
}

export function isCompleteNodalPlane(plane) {
    return !!plane && Number.isFinite(plane.strike) && plane.strike >= 0 && plane.strike <= 360 &&
        Number.isFinite(plane.dip) && plane.dip >= 0 && plane.dip <= 90 &&
        Number.isFinite(plane.rake) && plane.rake >= -180 && plane.rake <= 180;
}

export function selectFocalMechanism(products) {
    // ComCat arrays are ordered by preference. Keep fields from ONE solution.
    const candidates = ['moment-tensor', 'focal-mechanism'].flatMap(type =>
        (products?.[type] || []).filter(product => product.status !== 'DELETE' && product.properties)
            .map(product => ({ ...product, type })));
    return candidates.find(product => [1, 2].some(number =>
        isCompleteNodalPlane(readNodalPlane(product.properties, number)))) || candidates[0];
}

export function readAxis(properties, key) {
    const azimuth = finiteNumber(properties?.[`${key}-axis-azimuth`]);
    const plunge = finiteNumber(properties?.[`${key}-axis-plunge`]);
    return {
        azimuth: azimuth >= 0 && azimuth <= 360 ? azimuth : NaN,
        plunge: plunge >= -90 && plunge <= 90 ? plunge : NaN,
    };
}

/** Lower-hemisphere, equal-area projection; north up, east right. */
export function projectAxis(axis, center = 60, radius = 50) {
    const azimuth = finiteNumber(axis?.azimuth), plunge = finiteNumber(axis?.plunge);
    if (!Number.isFinite(azimuth) || !Number.isFinite(plunge) || Math.abs(plunge) > 90) return null;
    const angle = (azimuth + (plunge < 0 ? 180 : 0)) * RAD;
    const distance = radius * Math.sqrt(1 - Math.sin(Math.abs(plunge) * RAD));
    return { x: center + distance * Math.sin(angle), y: center - distance * Math.cos(angle) };
}

export function faultVectors(plane) {
    if (!isCompleteNodalPlane(plane)) return null;
    const strike = plane.strike * RAD, dip = plane.dip * RAD, rake = plane.rake * RAD;
    const alongStrike = [Math.cos(strike), Math.sin(strike), 0];
    const downDip = [-Math.sin(strike) * Math.cos(dip), Math.cos(strike) * Math.cos(dip), Math.sin(dip)];
    const normal = [-Math.sin(strike) * Math.sin(dip), Math.cos(strike) * Math.sin(dip), -Math.cos(dip)];
    const slip = alongStrike.map((value, index) => Math.cos(rake) * value - Math.sin(rake) * downDip[index]);
    return { normal, slip };
}

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

// Double-couple P radiation M = s*nᵀ + n*sᵀ. Positive = compressional first motion.
export function radiationAmplitude(vectors, direction) {
    return 2 * dot(vectors.normal, direction) * dot(vectors.slip, direction);
}

/** Inverse equal-area projection, normalized disk coordinates (x east, y south). */
export function directionOnFocalSphere(x, y) {
    const r2 = x * x + y * y;
    if (r2 > 1 + 1e-12) return null;
    const scale = Math.sqrt(2 - r2);
    return [-y * scale, x * scale, 1 - r2];
}

function nodalTrace(normal, center, radius) {
    const length = Math.hypot(normal[0], normal[1]);
    if (length < 1e-10) return ''; // Horizontal plane coincides with outer circle.
    const along = [-normal[1] / length, normal[0] / length, 0];
    let down = [-normal[2] * along[1], normal[2] * along[0], normal[0] * along[1] - normal[1] * along[0]];
    if (down[2] < 0) down = down.map(value => -value);
    return Array.from({ length: 181 }, (_, index) => {
        const angle = index * RAD;
        const direction = along.map((value, i) => value * Math.cos(angle) + down[i] * Math.sin(angle));
        const scale = radius / Math.sqrt(1 + Math.max(0, direction[2]));
        return `${index ? 'L' : 'M'}${(center + scale * direction[1]).toFixed(3)},${(center - scale * direction[0]).toFixed(3)}`;
    }).join('');
}

export function beachballGeometry(plane, center = 60, radius = 50) {
    const vectors = faultVectors(plane);
    if (!vectors) return null;
    // Sample the analytic radiation field at 240×240 (<1 screen pixel/cell).
    // Coalesce row runs for a compact SVG; nodal traces are continuous projections.
    const size = 240, cell = 2 * radius / size;
    const rows = [];
    for (let row = 0; row < size; row++) {
        const y = -1 + 2 * (row + 0.5) / size;
        let start = -1;
        for (let col = 0; col <= size; col++) {
            const x = -1 + 2 * (col + 0.5) / size;
            const direction = col < size ? directionOnFocalSphere(x, y) : null;
            const shaded = direction && radiationAmplitude(vectors, direction) > 1e-12;
            if (shaded && start < 0) start = col;
            if (!shaded && start >= 0) {
                const left = center - radius + start * cell, top = center - radius + row * cell;
                const width = (col - start) * cell;
                rows.push(`M${left.toFixed(3)},${top.toFixed(3)}h${width.toFixed(3)}v${cell.toFixed(3)}h-${width.toFixed(3)}Z`);
                start = -1;
            }
        }
    }
    return { shadedPath: rows.join(''), nodalPaths: [vectors.normal, vectors.slip].map(normal => nodalTrace(normal, center, radius)) };
}
