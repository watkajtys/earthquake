import React, { useMemo, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { scaleLinear, scaleTime, scaleSqrt } from 'd3-scale'; // Import scaleSqrt
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

  const newMarginBottom = 80; // For legend
  const chartHeight = 350 + (newMarginBottom - 60); // Adjust chart height to accommodate new margin
  const margin = { top: 40, right: 50, bottom: newMarginBottom, left: 60 };

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
    if (width <= 0 || !xScale.ticks) return [];
    const [startTime, endTime] = timeDomain;
    const timeDiffHours = (endTime - startTime) / (1000 * 60 * 60);

    let interval;
    if (timeDiffHours <= 24) {
      interval = d3.timeHour.every(3); // Every 3 hours if span is 1 day or less
    } else if (timeDiffHours <= 72) {
      interval = d3.timeHour.every(6); // Every 6 hours if span is 3 days or less
    } else {
      interval = d3.timeHour.every(12); // Every 12 hours for longer spans
    }

    return xScale.ticks(interval).map(value => ({
      value,
      offset: xScale(value),
      label: timeFormat("%b %d, %H:%M")(value)
    }));
  }, [xScale, width, timeDomain]);

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


  return (
    <div className="bg-slate-700 p-4 rounded-lg border border-slate-600 shadow-md">
      <h3 className={`text-lg font-semibold mb-4 text-center text-indigo-400`}>
        Seismic Activity Timeline (UTC)
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
              className={`${gridLineColor} stroke-dasharray-2 stroke-opacity-30`}
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

          {/* Data Points */}
          {originalQuakes.map(quake => {
            // Properties already validated in the initial processing memo
            const { id, properties } = quake;
            const { time, mag, place } = properties;

            const cx = xScale(new Date(time));
            const cy = yScale(mag);
            const color = getMagnitudeColor(mag);
            const isMain = processedMainshock && processedMainshock.id === id;

            const baseRadius = radiusScale(mag);
            let circleRadius;
            let fillStyle;
            let strokeStyle;
            let strokeWidthStyle;

            if (isMain) {
              circleRadius = baseRadius * 1.5;
              fillStyle = color; // Solid color for mainshock
              strokeStyle = 'none';
              strokeWidthStyle = 0;
            } else {
              circleRadius = baseRadius;
              fillStyle = 'transparent'; // Hollow for aftershocks
              strokeStyle = color; // Border color for aftershocks
              strokeWidthStyle = 1; // Thin border for aftershocks
            }

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
                  fill={fillStyle}
                  stroke={strokeStyle}
                  strokeWidth={strokeWidthStyle}
                  fillOpacity={0.8} // Adjusted for better visibility
                  strokeOpacity={0.8}
                  className="transition-opacity duration-200 hover:opacity-100"
                >
                  <title>{`Mag ${formatNumber(mag,1)} ${place || 'Unknown location'} - ${formatDate(time)}`}</title>
                </circle>
                {isMain && (
                  <text
                    x={cx + circleRadius + 3} // Adjusted x position
                    y={cy}
                    alignmentBaseline="middle"
                    className={`text-xs fill-current ${tickLabelColor}`}
                  >
                    {formatNumber(mag,1)}
                  </text>
                )}
                {!isMain && mag >= 3.0 && ( // Labels for aftershocks M >= 3.0
                  <text
                    x={cx + circleRadius + 3}
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
        {/* Legend */}
        <g transform={`translate(${margin.left}, ${margin.top + height + 45})`}>
          {/* Mainshock Legend Item */}
          <g transform={`translate(0, 0)`}>
            <circle
              cx="0"
              cy="0"
              r={6} // mainshockLegendRadius
              fill={getMagnitudeColor(5.5)} // Representative color
            />
            <text x="15" y="4" className={`text-xs fill-current ${tickLabelColor}`}>Mainshock</text>
          </g>
          {/* Aftershock Legend Item */}
          <g transform={`translate(100, 0)`}> {/* Offset for second item */}
            <circle
              cx="0"
              cy="0"
              r={4} // aftershockLegendRadius
              fill="transparent"
              stroke={getMagnitudeColor(4.5)} // Representative color
              strokeWidth="1"
            />
            <text x="15" y="4" className={`text-xs fill-current ${tickLabelColor}`}>Aftershock</text>
          </g>
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
