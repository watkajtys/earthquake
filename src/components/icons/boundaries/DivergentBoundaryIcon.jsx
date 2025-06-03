import React from 'react';
import { motion } from 'framer-motion';

const DivergentBoundaryIcon = ({ className = "w-12 h-8" }) => {
  const leftBlockVariants = {
    initial: { x: 0 },
    animate: { x: -3 }, // Moves left
  };

  const rightBlockVariants = {
    initial: { x: 0 },
    animate: { x: 3 }, // Moves right
  };

  const transitionSettings = {
    duration: 1.5,
    ease: "easeInOut",
    repeat: Infinity,
    repeatType: "reverse",
  };

  // Optional: Animation for a central 'upwelling' line
  // const centerLineVariants = {
  //   initial: { opacity: 0, y: 5 },
  //   animate: { opacity: 0.3, y: 0 },
  // };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="divergentBoundaryTitle" role="img">
      <title id="divergentBoundaryTitle">Animated Divergent Boundary Diagram</title>

      {/* Left Block - animated */}
      <motion.g
        variants={leftBlockVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings}
      >
        <rect x="2" y="5" width="20" height="20" fill="currentColor" opacity="0.7" />
        {/* Arrow on left block pointing left */}
        <polyline points="10,15 4,15 7,12 4,15 7,18" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      {/* Right Block - animated */}
      <motion.g
        variants={rightBlockVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings}
      >
        <rect x="28" y="5" width="20" height="20" fill="currentColor" opacity="0.5" />
        {/* Arrow on right block pointing right */}
        <polyline points="40,15 46,15 43,12 46,15 43,18" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      {/* Optional: Central upwelling indicator - could be animated */}
      {/*
      <motion.line
        x1="25" y1="10" x2="25" y2="20"
        stroke="currentColor" strokeWidth="1" strokeDasharray="2,1"
        variants={centerLineVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings} // Can use same or different transition
      />
      */}
    </svg>
  );
};
export default DivergentBoundaryIcon;
