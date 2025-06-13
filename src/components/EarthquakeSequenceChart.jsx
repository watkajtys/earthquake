import React, { useMemo, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { scaleLinear, scaleTime } from 'd3-scale';
import { max as d3Max, min as d3Min, extent as d3Extent } from 'd3-array';
import { timeFormat } from 'd3-time-format';
import { getMagnitudeColor, formatDate, isValidNumber, isValuePresent, formatNumber } from '../utils/utils'; // Corrected path
import EarthquakeSequenceChartSkeleton from './skeletons/EarthquakeSequenceChartSkeleton'; // Import skeleton

const axisLabelColor = "text-slate-400"; // From EarthquakeTimelineSVGChart
const tickLabelColor = "text-slate-500"; // From EarthquakeTimelineSVGChart
const gridLineColor = "stroke-slate-600"; // Similar to border color in EarthquakeTimelineSVGChart
const mainshockStrokeWidth = 2;
const mainshockRadius = 8;
const eventRadius = 5;

const EarthquakeSequenceChart = React.memo(({ cluster, isLoading = false }) => {
  const svgRef = useRef(null);
  const [chartRenderWidth, setChartRenderWidth] = useState(800); // Default width

  useEffect(() => {
    if (svgRef.current && svgRef.current.parentElement) {
      // Ensure parentElement has a clientWidth, otherwise default
      const parentWidth = svgRef.current.parentElement.clientWidth;
      setChartRenderWidth(parentWidth > 0 ? parentWidth : 800);
    }
    // Note: For full responsiveness on resize, a ResizeObserver would be needed.
    // This useEffect only sets the initial width based on the parent.
  }, []);

  const chartHeight = 350;
  const margin = { top: 40, right: 50, bottom: 60, left: 60 }; // Increased bottom for time labels, top for title

  const width = chartRenderWidth - margin.left - margin.right;
  const height = chartHeight - margin.top - margin.bottom;

  const { originalQuakes, processedMainshock } = useMemo(() => {
    const quakes = cluster?.originalQuakes || []; // Corrected path to originalQuakes
    // Filter out quakes with invalid time or magnitude early on
    const validQuakes = quakes.filter(q =>
      isValuePresent(q?.properties?.time) &&
      isValidNumber(q?.properties?.mag) &&
      q.properties.time !== null && // ensure time is not null
      q.properties.mag !== null     // ensure mag is not null
    );

    if (validQuakes.length === 0) {
      return { originalQuakes: [], processedMainshock: null };
    }

    // Determine mainshock from valid quakes
    const mainshock = validQuakes.reduce((prev, current) => {
      const prevMag = prev.properties.mag;
      const currentMag = current.properties.mag;
      if (currentMag > prevMag) {
        return current;
      }
      if (currentMag === prevMag) {
        // If magnitudes are equal, the earlier one is mainshock
        return current.properties.time < prev.properties.time ? current : prev;
      }
      return prev;
    });
    return { originalQuakes: validQuakes, processedMainshock: mainshock };
  }, [cluster]);

  if (isLoading) {
    return <EarthquakeSequenceChartSkeleton />;
  }

  // Note: The "No data available" message is now primarily handled here, after isLoading check.
  // This ensures skeleton shows for loading state, then no-data message if applicable.
  if (originalQuakes.length === 0 && width > 0 && !isLoading) {
    return (
      <div className="bg-slate-700 p-4 rounded-lg border border-slate-600 shadow-md flex flex-col justify-center items-center" style={{ height: `${chartHeight}px` }}>
        <h3 className={`text-lg font-semibold text-indigo-400 mb-2`}>When quakes and aftershocks occurred</h3>
        <p className={`${tickLabelColor} p-4 text-center text-sm`}>No data available for chart.</p>
      </div>
    );
  }

  const timeDomain = useMemo(() => {
    if (originalQuakes.length === 0) return [new Date(0), new Date()]; // Default to prevent crash
    const times = originalQuakes.map(d => new Date(d.properties.time));
    return d3Extent(times);
  }, [originalQuakes]);

  const magDomain = useMemo(() => {
    if (originalQuakes.length === 0) return [0, 1]; // Default domain
    const mags = originalQuakes.map(d => d.properties.mag);
    const maxMag = d3Max(mags);
    const validMaxMag = isValidNumber(maxMag) ? maxMag : 0;
    return [0, Math.max(1, Math.ceil(validMaxMag))]; // Ensure domain is at least [0,1]
  }, [originalQuakes]);

  const xScale = useMemo(() =>
    scaleTime().domain(timeDomain).range([0, width]),
  [timeDomain, width]);

  const yScale = useMemo(() =>
    scaleLinear().domain(magDomain).range([height, 0]),
  [magDomain, height]);

  // Axes and Gridlines
  const xAxisTicks = useMemo(() => {
    if (width <= 0 || !xScale.ticks) return [];
    const tickCount = Math.max(2, Math.floor(width / 110)); // Adjusted for "Jan 01, 11AM" format
    return xScale.ticks(tickCount).map(value => ({
      value,
      offset: xScale(value),
      label: timeFormat("%b %d, %I%p")(value).replace(", 0",", ") // Compact format e.g. "Jan 01, 11AM"
    }));
  }, [xScale, width]);

  const yAxisTicks = useMemo(() => {
    if (height <= 0 || !yScale.ticks) return [];
    const domainMax = magDomain[1];
    const tickCount = Math.min(Math.max(2, Math.floor(domainMax) + 1), 6); // Prefer integer ticks

    let ticks = yScale.ticks(tickCount)
      .filter(tick => tick >= 0 && tick <= domainMax && Number.isInteger(tick));

    // Ensure 0 and max magnitude are included if possible and integers
    if (domainMax > 0 && Number.isInteger(domainMax) && !ticks.includes(domainMax)) {
        ticks.push(domainMax);
    }
    if (!ticks.includes(0)) {
        ticks.push(0);
    }
    ticks.sort((a,b) => a-b);

    // Remove duplicates that might arise from adding 0 and domainMax
    ticks = [...new Set(ticks)];

    return ticks.map(value => ({
      value,
      offset: yScale(value),
    })).filter(tick => tick.offset >= 0 && tick.offset <= height); // Ensure ticks are within drawable area
  }, [yScale, height, magDomain]);


  return (
    <div className="bg-slate-700 p-4 rounded-lg border border-slate-600 shadow-md">
      <h3 className={`text-lg font-semibold mb-4 text-center text-indigo-400`}>
        When quakes and aftershocks occurred
      </h3>
      <svg ref={svgRef} width="100%" height={chartHeight} viewBox={`0 0 ${chartRenderWidth} ${chartHeight}`}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Y-Axis Gridlines */}
          {yAxisTicks.map(({ value, offset }) => (
            <line
              key={`y-grid-${value}`}
              x1={0}
              x2={width}
              y1={offset}
              y2={offset}
              className={`${gridLineColor} stroke-dasharray-2 stroke-opacity-50`}
              strokeDasharray="2,2"
            />
          ))}

          {/* X-Axis Gridlines */}
          {xAxisTicks.map(({ value, offset }) =>
             (offset >= 0 && offset <= width) && ( // Render only if within bounds
            <line
              key={`x-grid-${value.toISOString()}`}
              x1={offset}
              x2={offset}
              y1={0}
              y2={height}
              className={`${gridLineColor} stroke-dasharray-2 stroke-opacity-50`}
              strokeDasharray="2,2"
            />
          ))}

          {/* Y-Axis */}
          <line x1={0} y1={0} x2={0} y2={height} className={gridLineColor} />
          {yAxisTicks.map(({ value, offset }) => (
            <text
              key={`y-tick-${value}`}
              x={-8}
              y={offset}
              textAnchor="end"
              alignmentBaseline="middle"
              className={`text-xs fill-current ${tickLabelColor}`}
            >
              {value}
            </text>
          ))}
          <text
            transform={`translate(${-margin.left / 1.5}, ${height / 2}) rotate(-90)`}
            textAnchor="middle"
            className={`text-sm fill-current ${axisLabelColor}`}
          >
            Mag.
          </text>

          {/* X-Axis */}
          <line x1={0} y1={height} x2={width} y2={height} className={gridLineColor} />
          {xAxisTicks.map(({ value, offset, label }) =>
            (offset >= 0 && offset <= width) && ( // Render only if within bounds
            <text
              key={`x-tick-${value.toISOString()}`}
              x={offset}
              y={height + 20}
              textAnchor="middle"
              className={`text-xs fill-current ${tickLabelColor}`}
            >
              {label}
            </text>
          ))}

          {/* Data Points */}
          {originalQuakes.map(quake => {
            // Properties already validated in the initial processing memo
            const { id, properties } = quake;
            const { time, mag, place } = properties;

            const cx = xScale(new Date(time));
            const cy = yScale(mag);
            const color = getMagnitudeColor(mag);
            const isMain = processedMainshock && processedMainshock.id === id;

            // Basic check if points are outside the main plot area before rendering
            // Add a small buffer for radius for visibility at edges
            if (cx < -eventRadius || cx > width + eventRadius || cy < -eventRadius || cy > height + eventRadius) {
              return null;
            }

            return (
              <g key={id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isMain ? mainshockRadius : eventRadius}
                  fill={isMain ? 'none' : color}
                  stroke={isMain ? color : 'none'}
                  strokeWidth={isMain ? mainshockStrokeWidth : 0}
                  className="transition-opacity duration-200 hover:opacity-70"
                >
                  <title>{`Mag ${formatNumber(mag,1)} ${place || 'Unknown location'} - ${formatDate(time)}`}</title>
                </circle>
                {isMain && (
                  <text
                    x={cx + mainshockRadius + 5}
                    y={cy}
                    alignmentBaseline="middle"
                    className={`text-xs fill-current ${tickLabelColor}`}
                  >
                    Magnitude {formatNumber(mag,1)} earthquake
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
});

EarthquakeSequenceChart.propTypes = {
  cluster: PropTypes.shape({
    // originalQuakes is now expected directly on cluster, not cluster.properties
    originalQuakes: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        properties: PropTypes.shape({
          time: PropTypes.number,
          mag: PropTypes.number,
          place: PropTypes.string,
        }).isRequired,
      })
    ),
    // If other properties are still expected on cluster.properties, they can be defined here
    // For example, if cluster_id was used:
    // properties: PropTypes.shape({
    //   cluster_id: PropTypes.string,
    // })
  }).isRequired,
  isLoading: PropTypes.bool,
};

EarthquakeSequenceChart.defaultProps = {
  isLoading: false,
};

export default EarthquakeSequenceChart;
