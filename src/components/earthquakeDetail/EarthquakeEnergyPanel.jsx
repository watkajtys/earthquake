import React from 'react';

function EarthquakeEnergyPanel({
    energyJoules,
    isValidNumber,
    formatLargeNumber,
    exhibitPanelClass,
    exhibitTitleClass,
    highlightClass,
    captionClass
}) {
    // Guard condition based on the original rendering logic
    if (!isValidNumber(energyJoules)) {
        return null; // Or some fallback UI if energyJoules is not valid
    }

    return (
        <div className={`${exhibitPanelClass} border-orange-500`}>
            <h2 className={`${exhibitTitleClass} text-orange-800 border-orange-200`}>Energy Unleashed</h2>
            <p className="mb-3">Approx. Energy: <strong className={`${highlightClass} text-orange-600`}>{formatLargeNumber(energyJoules)} Joules</strong>.</p>
            <div className="space-y-2">
                {energyJoules > 0 && ( // Only show comparisons if energy is greater than 0
                    <>
                        <div className="flex items-start p-2 bg-orange-50 rounded-md">
                            <svg width="24" height="24" viewBox="0 0 24 24" className="mr-2 shrink-0 mt-0.5 fill-yellow-500 stroke-yellow-700"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" strokeWidth="1.5" /></svg>
                            <div><strong className="text-orange-700">Lightning Bolt:</strong> ~1 billion Joules. This quake was like <strong className={`${highlightClass} text-orange-600`}>{formatLargeNumber(energyJoules / 1e9)}</strong> lightning bolts.</div>
                        </div>
                        <div className="flex items-start p-2 bg-red-50 rounded-md">
                            <svg width="24" height="24" viewBox="0 0 24 24" className="mr-2 shrink-0 mt-0.5 fill-red-500 stroke-red-700" strokeWidth="1.5"><path d="M12 2C12 2 10.263 4.73897 9.00001 7.49997C9.00001 7.49997 6.00001 7.49997 6.00001 9.99997C6.00001 12.5 9.00001 12.5 9.00001 15C9.00001 17.5 6.00001 17.5 6.00001 20C6.00001 22.5 12 22.5 12 22.5C12 22.5 18 22.5 18 20C18 17.5 15 17.5 15 15C15 12.5 18 12.5 18 9.99997C18 7.49997 15 7.49997 15 7.49997C13.737 4.73897 12 2 12 2Z" /></svg>
                            <div><strong className="text-red-700">Hiroshima Bomb:</strong> ~63 trillion Joules. This quake was like <strong className={`${highlightClass} text-red-600`}>{formatLargeNumber(energyJoules / 6.3e13)}</strong> Hiroshima bombs.</div>
                        </div>
                    </>
                )}
            </div>
            {energyJoules > 0 && <p className={captionClass}>Comparisons are for scale.</p>}
        </div>
    );
}

export default EarthquakeEnergyPanel;
