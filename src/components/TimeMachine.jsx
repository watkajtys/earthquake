// src/components/TimeMachine.jsx
import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const TimeMachine = ({ onDateChange }) => {
  const [startDate, setStartDate] = useState(new Date());

  const handleDateChange = (date) => {
    setStartDate(date);
  };

  const handleGoClick = () => {
    onDateChange(startDate);
  };

  return (
    <div className="flex items-center space-x-2">
      <DatePicker
        selected={startDate}
        onChange={handleDateChange}
        dateFormat="yyyy/MM/dd"
        className="bg-slate-700 text-white rounded-md px-2 py-1 text-sm"
      />
      <button
        onClick={handleGoClick}
        className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 text-sm font-medium rounded-md"
      >
        Go
      </button>
    </div>
  );
};

export default TimeMachine;
