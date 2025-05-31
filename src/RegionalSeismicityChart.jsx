// src/RegionalSeismicityChart.jsx
import React, { useMemo } from 'react';

// (Copied from App.jsx - ideally this would be in a shared utils.js)
const getMagnitudeColor = (magnitude) => {
    if (magnitude === null || magnitude === undefined) return '#94A3B8'; // slate-400
    if (magnitude < 1.0) return '#67E8F9'; // cyan-300
    if (magnitude < 2.5) return '#22D3EE'; // cyan-400
    if (magnitude < 4.0) return '#34D399'; // emerald-400
    if (magnitude < 5.0) return '#FACC15'; // yellow-400
    if (magnitude < 6.0) return '#FB923C'; // orange-400
    if (magnitude < 7.0) return '#F97316'; // orange-500
    if (magnitude < 8.0) return '#EF4444'; // red-500
    return '#B91C1C'; // red-700
};

// --- Helper Functions ---
/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of the first point.
 * @param {number} lon1 Longitude of the first point.
 * @param {number} lat2 Latitude of the second point.
 * @param {number} lon2 Longitude of the second point.
 * @returns {number} Distance in kilometers.
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

/**
 * RegionalSeismicityChart component
 * This component displays a chart of seismic activity in the region
 * surrounding the selected earthquake.
 */
function RegionalSeismicityChart({ currentEarthquake, nearbyEarthquakesData }) {
  const REGIONAL_RADIUS_KM = 100; // 100 km radius for nearby events
  const TIME_WINDOW_DAYS = 30; // Look back 30 days

  const regionalEvents = useMemo(() => {
    if (!currentEarthquake || !nearbyEarthquakesData || nearbyEarthquakesData.length === 0) {
      return [];
    }

    const currentLat = currentEarthquake.geometry?.coordinates?.[1];
    const currentLon = currentEarthquake.geometry?.coordinates?.[0];
    const currentTime = currentEarthquake.properties?.time;

    if (currentLat === undefined || currentLon === undefined || currentTime === undefined) {
      return [];
    }

    const thirtyDaysInMillis = TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const startTimeWindow = currentTime - thirtyDaysInMillis;

    return nearbyEarthquakesData.filter(quake => {
      const qLat = quake.geometry?.coordinates?.[1];
      const qLon = quake.geometry?.coordinates?.[0];
      const qTime = quake.properties?.time;
      const qId = quake.id;

      if (qLat === undefined || qLon === undefined || qTime === undefined || qId === currentEarthquake.id) {
        return false; // Skip if data is incomplete or it's the same event
      }

      // Filter by time (up to 30 days before the current event)
      if (qTime >= currentTime || qTime < startTimeWindow) {
        return false;
      }

      // Filter by distance
      const distance = calculateDistance(currentLat, currentLon, qLat, qLon);
      return distance <= REGIONAL_RADIUS_KM;
    });
  }, [currentEarthquake, nearbyEarthquakesData, REGIONAL_RADIUS_KM, TIME_WINDOW_DAYS]);

  const chartData = useMemo(() => {
    if (regionalEvents.length === 0) {
      return [];
    }
    // Group by day for the last 30 days relative to currentEarthquake's time
    const eventsByDay = {};
    const currentEventDate = new Date(currentEarthquake.properties.time);
    currentEventDate.setHours(0,0,0,0); // Normalize to start of the day

    for (let i = 0; i < TIME_WINDOW_DAYS; i++) {
        const dateKey = new Date(currentEventDate);
        dateKey.setDate(currentEventDate.getDate() - i);
        // Format as YYYY-MM-DD for consistent keying, or just use date object if careful with timezones
        const formattedDateKey = dateKey.toLocaleDateString('en-CA'); // YYYY-MM-DD
        eventsByDay[formattedDateKey] = { date: new Date(dateKey), count: 0, magnitudes: [] };
    }

    regionalEvents.forEach(quake => {
      const qDate = new Date(quake.properties.time);
      qDate.setHours(0,0,0,0);
      const formattedDateKey = qDate.toLocaleDateString('en-CA');
      if (eventsByDay[formattedDateKey]) {
        eventsByDay[formattedDateKey].count++;
        if (quake.properties.mag !== null && quake.properties.mag !== undefined) {
            eventsByDay[formattedDateKey].magnitudes.push(quake.properties.mag);
        }
      }
    });

    // Convert to array and sort by date ascending (oldest to newest)
    return Object.values(eventsByDay)
                 .sort((a, b) => a.date - b.date)
                 .map(day => ({
                    ...day,
                    avgMag: day.magnitudes.length > 0 ? (day.magnitudes.reduce((s,m)=>s+m,0) / day.magnitudes.length) : null
                 }));

  }, [regionalEvents, currentEarthquake, TIME_WINDOW_DAYS]);


  if (!currentEarthquake) {
    return (
      <div className="p-3 rounded-md text-center text-sm text-slate-500">
        Select an earthquake to see regional seismicity.
      </div>
    );
  }

  const isLoading = !nearbyEarthquakesData; // Simplified loading state

  if (isLoading) {
    return (
        <div className="p-3 rounded-md">
            <h3 className="text-md font-semibold text-blue-700 mb-2">Regional Activity</h3>
            <div className="animate-pulse">
                <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
                <div className="w-full h-40 bg-gray-200 rounded-md flex items-center justify-center mt-2">
                    <p className="text-gray-400 text-xs">Loading regional data...</p>
                </div>
            </div>
        </div>
    );
  }

  if (regionalEvents.length === 0) {
    return (
      <div className="p-3 rounded-md">
        <h3 className="text-md font-semibold text-blue-700 mb-2">Regional Activity</h3>
        <p className="text-xs text-slate-600 text-center py-5">
          No other significant earthquakes recorded within {REGIONAL_RADIUS_KM}km in the {TIME_WINDOW_DAYS} days prior to this event.
        </p>
      </div>
    );
  }

  // SVG Chart Constants
  const svgHeight = 200;
  const svgWidth = 380; // Adjusted for typical panel width
  const margin = { top: 20, right: 10, bottom: 35, left: 30 };
  const chartWidth = svgWidth - margin.left - margin.right;
  const chartHeight = svgHeight - margin.top - margin.bottom;

  const maxCount = Math.max(...chartData.map(d => d.count), 0);

  // X-axis (time) - simple ordinal scale for days
  const barWidth = chartWidth / Math.max(1, chartData.length) * 0.8; // 80% of available space per bar
  const barSpacing = chartWidth / Math.max(1, chartData.length) * 0.2;


  // Y-axis (count)
  const yScale = (value) => chartHeight - (value / Math.max(1, maxCount)) * chartHeight;

  // Determine tick values for Y axis
  const yAxisTicks = [];
  if (maxCount > 0) {
    const numTicks = Math.min(maxCount, 5); // Max 5 ticks
    const step = Math.ceil(maxCount / numTicks) || 1;
    for (let i = 0; i <= maxCount; i += step) {
      if (yAxisTicks.length <= numTicks) yAxisTicks.push(i);
      else break;
    }
    if (!yAxisTicks.includes(maxCount) && yAxisTicks.length <= numTicks) yAxisTicks.push(maxCount);
    if (yAxisTicks.length === 1 && yAxisTicks[0] === 0 && maxCount > 0) yAxisTicks.push(maxCount); // Ensure at least one non-zero tick if data exists
    else if (yAxisTicks.length === 0 && maxCount === 0) yAxisTicks.push(0);
  } else {
      yAxisTicks.push(0);
  }


  return (
    <div className="p-3 rounded-md">
      <h3 className="text-md font-semibold text-blue-700 mb-1">Regional Activity Prior to Event</h3>
      <p className="text-xs text-slate-500 mb-2">
        Earthquakes within {REGIONAL_RADIUS_KM}km in the {TIME_WINDOW_DAYS} days before this M{currentEarthquake.properties.mag?.toFixed(1)} event.
      </p>

      <div className="w-full overflow-x-auto">
        <svg width={svgWidth} height={svgHeight} className="font-sans">
          <g transform={`translate(${margin.left},${margin.top})`}>
            {/* Y-axis Grid Lines & Labels */}
            {yAxisTicks.map(tick => (
              <g key={`y-tick-${tick}`} className="text-gray-400">
                <line
                  x1={0} y1={yScale(tick)}
                  x2={chartWidth} y2={yScale(tick)}
                  stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" />
                <text
                  x={-5} y={yScale(tick) + 4}
                  textAnchor="end" className="text-xs fill-current">
                  {tick}
                </text>
              </g>
            ))}

            {/* X-axis Line (bottom) */}
            <line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="currentColor" className="text-gray-500" strokeWidth="1"/>

            {/* Bars and X-axis Labels */}
            {chartData.map((dayData, index) => {
              const x = index * (barWidth + barSpacing);
              const barH = (dayData.count / Math.max(1,maxCount)) * chartHeight;
              const y = chartHeight - barH;
              const isSignificantDay = chartData.length <= 7 || index % Math.floor(chartData.length / 7) === 0 || index === chartData.length -1 ;


              return (
                <g key={dayData.date.toISOString()}>
                  <title>
                    {`${dayData.date.toLocaleDateString([], {month:'short', day:'numeric'})}: ${dayData.count} event(s)`}
                    {dayData.avgMag ? `, Avg Mag: ${dayData.avgMag.toFixed(1)}` : ''}
                  </title>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barH}
                    fill={getMagnitudeColor(dayData.avgMag)}
                    className="hover:opacity-80 transition-opacity"
                  />
                  {dayData.count > 0 && (
                     <text x={x + barWidth / 2} y={y - 3 > 0 ? y-3 : 8} textAnchor="middle" className="text-xs font-medium fill-gray-700">
                        {dayData.count}
                     </text>
                  )}
                  {isSignificantDay && (
                    <text
                      x={x + barWidth / 2} y={chartHeight + 15}
                      textAnchor="middle" className="text-xs fill-gray-500">
                      {dayData.date.toLocaleDateString([], {month:'short', day:'numeric'})}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Axis Labels */}
            <text transform={`translate(${-margin.left + 10}, ${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className="text-xs fill-gray-600">
              Event Count
            </text>
            <text transform={`translate(${chartWidth / 2}, ${chartHeight + margin.bottom -5})`} textAnchor="middle" className="text-xs fill-gray-600">
              Date (Days Before Current Event)
            </text>
          </g>
        </svg>
      </div>
       <div className="text-xs text-slate-500 mt-2 leading-tight">
        <span className="font-semibold">Avg. Magnitude Color Key:</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(0.5) }}></span> &lt;1.0</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(1.5) }}></span> 1.0-2.4</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(3.0) }}></span> 2.5-3.9</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(4.5) }}></span> 4.0-4.9</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(5.5) }}></span> 5.0-5.9</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(6.5) }}></span> 6.0-6.9</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(7.5) }}></span> 7.0+</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(null) }}></span> N/A</span>
        </div>
    </div>
    </div>
  );
}

export default RegionalSeismicityChart;
