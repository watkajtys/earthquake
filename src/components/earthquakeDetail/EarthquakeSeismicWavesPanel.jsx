import React from 'react';

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
                        <line x1="10" y1="40" x2="140" y2="40" stroke="#4b5563" strokeWidth="1"/>
                        <line x1="20" y1="30" x2="20" y2="50" stroke="#3b82f6" strokeWidth="2"/>
                        <line x1="25" y1="30" x2="25" y2="50" stroke="#3b82f6" strokeWidth="2"/>
                        <line x1="70" y1="30" x2="70" y2="50" stroke="#3b82f6" strokeWidth="2"/>
                        <line x1="75" y1="30" x2="75" y2="50" stroke="#3b82f6" strokeWidth="2"/>
                        <text x="75" y="70" fontSize="10" textAnchor="middle">Push-Pull Motion →</text>
                    </svg>
                    <p className="text-xs text-slate-600">Fastest, compressional.</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-md">
                    <strong>S-Waves (Secondary)</strong>
                    <svg width="150" height="80" viewBox="0 0 150 80" className="mx-auto mt-1">
                        <path d="M10 40 Q 25 20 40 40 T 70 40 T 100 40 T 130 40" stroke="#ef4444" strokeWidth="2" fill="none"/>
                        <line x1="10" y1="40" x2="140" y2="40" stroke="#4b5563" strokeWidth="0.5" strokeDasharray="2,2"/>
                        <text x="75" y="70" fontSize="10" textAnchor="middle">Side-to-Side Motion ↕</text>
                    </svg>
                    <p className="text-xs text-slate-600">Slower, shear, solids only.</p>
                </div>
            </div>
            <p className={`${captionClass} mt-3`}>Surface waves (Love & Rayleigh) arrive later and often cause most shaking.</p>
        </div>
    );
}

export default EarthquakeSeismicWavesPanel;
