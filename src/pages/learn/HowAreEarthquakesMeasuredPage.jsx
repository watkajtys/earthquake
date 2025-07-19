// src/pages/learn/HowAreEarthquakesMeasuredPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "How Are Earthquakes Measured?" learning page.
 * This page will detail the instruments and scales used to measure earthquakes,
 * such as seismographs, the Richter scale, and the Moment Magnitude Scale.
 * It includes SEO metadata and a link back to the main learning page.
 *
 * @component
 * @returns {JSX.Element} The HowAreEarthquakesMeasuredPage component.
 */
const HowAreEarthquakesMeasuredPage = () => {
  return (
    <>
      <SeoMetadata
        title="How Are Earthquakes Measured? | Learn | Seismic Monitor"
        description="Discover the science and technology behind earthquake measurement, including seismographs, the Richter scale, and the Moment Magnitude Scale."
        keywords="how are earthquakes measured, seismograph, Richter scale, Moment Magnitude Scale, earthquake magnitude, earthquake intensity, learn seismology"
        pageUrl="https://earthquakeslive.com/learn/how-are-earthquakes-measured"
        canonicalUrl="https://earthquakeslive.com/learn/how-are-earthquakes-measured"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          How Are Earthquakes Measured?
        </h1>
        <div className="space-y-4 text-slate-300">
          <p>
            When an earthquake occurs, scientists need a way to quantify its strength. Over the years,
            seismologists have developed various scales and instruments to measure the energy released
            by an earthquake. Understanding these measurements is key to assessing an earthquake's potential impact.
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">Seismographs: Listening to the Earth</h2>
          <p>
            The primary tool used to detect and record earthquakes is a <strong>seismograph</strong>.
            This instrument is sensitive enough to detect the faintest seismic waves. A simple seismograph
            consists of a heavy weight suspended from a frame. When the ground shakes, the frame moves with it,
            but the inertia of the weight keeps it relatively still. A pen attached to the weight records the
            vibrations on a rotating drum of paper, creating a record called a <strong>seismogram</strong>.
            Modern systems use electronics to record the data digitally, providing much more precise readings.
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">The Richter Scale: A Historical Perspective</h2>
          <p>
            Developed in 1935 by Charles F. Richter, the <strong>Richter scale</strong> was one of the first widely
            used methods for rating the magnitude of an earthquake. It is a logarithmic scale, meaning that for each
            whole number you go up on the scale, the amplitude of the ground motion recorded by a seismograph
            increases by a factor of 10. For example, a magnitude 5.0 earthquake produces 10 times more ground
            shaking than a magnitude 4.0 earthquake.
          </p>
          <p>
            However, the Richter scale has limitations. It is most accurate for moderate, nearby earthquakes and
            can be less reliable for larger or more distant ones. For this reason, it has been largely superseded
            by a more modern and physically meaningful scale.
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">The Moment Magnitude Scale (MMS)</h2>
          <p>
            Today, the <strong>Moment Magnitude Scale (MMS)</strong> is the standard used by seismologists for
            measuring medium-to-large earthquakes. It measures the total energy released by an earthquake, known
            as the seismic moment. The seismic moment is calculated based on several factors, including:
          </p>
          <ul className="list-disc list-inside pl-4 space-y-2">
            <li>The rigidity of the rock along the fault.</li>
            <li>The area of the fault that slipped.</li>
            <li>The average amount of slip (distance the rock moved).</li>
          </ul>
          <p>
            Like the Richter scale, the MMS is logarithmic. The values are calibrated to be roughly comparable
            to the Richter scale, but the MMS provides a more accurate measure of the total energy released,
            especially for large earthquakes (magnitude 8 and above). It works over a wider range of earthquake
            sizes and is valid regardless of the distance from the epicenter.
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-indigo-400 pt-2">Magnitude vs. Intensity</h2>
          <p>
            It is important to distinguish between an earthquake's <strong>magnitude</strong> and its{' '}
            <strong>intensity</strong>. Magnitude measures the energy released at the source (the hypocenter),
            and each earthquake has only one magnitude value. Intensity, on the other hand, describes the
            degree of shaking and damage at a specific location. Intensity varies from place to place and is
            often measured using the Modified Mercalli Intensity (MMI) scale.
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

export default HowAreEarthquakesMeasuredPage;
