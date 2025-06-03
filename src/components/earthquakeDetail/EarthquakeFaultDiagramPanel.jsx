import React from 'react';
import InteractiveFaultDiagram from './InteractiveFaultDiagram'; // Import the previously moved component
import { isValidNumber, formatNumber, isValidString } from '../../utils/utils.js';

// Define constants and helper functions at the module level
const FAULT_TYPE_CATEGORIES = {
    NORMAL: 'Normal',
    REVERSE: 'Reverse / Thrust',
    STRIKE_SLIP_LEFT: 'Left-Lateral Strike-Slip',
    STRIKE_SLIP_RIGHT: 'Right-Lateral Strike-Slip',
    OBLIQUE_NORMAL_LEFT: 'Oblique: Left-Lateral Normal',
    OBLIQUE_NORMAL_RIGHT: 'Oblique: Right-Lateral Normal',
    OBLIQUE_REVERSE_LEFT: 'Oblique: Left-Lateral Reverse',
    OBLIQUE_REVERSE_RIGHT: 'Oblique: Right-Lateral Reverse',
    UNKNOWN: 'Unknown Fault Type'
};

const FAULT_TYPE_EXPLANATIONS = {
    [FAULT_TYPE_CATEGORIES.NORMAL]: "In a normal fault, the crust extends or pulls apart. The block above the slanting fault plane (hanging wall) moves downwards relative to the block below (footwall). This is common in areas of tectonic spreading, like the East African Rift.",
    [FAULT_TYPE_CATEGORIES.REVERSE]: "In a reverse (or thrust) fault, the crust compresses or pushes together. The block above the slanting fault plane (hanging wall) moves upwards relative to the block below (footwall). Thrust faults are a type of reverse fault with a shallowly dipping fault plane (typically less than 45°). These are common in mountain-building areas, such as the Himalayas.",
    [FAULT_TYPE_CATEGORIES.STRIKE_SLIP_LEFT]: "This is a left-lateral strike-slip fault. Blocks of crust slide past each other horizontally with little to no vertical movement. If you stand on one side of the fault and look across, the block on the other side has moved to your left. Many faults in the San Andreas Fault system exhibit this type of movement.",
    [FAULT_TYPE_CATEGORIES.STRIKE_SLIP_RIGHT]: "This is a right-lateral strike-slip fault. Blocks of crust slide past each other horizontally with little to no vertical movement. If you stand on one side of the fault and look across, the block on the other side has moved to your right. The main San Andreas Fault is a classic example.",
    [FAULT_TYPE_CATEGORIES.OBLIQUE_NORMAL_LEFT]: "This is an oblique fault with combined left-lateral strike-slip and normal fault movement. The hanging wall moves down and also horizontally to the left relative to the footwall.",
    [FAULT_TYPE_CATEGORIES.OBLIQUE_NORMAL_RIGHT]: "This is an oblique fault with combined right-lateral strike-slip and normal fault movement. The hanging wall moves down and also horizontally to the right relative to the footwall.",
    [FAULT_TYPE_CATEGORIES.OBLIQUE_REVERSE_LEFT]: "This is an oblique fault with combined left-lateral strike-slip and reverse fault movement. The hanging wall moves up and also horizontally to the left relative to the footwall.",
    [FAULT_TYPE_CATEGORIES.OBLIQUE_REVERSE_RIGHT]: "This is an oblique fault with combined right-lateral strike-slip and reverse fault movement. The hanging wall moves up and also horizontally to the right relative to the footwall.",
    [FAULT_TYPE_CATEGORIES.UNKNOWN]: "The specific type of fault movement is based on the calculated rake angle. If the rake is unclear or not available, the exact fault type cannot be precisely determined from this data alone."
};

function getFaultCategory(rake) {
    if (!isValidNumber(rake)) {
        return FAULT_TYPE_CATEGORIES.UNKNOWN;
    }
    // Normalize rake to be between -180 and 180 if necessary, though typically it is.
    const r = parseFloat(rake);

    if (r >= -22.5 && r <= 22.5) return FAULT_TYPE_CATEGORIES.STRIKE_SLIP_LEFT;
    if (r >= 157.5 || r <= -157.5) return FAULT_TYPE_CATEGORIES.STRIKE_SLIP_RIGHT;
    if (r >= 67.5 && r <= 112.5) return FAULT_TYPE_CATEGORIES.REVERSE;
    if (r <= -67.5 && r >= -112.5) return FAULT_TYPE_CATEGORIES.NORMAL;
    if (r > 22.5 && r < 67.5) return FAULT_TYPE_CATEGORIES.OBLIQUE_REVERSE_LEFT;
    if (r > 112.5 && r < 157.5) return FAULT_TYPE_CATEGORIES.OBLIQUE_REVERSE_RIGHT;
    if (r < -22.5 && r > -67.5) return FAULT_TYPE_CATEGORIES.OBLIQUE_NORMAL_LEFT;
    if (r < -112.5 && r > -157.5) return FAULT_TYPE_CATEGORIES.OBLIQUE_NORMAL_RIGHT;

    return FAULT_TYPE_CATEGORIES.UNKNOWN; // Fallback if somehow a rake value is outside ranges
}

// Main component function
function EarthquakeFaultDiagramPanel({
    selectedFaultPlaneKey,
    setSelectedFaultPlaneKey,
    np1Data,
    np2Data,
    selectedFaultPlane,
    exhibitPanelClass,
    exhibitTitleClass,
    diagramContainerClass,
    highlightClass
}) {
    // Conditional rendering for the entire panel based on selectedFaultPlane.strike
    if (!selectedFaultPlane || !isValidNumber(selectedFaultPlane.strike)) {
        return null;
    }

    const faultCategory = getFaultCategory(selectedFaultPlane.rake);
    const explanationText = FAULT_TYPE_EXPLANATIONS[faultCategory] || FAULT_TYPE_EXPLANATIONS[FAULT_TYPE_CATEGORIES.UNKNOWN];

    return (
        <div className={`${exhibitPanelClass} border-purple-500`}>
            <h2 className={`${exhibitTitleClass} text-purple-800 border-purple-200`}>How Did the Ground Break?</h2>
            <div className="text-center mb-3 space-x-2">
                {/* Conditional rendering for NP1 button */}
                {np1Data && isValidNumber(np1Data.strike) && (
                    <button
                        onClick={() => setSelectedFaultPlaneKey('np1')}
                        className={`px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${selectedFaultPlaneKey === 'np1' ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}
                    >
                        Nodal Plane 1
                    </button>
                )}
                {/* Conditional rendering for NP2 button */}
                {np2Data && isValidNumber(np2Data.strike) && (
                    <button
                        onClick={() => setSelectedFaultPlaneKey('np2')}
                        className={`px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${selectedFaultPlaneKey === 'np2' ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}
                    >
                        Nodal Plane 2
                    </button>
                )}
            </div>
            <div className={`${diagramContainerClass} bg-indigo-50`} style={{minHeight: '280px'}}>
                <InteractiveFaultDiagram
                    planeData={selectedFaultPlane}
                    planeKey={selectedFaultPlaneKey}
                    // isValidNumber is defined within InteractiveFaultDiagram itself for now
                />
            </div>
            {/* Display Strike, Dip, Rake only if they are valid numbers */}
            {(isValidNumber(selectedFaultPlane.strike) || isValidNumber(selectedFaultPlane.dip) || isValidNumber(selectedFaultPlane.rake)) && (
                <div className="mt-3 text-xs md:text-sm text-slate-700 bg-purple-50 p-3 rounded-md">
                    <p>
                        {isValidNumber(selectedFaultPlane.strike) && <><strong className={highlightClass}>Strike:</strong> {formatNumber(selectedFaultPlane.strike,0)}° </>}
                        {isValidNumber(selectedFaultPlane.dip) && <>{isValidNumber(selectedFaultPlane.strike) && "| "}<strong className={highlightClass}>Dip:</strong> {formatNumber(selectedFaultPlane.dip,0)}° </>}
                        {isValidNumber(selectedFaultPlane.rake) && <>{(isValidNumber(selectedFaultPlane.strike) || isValidNumber(selectedFaultPlane.dip)) && "| "}<strong className={highlightClass}>Rake:</strong> {formatNumber(selectedFaultPlane.rake,0)}°</>}
                    </p>
                    {isValidString(selectedFaultPlane.description) && <p className="mt-1 text-xs">{selectedFaultPlane.description}</p>}
                </div>
            )}

            {/* Explanation Section */}
            {explanationText && (
                <div className="mt-3 text-sm text-slate-700 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className={`text-sm font-semibold mb-1 text-purple-700`}>{faultCategory}</h3>
                    <p className="text-xs leading-relaxed">{explanationText}</p>
                </div>
            )}
        </div>
    );
}

export default EarthquakeFaultDiagramPanel;
