import React from 'react';
import { motion } from 'framer-motion';

const StrikeSlipFaultIcon = ({ className = "w-12 h-8" }) => {
  // Variants for left block
  const leftBlockVariants = {
    initial: { x: 0 },
    animate: { x: -4 }, // Moves left
  };

  // Variants for right block
  const rightBlockVariants = {
    initial: { x: 0 },
    animate: { x: 4 }, // Moves right
  };

  const transitionSettings = {
    duration: 1.5,
    ease: "easeInOut",
    repeat: Infinity,
    repeatType: "reverse",
  };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="strikeSlipFaultTitle" role="img">
      <title id="strikeSlipFaultTitle">Animated Strike-Slip Fault Diagram</title>

      {/* Fault line (vertical) - static */}
      <line x1="25" y1="2" x2="25" y2="28" stroke="currentColor" strokeWidth="1" />

      {/* Left block - animated */}
      <motion.g
        variants={leftBlockVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings}
      >
        <rect x="2" y="2" width="21" height="26" fill="currentColor" opacity="0.7" />
        {/* Arrow indicating leftward movement (top surface view) */}
        <polyline points="12.5,8 8.5,12.5 12.5,17" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>

      {/* Right block - animated */}
      <motion.g
        variants={rightBlockVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings}
      >
        <rect x="27" y="2" width="21" height="26" fill="currentColor" opacity="0.5" />
        {/* Arrow indicating rightward movement (top surface view) */}
        <polyline points="37.5,8 41.5,12.5 37.5,17" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>
    </svg>
  );
};
export default StrikeSlipFaultIcon;
