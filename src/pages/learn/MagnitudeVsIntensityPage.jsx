// src/pages/learn/MagnitudeVsIntensityPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Magnitude vs. Intensity" learning page.
 * Currently, this page serves as a placeholder indicating that content is "coming soon".
 * It includes SEO metadata relevant to the topic and a link to navigate back
 * to the main "Learn About Earthquakes" page.
 * This component takes no direct props.
 *
 * @component
 * @returns {JSX.Element} The MagnitudeVsIntensityPage component.
 */
const MagnitudeVsIntensityPage = () => {
  return (
    <>
      <SeoMetadata
        title="Magnitude vs. Intensity | Learn | Seismic Monitor"
        description="Learn the crucial difference between earthquake magnitude (the energy released at the source) and intensity (the shaking and damage experienced at a location)."
        keywords="earthquake magnitude, earthquake intensity, richter scale, modified mercalli intensity scale, mmi, seismic energy, earthquake shaking, learn seismology, magnitude vs intensity"
        pageUrl="https://earthquakeslive.com/learn/magnitude-vs-intensity"
        canonicalUrl="https://earthquakeslive.com/learn/magnitude-vs-intensity"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Earthquake Magnitude vs. Intensity: What's the Difference?
        </h1>
        <div className="space-y-4">
          <p className="text-lg">
            In the world of seismology, "magnitude" and "intensity" are two terms that are often used interchangeably by the public, but they measure fundamentally different aspects of an earthquake. Understanding the distinction is key to grasping the full picture of a seismic event.
          </p>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">Magnitude: The Energy Released</h2>
          <p>
            Magnitude is a single, fixed number that quantifies the total amount of energy released by an earthquake at its source (the hypocenter). It is calculated from seismic recordings made by seismographs.
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>One Number per Earthquake:</strong> An earthquake has only one magnitude. For example, the 2011 Tōhoku earthquake in Japan had a magnitude of 9.1.</li>
            <li><strong>Objective Measurement:</strong> It's an objective measurement based on instrument data, primarily using the Moment Magnitude Scale (Mw).</li>
            <li><strong>Logarithmic Scale:</strong> For each whole number increase on the scale, the seismic energy released increases by about 32 times.</li>
          </ul>
          <p className="mt-2">
            Think of magnitude as the power of a bomb. It's a measure of the total explosive force, regardless of where you are standing when it goes off.
          </p>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">Intensity: The Shaking We Feel</h2>
          <p>
            Intensity describes the effects of an earthquake at a specific location. It measures the strength of shaking and the resulting damage to people, buildings, and the environment.
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Many Values per Earthquake:</strong> An earthquake produces a range of intensity values, which are highest near the epicenter and generally decrease with distance.</li>
            <li><strong>Subjective and Observational:</strong> Intensity is determined from witness reports and damage assessments. In the U.S., the Modified Mercalli Intensity (MMI) scale is used, which ranks effects from I (Not Felt) to X (Extreme).</li>
            <li><strong>Influenced by Local Factors:</strong> The intensity you experience depends on your distance from the epicenter, the local geology (soft soil can amplify shaking), and building construction quality.</li>
          </ul>
          <p className="mt-2">
            Think of intensity as the experience of the bomb's explosion. Being closer to the blast results in a higher intensity (more shaking, more damage) than being farther away.
          </p>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">Key Takeaway</h2>
          <p>
            <strong>Magnitude</strong> is the cause—the energy released at the earthquake's source. <strong>Intensity</strong> is the effect—the severity of shaking at a particular place. A single, large-magnitude earthquake can produce low intensities in distant locations and very high intensities close to the epicenter.
          </p>
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

export default MagnitudeVsIntensityPage;
