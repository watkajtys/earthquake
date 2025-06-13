import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { calculatePWaveTravelTime, calculateSWaveTravelTime } from '../../utils/seismicUtils.js';

function EarthquakeSeismicWavesPanel({
    exhibitPanelClass,
    exhibitTitleClass,
    captionClass,
    // eslint-disable-next-line no-unused-vars
    eventTime, // Not used in current calculations, but available
    // eslint-disable-next-line no-unused-vars
    eventDepth // Not used in current calculations, but available
}) {
    const hypotheticalDistances = [50, 150, 300, 500]; // in km

    const travelTimeData = hypotheticalDistances.map(dist => {
        const pTime = calculatePWaveTravelTime(dist);
        const sTime = calculateSWaveTravelTime(dist);
        const spGap = sTime - pTime;
        return {
            distance: dist,
            pTravelTime: pTime,
            sTravelTime: sTime,
            spGapTime: spGap,
        };
    });

    return (
        <div className={`${exhibitPanelClass} border-fuchsia-500`}>
            <h2 className={`${exhibitTitleClass} text-fuchsia-800 border-fuchsia-200`}>Understanding Seismic Waves</h2>
            <div className="grid md:grid-cols-2 gap-4 mt-2">
                <div className="text-center p-2 bg-blue-50 rounded-md flex flex-col">
                    <strong>P-Waves (Primary)</strong>
                    <svg viewBox="0 0 250 150" className="mx-auto mt-1 w-full h-auto max-w-xs">
                        {/* Wave propagation direction arrow */}
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
                            </marker>
                        </defs>
                        <line x1="30" y1="100" x2="220" y2="100" stroke="#333" strokeWidth="1" markerEnd="url(#arrowhead)" />
                        <text x="125" y="115" fontSize="10" textAnchor="middle">Direction of Wave Propagation</text>

                        {/* Particles representing the medium */}
                        {[...Array(20)].map((_, i) => {
                            const initialXBase = 15 + i * 10; // Base X position for particle i
                            const particleHeight = 30; // Slightly reduce height for visual balance
                            const particleY = 45; // Adjust Y to center particles
                            const amplitude = 4; // Max displacement in X

                            const initialWidth = 6;
                            const compressedWidth = 8;
                            const rarefiedWidth = 4;

                            const initialOpacity = 0.75;
                            const compressedOpacity = 1.0;
                            const rarefiedOpacity = 0.5;

                            // Values for a full cycle: initial -> compress -> initial -> rarefy -> initial
                            const xValues = [
                                initialXBase,
                                initialXBase + amplitude, // Compression peak (particles move right, pushing)
                                initialXBase,
                                initialXBase - amplitude, // Rarefaction peak (particles move left, pulling back)
                                initialXBase
                            ].join(';');

                            const widthValues = [
                                initialWidth,
                                compressedWidth,
                                initialWidth,
                                rarefiedWidth,
                                initialWidth
                            ].join(';');

                            const opacityValues = [
                                initialOpacity,
                                compressedOpacity,
                                initialOpacity,
                                rarefiedOpacity,
                                initialOpacity
                            ].join(';');

                            return (
                                <rect
                                    key={i}
                                    x={initialXBase - initialWidth / 2} // Center particle around its x position
                                    y={particleY - particleHeight / 2}
                                    width={initialWidth}
                                    height={particleHeight}
                                    fill="#3b82f6"
                                    rx="1" // Slightly rounded corners
                                >
                                    <animate
                                        attributeName="x"
                                        values={xValues}
                                        dur="2s"
                                        begin={`${i * 0.075}s`} // Stagger start time for traveling wave
                                        repeatCount="indefinite"
                                        calcMode="spline"
                                        keyTimes="0; 0.25; 0.5; 0.75; 1"
                                        keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
                                    />
                                    <animate
                                        attributeName="width"
                                        values={widthValues}
                                        dur="2s"
                                        begin={`${i * 0.075}s`}
                                        repeatCount="indefinite"
                                        calcMode="spline"
                                        keyTimes="0; 0.25; 0.5; 0.75; 1"
                                        keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
                                    />
                                    <animate
                                        attributeName="fill-opacity"
                                        values={opacityValues}
                                        dur="2s"
                                        begin={`${i * 0.075}s`}
                                        calcMode="spline"
                                        keyTimes="0; 0.25; 0.5; 0.75; 1"
                                        keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
                                        repeatCount="indefinite"
                                    />
                                </rect>
                            );
                        })}

                        {/* Labels for Compression and Rarefaction - adjusted positions if needed */}
                        <text x="50" y="25" fontSize="10" textAnchor="middle">Compression</text>
                        {/* Example visual hint for compression zone, if static labels are not enough */}
                        {/* <rect x="40" y="30" width="30" height="5" fill="rgba(0,0,0,0.05)" rx="2" /> */}
                        <text x="180" y="25" fontSize="10" textAnchor="middle">Rarefaction</text>
                        {/* <rect x="165" y="30" width="30" height="5" fill="rgba(0,0,0,0.05)" rx="2" /> */}

                        {/* Particle Motion Label - ensure it points along the particle movement axis */}
                        <line x1="25" y1="70" x2="45" y2="70" stroke="#333" strokeWidth="1" markerEnd="url(#arrowhead)" markerStart="url(#arrowhead)"/>
                        <text x="35" y="85" fontSize="10" textAnchor="middle">Particle Motion</text>
                    </svg>
                    <p className="text-xs text-slate-600 mt-auto pt-2">Fastest waves, they compress and rarefy the material they pass through. Particles move back and forth in the same direction as the wave propagation. The table below illustrates how their travel time compares to S-waves over various distances.</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-md flex flex-col">
                    <strong>S-Waves (Secondary)</strong>
                    <svg viewBox="0 0 250 150" className="mx-auto mt-1 w-full h-auto max-w-xs">
                        {/* Wave propagation direction arrow */}
                        <defs>
                            <marker id="s_arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
                            </marker>
                        </defs>
                        <line x1="30" y1="100" x2="220" y2="100" stroke="#333" strokeWidth="1" markerEnd="url(#s_arrowhead)" />
                        <text x="125" y="115" fontSize="10" textAnchor="middle">Direction of Wave Propagation</text>

                        {/* S-Wave path - extended for animation */}
                        {/* Original segment for one wavelength: M30,50 Q55,20 80,50 T130,50 (100px wide) */}
                        {/* Estimated length of one wavelength (100px wide, 30px amplitude) is ~156-160px */}
                        <path
                            d="M-250 50 q25 -30 50 0 t50 0 q25 -30 50 0 t50 0 q25 -30 50 0 t50 0 q25 -30 50 0 t50 0 q25 -30 50 0 t50 0 q25 -30 50 0 t50 0 q25 -30 50 0 t50 0" // Path starts further left, 7 wavelengths
                            stroke="#ef4444"
                            strokeWidth="3"
                            fill="none"
                            strokeDasharray="200" // Length of ONE full wave cycle
                            strokeDashoffset="0"
                        >
                            <animate
                                attributeName="stroke-dashoffset"
                                values="0;-400" // Animates over ONE full wave cycle
                                dur="6s" // Duration for ONE full wave cycle to pass
                                repeatCount="indefinite"
                            />
                        </path>

                        {/* Particles demonstrating shear motion */}
                        {[...Array(5)].map((_, i) => {
                            const initialX = 30 + i * 45;
                            const particleYPos = 50; // Central Y position
                            const amplitude = 20; // Max Y displacement, matches wave amplitude

                            // Particle Y values: center, top, center, bottom, center
                            const yValues = [
                                particleYPos,
                                particleYPos - amplitude,
                                particleYPos,
                                particleYPos + amplitude,
                                particleYPos
                            ].join(';');

                            return (
                                <rect
                                    key={i}
                                    x={initialX - 4} // Particle width 8
                                    y={particleYPos - 4} // Particle height 8
                                    width="8"
                                    height="8"
                                    fill="#c026d3" // Fuchsia color for particles
                                    rx="1"
                                >
                                    <animate
                                        attributeName="y"
                                        values={yValues}
                                        dur="2s" // Sync with wave cycle duration
                                        begin={`${((initialX - 30) % 100 / 100) * 2}s`}
                                        repeatCount="indefinite"
                                        calcMode="spline"
                                        keyTimes="0; 0.25; 0.5; 0.75; 1"
                                        keySplines="0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1"
                                    />
                                </rect>
                            );
                        })}

                        {/* Particle Motion Label - adjusted position */}
                        <line x1={30 + 45 -4} y1="30" x2={30 + 45 -4} y2="70" stroke="#333" strokeWidth="1" markerEnd="url(#s_arrowhead)" markerStart="url(#s_arrowhead)"/>
                        <text x={30 + 45 + 5} y="55" fontSize="10" textAnchor="start">Particle Motion</text>
                    </svg>
                    <p className="text-xs text-slate-600 mt-auto pt-2">Slower than P-waves, they cause particles to shear the material they pass through. Particles move side-to-side, perpendicular to the wave propagation direction. See the table below to compare their travel times with P-waves and understand the resulting 'S-P gap' used in locating earthquakes.</p>
                </div>
            </div>
            <p className={`${captionClass} mt-3`}>Surface waves (Love & Rayleigh) arrive later and often cause most shaking.</p>

            {/* P & S Wave Travel Times Table Section */}
            <div className="mt-4">
                <h3 className={`${exhibitTitleClass} text-fuchsia-800 border-fuchsia-200 text-base mb-2`}>P & S Wave Travel Times (Illustrative)</h3>
                <div className="overflow-x-auto bg-slate-50 p-3 rounded-md shadow">
                    <table className="w-full text-sm text-left text-slate-700">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                            <tr>
                                <th scope="col" className="px-4 py-2">Distance (km)</th>
                                <th scope="col" className="px-4 py-2 text-center">P-Wave Travel (s)</th>
                                <th scope="col" className="px-4 py-2 text-center">S-Wave Travel (s)</th>
                                <th scope="col" className="px-4 py-2 text-center">S-P Gap (s)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {travelTimeData.map((data, index) => (
                                <tr key={index} className="border-b border-slate-200 hover:bg-slate-100">
                                    <td className="px-4 py-2 font-medium">{data.distance}</td>
                                    <td className="px-4 py-2 text-center">{data.pTravelTime.toFixed(1)}</td>
                                    <td className="px-4 py-2 text-center">{data.sTravelTime.toFixed(1)}</td>
                                    <td className="px-4 py-2 text-center">{data.spGapTime.toFixed(1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className={`${captionClass} mt-2`}>Note: Assumes average crustal velocities (P: 6.5 km/s, S: 3.75 km/s) and ignores depth.</p>
            </div>


            {/* Triangulation Section */}
            <div className="mt-6 p-4 bg-gray-50 rounded-md">
                <h3 className="text-lg font-semibold text-center text-teal-700 mb-2">How Triangulation Works</h3>
                <div className="grid md:grid-cols-2 gap-4 items-center">
                    <div>
                        <svg viewBox="0 0 300 200" className="mx-auto w-full h-auto max-w-sm">
                            {/* Seismic Stations with animation */}
                            {/* Station 1: (45, 150) */}
                            <polygon points="40,150 45,140 50,150" fill="#00796b">
                                <animate attributeName="fill" values="#00796b;#26a69a;#00796b" dur="0.4s" begin="0s" />
                            </polygon>
                            <text x="45" y="165" fontSize="10" textAnchor="middle">Station 1</text>

                            {/* Station 2: (255, 150) */}
                            <polygon points="250,150 255,140 260,150" fill="#00796b">
                                <animate attributeName="fill" values="#00796b;#26a69a;#00796b" dur="0.4s" begin="1.5s" />
                            </polygon>
                            <text x="255" y="165" fontSize="10" textAnchor="middle">Station 2</text>

                            {/* Station 3: (150, 20) */}
                            <polygon points="145,20 150,10 155,20" fill="#00796b">
                                <animate attributeName="fill" values="#00796b;#26a69a;#00796b" dur="0.4s" begin="3.0s" />
                            </polygon>
                            <text x="150" y="35" fontSize="10" textAnchor="middle">Station 3</text>

                            {/* Epicenter (target for circles) with animation */}
                            <circle cx="150" cy="100" r="5" fill="#d90429">
                                <animateTransform
                                    attributeName="transform"
                                    type="scale"
                                    values="1; 1.8; 1"
                                    dur="0.5s"
                                    begin="4.7s"
                                    additive="sum"
                                    fill="freeze"
                                    calcMode="spline"
                                    keyTimes="0; 0.5; 1"
                                    keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
                                />
                            </circle>
                            <text x="150" y="92" fontSize="10" textAnchor="middle" fontWeight="bold">Epicenter</text>

                            {/* Distance Circles - with wavefront style and new timing */}
                            <circle cx="45" cy="150" r="0" stroke="#7dd3fc" strokeWidth="2" strokeDasharray="8 4" fill="rgba(125, 211, 252, 0.1)">
                                <animate
                                    attributeName="r"
                                    from="0"
                                    to="116.3"
                                    dur="1.5s"
                                    begin="0.2s"
                                    fill="freeze"
                                    calcMode="spline"
                                    keyTimes="0; 1"
                                    keySplines="0.25 0.1 0.25 1"
                                />
                                <animate
                                    attributeName="fill-opacity"
                                    values="0.1;0.3;0.1"
                                    dur="1.5s"
                                    begin="0.2s"
                                    fill="freeze"
                                    calcMode="spline"
                                    keyTimes="0; 0.5; 1"
                                    keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
                                />
                            </circle>
                            <circle cx="255" cy="150" r="0" stroke="#fbbf24" strokeWidth="2" strokeDasharray="8 4" fill="rgba(251, 191, 36, 0.1)">
                                <animate
                                    attributeName="r"
                                    from="0"
                                    to="116.3"
                                    dur="1.5s"
                                    begin="1.7s"
                                    fill="freeze"
                                    calcMode="spline"
                                    keyTimes="0; 1"
                                    keySplines="0.25 0.1 0.25 1"
                                />
                                <animate
                                    attributeName="fill-opacity"
                                    values="0.1;0.3;0.1"
                                    dur="1.5s"
                                    begin="1.7s"
                                    fill="freeze"
                                    calcMode="spline"
                                    keyTimes="0; 0.5; 1"
                                    keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
                                />
                            </circle>
                            <circle cx="150" cy="20" r="0" stroke="#f87171" strokeWidth="2" strokeDasharray="8 4" fill="rgba(248, 113, 113, 0.1)">
                                <animate
                                    attributeName="r"
                                    from="0"
                                    to="80"
                                    dur="1.5s"
                                    begin="3.2s"
                                    fill="freeze"
                                    calcMode="spline"
                                    keyTimes="0; 1"
                                    keySplines="0.25 0.1 0.25 1"
                                />
                                <animate
                                    attributeName="fill-opacity"
                                    values="0.1;0.3;0.1"
                                    dur="1.5s"
                                    begin="3.2s"
                                    fill="freeze"
                                    calcMode="spline"
                                    keyTimes="0; 0.5; 1"
                                    keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
                                />
                            </circle>

                            <text x="10" y="195" fontSize="10" fill="#555">Distance Circles</text>
                        </svg>
                    </div>
                    <div className="text-sm text-slate-700">
                        <p className="mb-2">
                            Seismologists determine the distance to an earthquake by measuring the time difference between the arrival of P-waves (primary, faster) and S-waves (secondary, slower) at a seismic station. The P-waves travel faster than S-waves, so the larger the time gap between their arrivals, the farther away the earthquake.
                        </p>
                        <p>
                            To find the exact location (epicenter), data from at least three seismic stations is needed. A circle is drawn around each station, where the radius is the calculated distance. The point where all three circles intersect is the earthquake's epicenter.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

EarthquakeSeismicWavesPanel.propTypes = {
    exhibitPanelClass: PropTypes.string,
    exhibitTitleClass: PropTypes.string,
    captionClass: PropTypes.string,
    eventTime: PropTypes.number,
    eventDepth: PropTypes.number,
};

export default memo(EarthquakeSeismicWavesPanel);
