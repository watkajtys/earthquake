import React from 'react';

/**
 * Renders a simplified, illustrative 3D-perspective SVG block diagram
 * based on the fault type.
 *
 * @param {object} faultType - An object containing fault details, primarily `faultType.name`.
 * @param {string} faultType.name - The name of the fault type (e.g., "Normal Fault").
 */
function SimpleFaultBlockDiagram({ faultType }) {
    if (!faultType || !faultType.name) {
        return <div className="text-xs text-slate-500">Fault diagram unavailable.</div>;
    }

    const faultName = faultType.name.toLowerCase(); // For easier matching
    const isOblique = faultName.includes("oblique");

    // SVG Viewbox and Dimensions
    const width = 150;
    const height = 120; // Keep height, or adjust if text needs more space consistently
    const viewBox = `0 0 ${width} ${height}`;

    // Common styles
    const blockStroke = "#333";
    const blockStrokeWidth = 1;
    const arrowFill = "#cc0000";
    const textFill = "#111";
    const fontSizeSmall = "10px";

    let diagramContent = null;

    // Define arrow marker
    const arrowMarker = (
        <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={arrowFill} />
            </marker>
        </defs>
    );

    if (faultName.includes("normal")) {
        // --- NORMAL FAULT ---
        // Hanging wall (left) moves down relative to footwall (right)
        // Fault plane dips to the left (under the HW)
        diagramContent = (
            <>
                {arrowMarker}
                {/* Footwall (Right Block - static) */}
                <g transform="translate(10, 10)"> {/* Shifted for centering */}
                    {/* FW Top */}
                    <polygon points="70,25 120,25 105,40 55,40" fill="#d1d5db" stroke={blockStroke} strokeWidth={blockStrokeWidth} />
                    {/* FW Front */}
                    <polygon points="55,40 105,40 105,80 55,80" fill="#9ca3af" stroke={blockStroke} strokeWidth={blockStrokeWidth} />
                     {/* FW Side (sloping fault plane) */}
                    <polygon points="55,40 55,80 40,70 40,30" fill="#6b7280" stroke={blockStroke} strokeWidth={blockStrokeWidth} />
                    <text x="80" y="60" fontSize={fontSizeSmall} fill={textFill} textAnchor="middle">FW</text>
                </g>

                {/* Hanging Wall (Left Block - moved down) */}
                <g transform="translate(10, 22)"> {/* Shifted down */}
                     {/* HW Top */}
                    <polygon points="55,25 40,40 0,40 -15,25" fill="#e5e7eb" stroke={blockStroke} strokeWidth={blockStrokeWidth} transform="translate(-5,5)"/> {/* Slightly adjusted for perspective */}
                     {/* HW Front - partially hidden */}
                    {/* <polygon points="-15,25 40,40 40,70 -15,55" fill="#b0b0b0" stroke={blockStroke} strokeWidth={blockStrokeWidth} /> */}
                    <text x="15" y="50" fontSize={fontSizeSmall} fill={textFill} textAnchor="middle" transform="translate(-5,5)">HW</text>
                </g>

                {/* Arrow for Normal Fault: showing HW moving down and slightly away (due to slope) */}
                {/* Arrow points from an estimated original position on HW down along the fault plane */}
                <line x1="40" y1="40" x2="25" y2="65" stroke={arrowFill} strokeWidth="2" markerEnd="url(#arrow)" />
            </>
        );
    } else if (faultName.includes("reverse") || faultName.includes("thrust")) {
        // --- REVERSE/THRUST FAULT ---
        // Hanging wall (left) moves up relative to footwall (right)
        // Fault plane dips to the left (under the HW)
         diagramContent = (
            <>
                {arrowMarker}
                 {/* Footwall (Right Block - static) */}
                <g transform="translate(10, 20)"> {/* Shifted for centering and down a bit */}
                    <polygon points="70,25 120,25 105,40 55,40" fill="#d1d5db" stroke={blockStroke} strokeWidth={blockStrokeWidth} />
                    <polygon points="55,40 105,40 105,80 55,80" fill="#9ca3af" stroke={blockStroke} strokeWidth={blockStrokeWidth} />
                    <polygon points="55,40 55,80 40,70 40,30" fill="#6b7280" stroke={blockStroke} strokeWidth={blockStrokeWidth} />
                    <text x="80" y="60" fontSize={fontSizeSmall} fill={textFill} textAnchor="middle">FW</text>
                </g>

                {/* Hanging Wall (Left Block - moved up) */}
                <g transform="translate(10, 0)"> {/* Shifted up */}
                    <polygon points="55,25 40,40 0,40 -15,25" fill="#e5e7eb" stroke={blockStroke} strokeWidth={blockStrokeWidth} transform="translate(-5,5)"/>
                    <text x="15" y="50" fontSize={fontSizeSmall} fill={textFill} textAnchor="middle" transform="translate(-5,5)">HW</text>
                </g>

                {/* Arrow for Reverse Fault: showing HW moving up and slightly over (due to slope) */}
                <line x1="25" y1="65" x2="40" y2="40" stroke={arrowFill} strokeWidth="2" markerEnd="url(#arrow)" />
            </>
        );
    } else if (faultName.includes("left-lateral")) {
        // --- LEFT-LATERAL STRIKE-SLIP ---
        // Block opposite viewer moves left
        diagramContent = (
            <>
                {arrowMarker}
                {/* Left Block (moves towards viewer if it's the one opposite moving left) */}
                {/* Or, more simply, top surface arrows */}
                <g transform="translate(5, 20)"> {/* Centering */}
                    {/* Block 1 (closer to viewer, on left of fault) */}
                    <polygon points="10,10 60,10 70,25 20,25" fill="#d1d5db" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Top */}
                    <polygon points="20,25 70,25 70,75 20,75" fill="#9ca3af" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Front */}
                    <polygon points="10,10 20,25 20,75 10,60" fill="#6b7280" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Side */}
                    {/* Arrow on top surface of left block */}
                    <line x1="35" y1="17.5" x2="55" y2="17.5" stroke={arrowFill} strokeWidth="2" markerEnd="url(#arrow)" />


                    {/* Block 2 (further from viewer, on right of fault) */}
                    <polygon points="75,10 125,10 135,25 85,25" fill="#d1d5db" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Top */}
                    <polygon points="85,25 135,25 135,75 85,75" fill="#9ca3af" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Front */}
                    {/* <polygon points="75,10 85,25 85,75 75,60" fill="#6b7280" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> */} {/* Side - hidden */}
                     {/* Arrow on top surface of right block */}
                    <line x1="110" y1="17.5" x2="90" y2="17.5" stroke={arrowFill} strokeWidth="2" markerEnd="url(#arrow)" />
                </g>
                 {/* Fault Line */}
                <line x1="72.5" y1="20" x2="72.5" y2="100" stroke={blockStroke} strokeWidth="0.5" strokeDasharray="2,2" transform="translate(2.5,0)"/>

            </>
        );
    } else if (faultName.includes("right-lateral")) {
        // --- RIGHT-LATERAL STRIKE-SLIP ---
        // Block opposite viewer moves right
         diagramContent = (
            <>
                {arrowMarker}
                <g transform="translate(5, 20)"> {/* Centering */}
                    {/* Block 1 (closer to viewer, on left of fault) */}
                    <polygon points="10,10 60,10 70,25 20,25" fill="#d1d5db" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Top */}
                    <polygon points="20,25 70,25 70,75 20,75" fill="#9ca3af" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Front */}
                    <polygon points="10,10 20,25 20,75 10,60" fill="#6b7280" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Side */}
                    {/* Arrow on top surface of left block */}
                    <line x1="55" y1="17.5" x2="35" y2="17.5" stroke={arrowFill} strokeWidth="2" markerEnd="url(#arrow)" />

                    {/* Block 2 (further from viewer, on right of fault) */}
                    <polygon points="75,10 125,10 135,25 85,25" fill="#d1d5db" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Top */}
                    <polygon points="85,25 135,25 135,75 85,75" fill="#9ca3af" stroke={blockStroke} strokeWidth={blockStrokeWidth}/> {/* Front */}
                     {/* Arrow on top surface of right block */}
                    <line x1="90" y1="17.5" x2="110" y2="17.5" stroke={arrowFill} strokeWidth="2" markerEnd="url(#arrow)" />
                </g>
                {/* Fault Line */}
                <line x1="72.5" y1="20" x2="72.5" y2="100" stroke={blockStroke} strokeWidth="0.5" strokeDasharray="2,2" transform="translate(2.5,0)"/>
            </>
        );
    } else {
        // --- UNKNOWN/DEFAULT ---
        diagramContent = (
            <g transform="translate(30,20)">
                <rect x="10" y="10" width="80" height="60" fill="#e0e0e0" stroke={blockStroke} strokeWidth={blockStrokeWidth} />
                <text x="50" y="45" fontSize="24" textAnchor="middle" fill={textFill}>?</text>
            </g>
        );
    }

    return (
        <svg width={width} height={height} viewBox={viewBox} aria-labelledby="faultDiagramTitle" className="bg-slate-50 rounded border border-gray-300">
            <title id="faultDiagramTitle">{faultType.name || 'Fault diagram'}</title>
            {diagramContent}
            {isOblique && (
                <text
                    x={width / 2}
                    y={height - 8} // Position towards the bottom, adjust as needed
                    textAnchor="middle"
                    fontSize="10px"
                    fill="#4b5563" // A slightly muted text color
                    fontStyle="italic"
                >
                    (Oblique Slip)
                </text>
            )}
        </svg>
    );
}

export default SimpleFaultBlockDiagram;
