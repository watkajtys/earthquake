import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { scaleLinear, scaleTime, scaleSqrt } from 'd3-scale';
import { max as d3Max, min as d3Min, extent as d3Extent } from 'd3-array';
import { timeFormat } from 'd3-time-format';
import { timeHour } from 'd3-time';
import { line as d3Line } from 'd3-shape';
import { brushX } from 'd3-brush';
import { zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection'; // Import select
import { getMagnitudeColor, formatDate, isValidNumber, isValuePresent, formatNumber } from '../utils/utils';
import EarthquakeSequenceChartSkeleton from './skeletons/EarthquakeSequenceChartSkeleton';
import { MICROQUAKE_THRESHOLD } from '../constants/appConstants'; // Corrected import path

const axisLabelColor = "text-slate-400";
const tickLabelColor = "text-slate-500";
const gridLineColor = "stroke-slate-600";
const mainshockStrokeWidth = 2;
// const mainshockRadius = 8; // Will be determined by radiusScale
// const eventRadius = 5; // Will be determined by radiusScale

const EarthquakeSequenceChart = React.memo(({ cluster, isLoading = false }) => {
  const svgRef = useRef(null);
  const brushRef = useRef(null);
  const d3BrushInstanceRef = useRef(null); // To store the D3 brush generator instance
  const zoomOverlayRef = useRef(null);
  const d3ZoomRef = useRef(null);
  const initialTouchDataRef = useRef(null); // For custom touch zoom

  const [chartRenderWidth, setChartRenderWidth] = useState(800);
  const [currentXDomain, setCurrentXDomain] = useState(null);

  useEffect(() => {
    if (svgRef.current && svgRef.current.parentElement) {
      const parentWidth = svgRef.current.parentElement.clientWidth;
      setChartRenderWidth(parentWidth > 0 ? parentWidth : 800);
    }
  }, []);

  const chartHeight = 350;
  const margin = { top: 40, right: 20, bottom: 80, left: 20 };

  const width = chartRenderWidth - margin.left - margin.right;
  const height = chartHeight - margin.top - margin.bottom;

  // Memoize originalQuakes and processedMainshock
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

    const mainshock = validQuakes.reduce((prev, current) =>
      current.properties.mag > prev.properties.mag ? current :
      (current.properties.mag === prev.properties.mag && current.properties.time < prev.properties.time ? current : prev)
    );
    return { originalQuakes: validQuakes, processedMainshock: mainshock };
  }, [cluster]);


  const fullTimeDomain = useMemo(() => {
    if (originalQuakes.length === 0) return [new Date(0), new Date()];
    const times = originalQuakes.map(d => new Date(d.properties.time));
    return d3Extent(times);
  }, [originalQuakes]);

  useEffect(() => {
    if (fullTimeDomain && fullTimeDomain[0] && fullTimeDomain[1]) {
      const currentStart = currentXDomain ? currentXDomain[0].getTime() : null;
      const currentEnd = currentXDomain ? currentXDomain[1].getTime() : null;
      const fullStart = fullTimeDomain[0].getTime();
      const fullEnd = fullTimeDomain[1].getTime();

      if (!currentXDomain || currentStart !== fullStart || currentEnd !== fullEnd) {
         // Initialize or reset if fullTimeDomain changes significantly (e.g. new cluster)
         // This condition might need refinement based on how clusters are updated.
         // For now, if currentXDomain is null, or if it's different from a new fullTimeDomain, reset it.
        if (!currentXDomain || (currentXDomain && (currentStart !== fullStart || currentEnd !== fullEnd))) {
           // Check if the currentXDomain is substantially different from fullTimeDomain
           // to avoid resetting during minor updates if that's ever a case.
           // For now, a direct comparison or null check is fine.
           setCurrentXDomain(fullTimeDomain);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullTimeDomain]); // currentXDomain is NOT a dependency here to avoid loops intentionally.

  const activeXDomain = currentXDomain || fullTimeDomain;

  const isZoomed = useMemo(() => {
    if (!currentXDomain || !fullTimeDomain || !fullTimeDomain[0] || !fullTimeDomain[1] || !currentXDomain[0] || !currentXDomain[1]) return false;
    // Check if both domains are valid Date objects
    if (!(fullTimeDomain[0] instanceof Date && fullTimeDomain[1] instanceof Date &&
          currentXDomain[0] instanceof Date && currentXDomain[1] instanceof Date)) {
      return false;
    }
    const fullDomainRange = fullTimeDomain[1].getTime() - fullTimeDomain[0].getTime();
    const currentDomainRange = currentXDomain[1].getTime() - currentXDomain[0].getTime();

    // Add a tolerance, e.g., if current range is less than 99% of full range
    // Ensure fullDomainRange is not zero to prevent division by zero or NaN issues.
    const isRangeSmaller = fullDomainRange > 0 ? (currentDomainRange < fullDomainRange * 0.99) : false;

    const areEndpointsDifferent = fullTimeDomain[0].getTime() !== currentXDomain[0].getTime() ||
                                  fullTimeDomain[1].getTime() !== currentXDomain[1].getTime();
    return isRangeSmaller || areEndpointsDifferent;
  }, [currentXDomain, fullTimeDomain]);

  const xScale = useMemo(() =>
    scaleTime().domain(activeXDomain).range([0, width]),
  [activeXDomain, width]);

  const magDomain = useMemo(() => {
    if (originalQuakes.length === 0) return [0, 1];
    const mags = originalQuakes.map(d => d.properties.mag).filter(isValidNumber);
    if (mags.length === 0) return [0, 1];
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

  const yScale = useMemo(() =>
    scaleLinear().domain(magDomain).range([height, 0]),
  [magDomain, height]);

  const radiusScale = useMemo(() =>
    scaleSqrt().domain([0, d3Max([1, magDomain[1]])]).range([2, 12]).clamp(true), // ensure domain max is at least 1, increased max range
  [magDomain]);

  // Axes and Gridlines
  const timeAxisTicks = useMemo(() => {
    if (width <= 0 || !activeXDomain || !activeXDomain[0] || !activeXDomain[1] || !xScale) return [];
    // Use activeXDomain for ticks
    const [domainStartTime, domainEndTime] = activeXDomain;
    const durationMs = domainEndTime.getTime() - domainStartTime.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    let tickInterval;
    if (durationHours <= 0) { // Handle zero or negative duration
        return [];
    } else if (durationHours < 12) {
      tickInterval = timeHour.every(durationHours < 6 ? 1 : 2);
    } else if (durationHours < 24) {
      tickInterval = timeHour.every(3);
    } else if (durationHours < 48) {
      tickInterval = timeHour.every(6);
    } else if (durationHours < 7 * 24) {
      tickInterval = timeHour.every(12);
    } else {
      tickInterval = timeHour.every(24);
    }

    const potentialTicks = xScale.ticks(tickInterval); // Use xScale directly
    const timeTickFormat = timeFormat("%b %d, %-I%p");

    return potentialTicks.map(value => ({
        value,
        offset: xScale(value), // Use the main xScale
        label: timeTickFormat(value)
    })).filter(tick => tick.offset >= -5 && tick.offset <= width + 5);
  }, [xScale, width, activeXDomain]); // Depends on activeXDomain

  // Date axis ticks are removed for simplicity with zoom/brush for now.
  // The timeAxisTicks will show dates when appropriate.

  const yAxisTicks = useMemo(() => {
      if (height <= 0 || !yScale || !yScale.ticks) return [];

      const suggestedTickCount = 5;
      let ticks = yScale.ticks(suggestedTickCount);
      const domainSpan = magDomain[1] - magDomain[0];
      if (domainSpan > 0 && domainSpan <= 2) {
          ticks = ticks.map(t => Math.round(t * 2) / 2);
      } else if (domainSpan > 0) {
          const allNearInteger = ticks.every(t => Math.abs(t - Math.round(t)) < 0.01);
          if (allNearInteger) ticks = ticks.map(t => Math.round(t));
      }
      ticks = [...new Set(ticks)].filter(t => t >= magDomain[0] && t <= magDomain[1]);
      ticks.sort((a,b) => a-b);
      return ticks.map(value => ({
          value,
          offset: yScale(value),
      })).filter(tick => tick.offset >= -1 && tick.offset <= height + 1);
  }, [yScale, height, magDomain]);


  // Process quakes for rendering points and lines
  const { sortedPointsInView, linePath } = useMemo(() => {
    if (!originalQuakes || originalQuakes.length === 0 || !activeXDomain || !activeXDomain[0] || !activeXDomain[1]) {
        return { sortedPointsInView: [], linePath: null };
    }

    // Filter quakes that are within the current X domain (time window)
    // And ensure they have valid time and mag for plotting
    const quakesCurrentlyVisible = originalQuakes.filter(q => {
        const time = new Date(q.properties.time);
        // Ensure properties and time/mag are valid before creating Date or comparing
        return q.properties && isValuePresent(q.properties.time) && isValidNumber(q.properties.mag) &&
               time >= activeXDomain[0] && time <= activeXDomain[1];
    });

    // Explicitly sort quakes by time
    const sorted = [...quakesCurrentlyVisible].sort((a, b) =>
        new Date(a.properties.time) - new Date(b.properties.time)
    );

    let quakesForLine;
    if (isZoomed) {
        quakesForLine = sorted; // Show all lines when zoomed
    } else {
        quakesForLine = sorted.filter(q => q.properties.mag >= MICROQUAKE_THRESHOLD);
    }

    if (quakesForLine.length < 2) { // Need at least two points for a line
        return { sortedPointsInView: sorted, linePath: null };
    }

    const lineGenerator = d3Line()
        .x(d => xScale(new Date(d.properties.time)))
        .y(d => yScale(d.properties.mag));

    return { sortedPointsInView: sorted, linePath: lineGenerator(quakesForLine) };
  }, [originalQuakes, activeXDomain, xScale, yScale, isZoomed]); // Removed MICROQUAKE_THRESHOLD from deps


  // Brush handler
  const handleBrushEnd = useCallback((event) => {
    if (!event.selection) { // If selection is cleared
      if (currentXDomain && fullTimeDomain && (currentXDomain[0].getTime() !== fullTimeDomain[0].getTime() || currentXDomain[1].getTime() !== fullTimeDomain[1].getTime())) {
        setCurrentXDomain(fullTimeDomain); // Reset to full domain
      }
      // Also clear brush visual if it was cleared by clicking outside (event.selection is null)
      // and the d3BrushInstance is available
      if (d3BrushInstanceRef.current && brushRef.current) {
        select(brushRef.current).call(d3BrushInstanceRef.current.move, null);
      }
      return;
    }
    const [x0, x1] = event.selection.map(xScale.invert);
    setCurrentXDomain([x0, x1]);
    // After brushing, remove the brush selection from the view
    if (d3BrushInstanceRef.current && brushRef.current) {
      // Programmatically clear the brush selection rectangle
      select(brushRef.current).call(d3BrushInstanceRef.current.move, null);
    }
  }, [xScale, fullTimeDomain, currentXDomain]); // Ensure all dependencies are correct

  // Zoom handler
  const handleZoom = useCallback((event) => {
    const { transform } = event;
    const newXScale = transform.rescaleX(xScale);
    setCurrentXDomain(newXScale.domain());
  }, [xScale]); // xScale includes activeXDomain, width

  // Setup Brush
  useEffect(() => {
    if (!brushRef.current || width <= 0 || height <= 0) return;

    // Store the brush instance in the ref so it can be accessed in handleBrushEnd
    d3BrushInstanceRef.current = brushX()
      .extent([[0, 0], [width, height]])
      .on("end", handleBrushEnd); // handleBrushEnd is a useCallback, stable reference

    const brushDOMNode = select(brushRef.current);
    brushDOMNode.call(d3BrushInstanceRef.current);

    return () => {
      brushDOMNode.on(".brush", null);
      brushDOMNode.selectAll("*").remove();
    };

  }, [width, height, handleBrushEnd]); // handleBrushEnd is stable due to useCallback

  // Setup Zoom & Custom Touch Handlers
  useEffect(() => {
    if (!zoomOverlayRef.current || width <= 0 || height <= 0 || !xScale || !yScale || !fullTimeDomain) return;

    const overlay = zoomOverlayRef.current;

    // D3 Zoom for mouse wheel and double click
    const zoomBehavior = zoom()
      .scaleExtent([0.1, 20])
      .extent([[0, 0], [width, height]])
      .translateExtent([[0, 0], [width, height]])
      .filter(event => !event.type.startsWith('touch') && (event.type === 'wheel' || event.type === 'dblclick')) // Ignore touch events for D3 zoom
      .on("zoom", handleZoom);

    d3ZoomRef.current = zoomBehavior;
    const overlaySelection = select(overlay); // Use imported select
    overlaySelection.call(zoomBehavior);
    // Initialize zoom transform
    if (currentXDomain && fullTimeDomain &&
        currentXDomain[0].getTime() === fullTimeDomain[0].getTime() &&
        currentXDomain[1].getTime() === fullTimeDomain[1].getTime()) {
      overlaySelection.call(zoomBehavior.transform, zoomIdentity);
    }

    // Custom Touch Handlers
    const handleTouchStart = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        initialTouchDataRef.current = {
          initialDistance: Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY), // Using hypot for 2D distance
          initialMidpointX: (touch1.clientX + touch2.clientX) / 2,
          domain: [...activeXDomain], // Store a copy of the domain at touch start
        };
        // Detach D3 zoom temporarily to avoid conflicts if it wasn't fully filtered:
        // select(overlay).on('.zoom', null);
      }
    };

    const handleTouchMove = (event) => {
      if (initialTouchDataRef.current && event.touches.length === 2) {
        event.preventDefault();
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const newDistance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);

        if (initialTouchDataRef.current.initialDistance === 0) return;

        let scaleFactor = newDistance / initialTouchDataRef.current.initialDistance;

        // Prevent extreme scaling or inversion
        if (scaleFactor < 0.01 || scaleFactor > 100) return;


        const { domain: initialDomain, initialMidpointX } = initialTouchDataRef.current;

        // Convert pixel midpoint to time value using the scale *at the start of the gesture*
        // This requires an xScale based on initialDomain
        const initialXScale = scaleTime().domain(initialDomain).range([0, width]);
        const focalTime = initialXScale.invert(initialMidpointX - margin.left); // Adjust for margin if overlay is not translated
                                                                            // Assuming zoomOverlayRef is within the G element that has margin transform
                                                                            // If zoomOverlayRef is the SVG itself, margin.left is not needed here.
                                                                            // Based on current JSX, zoomOverlayRef is inside the translated G.

        const focalTimeMs = focalTime.getTime();
        const initialDomainWidthMs = initialDomain[1].getTime() - initialDomain[0].getTime();

        let newDomainWidthMs = initialDomainWidthMs / scaleFactor;

        const MIN_DOMAIN_WIDTH_MS = 1 * 60 * 1000; // 1 minute
        if (newDomainWidthMs < MIN_DOMAIN_WIDTH_MS) {
          newDomainWidthMs = MIN_DOMAIN_WIDTH_MS;
          // Recalculate scaleFactor if clamped, to keep focal point consistent
          scaleFactor = initialDomainWidthMs / newDomainWidthMs;
        }

        const leftRatio = (focalTimeMs - initialDomain[0].getTime()) / initialDomainWidthMs;
        const rightRatio = (initialDomain[1].getTime() - focalTimeMs) / initialDomainWidthMs;

        let newStartTimeMs = focalTimeMs - (newDomainWidthMs * leftRatio);
        let newEndTimeMs = focalTimeMs + (newDomainWidthMs * rightRatio);

        // Clamp to fullTimeDomain
        newStartTimeMs = Math.max(newStartTimeMs, fullTimeDomain[0].getTime());
        newEndTimeMs = Math.min(newEndTimeMs, fullTimeDomain[1].getTime());

        // If clamping caused start >= end, adjust to maintain min width
        if (newStartTimeMs >= newEndTimeMs) {
            const mid = (newStartTimeMs + newEndTimeMs) / 2; // or use focalTimeMs
            newStartTimeMs = mid - MIN_DOMAIN_WIDTH_MS / 2;
            newEndTimeMs = mid + MIN_DOMAIN_WIDTH_MS / 2;
            // Re-clamp after adjustment
            newStartTimeMs = Math.max(newStartTimeMs, fullTimeDomain[0].getTime());
            newEndTimeMs = Math.min(newEndTimeMs, fullTimeDomain[1].getTime());
        }

        // Final check to ensure start is less than end after all adjustments
        if (newStartTimeMs < newEndTimeMs) {
            setCurrentXDomain([new Date(newStartTimeMs), new Date(newEndTimeMs)]);
        }
      }
    };

    const handleTouchEnd = (event) => {
      if (initialTouchDataRef.current && event.touches.length < 2) {
        initialTouchDataRef.current = null;
        // Re-attach D3 zoom if it was temporarily detached:
        // select(overlay).call(d3ZoomRef.current);
      }
    };

    overlay.addEventListener('touchstart', handleTouchStart, { passive: false });
    overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
    overlay.addEventListener('touchend', handleTouchEnd, { passive: false });
    overlay.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      select(overlay).on(".zoom", null); // Clean up D3 zoom listeners
      overlay.removeEventListener('touchstart', handleTouchStart);
      overlay.removeEventListener('touchmove', handleTouchMove);
      overlay.removeEventListener('touchend', handleTouchEnd);
      overlay.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [width, height, handleZoom, xScale, yScale, currentXDomain, fullTimeDomain, activeXDomain, margin.left]); // Added activeXDomain, margin.left


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
      <svg ref={svgRef} width="100%" height={chartHeight} viewBox={`0 0 ${chartRenderWidth} ${chartHeight}`}>
        <defs>
          <clipPath id={`clip-${cluster?.properties?.cluster_id || 'default'}`}>
            <rect x="0" y="0" width={width} height={height} />
          </clipPath>
        </defs>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Zoom Overlay Rectangle - must be rendered before other interactive elements if it's meant to capture all pointer events for zoom */}
          <rect
            ref={zoomOverlayRef}
            width={width}
            height={height}
            fill="none"
            pointerEvents="all" // Capture all mouse events for zooming
            style={{ cursor: 'move' }} // Optional: change cursor to indicate zoomable area
          />

          {/* Y-Axis Gridlines */}
          {yAxisTicks.map(({ value, offset }) => (
            <line
              key={`y-grid-${value}`} x1={0} x2={width} y1={offset} y2={offset}
              className={`${gridLineColor} stroke-dasharray-2 stroke-opacity-50`} strokeDasharray="2,2"
            />
          ))}

          {timeAxisTicks.map(({ value, offset }) =>
             (offset >= 0 && offset <= width) && (
            <line
              key={`x-grid-${value.toISOString()}`} x1={offset} x2={offset} y1={0} y2={height}
              className={`${gridLineColor} stroke-dasharray-2 stroke-opacity-50`} strokeDasharray="2,2"
            />
          ))}

          {/* Main plot area group with clip-path */}
          <g clipPath={`url(#clip-${cluster?.properties?.cluster_id || 'default'})`}>
            {/* Connecting Line for Quakes (conditional rendering logic applied in useMemo) */}
            {linePath && (
              <path
                  d={linePath}
                  strokeDasharray="3,3"
                  className={`stroke-current ${tickLabelColor} opacity-75`}
                  strokeWidth={1}
                  fill="none"
              />
            )}

            {/* Data Points (Circles - using sortedPointsInView) */}
            {sortedPointsInView.map(quake => {
              const { id, properties } = quake;
              const { time, mag, place } = properties;
              // Ensure time is valid before creating Date object
              const dateObj = isValuePresent(time) ? new Date(time) : null;
              if (!dateObj) return null; // Skip rendering if time is invalid

              const cx = xScale(dateObj);
              const cy = yScale(mag);
              const color = getMagnitudeColor(mag);
              const isMain = processedMainshock && processedMainshock.id === id;

              // Ensure mag is a valid number before passing to radiusScale
              const baseRadius = isValidNumber(mag) ? radiusScale(mag) : 2; // Default radius if mag is invalid
              const circleRadius = isMain ? baseRadius + 2 : baseRadius;

              // Y-axis check
              if (cy < -circleRadius || cy > height + circleRadius) {
                return null;
              }

              return (
                <g key={id}>
                  <circle
                    cx={cx} cy={cy} r={circleRadius}
                    fill={isMain ? 'none' : color} // Mainshock has no fill, only stroke
                    stroke={isMain ? color : 'none'} // Mainshock stroke is its color, others no stroke
                    strokeWidth={isMain ? mainshockStrokeWidth : 0} // Mainshock has thicker stroke
                    fillOpacity={isMain ? 1.0 : 0.7} // Mainshock fill opacity (though fill is none)
                    strokeOpacity={isMain ? 1.0 : 0.7}
                    className="transition-opacity duration-200 hover:opacity-100"
                  >
                    <title>{`Mag ${isValidNumber(mag) ? formatNumber(mag,1) : 'N/A'} ${place || 'Unknown location'} - ${formatDate(time)}`}</title>
                  </circle>
                  {isMain && isValidNumber(mag) && ( // Also check mag for label
                    <text
                      x={cx + circleRadius + 5} y={cy}
                      alignmentBaseline="middle" className={`text-xs fill-current ${tickLabelColor}`}
                    >
                      {formatNumber(mag,1)}
                    </text>
                  )}
                </g>
              );
            })}
          </g> {/* End of main plot area group with clip-path */}

          {/* Brush Group - Rendered on top of data but below axes for interaction */}
          {/* Ensure pointerEvents="none" for elements under brush if brush should take precedence */}
          {/* Or pointerEvents="all" on brush itself and ensure it's drawn last among interactive layers */}
          <g ref={brushRef} className="brush-group" />


          {/* Y-Axis (rendered on top of data and gridlines) */}
          <line x1={0} y1={0} x2={0} y2={height} className={gridLineColor} />
          {yAxisTicks.map(({ value, offset }) => (
            <text
              key={`y-tick-${value}`} x={-8} y={offset}
              textAnchor="end" alignmentBaseline="middle"
              className={`text-xs fill-current ${tickLabelColor}`}
            >
              {value}
            </text>
          ))}

          {/* X-Axis (rendered on top of data and gridlines) */}
          <line x1={0} y1={height} x2={width} y2={height} className={gridLineColor} />
          {timeAxisTicks.map(({ value, offset, label }) =>
            (offset >= 0 && offset <= width) && (
            <text
              key={`time-label-${value.toISOString()}`} x={offset} y={height + 20}
              textAnchor="middle" className={`text-xs fill-current ${tickLabelColor}`}
            >
              {label}
            </text>
          ))}
          <text
            x={width / 2} y={height + 45}
            textAnchor="middle" className={`text-sm fill-current ${axisLabelColor}`}
          >
            Time (UTC)
          </text>
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
          time: PropTypes.number, // Should be epoch milliseconds
          mag: PropTypes.number,
          place: PropTypes.string,
        }).isRequired,
      })
    ),
    properties: PropTypes.shape({ // For cluster_id used in clip-path ID
        cluster_id: PropTypes.string,
    })
  }).isRequired,
  isLoading: PropTypes.bool,
};

EarthquakeSequenceChart.defaultProps = {
  isLoading: false,
};

export default EarthquakeSequenceChart;
