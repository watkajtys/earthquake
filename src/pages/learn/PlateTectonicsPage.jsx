// src/pages/learn/PlateTectonicsPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Plate Tectonics and Earthquakes" learning page.
 * Currently, this page serves as a placeholder indicating that content is "coming soon".
 * It includes SEO metadata relevant to the topic and a link to navigate back
 * to the main "Learn About Earthquakes" page.
 * This component takes no direct props.
 *
 * @component
 * @returns {JSX.Element} The PlateTectonicsPage component.
 */
const PlateTectonicsPage = () => {
  return (
    <>
      <SeoMetadata
        title="Plate Tectonics and Earthquakes | Learn | Seismic Monitor"
        description="Explore the fundamental connection between plate tectonics, fault lines, and the generation of earthquakes around the globe."
        keywords="plate tectonics, fault lines, earthquakes, tectonic plates, seismic activity, earth science, learn seismology"
        pageUrl="https://earthquakeslive.com/learn/plate-tectonics"
        canonicalUrl="https://earthquakeslive.com/learn/plate-tectonics"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Plate Tectonics and Earthquakes
        </h1>
        <p className="text-slate-300">
          Content for 'Plate Tectonics and Earthquakes' coming soon!
          This article will explain the theory of plate tectonics and how the movement and interaction
          of Earth's lithospheric plates lead to seismic events.
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

export default PlateTectonicsPage;
