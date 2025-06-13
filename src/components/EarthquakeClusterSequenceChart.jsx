import React, { useEffect, useMemo, useState } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { timeFormat } from 'd3-time-format';
import { select } from 'd3-selection'; // Added

const EarthquakeClusterSequenceChart = ({ data }) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = React.useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const mainshock = useMemo(() => {
    if (!data || data.length === 0) return null;
    // GeoJSON: properties are nested
    return data.reduce((prev, current) =>
      (prev.properties.mag > current.properties.mag) ? prev : current
    );
  }, [data]);

  const processedData = useMemo(() => {
    if (!data || !mainshock) return [];
    return data.map(event => ({
      ...event, // Spread original event (includes id, type, geometry, properties)
      // Ensure time is accessed from properties for calculation
      time_after_mainshock: (new Date(event.properties.time) - new Date(mainshock.properties.time)) / (1000 * 60 * 60 * 24), // in days
    }));
  }, [data, mainshock]);

  const margin = { top: 50, right: 50, bottom: 60, left: 60 };
  const width = containerWidth - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const xScale = useMemo(() => {
    if (!processedData || processedData.length === 0 || !mainshock) return null;
    const timeDomain = [
        // Ensure time is accessed from properties for calculation
        (new Date(mainshock.properties.time).getTime() - 1 * 24 * 60 * 60 * 1000) / (1000 * 60 * 60 * 24), // 1 day before mainshock
        Math.max(...processedData.map(d => d.time_after_mainshock), 1) // Ensure at least 1 day shown
    ];
    return scaleLinear()
      .domain(timeDomain)
      .range([0, width]);
  }, [processedData, mainshock, width]);


  const yScale = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;
    // Ensure mag is accessed from properties
    const magMin = Math.min(...processedData.map(d => d.properties.mag), 0);
    const magMax = Math.max(...processedData.map(d => d.properties.mag), 5);
    return scaleLinear()
      .domain([magMin > 0 ? 0 : magMin, magMax])
      .range([height, 0]);
  }, [processedData, height]);

  const radiusScale = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;
    // Ensure mag is accessed from properties
    const magMin = Math.min(...processedData.map(d => d.properties.mag));
    const magMax = Math.max(...processedData.map(d => d.properties.mag));
    return scaleLinear()
      .domain([magMin, magMax])
      .range([3, 15]);
  }, [processedData]);

  if (!data || data.length === 0) {
    return (
      <div className="flex justify-center items-center h-96 text-gray-500" ref={containerRef}>
        No earthquake data available for this sequence.
      </div>
    );
  }

  if (width <= 0) {
    return <div ref={containerRef} className="w-full h-96"></div>; // Render empty div to get width
  }

  const xAxis = (el) => { // el is the raw DOM element from the ref
    if (el) {
      const g = select(el); // Create a D3 selection from the element
      g.attr('transform', `translate(0,${height})`)
       .call(scale => {
          const domain = xScale.domain();
          const ticks = xScale.ticks(width / 80);
          g.selectAll('*').remove(); // Clear previous ticks and path

          g.append('path')
              .attr('class', 'domain')
              .attr('stroke', 'currentColor')
              .attr('d', `M${xScale(domain[0])},0.5H${xScale(domain[1])}`);

          ticks.forEach(tick => {
              if (tick === undefined || isNaN(tick) || xScale(tick) === undefined || isNaN(xScale(tick))) return;
              const tickG = g.append('g')
                  .attr('class', 'tick')
                  .attr('transform', `translate(${xScale(tick)},0)`);
              tickG.append('line')
                  .attr('stroke', 'currentColor')
                  .attr('y2', 6);
              tickG.append('text')
                  .attr('fill', 'currentColor')
                  .attr('y', 9)
                  .attr('dy', '0.71em')
                  .attr('text-anchor', 'middle')
                  .text(String(tick)); // Ensure tick is a string
          });
      });
    }
  };


  const yAxis = (el) => { // el is the raw DOM element from the ref
    if (el) {
      const g = select(el); // Create a D3 selection from the element
      g.call(scale => {
          const domain = yScale.domain();
          const ticks = yScale.ticks();
          g.selectAll('*').remove(); // Clear previous ticks and path

          g.append('path')
              .attr('class', 'domain')
              .attr('stroke', 'currentColor')
              .attr('d', `M0.5,${yScale(domain[0])}V${yScale(domain[1])}`);

          ticks.forEach(tick => {
            if (tick === undefined || isNaN(tick) || yScale(tick) === undefined || isNaN(yScale(tick))) return;
              const tickG = g.append('g')
                  .attr('class', 'tick')
                  .attr('transform', `translate(0,${yScale(tick)})`);
              tickG.append('line')
                  .attr('stroke', 'currentColor')
                  .attr('x2', -6);
              tickG.append('text')
                  .attr('fill', 'currentColor')
                  .attr('x', -9)
                  .attr('dy', '0.32em')
                  .attr('text-anchor', 'end')
                  .text(String(tick)); // Ensure tick is a string
          });
      });
    }
  };


  return (
    <div className="bg-white shadow-lg rounded-lg p-6 w-full min-h-[400px]" ref={containerRef}>
      <h2 className="text-xl font-semibold text-gray-700 mb-4">Earthquake Sequence: Time vs. Magnitude</h2>
      <svg
        width={width + margin.left + margin.right}
        height={height + margin.top + margin.bottom}
        aria-label="Earthquake Sequence: Time vs. Magnitude"
        data-testid="earthquake-sequence-chart-svg"
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* X Axis */}
          <g ref={xAxis} className="text-gray-600"/>
          <text
            transform={`translate(${width / 2},${height + margin.bottom - 10})`}
            textAnchor="middle"
            className="text-sm fill-current text-gray-700"
          >
            Days from Mainshock
          </text>

          {/* Y Axis */}
          <g ref={yAxis} className="text-gray-600" />
          <text
            transform="rotate(-90)"
            y={0 - margin.left + 15}
            x={0 - (height / 2)}
            textAnchor="middle"
            className="text-sm fill-current text-gray-700"
          >
            Magnitude
          </text>

          {/* Title */}
            <text
                x={width / 2}
                y={0 - (margin.top / 2)}
                textAnchor="middle"
                className="text-lg font-bold text-gray-800"
            >
                {mainshock && mainshock.properties && mainshock.properties.time ? `Sequence started: ${new Date(mainshock.properties.time).toLocaleDateString()}` : 'Earthquake Sequence'}
            </text>


          {/* Data points */}
          {processedData.map((event, i) => ( // event here is from processedData, which includes original GeoJSON structure
            <circle
              key={event.id || i} // Use event.id if available, otherwise fallback to index
              cx={xScale(event.time_after_mainshock)}
              cy={yScale(event.properties.mag)}
              r={radiusScale(event.properties.mag)}
              fill={event.id === mainshock.id ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 100, 255, 0.5)'}
              stroke={event.id === mainshock.id ? 'rgba(200, 0, 0, 1)' : 'rgba(0, 80, 200, 0.8)'}
              strokeWidth="1"
            >
              <title>
                {`Time: ${new Date(event.properties.time).toLocaleString()}\nMagnitude: ${event.properties.mag}\nDepth: ${event.geometry.coordinates[2]} km\nPlace: ${event.properties.place}\nStatus: ${event.properties.status}${event.id === mainshock.id ? ' (Mainshock)' : ''}`}
              </title>
            </circle>
          ))}
           {/* Mainshock Label */}
           {mainshock && mainshock.properties && xScale(0) >=0 && xScale(0) <= width && yScale(mainshock.properties.mag) >=0 && yScale(mainshock.properties.mag) <= height && (
             <text
                x={xScale(0)} // Mainshock is at time_after_mainshock = 0
                y={yScale(mainshock.properties.mag) - radiusScale(mainshock.properties.mag) - 5} // Position above the circle
                textAnchor="middle"
                className="text-xs fill-current text-red-600 font-semibold"
             >
                Mainshock
             </text>
           )}
        </g>
      </svg>
      <div className="mt-4 flex justify-end space-x-2">
        <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-1"></div>
            <span className="text-xs text-gray-600">Mainshock</span>
        </div>
        <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-1"></div>
            <span className="text-xs text-gray-600">Aftershock/Foreshock</span>
        </div>
      </div>
    </div>
  );
};

export default EarthquakeClusterSequenceChart;
