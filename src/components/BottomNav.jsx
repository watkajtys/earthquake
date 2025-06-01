// src/BottomNav.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { FaGlobe, FaListAlt, FaStream, FaBook } from 'react-icons/fa';

/**
 * A React component that renders the bottom navigation bar for mobile views.
 * It uses NavLink from 'react-router-dom' to provide navigation to different
 * sections of the application: Globe, Overview, Feeds, and Learn.
 * The active tab is highlighted.
 * @returns {JSX.Element} The rendered BottomNav component.
 */
const BottomNav = () => { // Removed activeMobileView and setActiveMobileView props
    const tabs = [
        { name: 'Globe', path: '/', icon: <FaGlobe /> },
        { name: 'Overview', path: '/overview', icon: <FaListAlt /> },
        { name: 'Feeds', path: '/feeds', icon: <FaStream /> },
        { name: 'Learn', path: '/learn', icon: <FaBook /> },
    ];

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 flex justify-around items-center h-16 z-50">
            {tabs.map(tab => (
                <NavLink
                    key={tab.name}
                    to={tab.path}
                    className={({ isActive }) =>
                        `flex flex-col items-center justify-center text-xs p-2 rounded-md h-full w-full
                        ${isActive
                            ? 'text-indigo-300' // Active tab color - Improved contrast
                            : 'text-slate-400 hover:text-indigo-300' // Inactive tab color
                        }`
                    }
                >
                    <div className="text-xl mb-0.5" aria-hidden="true">{tab.icon}</div>
                    <span>{tab.name}</span>
                </NavLink>
            ))}
        </nav>
    );
};

export default BottomNav;