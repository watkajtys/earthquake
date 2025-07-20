// src/components/JulesTask.jsx
import React from 'react';

/**
 * A simple component that displays a title and a button.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {string} props.title - The title to display.
 * @param {function():void} props.onButtonClick - Callback function triggered when the button is clicked.
 * @returns {JSX.Element} The JulesTask component.
 */
const JulesTask = ({ title, onButtonClick }) => {
    return (
        <div className="p-2.5 bg-slate-800 bg-opacity-80 text-white rounded-lg shadow-xl max-w-[220px] backdrop-blur-sm border border-slate-700">
            <h2 className="text-xs font-bold mb-0.5 text-amber-300 uppercase tracking-wide">
                {title}
            </h2>
            <button
                onClick={onButtonClick}
                className="text-xs bg-slate-600 hover:bg-slate-500 focus:bg-slate-700 text-white font-medium py-1.5 px-3 rounded-md w-full transition-colors mt-0.5 shadow-sm"
            >
                Click Me
            </button>
        </div>
    );
};

export default JulesTask;
