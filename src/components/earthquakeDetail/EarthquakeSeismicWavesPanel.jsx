import React, { memo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { calculatePWaveTravelTime, calculateSWaveTravelTime } from '../../utils/seismicUtils.js';

// Constants for wave speeds (km/s) - can be moved to utils if shared
const P_WAVE_VELOCITY = 6.5;
const S_WAVE_VELOCITY = 3.75;


function EarthquakeSeismicWavesPanel({
    exhibitPanelClass,
    exhibitTitleClass,
    captionClass,
    eventTime, // Not used in current calculations, but available
    eventDepth // Not used in current calculations, but available
}) {
    const [distance, setDistance] = useState(100); // Initial distance in km
    const [pWaveTimeActual, setPWaveTimeActual] = useState(calculatePWaveTravelTime(distance, P_WAVE_VELOCITY));
    const [sWaveTimeActual, setSWaveTimeActual] = useState(calculateSWaveTravelTime(distance, S_WAVE_VELOCITY));

    useEffect(() => {
        setPWaveTimeActual(calculatePWaveTravelTime(distance, P_WAVE_VELOCITY));
        setSWaveTimeActual(calculateSWaveTravelTime(distance, S_WAVE_VELOCITY));
    }, [distance]);

    const spGapTimeActual = sWaveTimeActual - pWaveTimeActual;

    // SVG dimensions and layout constants
    const svgWidth = 500;
    const svgHeight = 200;
    const stationX = 50; // X coordinate of the seismic station
    const epicenterMaxX = 450; // Max X coordinate for wave travel path, representing max distance on slider
    const wavePathY = svgHeight / 2;
    const waveRadius = 8; // Radius of the animated wave circle

    // Animation scaling
    // We want the animation to be visible. Let's say the longest S-wave animation (for max distance)
    // should take about MAX_ANIM_DURATION_S seconds.
    const MAX_DISTANCE_SLIDER = 400; // km, should match slider max
    const MAX_ANIM_DURATION_S = 5; // seconds for the S-wave at max distance

    // Calculate animation durations
    // sWaveAnimDuration is capped by MAX_ANIM_DURATION_S at MAX_DISTANCE_SLIDER
    // For other distances, it's proportional.
    // If distance = MAX_DISTANCE_SLIDER, sWaveTimeActualForMax = MAX_DISTANCE_SLIDER / S_WAVE_VELOCITY
    // Then, sWaveAnimDuration = (sWaveTimeActual / sWaveTimeActualForMax) * MAX_ANIM_DURATION_S
    // This simplifies to: sWaveAnimDuration = (distance / S_WAVE_VELOCITY) / (MAX_DISTANCE_SLIDER / S_WAVE_VELOCITY) * MAX_ANIM_DURATION_S
    // sWaveAnimDuration = (distance / MAX_DISTANCE_SLIDER) * MAX_ANIM_DURATION_S
    // This makes the animation speed constant in the SVG regardless of actual wave speed, which is NOT what we want.

    // Let's use a simpler approach: Scale real times by a constant factor.
    // If sWaveTimeActual is 60s, and scale is 0.1, anim is 6s.
    // If pWaveTimeActual is 30s, and scale is 0.1, anim is 3s. This maintains relative speed.
    const ANIMATION_TIME_SCALE = 0.15; // Adjust this to make animations faster/slower overall
                                     // e.g., 0.1 means 10 real seconds become 1 animation second.

    let pWaveAnimDuration = pWaveTimeActual * ANIMATION_TIME_SCALE;
    let sWaveAnimDuration = sWaveTimeActual * ANIMATION_TIME_SCALE;

    // Cap maximum animation duration to prevent overly long animations if ANIMATION_TIME_SCALE is too large
    // or distances are extreme.
    const ABSOLUTE_MAX_ANIM_DUR = 8; // seconds
    if (sWaveAnimDuration > ABSOLUTE_MAX_ANIM_DUR) {
        const scaleCorrection = ABSOLUTE_MAX_ANIM_DUR / sWaveAnimDuration;
        sWaveAnimDuration = ABSOLUTE_MAX_ANIM_DUR;
        pWaveAnimDuration *= scaleCorrection;
    }
    // Ensure pWave is never slower than S wave if times are tiny (e.g. distance = 0)
    if (pWaveAnimDuration > sWaveAnimDuration && sWaveTimeActual > pWaveTimeActual) {
        pWaveAnimDuration = sWaveAnimDuration * (pWaveTimeActual / sWaveTimeActual);
    }
     if (pWaveAnimDuration < 0.1) pWaveAnimDuration = 0.1; // Minimum animation time
     if (sWaveAnimDuration < 0.1) sWaveAnimDuration = 0.1; // Minimum animation time


    const handleDistanceChange = (event) => {
        setDistance(Number(event.target.value));
    };

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

            {/* Interactive P & S Wave Travel Visualization Section */}
            <div className="mt-4">
                <h3 className={`${exhibitTitleClass} text-fuchsia-800 border-fuchsia-200 text-base mb-2`}>Interactive P & S Wave Travel</h3>

                {/* Distance Slider */}
                <div className="my-4 p-3 bg-slate-50 rounded-md shadow">
                    <label htmlFor="distance-slider" className="block text-sm font-medium text-slate-700">
                        Epicenter Distance: <span className="font-bold text-fuchsia-700">{distance} km</span>
                    </label>
                    <input
                        type="range"
                        id="distance-slider"
                        name="distance"
                        min="10"
                        max="400" // Max distance in km for the slider
                        value={distance}
                        onChange={handleDistanceChange}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                    />
                </div>

                {/* SVG Visualization */}
                {/* Use a key on the SVG container to force re-render of animations when distance changes */}
                <div key={distance} className="relative bg-gray-100 p-2 rounded-md shadow overflow-hidden">
                    <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                        {/* Station (origin of waves) */}
                        <circle cx={stationX} cy={wavePathY} r="10" fill="#3b82f6" />
                        <text x={stationX} y={wavePathY + 25} textAnchor="middle" fontSize="12">Station</text>

                        {/* Epicenter marker: position it at a scaled representation of the distance */}
                        {/* The visual path length is (epicenterMaxX - stationX) which corresponds to MAX_DISTANCE_SLIDER km */}
                        {/* So, current visual epicenter is stationX + (distance / MAX_DISTANCE_SLIDER) * (epicenterMaxX - stationX) */}
                        {(() => {
                            const currentEpicenterX = stationX + (distance / MAX_DISTANCE_SLIDER) * (epicenterMaxX - stationX);
                            return (
                                <>
                                    <line x1={currentEpicenterX} y1={wavePathY - 20} x2={currentEpicenterX} y2={wavePathY + 20} stroke="#e11d48" strokeWidth="2" strokeDasharray="4 2"/>
                                    <text x={currentEpicenterX} y={wavePathY + 25} textAnchor="middle" fontSize="12" fill="#e11d48">Epicenter ({distance} km)</text>
                                    {/* Wave Path Line - from station to current epicenter X */}
                                    <line x1={stationX} y1={wavePathY} x2={currentEpicenterX} y2={wavePathY} stroke="#a5b4fc" strokeWidth="2" />

                                    {/* P-Wave Animation */}
                                    {pWaveTimeActual > 0 && pWaveAnimDuration > 0 && (
                                        <circle cx={stationX} cy={wavePathY} r={waveRadius} fill="#3b82f6" fillOpacity="0.8">
                                            <animate
                                                attributeName="cx"
                                                values={`${stationX};${currentEpicenterX}`}
                                                dur={`${pWaveAnimDuration.toFixed(2)}s`}
                                                keyTimes="0;1"
                                                calcMode="linear"
                                                repeatCount="1"
                                                fill="freeze"
                                            />
                                        </circle>
                                    )}

                                    {/* S-Wave Animation */}
                                    {sWaveTimeActual > 0 && sWaveAnimDuration > 0 && (
                                        <circle cx={stationX} cy={wavePathY} r={waveRadius} fill="#ef4444" fillOpacity="0.8">
                                            <animate
                                                attributeName="cx"
                                                values={`${stationX};${currentEpicenterX}`}
                                                dur={`${sWaveAnimDuration.toFixed(2)}s`}
                                                keyTimes="0;1"
                                                calcMode="linear"
                                                repeatCount="1"
                                                fill="freeze"
                                            />
                                        </circle>
                                    )}
                                </>
                            );
                        })()}
                    </svg>
                </div>

                {/* Travel Times Display */}
                <div className="mt-3 p-3 bg-slate-100 rounded-md shadow">
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                            <p className="text-sm font-medium text-blue-600">P-Wave Arrival</p>
                            <p className="text-lg font-semibold">{pWaveTimeActual.toFixed(1)} s</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-red-600">S-Wave Arrival</p>
                            <p className="text-lg font-semibold">{sWaveTimeActual.toFixed(1)} s</p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-fuchsia-700">S-P Gap</p>
                            <p className="text-lg font-semibold">{spGapTimeActual.toFixed(1)} s</p>
                        </div>
                    </div>
                </div>
                <p className={`${captionClass} mt-2`}>
                    Adjust the slider to see how travel times change with distance. Assumes average crustal velocities
                    (P: {P_WAVE_VELOCITY} km/s, S: {S_WAVE_VELOCITY} km/s) and ignores depth. The animation shows the relative speed of the waves to the epicenter.
                </p>
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
    eventTime: PropTypes.number, // Available, not currently used in this panel's new viz
    eventDepth: PropTypes.number, // Available, not currently used in this panel's new viz
};

export default memo(EarthquakeSeismicWavesPanel);
