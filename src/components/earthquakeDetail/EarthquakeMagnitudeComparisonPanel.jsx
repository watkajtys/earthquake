import React, { memo } from 'react';
import { isValidNumber, formatNumber } from '../../utils/utils.js'; // Assuming this path is correct

function EarthquakeMagnitudeComparisonPanel({
    properties,
    // isValidNumber, // Now imported
    // formatNumber, // Now imported
    exhibitPanelClass,
    exhibitTitleClass,
    captionClass
}) {
    return (
        <div className={`${exhibitPanelClass} border-rose-500`}>
            <h2 className={`${exhibitTitleClass} text-rose-800 border-rose-200`}>Magnitude Comparison</h2>
            <div className="flex items-end justify-around h-48 md:h-56 w-full p-4 bg-rose-50 rounded-md mt-2 relative">
                {[
                    {h:20,l:"M2-3",b:"Minor"},
                    {h:40,l:"M4-5",b:"Light"},
                    {
                        h: isValidNumber(properties?.mag) ? Math.max(10, Math.min(80, (parseFloat(properties.mag)) * 10 + 5)) : 10,
                        l: isValidNumber(properties?.mag) ? `M${formatNumber(properties.mag,1)}` : 'M?',
                        b:"This Quake",
                        current:true
                    },
                    {h:70,l:"M6-7",b:"Strong"},
                    {h:90,l:"M7+",b:"Major"}
                ].map(bar => (
                    <div key={bar.l} title={`${bar.l} - ${bar.b}`} className="relative text-center w-[18%]" style={{height: `${bar.h}%`}}>
                        <div className={`h-full rounded-t-sm transition-all duration-300 ${bar.current ? 'bg-rose-500 border-2 border-rose-700' : 'bg-sky-400 hover:bg-sky-500'}`} style={{backgroundColor: !bar.current ? bar.c : undefined}}></div>
                        <div className={`absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold ${bar.current ? 'text-rose-700' : 'text-sky-700'}`}>{bar.l}</div>
                        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-slate-600 whitespace-nowrap">{bar.b}</div>
                    </div>
                ))}
            </div>
            <p className={captionClass}>Magnitudes are logarithmic: each whole number is ~32x more energy.</p>
        </div>
    );
}

export default memo(EarthquakeMagnitudeComparisonPanel);
