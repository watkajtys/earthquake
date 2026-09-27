import { faultVectors } from '../../utils/focalMechanismUtils.js';

// World coordinates: East, North, Up. Distances are diagram units, never metres.
const EPSILON = 1e-9;
const RAD = Math.PI / 180;
const HALF_WIDTH = 1.1;
const TOP = 0.6;
const BOTTOM = -0.9;
export const MAX_RELATIVE_SLIP = 0.8;
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const add = (a, b) => a.map((value, index) => value + b[index]);
const scale = (a, amount) => a.map(value => value * amount);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean = points => points[0].map((_, index) => points.reduce((sum, point) => sum + point[index], 0) / points.length);
const unit = vector => scale(vector, 1 / Math.hypot(...vector));
const nedToEnu = vector => [vector[1], vector[0], -vector[2]];

function clipPolygon(points, normal, side) {
    const result = [];
    for (let index = 0; index < points.length; index++) {
        const start = points[index], end = points[(index + 1) % points.length];
        const from = side * dot(normal, start), to = side * dot(normal, end);
        const insideStart = from >= -EPSILON, insideEnd = to >= -EPSILON;
        if (insideStart) result.push(start);
        if (insideStart !== insideEnd) {
            const fraction = from / (from - to);
            result.push(start.map((value, coordinate) => value + fraction * (end[coordinate] - value)));
        }
    }
    return result.filter((point, index) => !result.slice(0, index).some(other => Math.hypot(...point.map((value, coordinate) => value - other[coordinate])) < EPSILON));
}

function cubeFaces() {
    const w = HALF_WIDTH, t = TOP, b = BOTTOM;
    return [
        { kind: 'top', normal: [0, 0, 1], points: [[-w, -w, t], [w, -w, t], [w, w, t], [-w, w, t]] },
        { kind: 'bottom', normal: [0, 0, -1], points: [[-w, w, b], [w, w, b], [w, -w, b], [-w, -w, b]] },
        { kind: 'east', normal: [1, 0, 0], points: [[w, -w, b], [w, w, b], [w, w, t], [w, -w, t]] },
        { kind: 'west', normal: [-1, 0, 0], points: [[-w, w, b], [-w, -w, b], [-w, -w, t], [-w, w, t]] },
        { kind: 'north', normal: [0, 1, 0], points: [[w, w, b], [-w, w, b], [-w, w, t], [w, w, t]] },
        { kind: 'south', normal: [0, -1, 0], points: [[-w, -w, b], [w, -w, b], [w, -w, t], [-w, -w, t]] },
    ];
}

function capPolygon(faces, normal) {
    const points = [];
    for (const face of faces) {
        for (const point of face.points) {
            if (Math.abs(dot(point, normal)) < EPSILON && !points.some(other => Math.hypot(...point.map((value, index) => value - other[index])) < EPSILON)) points.push(point);
        }
    }
    if (points.length < 3) return [];
    const center = mean(points);
    const u = unit(cross(Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], normal));
    const v = cross(normal, u);
    return points.sort((a, b) => {
        const relativeA = add(a, scale(center, -1)), relativeB = add(b, scale(center, -1));
        return Math.atan2(dot(relativeA, v), dot(relativeA, u)) - Math.atan2(dot(relativeB, v), dot(relativeB, u));
    });
}

function referenceFence(normal, strike, side, offset) {
    const direction = [Math.cos(strike * RAD), -Math.sin(strike * RAD), 0];
    const extent = HALF_WIDTH / Math.max(Math.abs(direction[0]), Math.abs(direction[1]));
    let from = -extent, to = extent;
    const slope = dot(normal, direction), height = TOP * normal[2];
    if (Math.abs(slope) < EPSILON) {
        if (side * height < 0) return [];
    } else if (side > 0) from = Math.max(from, -height / slope);
    else to = Math.min(to, -height / slope);
    if (to - from < EPSILON) return [];
    const at = (distance, heightAboveTop = 0) => add([direction[0] * distance, direction[1] * distance, TOP + heightAboveTop], offset);
    const lines = [{ kind: 'rail', points: [at(from, 0.12), at(to, 0.12)] }];
    for (let distance = -extent + 0.12; distance <= extent; distance += 0.3) {
        if (distance > from + EPSILON && distance < to - EPSILON) lines.push({ kind: 'post', points: [at(distance), at(distance, 0.15)] });
    }
    return lines;
}

/** Clip a cuboid by the selected plane, then translate the halves along its slip vector.
 * Positive normal is A (the hanging wall for dip < 90°). The relative A−B
 * displacement is exactly slip * amount; their symmetric movement chooses a
 * reference frame, not an estimate of how either side moved in the earthquake.
 */
export function buildFaultBlockModel(plane, progress = 0) {
    const vectors = faultVectors(plane);
    if (!vectors) return null;
    const normal = nedToEnu(vectors.normal), slip = nedToEnu(vectors.slip);
    const amount = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)) * MAX_RELATIVE_SLIP;
    const originalFaces = cubeFaces();
    const blocks = [1, -1].map(side => {
        const offset = scale(slip, side * amount / 2);
        const clipped = originalFaces.map(face => ({ ...face, points: clipPolygon(face.points, normal, side) })).filter(face => face.points.length >= 3);
        const cap = capPolygon(clipped, scale(normal, -side));
        if (cap.length >= 3) clipped.push({ kind: 'fault', normal: scale(normal, -side), points: cap });
        return {
            side, offset,
            faces: clipped.map(face => ({ ...face, points: face.points.map(point => add(point, offset)) })),
            fence: referenceFence(normal, plane.strike, side, offset),
        };
    });
    const topValues = originalFaces[0].points.map(point => dot(normal, point));
    return { normal, slip, amount, blocks, surfaceIntersection: Math.min(...topValues) < -EPSILON && Math.max(...topValues) > EPSILON };
}

/** Orthographic camera azimuth is clockwise from north; elevation is above horizontal. */
export function faultBlockCamera(azimuth, elevation) {
    const a = azimuth * RAD, e = elevation * RAD;
    return {
        right: [-Math.cos(a), Math.sin(a), 0],
        up: [-Math.sin(e) * Math.sin(a), -Math.sin(e) * Math.cos(a), Math.cos(e)],
        towardViewer: [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)],
    };
}

export function projectFaultPoint(point, camera, center = [300, 207], zoom = 117) {
    return { x: center[0] + zoom * dot(point, camera.right), y: center[1] - zoom * dot(point, camera.up), depth: dot(point, camera.towardViewer) };
}

// Intersect a projected line with a convex face. Orthographic depth is linear,
// so the portion behind that face can be removed exactly, including a fence
// that crosses the silhouette of the other block.
function hiddenLineInterval(line, face, camera) {
    const [start, end] = line.points;
    const winding = Math.sign(face.points.reduce((sum, p, index) => {
        const q = face.points[(index + 1) % face.points.length];
        return sum + p.x * q.y - q.x * p.y;
    }, 0));
    let from = 0, to = 1;
    for (let index = 0; index < face.points.length; index++) {
        const a = face.points[index], b = face.points[(index + 1) % face.points.length];
        const signed = point => winding * ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x));
        const first = signed(start), last = signed(end), difference = last - first;
        if (Math.abs(difference) < EPSILON) { if (first < -EPSILON) return null; }
        else if (difference > 0) from = Math.max(from, -first / difference);
        else to = Math.min(to, -first / difference);
        if (to <= from + EPSILON) return null;
    }
    const planeDepth = point => (face.planeConstant - dot(face.normal, camera.right) * (point.x - 300) / 117 + dot(face.normal, camera.up) * (point.y - 207) / 117) / dot(face.normal, camera.towardViewer);
    const behindStart = planeDepth(start) - start.depth - EPSILON;
    const behindEnd = planeDepth(end) - end.depth - EPSILON;
    const difference = behindEnd - behindStart;
    if (Math.abs(difference) < EPSILON) { if (behindStart <= 0) return null; }
    else if (difference > 0) from = Math.max(from, -behindStart / difference);
    else to = Math.min(to, -behindStart / difference);
    return to > from + EPSILON ? [from, to] : null;
}

function visibleFenceSegments(line, faces, camera) {
    let intervals = [[0, 1]];
    for (const face of faces) {
        const hidden = hiddenLineInterval(line, face, camera);
        if (!hidden) continue;
        intervals = intervals.flatMap(([from, to]) => {
            if (hidden[1] <= from || hidden[0] >= to) return [[from, to]];
            const remaining = [];
            if (hidden[0] > from) remaining.push([from, hidden[0]]);
            if (hidden[1] < to) remaining.push([hidden[1], to]);
            return remaining;
        });
    }
    const at = fraction => Object.fromEntries(['x', 'y', 'depth'].map(coordinate => [coordinate, line.points[0][coordinate] + fraction * (line.points[1][coordinate] - line.points[0][coordinate])]));
    return intervals.map(([from, to], index) => ({ ...line, key: `${line.key}-${index}`, points: [at(from), at(to)] }));
}

export function faultBlockScene(model, camera) {
    if (!model) return { shapes: [], labels: [] };
    const shapes = [], labelCandidates = [];
    for (const block of model.blocks) {
        const visible = [];
        block.faces.forEach((face, index) => {
            if (dot(face.normal, camera.towardViewer) <= EPSILON) return;
            const points = face.points.map(point => projectFaultPoint(point, camera));
            const shape = { ...face, type: 'face', side: block.side, key: `${block.side}-face-${index}`, points, planeConstant: dot(face.normal, face.points[0]), depth: projectFaultPoint(mean(face.points), camera).depth };
            shapes.push(shape);
            const area = Math.abs(points.reduce((sum, point, i) => sum + point.x * points[(i + 1) % points.length].y - points[(i + 1) % points.length].x * point.y, 0));
            visible.push({ area, point: projectFaultPoint(mean(face.points), camera), side: block.side });
        });
        block.fence.forEach((line, index) => shapes.push({ ...line, type: 'fence', side: block.side, key: `${block.side}-fence-${index}`, points: line.points.map(point => projectFaultPoint(point, camera)), depth: projectFaultPoint(mean(line.points), camera).depth + 0.002 }));
        labelCandidates.push(...visible);
    }
    // Tangential slip leaves every block in its own half-space. This gives an
    // exact painter order even when average polygon depths interleave; visible
    // faces on each convex block do not overlap except at their edges.
    const faces = shapes.filter(shape => shape.type === 'face');
    const nearerSide = Math.sign(dot(model.normal, camera.towardViewer));
    faces.sort((a, b) => (a.side - b.side) * nearerSide || a.depth - b.depth);
    const fences = shapes.filter(shape => shape.type === 'fence').flatMap(line => visibleFenceSegments(line, faces, camera));
    const labels = [1, -1].flatMap(side => {
        const visible = labelCandidates.filter(label => label.side === side && !faces.some(face => hiddenLineInterval({ points: [label.point, label.point] }, face, camera))).sort((a, b) => b.area - a.area);
        return visible.length ? [visible[0]] : [];
    });
    return { shapes: [...faces, ...fences], labels };
}
