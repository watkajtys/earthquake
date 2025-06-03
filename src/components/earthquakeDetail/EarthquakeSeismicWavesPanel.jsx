import React, { memo } from 'react';

function EarthquakeSeismicWavesPanel({
    exhibitPanelClass,
    exhibitTitleClass,
    captionClass
}) {
    return (
        <div className={`${exhibitPanelClass} border-fuchsia-500`}>
            <h2 className={`${exhibitTitleClass} text-fuchsia-800 border-fuchsia-200`}>Understanding Seismic Waves</h2>
            <div className="grid md:grid-cols-2 gap-4 mt-2">
                <div className="text-center p-2 bg-blue-50 rounded-md">
                    <strong>P-Waves (Primary)</strong>
                    <svg width="150" height="80" viewBox="0 0 150 80" className="mx-auto mt-1">
                        <line x1="10" y1="40" x2="140" y2="40" stroke="#4b5563" strokeWidth="1" />

                        {/* Animated P-Wave Lines - Refined for clearer longitudinal motion */}
                        {Array.from({ length: 11 }).map((_, i) => {
                            const baseX = 20 + i * 10; // Base x position for each line
                            const amplitude = 2.5; // Max displacement
                            return (
                                <line
                                    key={`pwave-line-${i}`}
                                    y1="32" // Shorter lines
                                    y2="48"
                                    stroke="#3b82f6"
                                    strokeWidth="1.5" // Thinner lines
                                >
                                    <animate
                                        attributeName="x1"
                                        values={`${baseX};${baseX - amplitude};${baseX};${baseX + amplitude};${baseX};${baseX}`}
                                        dur="2s"
                                        begin={`${i * 0.12}s`} // Staggered start for propagation
                                        repeatCount="indefinite"
                                    />
                                    <animate
                                        attributeName="x2"
                                        values={`${baseX};${baseX - amplitude};${baseX};${baseX + amplitude};${baseX};${baseX}`}
                                        dur="2s"
                                        begin={`${i * 0.12}s`} // Staggered start for propagation
                                        repeatCount="indefinite"
                                    />
                                </line>
                            );
                        })}
                        <text x="75" y="70" fontSize="10" textAnchor="middle">Push-Pull Motion →</text>
                    </svg>
                    <p className="text-xs text-slate-600">Fastest, compressional.</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-md">
                    <strong>S-Waves (Secondary)</strong>
                    <svg width="150" height="80" viewBox="0 0 150 80" className="mx-auto mt-1">
                        <path d="M10 40 Q 25 20 40 40 T 70 40 T 100 40 T 130 40" stroke="#ef4444" strokeWidth="1.5" fill="none" strokeOpacity="0.4"/>
                        <line x1="10" y1="40" x2="140" y2="40" stroke="#4b5563" strokeWidth="0.5" strokeDasharray="2,2"/>
                        {/* Animated Particles for S-Wave - Refined */}
                        {[15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125].map((cx, i) => (
                            <circle key={`swave-particle-${i}`} cx={cx} cy="40" r="2.5" fill="#ef4444">
                                <animate
                                    attributeName="cy"
                                    values="40;25;40;55;40" // Increased amplitude
                                    dur="2s" // Slightly slower duration
                                    begin={`${i * 0.12}s`} // Adjusted begin for smoother wave with new duration
                                    repeatCount="indefinite"
                                />
                            </circle>
                        ))}
                        <text x="75" y="70" fontSize="10" textAnchor="middle">Side-to-Side Motion ↕</text>
                    </svg>
                    <p className="text-xs text-slate-600">Slower, shear, solids only.</p>
                </div>
            </div>

            {/* New Earth Cross-Section Diagram */}
            <div className="mt-6 text-center">
                <h3 className="text-md font-semibold text-fuchsia-700 mb-2">P & S Wave Travel Through Earth</h3>
                <svg width="100%" viewBox="0 0 300 260" className="mx-auto bg-slate-50 rounded-md border border-fuchsia-200">
                    <defs>
                        <marker id="arrowhead-p" markerWidth="5" markerHeight="3.5" refX="4.5" refY="1.75" orient="auto" markerUnits="strokeWidth">
                            <polygon points="0 0, 5 1.75, 0 3.5" fill="#3b82f6"/>
                        </marker>
                        <marker id="arrowhead-s" markerWidth="5" markerHeight="3.5" refX="4.5" refY="1.75" orient="auto" markerUnits="strokeWidth">
                            <polygon points="0 0, 5 1.75, 0 3.5" fill="#ef4444"/>
                        </marker>
                    </defs>

                    {/* Earth Layers */}
                    {/* Center x=150, y=130 */}
                    <circle cx="150" cy="130" r="100" fill="#f8f1e0" stroke="#d3c0ac" strokeWidth="1" /> {/* Crust/Lithosphere (outermost visual boundary) */}
                    <text x="150" y="35" textAnchor="middle" fontSize="9" fill="#8c6e54">Crust</text>

                    <circle cx="150" cy="130" r="98" fill="#fed7aa" stroke="#fca557" strokeWidth="1" /> {/* Mantle */}
                    <text x="150" y="65" textAnchor="middle" fontSize="9" fill="#b45309">Mantle</text>

                    <circle cx="150" cy="130" r="55" fill="#fef08a" stroke="#facc15" strokeWidth="1" /> {/* Outer Core */}
                    <text x="150" y="100" textAnchor="middle" fontSize="9" fill="#ca8a04">Outer Core (Liquid)</text>

                    <circle cx="150" cy="130" r="25" fill="#fde047" stroke="#eab308" strokeWidth="1" /> {/* Inner Core */}
                    <text x="150" y="132" textAnchor="middle" fontSize="9" fill="#a16207">Inner Core (Solid)</text>

                    {/* Earthquake Hypocenter (Top-left side, on the "crust") */}
                    {/* Approximate position: x=150 - r_mantle*cos(angle), y=130 - r_mantle*sin(angle) */}
                    {/* For angle = 135 degrees (top left): cos(135) = -0.707, sin(135) = 0.707 */}
                    {/* x = 150 - 98 * (-0.707) = 150 + 69 = 219 (too far right) */}
                    {/* Let's place it visually: x=60, y=50 (on the mantle boundary for simplicity) */}
                    <path d="M58 48 l 4 4 l -6 2 l 2 -6 l 4 4" fill="#ff0000" stroke="black" strokeWidth="0.5" /> {/* Simple star-like shape */}
                    <text x="50" y="40" fontSize="8" fill="black">EQ</text>

                    {/* P-Wave Paths (Blue) - Showing refraction and passing through core */}
                    {/* Path 1: Through inner core */}
                    <path d="M60 50 Q 100 100 150 130 T 240 210" stroke="#3b82f6" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead-p)" />
                    <text x="140" y="155" fontSize="8" fill="#3b82f6">P</text>
                    {/* Path 2: Through mantle only to other side */}
                    <path d="M60 50 C 80 80, 120 200, 200 220" stroke="#3b82f6" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead-p)" />
                    <text x="185" y="190" fontSize="8" fill="#3b82f6">P</text>
                    {/* Path 3: Refracted by outer core, not through inner */}
                    <path d="M60 50 Q 150 170 250 170" stroke="#3b82f6" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead-p)" />
                     <text x="230" y="155" fontSize="8" fill="#3b82f6">P</text>


                    {/* S-Wave Paths (Red) - Stopped by Outer Core */}
                    {/* Path 1: Travels through mantle, stops at outer core */}
                    <path d="M60 50 C 70 90, 80 120, 110 145" stroke="#ef4444" strokeWidth="1.5" fill="none" />
                    {/* No marker, it stops */}
                    <text x="90" y="110" fontSize="8" fill="#ef4444">S</text>
                    {/* Path 2: Another S-wave stopping */}
                    <path d="M60 50 C 90 70, 120 80, 142 98" stroke="#ef4444" strokeWidth="1.5" fill="none" />
                    <text x="125" y="80" fontSize="8" fill="#ef4444">S</text>

                    {/* S-Wave Shadow Zone Indication (Optional visual cue) */}
                    <rect x="180" y="40" width="100" height="180" fill="#e2e8f0" fillOpacity="0.3" rx="10" ry="10" />
                    <text x="230" y="30" textAnchor="middle" fontSize="9" fill="#475569">S-Wave Shadow Zone</text>

                </svg>
                <p className={`${captionClass} mt-2 text-xs px-2`}>
                    P-waves (e.g., blue lines) are compressional and can travel through all of Earth's layers.
                    S-waves (e.g., red lines) are shear waves and cannot pass through the liquid outer core.
                    This creates an "S-wave shadow zone" on the far side of the Earth from an earthquake,
                    which helped scientists discover the outer core is liquid.
                </p>
            </div>

            <p className={`${captionClass} mt-3`}>Surface waves (Love & Rayleigh) arrive later and often cause most shaking.</p>
        </div>
    );
}

export default memo(EarthquakeSeismicWavesPanel);
