import React, { useMemo, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { scaleLinear, scaleTime, scaleSqrt } from 'd3-scale'; // Import scaleSqrt
import { max as d3Max, min as d3Min, extent as d3Extent } from 'd3-array';
import { timeFormat } from 'd3-time-format';
import { timeHour } from 'd3-time'; // Import timeHour
import { line as d3Line } from 'd3-shape'; // Import d3Line
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
        <h3 className={`text-lg font-semibold text-indigo-400 mb-2`}>Earthquake Sequence (UTC)</h3>
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
    if (originalQuakes.length === 0) return [0, 1]; // Fallback for no data

    const mags = originalQuakes.map(d => d.properties.mag).filter(isValidNumber); // Ensure only valid numbers
    if (mags.length === 0) return [0, 1]; // Fallback if no valid magnitudes

    let minActualMag = d3Min(mags);
    let maxActualMag = d3Max(mags);

    // Handle case where minActualMag or maxActualMag might still be undefined if mags array is empty after filter
    // Though the mags.length === 0 check above should catch this.
    minActualMag = isValidNumber(minActualMag) ? minActualMag : 0;
    maxActualMag = isValidNumber(maxActualMag) ? maxActualMag : 0;


    let lowerBound = Math.max(0, minActualMag - 0.5);
    let upperBound = maxActualMag + 0.5;

    // Ensure a minimum span for the Y-axis, e.g., at least 1 unit
    const MIN_DOMAIN_SPAN = 1.0;
    if (upperBound - lowerBound < MIN_DOMAIN_SPAN) {
      const midPoint = (lowerBound + upperBound) / 2; // Calculate midpoint before adjusting lowerBound
      lowerBound = Math.max(0, midPoint - (MIN_DOMAIN_SPAN / 2));
      upperBound = lowerBound + MIN_DOMAIN_SPAN;
    }

    // Final check if lower bound ended up being equal to or greater than upper bound
    // This can happen if all mags are 0 or very close, and after padding and min_span logic.
    if (upperBound <= lowerBound) {
        upperBound = lowerBound + MIN_DOMAIN_SPAN;
    }

    return [lowerBound, upperBound];
  }, [originalQuakes]);

  const xScale = useMemo(() =>
    scaleTime().domain(timeDomain).range([0, width]),
  [timeDomain, width]);

  const yScale = useMemo(() =>
    scaleLinear().domain(magDomain).range([height, 0]),
  [magDomain, height]);

  const radiusScale = useMemo(() =>
    scaleSqrt()
      .domain([0, magDomain[1]]) // Domain from 0 to max magnitude in the dataset
      .range([2, 10]) // Output radius from 2px to 10px
      .clamp(true), // Prevent values outside the range (optional, but good for safety)
  [magDomain]);

  // Axes and Gridlines
  const xAxisTicks = useMemo(() => {
      // Ensure timeDomain is valid and width is positive for xScale creation
      if (width <= 0 || !timeDomain || !timeDomain[0] || !timeDomain[1]) return [];

      // xScale is derived from timeDomain and width, used for positioning
      // A temporary scale is used for tick generation if specific intervals are needed.
      const tempScale = scaleTime().domain(timeDomain).range([0, width]);

      const [domainStartTime, domainEndTime] = timeDomain;
      const durationMs = domainEndTime.getTime() - domainStartTime.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);

      let tickIntervalHours;
      if (durationHours <= 1) tickIntervalHours = 1; // Min 1 hour interval for very short spans
      else if (durationHours < 12) tickIntervalHours = 2;
      else if (durationHours < 24) tickIntervalHours = 3;
      else if (durationHours < 48) tickIntervalHours = 6;
      else tickIntervalHours = 12;

      const potentialTicks = tempScale.ticks(timeHour.every(tickIntervalHours));

      let allSameDay = true;
      if (potentialTicks.length > 0) {
          const firstTickDate = new Date(potentialTicks[0].getTime());
          const firstDay = firstTickDate.getDate();
          const firstMonth = firstTickDate.getMonth();
          const firstYear = firstTickDate.getFullYear();

          for (let i = 1; i < potentialTicks.length; i++) {
              const currentTickDate = new Date(potentialTicks[i].getTime());
              if (currentTickDate.getDate() !== firstDay || currentTickDate.getMonth() !== firstMonth || currentTickDate.getFullYear() !== firstYear) {
                  allSameDay = false;
                  break;
              }
          }
      } else {
          allSameDay = false; // Default if no ticks
      }
      // If only one tick, allSameDay remains true from initialization, which is correct.

      const useShortFormat = durationHours < 24 && allSameDay && potentialTicks.length > 0;
      // Use %-I for non-padded hour (e.g., "1PM" instead of "01PM") for brevity.
      // Use %p for AM/PM.
      const currentFormat = useShortFormat ? timeFormat("%-I%p") : timeFormat("%b %d, %-I%p");

      return potentialTicks.map(value => {
          let label = currentFormat(value);
          return {
              value,
              offset: xScale(value), // Use the main xScale passed to component for positioning
              label
          };
      // Filter ticks to be within or very close to the visible plot area
      }).filter(tick => tick.offset >= -5 && tick.offset <= width + 5);
  }, [xScale, width, timeDomain]); // Dependencies: xScale (captures scale changes), width, timeDomain

  const yAxisTicks = useMemo(() => {
      if (height <= 0 || !yScale.ticks) return [];

      // Suggest a number of ticks (e.g., 5). D3 will try to find "nice" values around this count.
      const suggestedTickCount = 5;
      let ticks = yScale.ticks(suggestedTickCount);

      // Optional: Refine ticks if needed, e.g., ensure they are not too fractional for magnitudes
      // For instance, round to nearest 0.5 if domain is small
      const domainSpan = magDomain[1] - magDomain[0];
      if (domainSpan <= 2 && domainSpan > 0) { // If domain span is small (but not zero), prefer ticks at .0 or .5
          ticks = ticks.map(t => Math.round(t * 2) / 2);
      } else if (domainSpan > 0) { // Otherwise, prefer integer ticks if possible, or let D3 decide
          // Check if most ticks are already integers or close to them
          const allNearInteger = ticks.every(t => Math.abs(t - Math.round(t)) < 0.01);
          if (allNearInteger) {
              ticks = ticks.map(t => Math.round(t));
          }
          // If not, D3's default choice is usually good.
      }

      // Remove duplicate ticks that might have resulted from rounding and ensure they are within domain
      ticks = [...new Set(ticks)].filter(t => t >= magDomain[0] && t <= magDomain[1]);
      ticks.sort((a,b) => a-b);

      return ticks.map(value => ({
          value,
          offset: yScale(value),
      // Allow slight overflow for edge ticks to be visible if they are just outside due to rounding/pixel alignment
      })).filter(tick => tick.offset >= -1 && tick.offset <= height + 1);
  }, [yScale, height, magDomain]);

  const { sortedQuakes, linePath } = useMemo(() => {
    if (!originalQuakes || originalQuakes.length < 2) {
        return { sortedQuakes: originalQuakes || [], linePath: null };
    }

    // Explicitly sort quakes by time
    const sorted = [...originalQuakes].sort((a, b) =>
        new Date(a.properties.time) - new Date(b.properties.time)
    );

    const lineGenerator = d3Line()
        .x(d => xScale(new Date(d.properties.time)))
        .y(d => yScale(d.properties.mag));

    return { sortedQuakes: sorted, linePath: lineGenerator(sorted) };
  }, [originalQuakes, xScale, yScale]); // Dependencies

  return (
    <div className="bg-slate-700 p-4 rounded-lg border border-slate-600 shadow-md">
      <h3 className={`text-lg font-semibold mb-4 text-center text-indigo-400`}>
        Earthquake Sequence (UTC)
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
            Magnitude
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
          {/* X-Axis Label */}
          <text
            x={width / 2}
            y={height + margin.bottom - 10} // Adjusted y position
            textAnchor="middle"
            className={`text-sm fill-current ${axisLabelColor}`}
          >
            Time (UTC)
          </text>

          {/* Connecting Line for Quakes */}
          {linePath && (
            <path
                d={linePath}
                strokeDasharray="3,3" // Dashed line
                className={`stroke-current ${tickLabelColor} opacity-75`} // Use existing tickLabelColor for theme consistency, add opacity
                strokeWidth={1}
                fill="none"
            />
          )}

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
            const baseRadius = radiusScale(mag);
            const circleRadius = isMain ? baseRadius + 2 : baseRadius; // Mainshock slightly larger

            // Add a small buffer for radius for visibility at edges
            if (cx < -circleRadius || cx > width + circleRadius || cy < -circleRadius || cy > height + circleRadius) {
              return null;
            }

            return (
              <g key={id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={circleRadius}
                  fill={isMain ? 'none' : color}
                  stroke={isMain ? color : 'none'}
                  strokeWidth={isMain ? mainshockStrokeWidth : 0}
                  fillOpacity={isMain ? 1.0 : 0.7}
                  strokeOpacity={isMain ? 1.0 : 0.7} // Mainshock stroke is its color, others usually no stroke
                  className="transition-opacity duration-200 hover:opacity-100" // Hover to full opacity
                >
                  <title>{`Mag ${formatNumber(mag,1)} ${place || 'Unknown location'} - ${formatDate(time)}`}</title>
                </circle>
                {isMain && (
                  <text
                    x={cx + circleRadius + 5} // Adjust label position based on new radius
                    y={cy}
                    alignmentBaseline="middle"
                    className={`text-xs fill-current ${tickLabelColor}`}
                  >
                    {formatNumber(mag,1)}
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
