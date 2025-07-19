import React from 'react';

const FilterPanel = ({ onFilterChange }) => {
  return (
    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md">
      <h3 className="text-md font-semibold mb-2 text-indigo-400">Filter Earthquakes</h3>
      <div className="flex flex-col space-y-2">
        <div>
          <label htmlFor="min-magnitude" className="text-sm text-slate-300">Min Magnitude:</label>
          <input
            type="number"
            id="min-magnitude"
            className="w-full bg-slate-800 text-white rounded-md px-2 py-1 text-sm"
            onChange={(e) => onFilterChange('minMagnitude', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="max-depth" className="text-sm text-slate-300">Max Depth (km):</label>
          <input
            type="number"
            id="max-depth"
            className="w-full bg-slate-800 text-white rounded-md px-2 py-1 text-sm"
            onChange={(e) => onFilterChange('maxDepth', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
