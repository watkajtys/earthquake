// src/pages/learn/MeasuringEarthquakesPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "How Earthquakes Are Measured" learning page.
 * Currently, this page serves as a placeholder indicating that content is "coming soon".
 * It includes SEO metadata relevant to the topic and a link to navigate back
 * to the main "Learn About Earthquakes" page.
 * This component takes no direct props.
 *
 * @component
 * @returns {JSX.Element} The MeasuringEarthquakesPage component.
 */
const MeasuringEarthquakesPage = () => {
  return (
    <>
      <SeoMetadata
        title="How Earthquakes Are Measured | Learn | Seismic Monitor"
        description="Discover how seismographs detect and record seismic waves, and learn about the modern scales like the Moment Magnitude Scale (Mw) used to quantify their size."
        keywords="measuring earthquakes, seismographs, seismic scales, richter scale, moment magnitude scale, mw, seismology, earthquake detection, how are earthquakes measured, seismogram"
        pageUrl="https://earthquakeslive.com/learn/measuring-earthquakes"
        canonicalUrl="https://earthquakeslive.com/learn/measuring-earthquakes"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          How Earthquakes Are Measured
        </h1>
        <div className="space-y-4">
          <p className="text-lg">
            When an earthquake occurs, it releases energy in the form of seismic waves that travel through the Earth. Scientists measure the size of an earthquake using instruments called seismographs, and report it using a magnitude scale.
          </p>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">Detecting Seismic Waves: The Seismograph</h2>
          <p>
            A seismograph is an instrument that records the ground's motion. A simple seismograph consists of a heavy weight suspended from a frame. When the ground shakes, the frame moves with it, but the weight's inertia keeps it relatively still. A pen attached to the weight records the relative motion on a rotating drum of paper, creating a record called a seismogram.
          </p>
          <p>
            Modern seismic stations use sophisticated electronic sensors that can detect even the faintest vibrations. These stations are part of a global network that allows seismologists to record and analyze earthquakes from all over the world.
          </p>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">Quantifying Size: Magnitude Scales</h2>
          <p>
            Magnitude is a measure of the energy released at the earthquake's source (the hypocenter). It's a single, objective number for a given earthquake. Several scales have been developed over the years.
          </p>

          <div className="pl-4 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">The Richter Scale (ML)</h3>
              <p className="mt-1">
                Developed in the 1930s by Charles F. Richter, this was the first widely used magnitude scale. It is a logarithmic scale, meaning a magnitude 5 earthquake has 10 times the ground motion of a magnitude 4. However, the Richter scale has limitations and is no longer commonly used for large, distant earthquakes. It is most accurate for small to moderate earthquakes recorded locally.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-indigo-400">The Moment Magnitude Scale (Mw)</h3>
              <p className="mt-1">
                Today, seismologists prefer the Moment Magnitude Scale (Mw). It is a more accurate measure of an earthquake's total energy release. The "moment" is calculated from the slip on the fault, the area of the fault that slipped, and the rigidity of the rock.
              </p>
              <p className="mt-2">
                The Mw scale is also logarithmic and is carefully calibrated to be roughly consistent with the Richter scale for smaller events. Crucially, it does not "saturate" for very large earthquakes, meaning it can accurately measure the size of even the most powerful events (M8 and greater). This is why the Moment Magnitude scale is the modern standard for reporting the size of significant earthquakes.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-6">
          <Link to="/learn" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            &larr; Back to Learn Topics
          </Link>
        </div>
      </div>
    </>
  );
};

export default MeasuringEarthquakesPage;
