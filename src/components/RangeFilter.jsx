import React from 'react';
import PropTypes from 'prop-types';

const RangeFilter = ({ title, min, max, value, onChange }) => {
  const handleMinChange = (e) => {
    onChange([+e.target.value, value[1]]);
  };

  const handleMaxChange = (e) => {
    onChange([value[0], +e.target.value]);
  };

  return (
    <div className="p-3 bg-slate-700 rounded-lg border border-slate-600 shadow-md">
      <h4 className="text-sm font-semibold text-indigo-300 mb-2">{title}</h4>
      <div className="flex items-center justify-between space-x-2 text-xs">
        <span>{min}</span>
        <div className="flex-1">
          <input
            type="range"
            min={min}
            max={max}
            value={value[0]}
            onChange={handleMinChange}
            className="w-full"
          />
          <input
            type="range"
            min={min}
            max={max}
            value={value[1]}
            onChange={handleMaxChange}
            className="w-full"
          />
        </div>
        <span>{max}</span>
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span>{value[0]}</span>
        <span>{value[1]}</span>
      </div>
    </div>
  );
};

RangeFilter.propTypes = {
  title: PropTypes.string.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  value: PropTypes.arrayOf(PropTypes.number).isRequired,
  onChange: PropTypes.func.isRequired,
};

export default RangeFilter;
