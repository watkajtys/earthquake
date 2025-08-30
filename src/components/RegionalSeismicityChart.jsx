// src/RegionalSeismicityChart.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { getMagnitudeColor } from '../utils/utils.js';
import { calculateDistance } from '../../common/mathUtils.js';

// Not needed locally anymore as they are imported from utils.js
// const getMagnitudeColor = (magnitude) => { ... };
// function calculateDistance(lat1, lon1, lat2, lon2) { ... };

/**
 * Renders a bar chart displaying regional seismic activity prior to a selected earthquake.
 * It shows the count of earthquakes per day within a defined radius and time window leading up to the main event.
 *
 * @param {object} currentEarthquake - The main earthquake object (GeoJSON feature) around which regional activity is analyzed.
 * @param {object[]} nearbyEarthquakesData - An array of GeoJSON earthquake features representing potentially nearby events. This data is filtered by the component.
 * @param {number} dataSourceTimespanDays - The number of days of data the `nearbyEarthquakesData` prop typically represents (e.g., 30 for a monthly feed). Used for context in descriptive text.
 * @param {boolean} isLoadingMonthly - Indicates if the 30-day data is currently being loaded.
 * @param {boolean} hasAttemptedMonthlyLoad - Indicates if an attempt to load 30-day data has been made.
 * @returns {JSX.Element} The regional seismicity chart component or a message if data is insufficient.
 */
function RegionalSeismicityChart({ currentEarthquake, nearbyEarthquakesData, dataSourceTimespanDays, isLoadingMonthly, hasAttemptedMonthlyLoad }) {
  const chartContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(380);

  const REGIONAL_RADIUS_KM = 160; // Approx 100 miles radius for nearby events
  const TIME_WINDOW_DAYS = 30;    // Default look back 30 days for data search

  useEffect(() => {
      const chartContainer = chartContainerRef.current;
      if (!chartContainer) return;
      const resizeObserver = new ResizeObserver(entries => {
          if (entries && entries.length > 0 && entries[0].contentRect) {
              setContainerWidth(entries[0].contentRect.width);
          }
      });
      resizeObserver.observe(chartContainer);
      setContainerWidth(chartContainer.clientWidth);
      return () => { if (chartContainer) { resizeObserver.unobserve(chartContainer); } };
  }, []);

  const regionalEvents = useMemo(() => {
    if (
        !currentEarthquake ||
        !currentEarthquake.properties || // Ensure properties object exists
        typeof currentEarthquake.properties.time !== 'number' ||
        !currentEarthquake.geometry ||
        !currentEarthquake.geometry.coordinates ||
        currentEarthquake.geometry.coordinates.length < 2 ||
        typeof currentEarthquake.geometry.coordinates[0] !== 'number' ||
        typeof currentEarthquake.geometry.coordinates[1] !== 'number' ||
        !nearbyEarthquakesData ||
        nearbyEarthquakesData.length === 0
    ) {
        return [];
    }
    // Now we know properties and geometry.coordinates exist and are valid
    const currentLon = currentEarthquake.geometry.coordinates[0];
    const currentLat = currentEarthquake.geometry.coordinates[1];
    const currentTime = currentEarthquake.properties.time;

    const startTimeWindow = currentTime - (TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return nearbyEarthquakesData.filter(quake => {
      // Robustness checks for each quake object in the array
      if (!quake || !quake.properties || typeof quake.properties.time !== 'number' || !quake.id) {
        return false;
      }
      if (!quake.geometry || !quake.geometry.coordinates || quake.geometry.coordinates.length < 2 ||
          typeof quake.geometry.coordinates[0] !== 'number' || typeof quake.geometry.coordinates[1] !== 'number') {
        return false;
      }

      const qLon = quake.geometry.coordinates[0];
      const qLat = quake.geometry.coordinates[1];
      const qTime = quake.properties.time;
      const qId = quake.id;

      if (qId === currentEarthquake.id) return false; // currentEarthquake is already validated
      if (qTime >= currentTime || qTime < startTimeWindow) return false;
      return calculateDistance(currentLat, currentLon, qLat, qLon) <= REGIONAL_RADIUS_KM;
    });
  }, [currentEarthquake, nearbyEarthquakesData, REGIONAL_RADIUS_KM, TIME_WINDOW_DAYS]);

  const displayWindowDays = useMemo(() => {
    let calculatedDisplayDays = TIME_WINDOW_DAYS;
    if (regionalEvents.length > 0 && currentEarthquake?.properties?.time) {
        const earliestEventTime = Math.min(...regionalEvents.map(q => q.properties.time));
        const mainEventTime = currentEarthquake.properties.time;
        if (earliestEventTime && mainEventTime) {
            const actualSpanMillis = mainEventTime - earliestEventTime;
            if (actualSpanMillis >= 0) {
                const actualSpanDays = Math.ceil(actualSpanMillis / (1000 * 60 * 60 * 24));
                const minPracticalDisplayDays = 3;
                if (actualSpanDays < (TIME_WINDOW_DAYS / 2) && actualSpanDays < 10) {
                    calculatedDisplayDays = Math.max(actualSpanDays + 1, minPracticalDisplayDays);
                } else if (actualSpanDays < TIME_WINDOW_DAYS * 0.75) {
                    calculatedDisplayDays = Math.max(actualSpanDays + 2, 7);
                }
                calculatedDisplayDays = Math.min(calculatedDisplayDays, TIME_WINDOW_DAYS);
                calculatedDisplayDays = Math.max(calculatedDisplayDays, minPracticalDisplayDays);
            }
        }
    }
    return calculatedDisplayDays;
  }, [regionalEvents, currentEarthquake, TIME_WINDOW_DAYS]);

  const chartData = useMemo(() => {
    if (regionalEvents.length === 0) return [];
    const eventsByDay = {};
    const currentEventDate = new Date(currentEarthquake.properties.time);
    currentEventDate.setHours(0,0,0,0);
    for (let i = 0; i < displayWindowDays; i++) {
        const dateKeyDate = new Date(currentEventDate);
        dateKeyDate.setDate(currentEventDate.getDate() - i);
        eventsByDay[dateKeyDate.toLocaleDateString('en-CA')] = { date: dateKeyDate, count: 0, magnitudes: [] };
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
    return Object.values(eventsByDay)
                 .sort((a, b) => a.date - b.date)
                 .map(day => ({ ...day, avgMag: day.magnitudes.length > 0 ? (day.magnitudes.reduce((s,m)=>s+m,0) / day.magnitudes.length) : null }));
  }, [regionalEvents, currentEarthquake, displayWindowDays]);

  // Conditional returns for no current quake, loading, or no regional events
  if (!currentEarthquake) {
    return <div className="p-3 rounded-md text-center text-sm text-slate-500">Select an earthquake to see regional seismicity.</div>;
  }

    // Determine if we are specifically waiting for monthly (30-day) data to load.
    const isWaitingForMonthlyData =
        dataSourceTimespanDays === 30 &&
        hasAttemptedMonthlyLoad &&
        isLoadingMonthly;

    // Original condition for when nearbyEarthquakesData itself is absent (e.g., initial load of 7-day data).
    const isNearbyDataMissing = !nearbyEarthquakesData;

    // Combine conditions: show loader if nearby data is missing OR if we are specifically waiting for monthly data.
    const shouldShowLoadingSkeleton = isNearbyDataMissing || isWaitingForMonthlyData;

    if (shouldShowLoadingSkeleton) {
        return (
          <div className="p-3 rounded-md">
            <h3 className="text-md font-semibold text-blue-700 mb-2">Regional Activity</h3>
            <div className="animate-pulse">
              <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
              <div className="w-full h-40 bg-gray-200 rounded-md flex items-center justify-center mt-2">
                {/* Make the message more specific if waiting for monthly data */}
                <p className="text-gray-400 text-xs">
                  {isWaitingForMonthlyData ? "Loading 30-day regional data..." : "Loading regional data..."}
                </p>
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

  // SVG Chart Constants & Calculations
  const svgHeight = 200;
  const margin = { top: 20, right: 10, bottom: 35, left: 30 };
  const chartWidth = containerWidth > 0 ? containerWidth - margin.left - margin.right : 0;
  const chartHeight = svgHeight - margin.top - margin.bottom;
  const maxCount = Math.max(...chartData.map(d => d.count), 0);
  const barWidth = chartWidth > 0 && chartData.length > 0 ? chartWidth / chartData.length * 0.8 : 0;
  const barSpacing = chartWidth > 0 && chartData.length > 0 ? chartWidth / chartData.length * 0.2 : 0;
  const yScale = (value) => chartHeight - (value / Math.max(1, maxCount)) * chartHeight;
  const yAxisTicks = [];
  if (maxCount > 0) {
    const numTicks = Math.min(maxCount, 5);
    const step = Math.ceil(maxCount / numTicks) || 1;
    for (let i = 0; i <= maxCount; i += step) {
      if (yAxisTicks.length <= numTicks) yAxisTicks.push(i); else break;
    }
    if (!yAxisTicks.includes(maxCount) && yAxisTicks.length <= numTicks) yAxisTicks.push(maxCount);
    if (yAxisTicks.length === 1 && yAxisTicks[0] === 0 && maxCount > 0) yAxisTicks.push(maxCount);
    else if (yAxisTicks.length === 0 && maxCount === 0) yAxisTicks.push(0);
  } else { yAxisTicks.push(0); }
  const approxLabelWidthPx = 40;
  let numberOfAffordableLabels = chartWidth > 0 ? Math.max(1, Math.floor(chartWidth / approxLabelWidthPx)) : 1;
  if (chartData.length <= 2) {
      numberOfAffordableLabels = chartData.length;
  } else {
      numberOfAffordableLabels = Math.max(2, numberOfAffordableLabels);
  }
  const numLabelsToActuallyShow = Math.min(chartData.length, numberOfAffordableLabels);
  const labelStep = chartData.length > 0 && numLabelsToActuallyShow > 0 ? Math.ceil(chartData.length / numLabelsToActuallyShow) : 1;

  return (
    <div className="p-3 rounded-md">
      <h3 className="text-md font-semibold text-blue-700 mb-1">Regional Activity Prior to Event</h3>
      <p className="text-xs text-slate-500 mb-2">
        Using regional data from the last ~{dataSourceTimespanDays || 30} days, searching within {REGIONAL_RADIUS_KM}km.
        Chart displays activity in the {displayWindowDays} days prior to this M{currentEarthquake.properties.mag?.toFixed(1)} event.
      </p>
      <div ref={chartContainerRef} className="w-full overflow-hidden">
        <svg width="100%" height={svgHeight} viewBox={`0 0 ${containerWidth} ${svgHeight}`} className="font-sans">
          <g transform={`translate(${margin.left},${margin.top})`}>
            {yAxisTicks.map(tick => (
              <g key={`y-tick-${tick}`} className="text-gray-400">
                <line x1={0} y1={yScale(tick)} x2={chartWidth} y2={yScale(tick)} stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" />
                <text x={-5} y={yScale(tick) + 4} textAnchor="end" className="text-xs fill-current">{tick}</text>
              </g>
            ))}
            <line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="currentColor" className="text-gray-500" strokeWidth="1"/>
            {chartData.map((dayData, index) => {
              const x = index * (barWidth + barSpacing);
              const barH = (dayData.count / Math.max(1,maxCount)) * chartHeight;
              const y = chartHeight - barH;
              let isSignificantDay;
              if (numLabelsToActuallyShow === 0 && chartData.length > 0) {
                  isSignificantDay = false;
              } else if (chartData.length === 1) {
                  isSignificantDay = true;
              } else if (chartData.length <= numLabelsToActuallyShow) {
                  isSignificantDay = true;
              } else {
                  isSignificantDay = index === 0 || index === chartData.length - 1 || (index % labelStep === 0);
              }
              if (numLabelsToActuallyShow === 1 && chartData.length > 1) {
                   isSignificantDay = index === Math.floor(chartData.length / 2);
              }
              return (
                <g key={dayData.date.toISOString()}>
                  <title>
                    {`${dayData.date.toLocaleDateString([], {month:'short', day:'numeric'})}: ${dayData.count} event(s)`}
                    {dayData.avgMag ? `, Avg Mag: ${dayData.avgMag.toFixed(1)}` : ''}
                  </title>
                  <rect x={x} y={y} width={barWidth} height={barH} fill={getMagnitudeColor(dayData.avgMag)} className="hover:opacity-80 transition-opacity"/>
                  {dayData.count > 0 && (
                     <text x={x + barWidth / 2} y={y - 3 > 0 ? y-3 : 8} textAnchor="middle" className="text-xs font-medium fill-gray-700">{dayData.count}</text>
                  )}
                  {isSignificantDay && (
                    <text x={x + barWidth / 2} y={chartHeight + 15} textAnchor="middle" className="text-xs fill-gray-500">{dayData.date.toLocaleDateString([], {month:'short', day:'numeric'})}</text>
                  )}
                </g>
              );
            })}
            <text transform={`translate(${-margin.left + 10}, ${chartHeight / 2}) rotate(-90)`} textAnchor="middle" className="text-xs fill-gray-600">Event Count</text>
            <text transform={`translate(${chartWidth / 2}, ${chartHeight + margin.bottom -5})`} textAnchor="middle" className="text-xs fill-gray-600">Date (Days Before Current Event)</text>
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
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(7.5) }}></span> 7.0-7.9</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(8.5) }}></span> 8.0+</span>
            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: getMagnitudeColor(null) }}></span> N/A</span>
        </div>
    </div>
    </div>
  );
}

export default RegionalSeismicityChart;
