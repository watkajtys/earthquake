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
        description="Discover how seismographs detect and record earthquakes, and learn about the different scales (like Richter and Moment Magnitude) used to quantify their size."
        keywords="measuring earthquakes, seismographs, seismic scales, richter scale, moment magnitude scale, seismology, earthquake detection, learn seismology"
        pageUrl="https://earthquakeslive.com/learn/measuring-earthquakes"
        canonicalUrl="https://earthquakeslive.com/learn/measuring-earthquakes"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          How Earthquakes Are Measured (Seismographs & Scales)
        </h1>
        <p className="text-slate-300">
          Content for 'How Earthquakes Are Measured (Seismographs & Scales)' coming soon!
          This article will delve into the instruments, like seismographs, that detect and record seismic waves,
          and explain the various scales used to measure an earthquake's magnitude.
        </p>
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
