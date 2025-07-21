import React, { useState } from 'react';

const DateRangeSelector = ({ onSearch }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleSearch = () => {
    if (onSearch) {
      onSearch({ startDate, endDate });
    }
  };

  return (
    <div className="date-range-selector">
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
      />
      <input
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
      />
      <button onClick={handleSearch}>Search</button>
    </div>
  );
};

export default DateRangeSelector;
