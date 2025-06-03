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

    // Define arrow paths based on rake
    let arrowPath1 = ""; // Arrow on the left block (conceptually)
    let arrowPath2 = ""; // Arrow on the right block (conceptually)
    const rake = parseFloat(planeData.rake);

    // Define simplified arrow representations for diagram clarity
    // Coordinates are relative to the blocks' positions in the unrotated diagram
    // Left block roughly centered at x=95, right block at x=255, fault between 165-185
    const L_strike_right = "M 140 140 L 160 140"; // Left block, conceptual "rightward" slip component
    const L_strike_left  = "M 160 140 L 140 140"; // Left block, conceptual "leftward" slip component
    const R_strike_left  = "M 210 140 L 190 140"; // Right block, conceptual "leftward" slip component
    const R_strike_right = "M 190 140 L 210 140"; // Right block, conceptual "rightward" slip component

    const L_dip_up   = "M 95 155 L 95 125";   // Left block, conceptual "upward" on diagram
    const L_dip_down = "M 95 125 L 95 155";   // Left block, conceptual "downward" on diagram
    const R_dip_down = "M 255 125 L 255 155"; // Right block, conceptual "downward" on diagram
    const R_dip_up   = "M 255 155 L 255 125";   // Right block, conceptual "upward" on diagram

    const L_oblique_up_right = "M 140 150 L 160 130"; 
    const L_oblique_up_left = "M 160 150 L 140 130";  
    const L_oblique_down_right = "M 140 130 L 160 150"; 
    const L_oblique_down_left = "M 160 130 L 140 150";  
    
    const R_oblique_down_left = "M 210 130 L 190 150"; 
    const R_oblique_down_right = "M 190 130 L 210 150"; 
    const R_oblique_up_left = "M 210 150 L 190 130";   
    const R_oblique_up_right = "M 190 150 L 210 130";  

    if (isValidNumber(rake)) {
        if (rake >= -22.5 && rake <= 22.5) { // Pure Left-Lateral Strike-Slip
            arrowPath1 = L_strike_right; arrowPath2 = R_strike_left;
        } else if (rake >= 157.5 || rake <= -157.5) { // Pure Right-Lateral Strike-Slip
            arrowPath1 = L_strike_left; arrowPath2 = R_strike_right;
        } else if (rake >= 67.5 && rake <= 112.5) { // Pure Reverse/Thrust
            arrowPath1 = L_dip_up; arrowPath2 = R_dip_down;
        } else if (rake <= -67.5 && rake >= -112.5) { // Pure Normal
            arrowPath1 = L_dip_down; arrowPath2 = R_dip_up;
        } else if (rake > 22.5 && rake < 67.5) { // Oblique: Left-Lateral component + Reverse component
            arrowPath1 = L_oblique_up_right; arrowPath2 = R_oblique_down_left;
        } else if (rake > 112.5 && rake < 157.5) { // Oblique: Right-Lateral component + Reverse component
            arrowPath1 = L_oblique_up_left; arrowPath2 = R_oblique_down_right;
        } else if (rake < -22.5 && rake > -67.5) { // Oblique: Left-Lateral component + Normal component
            arrowPath1 = L_oblique_down_right; arrowPath2 = R_oblique_up_left;
        } else if (rake < -112.5 && rake > -157.5) { // Oblique: Right-Lateral component + Normal component
            arrowPath1 = L_oblique_down_left; arrowPath2 = R_oblique_up_right;
        } else { 
            arrowPath1 = L_strike_right; arrowPath2 = R_strike_left; // Fallback
        }
    } else {
        arrowPath1 = L_strike_right; // Default if rake is not valid
        arrowPath2 = R_strike_left;
    }

    return (
        <svg className="w-full max-w-xs md:max-w-sm mx-auto" height="250" viewBox="0 0 350 280" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="50" width="330" height="180" fill="#e0e7ff" stroke="#adb5bd" strokeWidth="1"/>
            {isValidNumber(faultStrikeRotation) &&
                <line x1="175" y1="50" x2="175" y2="230" stroke={blockStroke} strokeWidth="3" strokeDasharray="6,3" transform={`rotate(${faultStrikeRotation} 175 140)`}/>
            }
            <g transform={`rotate(${isValidNumber(faultStrikeRotation) ? faultStrikeRotation : 0} 175 140)`}>
                {/* Block A */}
                <rect x="25" y="70" width="140" height="140" fill={blockFill} stroke={blockStroke} strokeWidth="1.5" />
                <text
                    x="95"
                    y="140"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12px"
                    fill="#333333"
                    fontWeight="bold"
                >
                    Block A
                </text>
                {arrowPath1 && <path d={arrowPath1} stroke="black" strokeWidth="2.5" markerEnd="url(#arrowhead-detail-fault)" />}

                {/* Block B */}
                <rect x="185" y="70" width="140" height="140" fill={blockFill} stroke={blockStroke} strokeWidth="1.5" />
                <text
                    x="255"
                    y="140"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12px"
                    fill="#333333"
                    fontWeight="bold"
                >
                    Block B
                </text>
                {arrowPath2 && <path d={arrowPath2} stroke="black" strokeWidth="2.5" markerEnd="url(#arrowhead-detail-fault)" />}
            </g>
            <defs>
                <marker id="arrowhead-detail-fault" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                    <polygon points="0 0, 8 3, 0 6" fill="black"/>
                </marker>
            </defs>
            <text x="175" y="30" textAnchor="middle" className="text-sm font-semibold text-indigo-700">Fault View ({planeKey.toUpperCase()})</text>
            <text x="175" y="265" textAnchor="middle" className="text-xs text-slate-600">Illustrative Diagram (Top View)</text>
        </svg>
    );
}

export default InteractiveFaultDiagram;
