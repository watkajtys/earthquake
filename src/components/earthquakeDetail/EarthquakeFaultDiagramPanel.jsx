import React from 'react';
import InteractiveFaultDiagram from './InteractiveFaultDiagram'; // Import the previously moved component
import { isValidNumber, formatNumber, isValidString } from '../../utils/detailViewUtils.js';

function EarthquakeFaultDiagramPanel({
    selectedFaultPlaneKey,
    setSelectedFaultPlaneKey,
    np1Data,
    np2Data,
    selectedFaultPlane,
    // isValidNumber, // Passed from parent - Now imported
    // formatNumber,  // Passed from parent - Now imported
    // isValidString, // Passed from parent - Now imported
    exhibitPanelClass,
    exhibitTitleClass,
    diagramContainerClass,
    highlightClass
}) {
    // Conditional rendering for the entire panel based on selectedFaultPlane.strike
    if (!selectedFaultPlane || !isValidNumber(selectedFaultPlane.strike)) { // isValidNumber is now imported
        return null;
    }

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
                    {isValidString(selectedFaultPlane.description) && <p className="mt-1">{selectedFaultPlane.description}</p>}
                </div>
            )}
        </div>
    );
}

export default EarthquakeFaultDiagramPanel;
