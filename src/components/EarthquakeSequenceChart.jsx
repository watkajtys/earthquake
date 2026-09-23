import React, { useMemo, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { scaleLinear, scaleUtc, scaleSqrt } from 'd3-scale'; // Import scaleSqrt
import { max as d3Max, min as d3Min, extent as d3Extent } from 'd3-array';
import { utcFormat } from 'd3-time-format';
import { line as d3Line } from 'd3-shape'; // Import d3Line
import { getMagnitudeColor, formatDate, isValidNumber, isValuePresent, formatNumber } from '../utils/utils'; // Corrected path
import EarthquakeSequenceChartSkeleton from './skeletons/EarthquakeSequenceChartSkeleton'; // Import skeleton

const axisLabelColor = "text-slate-400"; // From EarthquakeTimelineSVGChart
const tickLabelColor = "text-slate-500"; // From EarthquakeTimelineSVGChart
const gridLineColor = "stroke-slate-600"; // Similar to border color in EarthquakeTimelineSVGChart
const mainshockStrokeWidth = 2;
const longRangeThresholdMs = 72 * 60 * 60 * 1000;
const minTimeLabelGap = 66;
const minDateLabelGap = 90;
// const mainshockRadius = 8; // Unused
// const eventRadius = 5; // Unused

const EarthquakeSequenceChart = React.memo(({ cluster, isLoading = false, onPlotSelection }) => {
  const svgRef = useRef(null);
  const activePointStatusId = React.useId();
  const [chartRenderWidth, setChartRenderWidth] = useState(800); // Default width
  const [focusPointIndex, setFocusPointIndex] = useState(0);

  useEffect(() => setFocusPointIndex(0), [cluster?.id]);

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

  useEffect(() => {
    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (!container) return;
    const measure = () => {
      const measuredWidth = svg.getBoundingClientRect().width || container.clientWidth;
      if (measuredWidth > 0) setChartRenderWidth(measuredWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isLoading, originalQuakes.length]);

  // All other useMemo hooks moved here, before any conditional returns
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
    scaleUtc().domain(timeDomain).range([0, width]),
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

  // Keep the same geometry for rendering and hit selection. Events at one
  // position must remain individually represented, even when circles overlap.
  const plottedPoints = useMemo(() => originalQuakes.map(quake => {
    const { time, mag } = quake.properties;
    const cx = xScale(new Date(time));
    const cy = yScale(mag);
    const isMain = processedMainshock?.id === quake.id;
    const baseRadius = radiusScale(mag);
    const radius = isMain ? baseRadius + 2 : baseRadius;

    if (cx < -radius || cx > width + radius || cy < -radius || cy > height + radius) {
      return null;
    }
    return { quake, cx, cy, radius, isMain };
  }).filter(Boolean), [originalQuakes, processedMainshock, xScale, yScale, radiusScale, width, height]);
  const activePointIndex = Math.min(focusPointIndex, Math.max(0, plottedPoints.length - 1));
  const activePoint = plottedPoints[activePointIndex];

  const selectPoint = (selectedPoint) => {
    if (!onPlotSelection) return;
    const selectedIds = plottedPoints.filter(point => {
      const dx = point.cx - selectedPoint.cx;
      const dy = point.cy - selectedPoint.cy;
      const combinedRadius = point.radius + selectedPoint.radius;
      return dx * dx + dy * dy <= combinedRadius * combinedRadius;
    }).map(point => point.quake.id);
    onPlotSelection(selectedIds);
  };

  const handlePlotKeyDown = event => {
    if (!onPlotSelection || !plottedPoints.length) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      setFocusPointIndex((activePointIndex + direction + plottedPoints.length) % plottedPoints.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectPoint(activePoint);
    }
  };

  const isLongRange = timeDomain[1] - timeDomain[0] >= longRangeThresholdMs;
  const timeAxisTicks = useMemo(() => {
    if (width <= 0 || !timeDomain[0] || !timeDomain[1]) return [];
    const minimumGap = isLongRange ? minDateLabelGap : minTimeLabelGap;
    const tickCount = Math.max(2, Math.floor(width / minimumGap));
    const crossesYear = timeDomain[0].getUTCFullYear() !== timeDomain[1].getUTCFullYear();
    const formatTick = utcFormat(isLongRange ? (crossesYear ? "%b %-d '%y" : "%b %-d") : "%-I%p");
    const seenDates = new Set();
    let lastOffset = -Infinity;

    return xScale.ticks(tickCount).map(value => ({
      value,
      offset: xScale(value),
      label: formatTick(value),
    })).filter(tick => {
      if (tick.offset < 0 || tick.offset > width || tick.offset - lastOffset < minimumGap) return false;
      if (isLongRange) {
        const dateKey = utcFormat("%Y-%m-%d")(tick.value);
        if (seenDates.has(dateKey)) return false;
        seenDates.add(dateKey);
      }
      lastOffset = tick.offset;
      return true;
    });
  }, [xScale, width, timeDomain, isLongRange]);

  const dateAxisTicks = useMemo(() => {
    if (width <= 0 || isLongRange || !timeDomain[0] || !timeDomain[1]) return [];
    const dates = [];
    const [domainStart, domainEnd] = timeDomain;
    let current = new Date(domainStart);
    current.setUTCHours(0, 0, 0, 0); // Start from the beginning of the UTC day

    while (current <= domainEnd) {
        const dayStartOffset = xScale(current);
        const nextDay = new Date(current);
        nextDay.setUTCDate(current.getUTCDate() + 1);

        // Determine the actual end of the day for xScale, capped by domainEnd
        const endOfDayForScale = nextDay > domainEnd ? domainEnd : nextDay;
        const dayEndOffset = xScale(endOfDayForScale);

        const visibleStart = Math.max(0, dayStartOffset);
        const visibleEnd = Math.min(width, dayEndOffset);

        // A day needs enough room for its centered label. Keep the widest
        // partial day as a fallback when the plot is especially narrow.
        if (visibleEnd > visibleStart) {
            dates.push({
                label: utcFormat("%b %d")(current),
                x: visibleStart + (visibleEnd - visibleStart) / 2,
                dayStartDate: new Date(current), // For unique key
                visibleWidth: visibleEnd - visibleStart,
            });
        }

        // Break if nextDay is invalid or beyond a reasonable limit to prevent infinite loops
        if (nextDay.getTime() <= current.getTime() || nextDay > new Date(domainEnd.getTime() + 24*60*60*1000 * 2)) break;
        current = nextDay;
    }
    const spaciousDates = dates.filter(date => date.visibleWidth >= minDateLabelGap);
    return spaciousDates.length ? spaciousDates : dates.sort((a, b) => b.visibleWidth - a.visibleWidth).slice(0, 1);
  }, [timeDomain, xScale, width, isLongRange]);

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
    if (originalQuakes.length === 0) {
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
      {onPlotSelection && activePoint && (
        <span id={activePointStatusId} className="sr-only" role="status" aria-live="polite">
          Point {activePointIndex + 1} of {plottedPoints.length}: magnitude {formatNumber(activePoint.quake.properties.mag, 1)}, {activePoint.quake.properties.place || 'unknown location'}, {formatDate(activePoint.quake.properties.time)}.
        </span>
      )}
      <svg ref={svgRef} width="100%" height={chartHeight} viewBox={`0 0 ${chartRenderWidth} ${chartHeight}`}
        role={onPlotSelection && activePoint ? 'button' : undefined} tabIndex={onPlotSelection && activePoint ? 0 : undefined}
        aria-label={onPlotSelection && activePoint
          ? 'Earthquake sequence chart. Use arrow keys to choose a point and Enter to inspect overlapping earthquakes.'
          : undefined}
        aria-describedby={onPlotSelection && activePoint ? activePointStatusId : undefined}
        onKeyDown={onPlotSelection ? handlePlotKeyDown : undefined}>
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

          {/* UTC time labels for short spans, date labels for long spans. */}
          {timeAxisTicks.map(({ value, offset, label }) =>
            (offset >= 0 && offset <= width) && (
            <text
              key={`time-label-${value.toISOString()}`}
              data-testid="sequence-axis-tick"
              x={offset}
              y={height + 20} // This might need adjustment if labels are too long
              textAnchor="middle"
              className={`text-xs fill-current ${tickLabelColor}`}
            >
              {label}
            </text>
          ))}

          {/* Day labels beneath the time labels for short spans. */}
          {dateAxisTicks.map(({ label: dateLabel, x, dayStartDate }) => (
            <text
              key={`date-label-${dayStartDate.toISOString()}`}
              data-testid="sequence-day-label"
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
          {plottedPoints.map(point => {
            const { quake, cx, cy, radius: circleRadius, isMain } = point;
            const { id, properties } = quake;
            const { time, mag, place } = properties;
            const color = getMagnitudeColor(mag);
            const isFocused = onPlotSelection && point === activePoint;

            return (
              <g key={id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={circleRadius}
                  fill={isMain ? 'none' : color}
                  stroke={isFocused ? '#ffffff' : isMain ? color : 'none'}
                  strokeWidth={isFocused ? 2 : isMain ? mainshockStrokeWidth : 0}
                  fillOpacity={isMain ? 1.0 : 0.7}
                  strokeOpacity={isMain ? 1.0 : 0.7}
                  className="transition-opacity duration-200 hover:opacity-100" // REVERTED: removed conditional text-slate-300
                  aria-hidden={onPlotSelection ? true : undefined}
                  // Keyboard users select the same point through the single chart control.
                  onClick={onPlotSelection ? () => selectPoint(point) : undefined}
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
  onPlotSelection: PropTypes.func,
};

EarthquakeSequenceChart.defaultProps = {
  isLoading: false,
};

export default EarthquakeSequenceChart;
