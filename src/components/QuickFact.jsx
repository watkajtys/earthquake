import React from 'react';
import InfoSnippet from './InfoSnippet'; // Assuming InfoSnippet is in the same directory

const QuickFact = ({ navigate }) => {
  return (
    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md text-sm">
      <h3 className="text-md font-semibold mb-1 text-indigo-400">Quick Fact</h3>
      <InfoSnippet topic="magnitude" />
      <button
        onClick={() => navigate('/learn')}
        className="mt-2 w-full bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition-colors"
      >
        Learn More About Earthquakes
      </button>
    </div>
  );
};

export default QuickFact;
