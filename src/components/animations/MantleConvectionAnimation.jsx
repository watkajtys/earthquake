import React from 'react';
import './MantleConvectionAnimation.css';

const MantleConvectionAnimation = () => {
  const svgWidth = 500;
  const svgHeight = 400;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  // Radii for layers (approximate for a semi-circular view, or full if we clip)
  // Let's aim for a semi-circular/partial view to imply a cross-section cut.
  // We'll use a clipPath later if needed, for now full circles.
  const crustThickness = 15;
  const mantleRadius = centerY - crustThickness - 10; // Leave some space
  const outerCoreRadius = mantleRadius * 0.55;
  const innerCoreRadius = outerCoreRadius * 0.45;


  return (
    // Container styling moved to WhyEarthquakesHappenPage.jsx's animationContainerStyle
    // For direct application if this component is used elsewhere:
    // className={`bg-slate-800 rounded-lg p-4 border border-slate-700 text-slate-300`}
    <div className="mantle-convection-animation-wrapper">
      <h3 className="text-lg font-semibold text-indigo-400 mb-4 text-center">Mantle Convection Engine</h3>
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="mantle-animation-svg bg-slate-700 border border-slate-600 rounded mx-auto block"
      >
        <defs>
          {/* SVG filter for a slight glow or depth, optional */ }
          <filter id="inner-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Mantle */}
        <circle
          cx={centerX}
          cy={centerY}
          r={mantleRadius}
          className="mantle"
        />

        {/* Outer Core */}
        <circle
          cx={centerX}
          cy={centerY}
          r={outerCoreRadius}
          className="outer-core"
        />

        {/* Inner Core */}
        <circle
          cx={centerX}
          cy={centerY}
          r={innerCoreRadius}
          className="inner-core"
        />

        {/* Crust/Lithosphere - drawn as a ring path for thickness */}
        <path
          d={`
            M ${centerX - mantleRadius - crustThickness}, ${centerY}
            a ${mantleRadius + crustThickness},${mantleRadius + crustThickness} 0 1,0 ${2 * (mantleRadius + crustThickness)},0
            a ${mantleRadius + crustThickness},${mantleRadius + crustThickness} 0 1,0 ${-2 * (mantleRadius + crustThickness)},0
            Z
            M ${centerX - mantleRadius}, ${centerY}
            a ${mantleRadius},${mantleRadius} 0 1,0 ${2 * mantleRadius},0
            a ${mantleRadius},${mantleRadius} 0 1,0 ${-2 * mantleRadius},0
            Z
          `}
          className="crust"
          fillRule="evenodd"
        />

        {/* Labels */}
        <text x={centerX} y={centerY} className="layer-label inner-core-label">Inner Core</text>
        <text x={centerX} y={centerY - outerCoreRadius + 15} className="layer-label outer-core-label">Outer Core</text>
        <text x={centerX} y={centerY - mantleRadius + 30} className="layer-label mantle-label">Mantle</text>
        <text x={centerX} y={centerY - mantleRadius - crustThickness - 5} className="layer-label crust-label">Crust/Lithosphere</text>

        {/* Tectonic Plates */}
        <g id="tectonic-plates">
          {/* Plate 1a (left part of divergent boundary) */}
          <rect
            id="plate1a"
            x={centerX - 80 - 10} /* 80 width, 10 initial separation from center for the "ridge" */
            y={centerY - mantleRadius - crustThickness - 10} /* 10 height */
            width="80"
            height="10"
            className="tectonic-plate"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; -10,0; 0,0"
              dur="10s"
              repeatCount="indefinite"
            />
          </rect>
          {/* Plate 1b (right part of divergent boundary) */}
          <rect
            id="plate1b"
            x={centerX + 10} /* 10 initial separation from center */
            y={centerY - mantleRadius - crustThickness - 10}
            width="80"
            height="10"
            className="tectonic-plate"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 10,0; 0,0"
              dur="10s"
              repeatCount="indefinite"
            />
          </rect>
          {/* Plate 2 (moving towards left subduction - assuming left cell sinks on its left edge) */}
          <rect
            id="plate2"
            x={centerX - 80 - 10 - 100 - 10} /* Positioned to the left of plate1a by 100 + 10 spacing */
            y={centerY - mantleRadius - crustThickness - 10}
            width="100"
            height="10"
            className="tectonic-plate"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; -15,0; 0,0" /* Moves left */
              dur="10s"
              repeatCount="indefinite"
            />
          </rect>
           {/* Plate 3 (moving towards right subduction - assuming right cell sinks on its right edge) */}
          <rect
            id="plate3"
            x={centerX + 10 + 80 + 10} /* Positioned to the right of plate1b */
            y={centerY - mantleRadius - crustThickness - 10}
            width="100"
            height="10"
            className="tectonic-plate"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 15,0; 0,0" /* Moves right */
              dur="10s"
              repeatCount="indefinite"
            />
          </rect>
        </g>

        <g id="convection-cells">
          {/* Path 1: Left Cell (Clockwise) */}
          <path
            id="convPath1"
            d={`
              M ${centerX - mantleRadius * 0.5}, ${centerY - outerCoreRadius * 0.2}
              A ${mantleRadius * 0.4}, ${mantleRadius * 0.7} 0 1,0 ${centerX - mantleRadius * 0.5}, ${centerY + outerCoreRadius * 0.2}
              A ${mantleRadius * 0.4}, ${mantleRadius * 0.7} 0 1,0 ${centerX - mantleRadius * 0.5}, ${centerY - outerCoreRadius * 0.2}
              Z
            `}
            fill="none" stroke="none"
          />
          {/* Path 2: Right Cell (Counter-Clockwise) */}
          <path
            id="convPath2"
            d={`
              M ${centerX + mantleRadius * 0.5}, ${centerY - outerCoreRadius * 0.2}
              A ${mantleRadius * 0.4}, ${mantleRadius * 0.7} 0 1,1 ${centerX + mantleRadius * 0.5}, ${centerY + outerCoreRadius * 0.2}
              A ${mantleRadius * 0.4}, ${mantleRadius * 0.7} 0 1,1 ${centerX + mantleRadius * 0.5}, ${centerY - outerCoreRadius * 0.2}
              Z
            `}
            fill="none" stroke="none"
          />

          {/* Particles for Path 1 (Left Cell) */}
          {[0, 2.5, 5, 7.5].map(delay => ( // Hot rising on the right side of left cell (towards center)
            <circle key={`hot-p1-${delay}`} className="hot-particle" r="5">
              <animateMotion dur="10s" begin={`${delay}s`} repeatCount="indefinite">
                <mpath xlinkHref="#convPath1" />
              </animateMotion>
            </circle>
          ))}
          {[1, 3.5, 6, 8.5].map(delay => ( // Cool sinking on the left side of left cell (towards edge)
            <circle key={`cool-p1-${delay}`} className="cool-particle" r="5">
              <animateMotion dur="10s" begin={`${delay}s`} repeatCount="indefinite">
                <mpath xlinkHref="#convPath1" />
              </animateMotion>
            </circle>
          ))}

          {/* Particles for Path 2 (Right Cell) */}
          {[0.5, 3, 5.5, 8].map(delay => ( // Hot rising on the left side of right cell (towards center)
            <circle key={`hot-p2-${delay}`} className="hot-particle" r="5">
              <animateMotion dur="10s" begin={`${delay}s`} repeatCount="indefinite">
                <mpath xlinkHref="#convPath2" />
              </animateMotion>
            </circle>
          ))}
          {[1.5, 4, 6.5, 9].map(delay => ( // Cool sinking on the right side of right cell (towards edge)
            <circle key={`cool-p2-${delay}`} className="cool-particle" r="5">
              <animateMotion dur="10s" begin={`${delay}s`} repeatCount="indefinite">
                <mpath xlinkHref="#convPath2" />
              </animateMotion>
            </circle>
          ))}
        </g>
      </svg>
    </div>
  );
};

export default MantleConvectionAnimation;
