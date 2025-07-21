// src/pages/learn/EarthquakeSafetyPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Earthquake Safety" learning page.
 * Currently, this page serves as a placeholder indicating that content is "coming soon".
 * It includes SEO metadata relevant to the topic and a link to navigate back
 * to the main "Learn About Earthquakes" page.
 * This component takes no direct props.
 *
 * @component
 * @returns {JSX.Element} The EarthquakeSafetyPage component.
 */
const EarthquakeSafetyPage = () => {
  return (
    <>
      <SeoMetadata
        title="Earthquake Safety Tips | Learn | Seismic Monitor"
        description="Learn how to prepare for, survive, and recover from an earthquake. Essential safety tips for you and your family."
        keywords="earthquake safety, earthquake preparedness, what to do in an earthquake, earthquake survival, emergency kit"
        pageUrl="https://earthquakeslive.com/learn/earthquake-safety"
        canonicalUrl="https://earthquakeslive.com/learn/earthquake-safety"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Earthquake Safety: Be Prepared
        </h1>
        <p className="text-slate-300">
          Content for 'Earthquake Safety' coming soon!
          This article will provide essential tips on how to prepare for an earthquake, what to do during one,
          and how to stay safe afterward.
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

export default EarthquakeSafetyPage;
