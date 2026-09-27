// USGS/Aki-Richards convention: strike clockwise from north, dip to its right,
// and rake describes hanging-wall slip relative to the footwall.
// https://pubs.usgs.gov/of/2008/1327/of2008-1327.pdf (p. 93)
// Rake 0 = left-lateral, 180 = right-lateral, +90 = reverse, -90 = normal.
const radians = Math.PI / 180;
const clean = (value) => Math.abs(value) < 1e-12 ? 0 : value;
const finiteNumber = (value) => (
    (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value))
);

export function getFaultDiagramGeometry(plane) {
    if (!plane || ![plane.strike, plane.dip, plane.rake].every(finiteNumber)) return null;
    const dip = Number(plane.dip);
    if (dip < 0 || dip > 90) return null;
    const strike = ((Number(plane.strike) % 360) + 360) % 360;
    const rake = ((Number(plane.rake) + 180) % 360 + 360) % 360 - 180;
    const strikeRadians = strike * radians;
    const dipRadians = dip * radians;
    const rakeRadians = rake * radians;
    const alongStrike = clean(Math.cos(rakeRadians));
    const upDip = clean(Math.sin(rakeRadians));
    const sinStrike = clean(Math.sin(strikeRadians));
    const cosStrike = clean(Math.cos(strikeRadians));
    const sinDip = clean(Math.sin(dipRadians));
    const cosDip = clean(Math.cos(dipRadians));

    // Unit slip = cos(rake) * strike - sin(rake) * down-dip.
    const slip = {
        east: clean(alongStrike * sinStrike - upDip * cosDip * cosStrike),
        north: clean(alongStrike * cosStrike + upDip * cosDip * sinStrike),
        up: clean(upDip * sinDip),
    };
    return {
        strike, dip, rake,
        dipDirection: (strike + 90) % 360,
        slip,
        // SVG y increases downward. The section's right side faces down dip.
        mapSlip: { x: slip.east, y: -slip.north },
        sectionSlip: { x: clean(-upDip * cosDip), y: clean(-upDip * sinDip) },
        mapDownDip: { x: cosStrike, y: sinStrike },
        sectionDownDip: { x: cosDip, y: sinDip },
        alongStrike,
    };
}
