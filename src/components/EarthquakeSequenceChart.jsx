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
// const mainshockRadius = 8; // Unused
// const eventRadius = 5; // Unused

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
  const margin = { top: 40, right: 35, bottom: 90, left: 35 };

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

  // All other useMemo hooks moved here, before any conditional returns
  const timeDomain = useMemo(() => {
    if (originalQuakes.length === 0) {
      // Default domain if no quakes: current time +/- 1 hour
      const now = new Date();
      return [new Date(now.getTime() - 60 * 60 * 1000), new Date(now.getTime() + 60 * 60 * 1000)];
    }

    const times = originalQuakes.map(d => new Date(d.properties.time));
    const [minTime, maxTime] = d3Extent(times);

    if (minTime === undefined || maxTime === undefined) { // Should not happen if originalQuakes is not empty
        const now = new Date();
        return [new Date(now.getTime() - 60 * 60 * 1000), new Date(now.getTime() + 60 * 60 * 1000)];
    }

    let startTime = minTime.getTime();
    let endTime = maxTime.getTime();

    if (startTime === endTime) {
      // If all events are at the same time, or only one event
      const paddingMs = 60 * 60 * 1000; // 1 hour padding
      return [new Date(startTime - paddingMs), new Date(endTime + paddingMs)];
    }

    const duration = endTime - startTime;
    const padding = duration * 0.05; // 5% padding on each side

    return [new Date(startTime - padding), new Date(endTime + padding)];
  }, [originalQuakes]);

  const magDomain = useMemo(() => {
    if (originalQuakes.length === 0) return [0, 1]; // Fallback for no data

    const mags = originalQuakes.map(d => d.properties.mag).filter(isValidNumber); // Ensure only valid numbers
    if (mags.length === 0) return [0, 1]; // Fallback if no valid magnitudes

    let minActualMag = d3Min(mags);
    let maxActualMag = d3Max(mags);

    minActualMag = isValidNumber(minActualMag) ? minActualMag : 0;
    maxActualMag = isValidNumber(maxActualMag) ? maxActualMag : 0;

    let lowerBound = Math.max(0, minActualMag - 0.5);
    let upperBound = maxActualMag + 0.5;

    const MIN_DOMAIN_SPAN = 1.0;
    if (upperBound - lowerBound < MIN_DOMAIN_SPAN) {
      const midPoint = (lowerBound + upperBound) / 2;
      lowerBound = Math.max(0, midPoint - (MIN_DOMAIN_SPAN / 2));
      upperBound = lowerBound + MIN_DOMAIN_SPAN;
    }

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
      .domain([0, magDomain[1]])
      .range([2, 10])
      .clamp(true),
  [magDomain]);

  const timeAxisTicks = useMemo(() => {
    if (width <= 0 || !timeDomain || !timeDomain[0] || !timeDomain[1] || !xScale) return [];

    const [domainStartTime, domainEndTime] = timeDomain;
    const durationMs = domainEndTime.getTime() - domainStartTime.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    const durationHours = durationMinutes / 60;

    let tickInterval;
    let timeTickFormatString;

    if (durationHours < 1) { // Less than 1 hour
        if (durationMinutes < 15) {
            tickInterval = timeHour.every(1); // Fallback, d3 might make it minutes
            timeTickFormatString = "%H:%M"; // e.g., 14:35
        } else if (durationMinutes < 30) {
            tickInterval = timeHour.every(1); // d3 will likely choose 5 or 10 min intervals
            timeTickFormatString = "%H:%M";
        } else {
            tickInterval = timeHour.every(1); // d3 will likely choose 10 or 15 min intervals
            timeTickFormatString = "%H:%M";
        }
    } else if (durationHours < 2) { // 1 to 2 hours
        tickInterval = timeHour.every(1); // d3 will likely choose 15 or 30 min intervals
        timeTickFormatString = "%H:%M";
    } else if (durationHours < 6) { // 2 to 6 hours
      tickInterval = timeHour.every(1); // Ticks every hour
      timeTickFormatString = "%-I%p"; // e.g., "1PM"
    } else if (durationHours < 12) { // 6 to 12 hours
      tickInterval = timeHour.every(2); // Ticks every 2 hours
      timeTickFormatString = "%-I%p";
    } else if (durationHours < 24) { // 12 to 24 hours
      tickInterval = timeHour.every(3); // Ticks every 3 hours
      timeTickFormatString = "%-I%p";
    } else if (durationHours < 72) { // 1 to 3 days
      tickInterval = timeHour.every(6); // Ticks every 6 hours
      timeTickFormatString = "%-I%p";
    } else if (durationHours < 168) { // 3 to 7 days
      tickInterval = timeHour.every(12); // Ticks every 12 hours
      timeTickFormatString = "%-I%p";
    } else { // More than 7 days
      tickInterval = timeHour.every(24); // Ticks every 24 hours (once a day)
      timeTickFormatString = "%-I%p"; // Will show "12AM"
    }

    // Let D3 generate the ticks using the suggested interval.
    // For very short durations, explicitly ask for more ticks if d3.ticks with timeHour.every(1) is too sparse.
    let potentialTicks;
    if (durationHours < 1 && durationMinutes < 30) {
        potentialTicks = xScale.ticks(5); // Request approx 5 ticks for very short spans
    } else if (durationHours < 2) {
        potentialTicks = xScale.ticks(timeHour.every(1)); // Try for hourly ticks
        if (potentialTicks.length < 2 && durationMinutes > 30) { // if not enough, try more specific
             potentialTicks = xScale.ticks(Math.max(2, Math.floor(durationMinutes / 15))); // e.g. every 15min
        } else if (potentialTicks.length < 2) {
            potentialTicks = xScale.ticks(2); // fallback to 2 ticks
        }
    }
    else {
        potentialTicks = xScale.ticks(tickInterval);
    }

    const timeTickFormat = timeFormat(timeTickFormatString);

    return potentialTicks.map(value => ({
        value,
        offset: xScale(value),
        label: timeTickFormat(value)
    })).filter(tick => tick.offset >= -5 && tick.offset <= width + 5);
  }, [xScale, width, timeDomain]);

  const dateAxisTicks = useMemo(() => {
    if (width <= 0 || !timeDomain || !timeDomain[0] || !timeDomain[1] || !xScale) return [];
    const dates = [];
    const [domainStart, domainEnd] = timeDomain;
    let current = new Date(domainStart);
    current.setHours(0, 0, 0, 0); // Start from the beginning of the day

    while (current <= domainEnd) {
        const dayStartOffset = xScale(current);
        const nextDay = new Date(current);
        nextDay.setDate(current.getDate() + 1);

        // Determine the actual end of the day for xScale, capped by domainEnd
        const endOfDayForScale = nextDay > domainEnd ? domainEnd : nextDay;
        const dayEndOffset = xScale(endOfDayForScale);

        const visibleStart = Math.max(0, dayStartOffset);
        const visibleEnd = Math.min(width, dayEndOffset);

        // Add tick if the visible part of the day is wider than 20 pixels
        if (visibleEnd > visibleStart && (visibleEnd - visibleStart > 20)) {
            dates.push({
                label: timeFormat("%b %d")(current),
                x: visibleStart + (visibleEnd - visibleStart) / 2,
                dayStartDate: new Date(current) // For unique key
            });
        }

        // Break if nextDay is invalid or beyond a reasonable limit to prevent infinite loops
        if (nextDay.getTime() <= current.getTime() || nextDay > new Date(domainEnd.getTime() + 24*60*60*1000 * 2)) break;
        current = nextDay;
    }
    return dates;
  }, [timeDomain, xScale, width]);

  const yAxisTicks = useMemo(() => {
      if (height <= 0 || !yScale.ticks) return [];
      const suggestedTickCount = 5;
      let ticks = yScale.ticks(suggestedTickCount);
      const domainSpan = magDomain[1] - magDomain[0];

      if (domainSpan <= 2 && domainSpan > 0) {
          ticks = ticks.map(t => Math.round(t * 2) / 2);
      } else if (domainSpan > 0) {
          const allNearInteger = ticks.every(t => Math.abs(t - Math.round(t)) < 0.01);
          if (allNearInteger) {
              ticks = ticks.map(t => Math.round(t));
          }
      }
      ticks = [...new Set(ticks)].filter(t => t >= magDomain[0] && t <= magDomain[1]);
      ticks.sort((a,b) => a-b);

      return ticks.map(value => ({
          value,
          offset: yScale(value),
      })).filter(tick => tick.offset >= -1 && tick.offset <= height + 1);
  }, [yScale, height, magDomain]);

  const { linePath } = useMemo(() => {
    if (!originalQuakes || originalQuakes.length === 0) { // Check originalQuakes for emptiness first
        return { linePath: null };
    }

    // Filter quakes for the line (magnitude >= 1.5 and valid properties)
    const quakesForLine = originalQuakes.filter(q =>
        q.properties &&
        typeof q.properties.mag === 'number' &&
        q.properties.mag >= 1.5
    );

    // If no quakes meet the criteria for the line, or only one does, no line can be drawn.
    if (quakesForLine.length < 2) {
        return { linePath: null };
    }

    // Sort the filtered quakes by time for the line generator
    const sortedForLine = [...quakesForLine].sort((a, b) =>
        new Date(a.properties.time) - new Date(b.properties.time)
    );

    const lineGenerator = d3Line()
        .x(d => xScale(new Date(d.properties.time)))
        .y(d => yScale(d.properties.mag)); // No .defined() here anymore

    return { linePath: lineGenerator(sortedForLine) };
  }, [originalQuakes, xScale, yScale]);

  // Conditional returns now happen *after* all useMemo hooks have been called
  if (isLoading) {
    return <EarthquakeSequenceChartSkeleton />;
  }

  if (originalQuakes.length === 0 && width > 0 && !isLoading) {
    return (
      <div className="bg-slate-700 p-4 rounded-lg border border-slate-600 shadow-md flex flex-col justify-center items-center" style={{ height: `${chartHeight}px` }}>
        <h3 className={`text-lg font-semibold text-indigo-400 mb-2`}>Earthquake Sequence (UTC)</h3>
        <p className={`${tickLabelColor} p-4 text-center text-sm`}>No data available for chart.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-700 p-4 rounded-lg border border-slate-600 shadow-md">
      {/* Chart Title H3 element removed */}
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

          {/* X-Axis Gridlines (using timeAxisTicks for vertical lines) */}
          {timeAxisTicks.map(({ value, offset }) =>
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
          {/* Y-Axis Label "Magnitude" removed */}

          {/* X-Axis */}
          <line x1={0} y1={height} x2={width} y2={height} className={gridLineColor} />

          {/* Time Tier Labels (Upper Tier with new format) */}
          {timeAxisTicks.map(({ value, offset, label }) =>
            (offset >= 0 && offset <= width) && (
            <text
              key={`time-label-${value.toISOString()}`}
              x={offset}
              y={height + 20} // This might need adjustment if labels are too long
              textAnchor="middle"
              className={`text-xs fill-current ${tickLabelColor}`}
            >
              {label}
            </text>
          ))}

          {/* Date Tier Labels (Lower Tier) */}
          {dateAxisTicks.map(({ label: dateLabel, x, dayStartDate }) => (
            <text
              key={`date-label-${dayStartDate.toISOString()}`}
              x={x}
              y={height + 40} // Position for date labels
              textAnchor="middle"
              className={`text-xs fill-current ${tickLabelColor}`}
            >
              {dateLabel}
            </text>
          ))}

          {/* X-Axis Label */}
          <text
            x={width / 2}
            // Adjust y position to account for the date tier labels
            y={height + 60} // Adjusted y position
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
                className={"stroke-current text-slate-300 opacity-100"} // MODIFIED LINE
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
                  stroke={isMain ? color : 'none'} // REVERTED: uses 'color' from getMagnitudeColor(mag)
                  strokeWidth={isMain ? mainshockStrokeWidth : 0}
                  fillOpacity={isMain ? 1.0 : 0.7}
                  strokeOpacity={isMain ? 1.0 : 0.7}
                  className="transition-opacity duration-200 hover:opacity-100" // REVERTED: removed conditional text-slate-300
                >
                  <title>{`Mag ${formatNumber(mag,1)} ${place || 'Unknown location'} - ${formatDate(time)}`}</title>
                </circle>
                {isMain && (
                  <text
                    x={cx + circleRadius + 5} // Adjust label position based on new radius
                    y={cy}
                    alignmentBaseline="middle"
                    className="text-xs fill-current text-slate-300" // MODIFIED: now uses text-slate-300
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
