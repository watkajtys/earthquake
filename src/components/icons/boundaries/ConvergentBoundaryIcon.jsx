import React from 'react';
import { motion } from 'framer-motion';

const ConvergentBoundaryIcon = ({ className = "w-12 h-8" }) => {
  const leftBlockVariants = {
    initial: { x: 0 },
    animate: { x: 3 }, // Moves right
  };

  const rightBlockVariants = {
    initial: { x: 0 },
    animate: { x: -3 }, // Moves left
  };

  const transitionSettings = {
    duration: 1.5,
    ease: "easeInOut",
    repeat: Infinity,
    repeatType: "reverse",
  };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="convergentBoundaryTitle" role="img">
      <title id="convergentBoundaryTitle">Animated Convergent Boundary Diagram</title>

      {/* Left Block - animated */}
      <motion.g
        variants={leftBlockVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings}
      >
        <rect x="2" y="5" width="20" height="20" fill="currentColor" opacity="0.7" />
        {/* Arrow on left block pointing right */}
        <polyline points="18,15 22,15 20,12 22,15 20,18" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      {/* Right Block - animated */}
      <motion.g
        variants={rightBlockVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings}
      >
        <rect x="28" y="5" width="20" height="20" fill="currentColor" opacity="0.5" />
        {/* Arrow on right block pointing left */}
        <polyline points="32,15 28,15 30,12 28,15 30,18" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      {/* Optional: Hint of collision/uplift - could be a static line or animated if desired */}
      {/* <line x1="25" y1="4" x2="25" y2="8" stroke="currentColor" strokeWidth="1"/> */}
      {/* <polyline points="23,8 25,5 27,8" stroke="currentColor" strokeWidth="1" fill="none"/> */}

    </svg>
  );
};
export default ConvergentBoundaryIcon;
