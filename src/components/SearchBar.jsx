import React from 'react';

const SearchBar = ({ onSearch }) => {
  return (
    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600 shadow-md">
      <h3 className="text-md font-semibold mb-2 text-indigo-400">Search Earthquakes</h3>
      <input
        type="text"
        placeholder="Search by location..."
        className="w-full bg-slate-800 text-white rounded-md px-2 py-1 text-sm"
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  );
};

export default SearchBar;
