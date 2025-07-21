import React, { useState } from 'react';
import DateRangeSelector from '../components/DateRangeSelector';
import EarthquakeMap from '../components/EarthquakeMap';

const HistoricalPage = () => {
  const [earthquakes, setEarthquakes] = useState([]);

  const handleSearch = async ({ startDate, endDate }) => {
    // Fetch the data from the new endpoint
    await fetch(`/api/historical-earthquakes?startDate=${startDate}&endDate=${endDate}`, {
      method: 'POST'
    });

    // Now fetch the earthquakes for the selected date range
    const response = await fetch(`/api/get-earthquakes?startDate=${startDate}&endDate=${endDate}`);
    const data = await response.json();
    setEarthquakes(data);
  };

  return (
    <div className="historical-page">
      <h1>Historical Earthquake Data</h1>
      <DateRangeSelector onSearch={handleSearch} />
      <EarthquakeMap earthquakes={earthquakes} />
    </div>
  );
};

export default HistoricalPage;
