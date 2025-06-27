import { useLayoutEffect } from 'react';

export const useViewportHeight = () => {
  useLayoutEffect(() => {
    const setViewportHeight = () => {
      // We use the visualViewport API if it's available, otherwise we fall back to innerHeight.
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
    };

    // Set the height on initial load
    setViewportHeight();

    // Add event listeners for resize and orientation changes
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setViewportHeight);
    } else {
      window.addEventListener('resize', setViewportHeight);
    }
    window.addEventListener('orientationchange', setViewportHeight);

    // Clean up the event listeners on component unmount
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setViewportHeight);
      } else {
        window.removeEventListener('resize', setViewportHeight);
      }
      window.removeEventListener('orientationchange', setViewportHeight);
    };
  }, []);
};
