import React from 'react';
import InteractiveFaultDiagram from './InteractiveFaultDiagram';
import FaultBlock3D from './FaultBlock3D.jsx';
import { isValidNumber, formatNumber, isValidString } from '../../utils/utils.js';

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
    if (!selectedFaultPlane || !isValidNumber(selectedFaultPlane.strike)) {
        return null;
    }

    return (
        <div className={`${exhibitPanelClass} border-purple-500`}>
            <h2 className={`${exhibitTitleClass} text-purple-800 border-purple-200`}>Possible Fault Orientation &amp; Slip</h2>
            <p className="mb-3 text-xs md:text-sm text-slate-600">
                A focal mechanism has two possible nodal planes. These are alternative fault orientations,
                not two confirmed faults. Additional evidence is needed to identify which plane slipped.
            </p>
            <div className="text-center mb-3 space-x-2">
                {np1Data && isValidNumber(np1Data.strike) && (
                    <button type="button" aria-pressed={selectedFaultPlaneKey === 'np1'}
                        onClick={() => setSelectedFaultPlaneKey('np1')} 
                        className={`px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${selectedFaultPlaneKey === 'np1' ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}
                    >
                        Nodal Plane 1
                    </button>
                )}
                {np2Data && isValidNumber(np2Data.strike) && (
                    <button type="button" aria-pressed={selectedFaultPlaneKey === 'np2'}
                        onClick={() => setSelectedFaultPlaneKey('np2')} 
                        className={`px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${selectedFaultPlaneKey === 'np2' ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}
                    >
                        Nodal Plane 2
                    </button>
                )}
            </div>
            <div className={`${diagramContainerClass} bg-indigo-50`} style={{minHeight: '280px'}}>
                <FaultBlock3D key={selectedFaultPlaneKey} planeData={selectedFaultPlane} planeKey={selectedFaultPlaneKey}/>
            </div>
            <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Compare horizontal and vertical slip components</summary>
                <div className="mt-3"><InteractiveFaultDiagram planeData={selectedFaultPlane} planeKey={selectedFaultPlaneKey}/></div>
            </details>
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
