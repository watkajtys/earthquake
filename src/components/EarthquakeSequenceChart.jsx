import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { scaleLinear, scaleTime, scaleSqrt } from 'd3-scale';
import { max as d3Max, min as d3Min, extent as d3Extent } from 'd3-array';
import { timeFormat } from 'd3-time-format';
import { timeHour } from 'd3-time';
import { line as d3Line } from 'd3-shape';
import { select } from 'd3-selection';
import { brushX } from 'd3-brush';
import { zoom, zoomIdentity } from 'd3-zoom';
import { getMagnitudeColor, formatDate, isValidNumber, isValuePresent, formatNumber } from '../utils/utils';
import EarthquakeSequenceChartSkeleton from './skeletons/EarthquakeSequenceChartSkeleton';
import { MICROQUAKE_THRESHOLD } from '../constants/appConstants';

const axisLabelColor = "text-slate-400";
const tickLabelColor = "text-slate-500"; // From EarthquakeTimelineSVGChart
const gridLineColor = "stroke-slate-600"; // Similar to border color in EarthquakeTimelineSVGChart
const mainshockStrokeWidth = 2;
const mainshockRadius = 8;
const eventRadius = 5;

const EarthquakeSequenceChart = React.memo(({ cluster, isLoading = false }) => {
  const svgRef = useRef(null);
  const brushGroupRef = useRef(null); // For the brush <g> element
  const d3ZoomRef = useRef(null); // To store the D3 zoom instance
  const [chartRenderWidth, setChartRenderWidth] = useState(800);
  const [xZoomDomain, setXZoomDomain] = useState(null); // Will hold [minDate, maxDate] for the zoomed/brushed area

  useEffect(() => {
    // Effect to set initial chart width
    if (svgRef.current && svgRef.current.parentElement) {
      const parentWidth = svgRef.current.parentElement.clientWidth;
      setChartRenderWidth(parentWidth > 0 ? parentWidth : 800);
    }
  }, []); // Runs once on mount

  const chartHeight = 350;
  const margin = { top: 40, right: 30, bottom: 80, left: 20 }; // Adjusted margin.right for brush handles

  const width = chartRenderWidth - margin.left - margin.right; // width of the plottable area
  const height = chartHeight - margin.top - margin.bottom; // height of the plottable area

  const { originalQuakes, processedMainshock } = useMemo(() => {
    const quakes = cluster?.originalQuakes || [];
    const validQuakes = quakes.filter(q =>
      isValuePresent(q?.properties?.time) &&
      isValidNumber(q?.properties?.mag) &&
      q.properties.time !== null &&
      q.properties.mag !== null
    );

    if (validQuakes.length === 0) {
      return { originalQuakes: [], processedMainshock: null };
    }

    const mainshock = validQuakes.reduce((prev, current) => {
      const prevMag = prev.properties.mag;
      const currentMag = current.properties.mag;
      if (currentMag > prevMag) return current;
      if (currentMag === prevMag) {
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

  // The full time domain of the original data
  const timeDomain = useMemo(() => {
    if (originalQuakes.length === 0) return [new Date(0), new Date()];
    const times = originalQuakes.map(d => new Date(d.properties.time));
    return d3Extent(times);
  }, [originalQuakes]);

  // The current X domain to display, considering zoom/brush
  const currentXDomain = useMemo(() => {
    return xZoomDomain || timeDomain;
  }, [xZoomDomain, timeDomain]);

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

  // X scale based on the current domain (either full or zoomed)
  const xScale = useMemo(() =>
    scaleTime().domain(currentXDomain).range([0, width]),
  [currentXDomain, width]);

  // X scale based on the *full* time domain, used by zoom logic to rescale
  const fullDomainXScale = useMemo(() =>
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
  const timeAxisTicks = useMemo(() => {
    // Use currentXDomain for generating ticks that are visible in the current view
    if (width <= 0 || !currentXDomain || !currentXDomain[0] || !currentXDomain[1] || !xScale) return [];

    const tempScale = scaleTime().domain(currentXDomain).range([0, width]); // Use currentXDomain
    const [domainStartTime, domainEndTime] = currentXDomain; // Use currentXDomain
    const durationMs = domainEndTime.getTime() - domainStartTime.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    let tickInterval; // D3 time interval function
    if (durationHours < 12) { // Aim for ticks every 1-2 hours
      tickInterval = timeHour.every(durationHours < 6 ? 1 : 2); // More granular for very short durations
    } else if (durationHours < 24) { // Aim for ticks every 3 hours
      tickInterval = timeHour.every(3);
    } else if (durationHours < 48) { // Aim for ticks every 6 hours
      tickInterval = timeHour.every(6);
    } else if (durationHours < 7 * 24) { // Less than a week, aim for 12 hour ticks
      tickInterval = timeHour.every(12);
    }
    else { // Otherwise, aim for daily ticks
      tickInterval = timeHour.every(24);
    }

    const potentialTicks = tempScale.ticks(tickInterval);
    // Ensure timeFormat handles date changes correctly if sequence spans multiple days
    const timeTickFormat = timeFormat("%b %d, %-I%p");

    return potentialTicks.map(value => ({
        value,
        offset: xScale(value),
        label: timeTickFormat(value)
    })).filter(tick => tick.offset >= -5 && tick.offset <= width + 5); // Keep existing filter
  }, [xScale, width, currentXDomain]); // Corrected dependency: timeDomain -> currentXDomain

  const dateAxisTicks = useMemo(() => {
    // Use currentXDomain for generating ticks that are visible in the current view
    if (width <= 0 || !currentXDomain || !currentXDomain[0] || !currentXDomain[1] || !xScale) return [];

    const dates = [];
    const [domainStart, domainEnd] = currentXDomain; // Use currentXDomain
    let current = new Date(domainStart);
    current.setHours(0, 0, 0, 0);

    while (current <= domainEnd) {
        const dayStartOffset = xScale(current);

        const nextDay = new Date(current);
        nextDay.setDate(current.getDate() + 1);
        // Ensure the end of the day segment does not exceed the domain end for xScale calculation
        const endOfDayInDomain = nextDay > domainEnd ? domainEnd : nextDay;
        const dayEndOffset = xScale(endOfDayInDomain);

        const visibleStart = Math.max(0, dayStartOffset);
        const visibleEnd = Math.min(width, dayEndOffset);

        if (visibleEnd > visibleStart && (visibleEnd - visibleStart > 1)) { // Ensure there's some visible portion of the day (e.g. > 1px)
            dates.push({
                label: timeFormat("%b %d")(current),
                x: visibleStart + (visibleEnd - visibleStart) / 2,
                dayStartDate: new Date(current)
            });
        }

        // Safety break for invalid date increments or extreme conditions
        if (current.getTime() === nextDay.getTime() || nextDay > new Date(domainEnd.getTime() + 24*60*60*1000 /* allow one day beyond for last tick */) ) break;
        current = nextDay;
    }
    return dates;
  }, [currentXDomain, xScale, width]); // Corrected dependency: timeDomain -> currentXDomain

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

  // This is the new, more complex useMemo hook for linePath and quakesForLine
  const { quakesForLine, linePath } = useMemo(() => {
    if (!originalQuakes || originalQuakes.length < 1 || !xScale || !yScale || !currentXDomain || !timeDomain || !timeDomain[0] || !timeDomain[1] || !currentXDomain[0] || !currentXDomain[1]) {
      return { quakesForLine: [], linePath: null };
    }

    const buffer = 1000; // 1 second buffer
    const visibleQuakes = originalQuakes.filter(q => {
      const quakeTime = new Date(q.properties.time);
      return quakeTime.getTime() >= currentXDomain[0].getTime() - buffer && quakeTime.getTime() <= currentXDomain[1].getTime() + buffer;
    });

    if (visibleQuakes.length < 2 && originalQuakes.length >= 1) { // Check originalQuakes length for sorting single visible points
         // Sort if there's at least one visible quake, even if no line is drawn.
        const sortedVisible = [...visibleQuakes].sort((a, b) => new Date(a.properties.time) - new Date(b.properties.time));
        return { quakesForLine: sortedVisible, linePath: null };
    }
    if (visibleQuakes.length < 2) { // If still less than 2 after considering originalQuakes for single point sort
        return { quakesForLine: [], linePath: null };
    }


    const fullDuration = timeDomain[1].getTime() - timeDomain[0].getTime();
    const currentDuration = currentXDomain[1].getTime() - currentXDomain[0].getTime();

    const isZoomedIn = fullDuration > 0 ? (currentDuration / fullDuration) < 0.8 : false;

    let quakesToConnect;
    if (isZoomedIn) {
      quakesToConnect = visibleQuakes;
    } else {
      quakesToConnect = visibleQuakes.filter(
        q => q.properties.mag >= MICROQUAKE_THRESHOLD
      );
    }

    if (quakesToConnect.length < 2) {
      const sortedConnectable = [...quakesToConnect].sort((a, b) => new Date(a.properties.time) - new Date(b.properties.time));
      return { quakesForLine: sortedConnectable, linePath: null };
    }

    const sortedQuakesForLine = [...quakesToConnect].sort(
      (a, b) => new Date(a.properties.time) - new Date(b.properties.time)
    );

    const lineGenerator = d3Line()
      .x(d => xScale(new Date(d.properties.time)))
      .y(d => yScale(d.properties.mag));

    return { quakesForLine: sortedQuakesForLine, linePath: lineGenerator(sortedQuakesForLine) };
  }, [originalQuakes, xScale, yScale, currentXDomain, timeDomain, MICROQUAKE_THRESHOLD]);


  // useEffect for D3 brush and zoom setup
  useEffect(() => {
    // Ensure refs are current and dimensions are valid, and data exists
    if (!svgRef.current || !brushGroupRef.current || width <= 0 || height <= 0 || originalQuakes.length === 0) {
      // Cleanup if previously initialized
      if (svgRef.current) select(svgRef.current).on(".zoom", null);
      if (brushGroupRef.current) select(brushGroupRef.current).selectAll("*").remove(); // Clear brush visuals
      return;
    }

    const svg = select(svgRef.current);
    const brushG = select(brushGroupRef.current);

    // --- Brush Handler ---
    const handleBrushEnd = (event) => {
      // Ignore brush events triggered by zoom.
      if (event.sourceEvent && event.sourceEvent.type === "zoom") return;
      const selection = event.selection;
      if (selection) {
        // Convert pixel selection to date domain
        const newDomain = [xScale.invert(selection[0]), xScale.invert(selection[1])];
        setXZoomDomain(newDomain);
        // Important: Clear the visual brush selection after applying the domain change.
        // This makes the brush a "select-to-zoom" tool rather than a persistent selection display.
        // If a persistent visual selection is desired, this line should be removed or conditional.
        brushG.call(d3Brush.move, null);
      } else if (!event.sourceEvent) {
        // If brush is cleared programmatically (e.g., by zoom), or by double-click with no new selection
        // setXZoomDomain(null); // This might be needed if we want programmatic clear to reset zoom fully
      } else if (event.selection === null) {
         // This typically means a click outside the brush or a double-click to clear.
         setXZoomDomain(null); // Reset to full domain
      }
    };
    // Wrap in useCallback: Dependencies are crucial here.
    // xScale (current, zoomed scale) is used for inverting. setXZoomDomain to update state.
    const memoizedHandleBrushEnd = useCallback(handleBrushEnd, [xScale, setXZoomDomain]);


    // --- Zoom Handler ---
    const handleZoom = (event) => {
      if (event.sourceEvent && event.sourceEvent.type === "brush") return; // Ignore zoom triggered by brush
      const { transform } = event;
      const newXScale = transform.rescaleX(fullDomainXScale); // Rescale the original full domain scale
      setXZoomDomain(newXScale.domain());

      // Clear any active brush visuals when zooming/panning
      if (brushGroupRef.current && select(brushGroupRef.current).property('__brush')) { // Check if brush is initialized
         select(brushGroupRef.current).call(d3Brush.move, null);
      }
    };
     // Wrap in useCallback: fullDomainXScale (original, unzoomed scale) is key.
    const memoizedHandleZoom = useCallback(handleZoom, [fullDomainXScale, setXZoomDomain, brushGroupRef]);


    // --- Brush Setup ---
    const d3Brush = brushX()
      .extent([[0, 0], [width, height]])
      .on('end', memoizedHandleBrushEnd); // Use 'end' to react once brushing is complete

    brushG.call(d3Brush);

    // --- Zoom Setup ---
    const d3Zoom = zoom()
      .scaleExtent([1, 30]) // Min/max zoom levels (e.g., 1x to 30x)
      .translateExtent([[0, 0], [width, height]]) // Pan extent to chart boundaries
      .extent([[0, 0], [width, height]])
      .on('zoom', memoizedHandleZoom);

    svg.call(d3Zoom);
    d3ZoomRef.current = d3Zoom; // Store the zoom instance

    // If xZoomDomain is null (e.g., reset externally or initially), reset D3's internal zoom transform.
    if (!xZoomDomain) {
      svg.call(d3ZoomRef.current.transform, zoomIdentity);
    }

    // Cleanup function for when component unmounts or dependencies change
    return () => {
      svg.on('.zoom', null); // Remove zoom listener
      if (brushG && brushG.property('__brush')) { // Check if brush is initialized before trying to remove
          brushG.on('.brush', null); // Remove brush listener
          brushG.selectAll("*").remove(); // Clear any visual artifacts of the brush
      }
    };
  }, [
    width, height, originalQuakes.length, // Basic chart params
    xScale, fullDomainXScale, // Scales
    xZoomDomain, setXZoomDomain, // Zoom state
    brushGroupRef, svgRef, // Refs
    memoizedHandleBrushEnd, memoizedHandleZoom // Callbacks (will be stable due to their own useCallback)
  ]);

  const resetZoom = useCallback(() => {
    setXZoomDomain(null);
    if (svgRef.current && d3ZoomRef.current) {
      select(svgRef.current).call(d3ZoomRef.current.transform, zoomIdentity);
    }
  }, [setXZoomDomain, svgRef, d3ZoomRef]); // d3ZoomRef is a ref, so it's stable. svgRef too.


  return (
    <div className="relative bg-slate-700 p-4 rounded-lg border border-slate-600 shadow-md">
      {xZoomDomain && (
        <button
          onClick={resetZoom}
          className="absolute top-2 right-14 z-20 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold py-1 px-2 rounded shadow-md"
          aria-label="Reset zoom"
        >
          Reset Zoom
        </button>
      )}
      <svg ref={svgRef} width="100%" height={chartHeight} viewBox={`0 0 ${chartRenderWidth} ${chartHeight}`}>
        <defs>
            {/* Unique ID for clipPath using cluster id or a fallback */}
            <clipPath id={`clip-${cluster?.properties?.cluster_id || cluster?.id || 'chart-area'}`}>
                <rect x="0" y="0" width={width < 0 ? 0 : width} height={height < 0 ? 0 : height} />
            </clipPath>
        </defs>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Y-Axis Gridlines (removed duplicated block) */}
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
          {timeAxisTicks.map(({ value, offset }) =>
             (offset >= 0 && offset <= width) && (
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
              {formatNumber(value,1)} {/* Format Y-axis tick values */}
            </text>
          ))}

          {/* X-Axis */}
          <line x1={0} y1={height} x2={width} y2={height} className={gridLineColor} />
          {timeAxisTicks.map(({ value, offset, label }) =>
            (offset >= 0 && offset <= width) && (
            <text
              key={`time-label-${value.toISOString()}`}
              x={offset}
              y={height + 20}
              textAnchor="middle"
              className={`text-xs fill-current ${tickLabelColor}`}
            >
              {label}
            </text>
          ))}
          {dateAxisTicks.map(({ label: dateLabel, x, dayStartDate }) => (
            <text
              key={`date-label-${dayStartDate.toISOString()}`}
              x={x}
              y={height + 40} // Position for second row of labels if needed
              textAnchor="middle"
              className={`text-xs fill-current ${tickLabelColor}`}
            >
              {dateLabel}
            </text>
          ))}
          <text
            x={width / 2}
            y={height + (dateAxisTicks.length > 0 ? 60 : 45)} // Adjust based on dateAxisTicks presence
            textAnchor="middle"
            className={`text-sm fill-current ${axisLabelColor}`}
          >
            Time (UTC)
          </text>

          {/* Data points and lines are clipped */}
          <g clipPath={`url(#clip-${cluster?.properties?.cluster_id || cluster?.id || 'chart-area'})`}>
            {/* Connecting Line for Quakes */}
            {linePath && quakesForLine.length > 1 && ( // Ensure quakesForLine has enough points for a line
              <path
                  d={linePath}
                  strokeDasharray="3,3"
                  className={`stroke-current ${tickLabelColor} opacity-75`}
                  strokeWidth={1}
                  fill="none"
              />
            )}
            {/* Data Points */}
            {originalQuakes
              .filter(quake => {
                const quakeTime = new Date(quake.properties.time);
                const buffer = 1000; // 1 second buffer
                // Ensure currentXDomain and its elements are valid before getTime()
                if (!currentXDomain || !currentXDomain[0] || !currentXDomain[1]) return false;
                return quakeTime.getTime() >= currentXDomain[0].getTime() - buffer && quakeTime.getTime() <= currentXDomain[1].getTime() + buffer;
              })
              .map(quake => {
              const { id, properties } = quake;
              const { time, mag, place } = properties;
              // Ensure xScale is valid and time is valid before processing
              if (!xScale || !properties.time) return null;
              const cx = xScale(new Date(time));
              // Ensure yScale is valid and mag is valid before processing
              if (!yScale || !isValidNumber(properties.mag)) return null;
              const cy = yScale(mag);
              const color = getMagnitudeColor(mag);
              const isMain = processedMainshock && processedMainshock.id === id;
              // Ensure radiusScale is valid and mag is valid before processing
              if (!radiusScale || !isValidNumber(properties.mag)) return null;
              const baseRadius = radiusScale(mag);
              const circleRadius = isMain ? baseRadius + 2 : baseRadius;

              // Secondary check if points are visually outside, though clipPath handles most of it
              if (cx < -circleRadius || cx > width + circleRadius || cy < -circleRadius || cy > height + circleRadius) {
                // Check if it's the mainshock; if so, its label might still be relevant if the point is just off-screen
                if (!isMain) return null;
                 // If mainshock is off-screen, don't render its circle but allow label logic below to decide
              }

              // Determine if mainshock label should be visible
              const mainshockTime = isMain ? new Date(properties.time) : null;
              const buffer = 1000; // Use consistent buffer
              const isMainshockInView = isMain && mainshockTime && currentXDomain && currentXDomain[0] && currentXDomain[1] &&
                                      mainshockTime.getTime() >= currentXDomain[0].getTime() - buffer &&
                                      mainshockTime.getTime() <= currentXDomain[1].getTime() + buffer;

              return (
                <g key={id}>
                  {/* Render circle only if it's within bounds or it's a mainshock whose label might be shown */}
                  {(cx >= -circleRadius && cx <= width + circleRadius && cy >= -circleRadius && cy <= height + circleRadius) || isMainshockInView ? (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={circleRadius}
                      fill={isMain ? 'none' : color}
                      stroke={isMain ? color : 'none'}
                      strokeWidth={isMain ? mainshockStrokeWidth : 0}
                      fillOpacity={isMain ? 1.0 : 0.7}
                      strokeOpacity={isMain ? 1.0 : 0.7}
                      className="transition-opacity duration-200 hover:opacity-100"
                    >
                      <title>{`Mag ${formatNumber(mag,1)} ${place || 'Unknown location'} - ${formatDate(time)}`}</title>
                    </circle>
                  ) : null }
                  {isMainshockInView && (
                    <text
                      x={cx + circleRadius + 5} // Position label next to circle
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
          </g> {/* End of clippable data area */}

          {/* Brush <g> element - rendered on top of data, within the translated <g> */}
          {originalQuakes.length > 0 && width > 0 && height > 0 && <g ref={brushGroupRef} className="brush-group" />}
        </g>
      </svg>
    </div>
  );
});

EarthquakeSequenceChart.propTypes = {
  cluster: PropTypes.shape({
    originalQuakes: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        properties: PropTypes.shape({
          time: PropTypes.number, // Keep as number if that's what API provides (timestamp)
          mag: PropTypes.number,
          place: PropTypes.string,
        }).isRequired,
      })
    ),
    // Added properties.cluster_id for unique clipPath ID
    properties: PropTypes.shape({
        cluster_id: PropTypes.string,
    })
  }).isRequired,
  isLoading: PropTypes.bool,
};

EarthquakeSequenceChart.defaultProps = {
  isLoading: false,
};

export default EarthquakeSequenceChart;
