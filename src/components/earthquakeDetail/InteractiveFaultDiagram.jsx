import React from 'react';
import { isValidNumber } from '../../utils/utils.js';

// Temporarily defined here. Will be moved to a utils file later.
// const isValidNumber = (num) => { // Now imported
//     const parsedNum = parseFloat(num);
//     return typeof parsedNum === 'number' && !isNaN(parsedNum);
// };

function InteractiveFaultDiagram({ planeData, planeKey }) {
    // Guard against rendering if essential data is NaN (strike is key for rotation)
    if (!planeData || !isValidNumber(planeData.strike)) { // isValidNumber is now imported
        return null;
    }
    const faultStrikeRotation = planeData.strike;
    const blockFill = planeKey === 'np1' ? "#ffe0b2" : "#ede7f6";
    const blockStroke = planeKey === 'np1' ? "#5d4037" : "#4527a0";
    const blockFillTop = planeKey === 'np1' ? "#fff2d9" : "#f7f3fb";
    const blockFillSide = planeKey === 'np1' ? "#f5d5a0" : "#e4ddef";


    // Define arrow paths based on rake
    let arrowPath1 = ""; // Arrow on the left block (conceptually)
    let arrowPath2 = ""; // Arrow on the right block (conceptually)
    const rake = parseFloat(planeData.rake);
    let faultTypeText = "Unknown Fault Type";

    // Define simplified arrow representations for diagram clarity
    // Coordinates are relative to the blocks' positions in the unrotated diagram
    // Left block roughly centered at x=95, right block at x=255, fault between 165-185
    const L_strike_right = "M 140 140 L 160 140";
    const L_strike_left  = "M 160 140 L 140 140";
    const R_strike_left  = "M 210 140 L 190 140";
    const R_strike_right = "M 190 140 L 210 140";

    const L_dip_up   = "M 95 155 L 95 125";
    const L_dip_down = "M 95 125 L 95 155";
    const R_dip_down = "M 255 125 L 255 155";
    const R_dip_up   = "M 255 155 L 255 125";

    const L_oblique_up_right = "M 140 150 L 160 130";
    const L_oblique_up_left = "M 160 150 L 140 130";
    const L_oblique_down_right = "M 140 130 L 160 150";
    const L_oblique_down_left = "M 160 130 L 140 150";

    const R_oblique_down_left = "M 210 130 L 190 150";
    const R_oblique_down_right = "M 190 130 L 210 150";
    const R_oblique_up_left = "M 210 150 L 190 130";
    const R_oblique_up_right = "M 190 150 L 210 130";

    if (isValidNumber(rake)) {
        if (rake >= -22.5 && rake <= 22.5) {
            arrowPath1 = L_strike_right; arrowPath2 = R_strike_left;
            faultTypeText = "Left-Lateral Strike-Slip";
        } else if (rake >= 157.5 || rake <= -157.5) {
            arrowPath1 = L_strike_left; arrowPath2 = R_strike_right;
            faultTypeText = "Right-Lateral Strike-Slip";
        } else if (rake >= 67.5 && rake <= 112.5) {
            arrowPath1 = L_dip_up; arrowPath2 = R_dip_down;
            faultTypeText = "Reverse / Thrust";
        } else if (rake <= -67.5 && rake >= -112.5) {
            arrowPath1 = L_dip_down; arrowPath2 = R_dip_up;
            faultTypeText = "Normal";
        } else if (rake > 22.5 && rake < 67.5) {
            arrowPath1 = L_oblique_up_right; arrowPath2 = R_oblique_down_left;
            faultTypeText = "Oblique: Left-Lateral Reverse";
        } else if (rake > 112.5 && rake < 157.5) {
            arrowPath1 = L_oblique_up_left; arrowPath2 = R_oblique_down_right;
            faultTypeText = "Oblique: Right-Lateral Reverse";
        } else if (rake < -22.5 && rake > -67.5) {
            arrowPath1 = L_oblique_down_right; arrowPath2 = R_oblique_up_left;
            faultTypeText = "Oblique: Left-Lateral Normal";
        } else if (rake < -112.5 && rake > -157.5) {
            arrowPath1 = L_oblique_down_left; arrowPath2 = R_oblique_up_right;
            faultTypeText = "Oblique: Right-Lateral Normal";
        } else {
            arrowPath1 = L_strike_right; arrowPath2 = R_strike_left; // Fallback
            faultTypeText = "Strike-Slip (Undetermined)";
        }
    } else {
        arrowPath1 = L_strike_right; // Default if rake is not valid
        arrowPath2 = R_strike_left;
        faultTypeText = "Fault Type Unknown (Invalid Rake)";
    }

    const perspectiveOffset = 20; // Determines the "depth" of the 3D effect

    let animVals = { dx1: 0, dy1: 0, dx2: 0, dy2: 0 };
    const animAmount = 5; // SVG units for translation
    const obliqueFactor = 0.7071; // cos(45deg) or sin(45deg) for splitting movement
    const animAmountX = animAmount * obliqueFactor;
    const animAmountY = animAmount * obliqueFactor;
    // Determine animation values based on rake, similar to faultTypeText
    if (isValidNumber(rake)) {
        if (rake >= -22.5 && rake <= 22.5) { // Left-Lateral Strike-Slip
            animVals = { dx1: animAmount, dy1: 0, dx2: -animAmount, dy2: 0 };
        } else if (rake >= 157.5 || rake <= -157.5) { // Right-Lateral Strike-Slip
            animVals = { dx1: -animAmount, dy1: 0, dx2: animAmount, dy2: 0 };
        } else if (rake >= 67.5 && rake <= 112.5) { // Reverse/Thrust
            animVals = { dx1: 0, dy1: -animAmount, dx2: 0, dy2: animAmount };
        } else if (rake <= -67.5 && rake >= -112.5) { // Normal
            animVals = { dx1: 0, dy1: animAmount, dx2: 0, dy2: -animAmount };
        } else if (rake > 22.5 && rake < 67.5) { // Oblique: Left-Lateral Reverse
            animVals = { dx1: animAmountX, dy1: -animAmountY, dx2: -animAmountX, dy2: animAmountY };
        } else if (rake > 112.5 && rake < 157.5) { // Oblique: Right-Lateral Reverse
            animVals = { dx1: -animAmountX, dy1: -animAmountY, dx2: animAmountX, dy2: animAmountY };
        } else if (rake < -22.5 && rake > -67.5) { // Oblique: Left-Lateral Normal
            animVals = { dx1: animAmountX, dy1: animAmountY, dx2: -animAmountX, dy2: -animAmountY };
        } else if (rake < -112.5 && rake > -157.5) { // Oblique: Right-Lateral Normal
            animVals = { dx1: -animAmountX, dy1: animAmountY, dx2: animAmountX, dy2: -animAmountY };
        }
        // Default animVals (all zeros) will apply if no case matches (though current logic covers all rake ranges)
    }
    // Fallback for invalid rake: animVals remains all zeros (no animation)

    const animationDuration = "1.5s";
    const repeatCount = "5";

    return (
        <svg className="w-full max-w-xs md:max-w-sm mx-auto" height="280" viewBox="0 0 350 310" xmlns="http://www.w3.org/2000/svg">
            {/* Background for the diagram area */}
            <rect x="5" y="5" width="340" height="270" fill="#f0f4f8" stroke="#d1d9e1" strokeWidth="1" rx="5"/>

            {/* Fault Type Text */}
            <text x="175" y="25" textAnchor="middle" className="text-sm font-semibold text-slate-700">{faultTypeText}</text>

            {/* Title Text remains, slightly adjusted Y for new fault type text */}
            <text x="175" y="45" textAnchor="middle" className="text-xs font-semibold text-indigo-700">Fault View ({planeKey.toUpperCase()})</text>

            {/* Rotated Group for Fault Blocks and Fault Line */}
            <g transform={`rotate(${isValidNumber(faultStrikeRotation) ? faultStrikeRotation : 0} 175 155)`}>
                {/* Fault Line - drawn first to be under blocks */}
                {isValidNumber(faultStrikeRotation) && /* Also check if strike is valid for drawing line */
                    <line x1="175" y1="60" x2="175" y2="250" stroke={blockStroke} strokeWidth="3" strokeDasharray="6,3"/>
                }

                {/* Block 1 (Left Block) - with 3D effect */}
                <g id="block1">
                    <animateTransform
                        attributeName="transform"
                        type="translate"
                        values={`0,0; ${animVals.dx1},${animVals.dy1}; 0,0`}
                        keyTimes="0; 0.5; 1"
                        dur={animationDuration}
                        repeatCount={repeatCount}
                        calcMode="spline"
                        keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
                    />
                    {/* Front Face */}
                    <rect x="25" y="85" width="140" height="140" fill={blockFill} stroke={blockStroke} strokeWidth="1.5" />
                    {/* Top Face */}
                    <polygon
                        points={`${25},${85} ${25 + perspectiveOffset},${85 - perspectiveOffset} ${165 + perspectiveOffset},${85 - perspectiveOffset} ${165},${85}`}
                        fill={blockFillTop} stroke={blockStroke} strokeWidth="1" />
                    {/* Side Face (right side of block 1, near fault line) */}
                    <polygon
                        points={`${165},${85} ${165 + perspectiveOffset},${85 - perspectiveOffset} ${165 + perspectiveOffset},${225 - perspectiveOffset} ${165},${225}`}
                        fill={blockFillSide} stroke={blockStroke} strokeWidth="1" />
                    {arrowPath1 && <path d={arrowPath1.replace(/M (\d+) (\d+)/g, (match, x, y) => `M ${parseFloat(x)} ${parseFloat(y) + 15}` ).replace(/L (\d+) (\d+)/g, (match, x, y) => `L ${parseFloat(x)} ${parseFloat(y) + 15}`)} stroke="black" strokeWidth="3" markerEnd="url(#arrowhead-detail-fault)" />}
                </g>

                {/* Block 2 (Right Block) - with 3D effect */}
                <g id="block2">
                    <animateTransform
                        attributeName="transform"
                        type="translate"
                        values={`0,0; ${animVals.dx2},${animVals.dy2}; 0,0`}
                        keyTimes="0; 0.5; 1"
                        dur={animationDuration}
                        repeatCount={repeatCount}
                        calcMode="spline"
                        keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
                    />
                    {/* Front Face */}
                    <rect x="185" y="85" width="140" height="140" fill={blockFill} stroke={blockStroke} strokeWidth="1.5" />
                    {/* Top Face */}
                    <polygon
                        points={`${185},${85} ${185 + perspectiveOffset},${85 - perspectiveOffset} ${325 + perspectiveOffset},${85 - perspectiveOffset} ${325},${85}`}
                        fill={blockFillTop} stroke={blockStroke} strokeWidth="1" />
                    {/* Side Face (left side of block 2, near fault line) */}
                    <polygon
                        points={`${185},${85} ${185 + perspectiveOffset},${85 - perspectiveOffset} ${185 + perspectiveOffset},${225 - perspectiveOffset} ${185},${225}`}
                        fill={blockFillSide} stroke={blockStroke} strokeWidth="1" />
                   {arrowPath2 && <path d={arrowPath2.replace(/M (\d+) (\d+)/g, (match, x, y) => `M ${parseFloat(x)} ${parseFloat(y) + 15}` ).replace(/L (\d+) (\d+)/g, (match, x, y) => `L ${parseFloat(x)} ${parseFloat(y) + 15}`)} stroke="black" strokeWidth="3" markerEnd="url(#arrowhead-detail-fault)" />}
                </g>
            </g>

            <defs>
                <marker id="arrowhead-detail-fault" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                    <polygon points="0 0, 8 3, 0 6" fill="black"/>
                </marker>
            </defs>

            {/* Caption Text, adjusted Y */}
            <text x="175" y="295" textAnchor="middle" className="text-xs text-slate-600">Illustrative Diagram (Top View)</text>
        </svg>
    );
}

export default InteractiveFaultDiagram;
