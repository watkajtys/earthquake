import React from 'react';

const AdvancedFilterPanel = () => {
  return (
    <div className="advanced-filter-panel">
      <h3>Advanced Filters</h3>
      <div>
        <h4>Magnitude</h4>
        <label>Min:</label>
        <input type="number" min="0" max="10" step="0.1" />
        <label>Max:</label>
        <input type="number" min="0" max="10" step="0.1" />
      </div>
      <div>
        <h4>Depth</h4>
        <label>Min:</label>
        <input type="number" min="-100" max="1000" step="10" />
        <label>Max:</label>
        <input type="number" min="-100" max="1000" step="10" />
      </div>
      <div>
        <h4>Location</h4>
        <label>Latitude:</label>
        <input type="number" min="-90" max="90" step="0.01" />
        <label>Longitude:</label>
        <input type="number" min="-180" max="180" step="0.01" />
        <label>Radius (km):</label>
        <input type="number" min="0" max="20000" step="100" />
      </div>
    </div>
  );
};

export default AdvancedFilterPanel;
