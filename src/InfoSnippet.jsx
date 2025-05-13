// src/InfoSnippet.jsx
import React, { useState } from 'react';

const infoData = {
    magnitude: {
        title: "What is Magnitude?",
        content: "Earthquake magnitude (usually Mww) measures the 'size' or energy released. For each whole number increase, the released energy is about 32 times greater. M1-M3 are often not felt. M7+ can cause widespread, heavy damage.",
        icon: "🌊"
    },
    depth: {
        title: "What is Depth?",
        content: "Depth is where the earthquake rupture starts. Shallow quakes (0-70 km) are often more damaging as energy is released closer to the surface. Intermediate (70-300 km) and deep quakes (>300 km) also occur.",
        icon: "🎯"
    },
    intensity: {
        title: "Intensity vs. Magnitude",
        content: "Magnitude is one number for the quake's energy. Intensity (e.g., MMI scale) describes the shaking severity at a specific location and varies with distance, ground type, and building standards.",
        icon: "🏠"
    },
    alerts: {
        title: "USGS Alert Levels",
        content: "PAGER alerts (Green, Yellow, Orange, Red) estimate potential impact (fatalities, economic losses). GREEN: minimal. RED: catastrophic. These are rapid assessments.",
        icon: "🔔"
    }
};

const InfoSnippet = ({ topic }) => {
    const [isOpen, setIsOpen] = useState(false);
    const data = infoData[topic];
    if (!data) return null;

    return (
        <div className="my-1.5">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full text-left px-2.5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md focus:outline-none transition-colors shadow-sm"
            >
                <span className="font-semibold text-xs">{data.icon} {data.title}</span>
                <span className="text-md">{isOpen ? '➖' : '➕'}</span>
            </button>
            {isOpen && (
                <div className="p-2.5 mt-0.5 bg-slate-600 bg-opacity-70 text-gray-200 rounded-b-md text-xs leading-relaxed shadow-inner">
                    {data.content}
                </div>
            )}
        </div>
    );
};
export default InfoSnippet;