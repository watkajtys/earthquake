import React from 'react';
import { motion } from 'framer-motion';

const ReverseFaultIcon = ({ className = "w-12 h-8" }) => {
  const hangingWallVariants = {
    initial: { y: 0, x: 0 }, // Start position
    animate: { y: -5, x: 2 }, // End position: move up and slightly right
  };

  const transitionSettings = {
    duration: 1.5,
    ease: "easeInOut",
    repeat: Infinity,
    repeatType: "reverse",
  };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="reverseFaultTitle" role="img">
      <title id="reverseFaultTitle">Animated Reverse Fault Diagram</title>

      {/* Fault line - static */}
      <line x1="5" y1="5" x2="45" y2="25" stroke="currentColor" strokeWidth="1" />

      {/* Footwall (right block) - static */}
      {/* Original points: "25,15 45,25 45,30 25,30" and rect x="25" y="15" width="25" height="15" */}
      <motion.g>
        <polygon points="25,15 45,25 45,30 25,30" fill="currentColor" opacity="0.5" />
        {/* <rect x="25" y="15" width="25" height="15" fill="currentColor" opacity="0.5" /> */}
      </motion.g>

      {/* Hanging wall (left block) - animated */}
      {/* Original points: "5,5 25,15 25,30 5,30" and rect x="0" y="0" width="25" height="25" */}
      <motion.g
        variants={hangingWallVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings}
      >
        {/* Combined shape for hanging wall */}
        {/* Points define the main block shape along the fault plane */}
        {/* Adjusted for initial y=5, x=25 block from original static icon */}
        <polygon points="5,20 25,10 25,25 5,25" fill="currentColor" opacity="0.7" />
        {/* <rect x="0" y="0" width="25" height="25" fill="currentColor" opacity="0.7" /> */}

        {/* Arrow indicating upward movement of hanging wall */}
        <polyline points="15,17 15,13 12,15 15,13 18,15" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>
    </svg>
  );
};
export default ReverseFaultIcon;
