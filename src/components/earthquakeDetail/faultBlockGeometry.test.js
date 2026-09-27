import { describe, expect, it } from 'vitest';
import { buildFaultBlockModel, faultBlockCamera, faultBlockScene, MAX_RELATIVE_SLIP, projectFaultPoint } from './faultBlockGeometry.js';

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const volume = block => block.faces.reduce((sum, face) => {
    for (let index = 1; index < face.points.length - 1; index++) sum += dot(face.points[0], cross(face.points[index], face.points[index + 1])) / 6;
    return sum;
}, 0);

// Independent projected triangle/ray intersection: this catches painter-order
// errors that a test of average depths cannot detect on overlapping polygons.
const depthAt = (points, x, y) => {
    const a = points[0];
    for (let index = 1; index < points.length - 1; index++) {
        const b = points[index], c = points[index + 1];
        const determinant = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        const weightA = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / determinant;
        const weightB = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / determinant;
        const weightC = 1 - weightA - weightB;
        if (weightA >= 0 && weightB >= 0 && weightC >= 0) return weightA * a.depth + weightB * b.depth + weightC * c.depth;
    }
    return null;
};

describe('3D fault-block physical geometry', () => {
    it.each([0, 0.01, 15, 35, 60, 89.99, 90])('clips closed rock volumes with the actual dip %s°', dip => {
        const model = buildFaultBlockModel({ strike: 137, dip, rake: -42 }, 0.7);
        expect(model.blocks.reduce((sum, block) => sum + volume(block), 0)).toBeCloseTo(2.2 * 2.2 * 1.5, 9);
        for (const block of model.blocks) {
            expect(volume(block)).toBeGreaterThan(0);
            const faultFace = block.faces.find(face => face.kind === 'fault');
            expect(faultFace.points.length).toBeGreaterThanOrEqual(3);
            for (const face of block.faces) {
                for (const point of face.points) {
                    const original = subtract(point, block.offset);
                    expect(block.side * dot(model.normal, original)).toBeGreaterThanOrEqual(-1e-9);
                    if (face.kind === 'fault') expect(dot(model.normal, point)).toBeCloseTo(0, 10);
                }
            }
        }
    });

    it.each([
        [{ strike: 0, dip: 60, rake: -90 }, [0.5, 0, -Math.sqrt(3) / 2]],
        [{ strike: 0, dip: 60, rake: 90 }, [-0.5, 0, Math.sqrt(3) / 2]],
        [{ strike: 0, dip: 90, rake: 0 }, [0, 1, 0]],
        [{ strike: 0, dip: 90, rake: 180 }, [0, -1, 0]],
        [{ strike: 90, dip: 60, rake: -90 }, [0, -0.5, -Math.sqrt(3) / 2]],
    ])('moves A relative to B in the geological slip direction for %j', (plane, expected) => {
        const model = buildFaultBlockModel(plane, 1);
        const relative = subtract(model.blocks[0].offset, model.blocks[1].offset);
        relative.forEach((value, index) => expect(value).toBeCloseTo(expected[index] * MAX_RELATIVE_SLIP, 10));
        expect(dot(relative, model.normal)).toBeCloseTo(0, 10);
        expect(Math.hypot(...relative)).toBeCloseTo(MAX_RELATIVE_SLIP, 10);
    });

    it('splits the fence at the real surface intersection and offsets its cut ends with the blocks', () => {
        const plane = { strike: 20, dip: 60, rake: -45 };
        const initial = buildFaultBlockModel(plane, 0);
        expect(initial.surfaceIntersection).toBe(true);
        const initiallyA = initial.blocks[0].fence[0].points[0];
        const initiallyB = initial.blocks[1].fence[0].points[1];
        initiallyA.forEach((value, index) => expect(value).toBeCloseTo(initiallyB[index], 10));
        const moved = buildFaultBlockModel(plane, 0.75);
        const fenceOffset = subtract(moved.blocks[0].fence[0].points[0], moved.blocks[1].fence[0].points[1]);
        fenceOffset.forEach((value, index) => expect(value).toBeCloseTo(moved.slip[index] * MAX_RELATIVE_SLIP * 0.75, 10));
    });

    it('keeps a shallow or horizontal plane underground rather than inventing a top trace', () => {
        for (const dip of [0, 10]) {
            const model = buildFaultBlockModel({ strike: 0, dip, rake: 0 });
            expect(model.surfaceIntersection).toBe(false);
            expect(model.blocks[0].fence.length).toBeGreaterThan(0);
            expect(model.blocks[1].fence).toEqual([]);
        }
    });

    it('refuses incomplete or invalid orientation and bounds illustrative movement', () => {
        expect(buildFaultBlockModel({ strike: 0, dip: 50 })).toBeNull();
        expect(buildFaultBlockModel({ strike: 0, dip: 91, rake: 90 })).toBeNull();
        expect(buildFaultBlockModel({ strike: 0, dip: 50, rake: 90 }, 2).amount).toBe(MAX_RELATIVE_SLIP);
        expect(buildFaultBlockModel({ strike: 0, dip: 50, rake: 90 }, -2).amount).toBe(0);
    });
});

describe('3D viewing projection', () => {
    it('puts north up and east right in the north-up top preset without changing the model', () => {
        const camera = faultBlockCamera(180, 90);
        expect(projectFaultPoint([1, 0, 0], camera, [0, 0], 1).x).toBeCloseTo(1);
        expect(projectFaultPoint([0, 1, 0], camera, [0, 0], 1).y).toBeCloseTo(-1);
        expect(projectFaultPoint([0, 0, 1], camera, [0, 0], 1).y).toBeCloseTo(0);
    });

    it('uses a right-handed orthonormal camera and culls faces pointing away', () => {
        const camera = faultBlockCamera(231, 34);
        expect(dot(camera.right, camera.up)).toBeCloseTo(0);
        expect(dot(camera.right, camera.towardViewer)).toBeCloseTo(0);
        expect(cross(camera.right, camera.up)).toEqual(camera.towardViewer);
        const scene = faultBlockScene(buildFaultBlockModel({ strike: 18, dip: 65, rake: 130 }, 1), camera);
        expect(scene.labels.map(label => label.side).sort()).toEqual([-1, 1]);
        scene.shapes.forEach(shape => {
            if (shape.type === 'face') expect(dot(shape.normal, camera.towardViewer)).toBeGreaterThan(0);
            shape.points.forEach(point => expect([point.x, point.y, point.depth].every(Number.isFinite)).toBe(true));
        });
    });

    it.each([0, 10, 45, 90])('keeps nearer rock in front and hides fence segments behind it at dip %s°', dip => {
        for (const rake of [-90, 0, 90]) {
            for (const azimuth of [20, 135, 240]) {
                const scene = faultBlockScene(buildFaultBlockModel({ strike: 0, dip, rake }, 1), faultBlockCamera(azimuth, 28));
                const faces = scene.shapes.filter(shape => shape.type === 'face');
                for (let x = 80; x < 520; x += 19) {
                    for (let y = 50; y < 370; y += 19) {
                        const depths = faces.map(face => depthAt(face.points, x, y)).filter(depth => depth !== null);
                        if (depths.length > 1) expect(depths[depths.length - 1]).toBeCloseTo(Math.max(...depths), 7);
                    }
                }
                for (const line of scene.shapes.filter(shape => shape.type === 'fence')) {
                    const point = Object.fromEntries(['x', 'y', 'depth'].map(coordinate => [coordinate, (line.points[0][coordinate] + line.points[1][coordinate]) / 2]));
                    for (const face of faces) {
                        const depth = depthAt(face.points, point.x, point.y);
                        if (depth !== null) expect(depth).toBeLessThanOrEqual(point.depth + 1e-7);
                    }
                }
                for (const { point } of scene.labels) {
                    for (const face of faces) {
                        const depth = depthAt(face.points, point.x, point.y);
                        if (depth !== null) expect(depth).toBeLessThanOrEqual(point.depth + 1e-7);
                    }
                }
            }
        }
    });
});
