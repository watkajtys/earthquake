import React from 'react';
import { motion } from 'framer-motion';

const NormalFaultIcon = ({ className = "w-12 h-8" }) => {
  // Define animation variants for the hanging wall (left block)
  const hangingWallVariants = {
    initial: { y: 0, x: 0 }, // Start position
    animate: { y: 5, x: -2 }, // End position: move down and slightly left
  };

  const transitionSettings = {
    duration: 1.5, // Duration for one direction of the animation
    ease: "easeInOut",
    repeat: Infinity,
    repeatType: "reverse", // Reverses the animation on each repeat
  };

  return (
    <svg viewBox="0 0 50 30" className={className} aria-labelledby="normalFaultTitle" role="img">
      <title id="normalFaultTitle">Animated Normal Fault Diagram</title>

      {/* Fault line - static */}
      <line x1="5" y1="25" x2="45" y2="5" stroke="currentColor" strokeWidth="1" />

      {/* Footwall (right block) - static */}
      {/* Original points: "25,5 45,5 45,20 25,30" */}
      <motion.g>
        <polygon points="25,5 45,5 45,20 25,22" fill="currentColor" opacity="0.5" />
        {/* Adjusted points slightly for better initial alignment if needed, or keep as is */}
        {/* <rect x="25" y="0" width="25" height="20" fill="currentColor" opacity="0.5" /> */}
      </motion.g>

      {/* Hanging wall (left block) - animated */}
      {/* Original points: "5,25 25,15 25,30 5,30" and rect x="0" y="15" */}
      <motion.g
        variants={hangingWallVariants}
        initial="initial"
        animate="animate"
        transition={transitionSettings}
      >
        {/* Combined shape for hanging wall for simpler animation */}
        {/* Points define the main block shape along the fault plane */}
        {/* These points might need adjustment for a visually correct starting position before animation */}
        {/* Let's assume initial state has the top edge of hanging wall at y=5, aligning somewhat with footwall top */}
        <polygon points="5,17 25,7 25,22 5,22" fill="currentColor" opacity="0.7" />
        {/* Base of the block */}
        {/* <rect x="0" y="15" width="25" height="15" fill="currentColor" opacity="0.7" /> */}

        {/* Arrow indicating downward movement of hanging wall - also part of the animated group */}
        {/* Arrow position might need to be relative to this group's new position or animated separately if complex */}
        <polyline points="15,10 15,14 12,12 15,14 18,12" stroke="white" strokeWidth="1.5" fill="none" />
      </motion.g>
    </svg>
  );
};
export default NormalFaultIcon;
