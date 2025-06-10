import React, { memo } from 'react';
import InfoSnippet from './InfoSnippet'; // Assuming InfoSnippet is in the same directory

/**
 * Displays a "Quick Fact" section, which includes a predefined `InfoSnippet`
 * (currently hardcoded to the "magnitude" topic) and a button to navigate to a "Learn" page.
 * This component is memoized using `React.memo` for performance optimization.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {function(string):void} props.navigate - A navigation function (typically from a routing library like React Router)
 *   used to redirect the user to the specified path (e.g., '/learn').
 * @returns {JSX.Element} The QuickFact component.
 */
const QuickFact = ({ navigate }) => {
  return (
    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
      <h3 className="text-md font-semibold mb-1 text-indigo-400">Quick Fact</h3>
      <InfoSnippet topic="magnitude" />
      <button
        onClick={() => navigate('/learn')}
        className="mt-2 w-full bg-slate-600 hover:bg-slate-500 focus:bg-slate-700 text-white text-xs font-medium py-1.5 px-3 rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Learn More About Earthquakes
      </button>
    </div>
  );
};

export default memo(QuickFact);
