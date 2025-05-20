// src/BottomNav.jsx
import React from 'react';
// Import icons from a library like react-icons if you want them
import { FaGlobe, FaListAlt, FaStream, FaBook } from 'react-icons/fa'; // Corrected: Added import

const BottomNav = ({ activeMobileView, setActiveMobileView }) => {
    const tabs = [
        { name: 'Globe', viewId: 'globe_view', icon: <FaGlobe /> }, // Replace with actual icons
        { name: 'Overview', viewId: 'overview_mobile', icon: <FaListAlt /> },
        { name: 'Feeds', viewId: 'feeds_details_mobile', icon: <FaStream /> },
        { name: 'Learn', viewId: 'learn_more_mobile', icon: <FaBook /> },
    ];

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 flex justify-around items-center h-16 z-50"> {/* Ensure lg:hidden */}
            {tabs.map(tab => (
                <button
                    key={tab.viewId}
                    onClick={() => setActiveMobileView(tab.viewId)}
                    className={`flex flex-col items-center justify-center text-xs p-2 rounded-md h-full w-full
                                ${activeMobileView === tab.viewId
                        ? 'text-indigo-400' // Active tab color
                        : 'text-slate-400 hover:text-indigo-300' // Inactive tab color
                    }`}
                >
                    <div className="text-xl mb-0.5">{tab.icon}</div> {/* Icon */}
                    <span>{tab.name}</span> {/* Label */}
                </button>
            ))}
        </nav>
    );
};

export default BottomNav;