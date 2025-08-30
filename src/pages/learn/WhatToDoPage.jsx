// src/pages/learn/WhatToDoPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "What to do Before, During, and After an Earthquake" learning page.
 * This page provides practical advice on earthquake preparedness and safety.
 *
 * @component
 * @returns {JSX.Element} The WhatToDoPage component.
 */
const WhatToDoPage = () => {
  return (
    <>
      <SeoMetadata
        title="What to Do Before, During, and After an Earthquake | Learn | Seismic Monitor"
        description="Learn how to prepare for an earthquake, what to do during one, and how to stay safe afterwards. This guide provides essential tips for earthquake safety."
        keywords="earthquake safety, earthquake preparedness, what to do in an earthquake, earthquake survival guide, before an earthquake, during an earthquake, after an earthquake"
        pageUrl="https://earthquakeslive.com/learn/what-to-do-in-an-earthquake"
        canonicalUrl="https://earthquakeslive.com/learn/what-to-do-in-an-earthquake"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          What to Do Before, During, and After an Earthquake
        </h1>

        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 mt-6 mb-2">Before an Earthquake</h2>
          <ul className="list-disc list-inside space-y-2 text-slate-300">
            <li>Secure heavy items in your home like bookcases, refrigerators, and water heaters to the walls.</li>
            <li>Create a disaster preparedness kit with water, non-perishable food, a flashlight, a first-aid kit, and any necessary medications.</li>
            <li>Identify safe spots in each room, such as under a sturdy table or desk.</li>
            <li>Have an emergency plan with your family. Decide on a meeting place if you get separated.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 mt-6 mb-2">During an Earthquake</h2>
          <ul className="list-disc list-inside space-y-2 text-slate-300">
            <li><strong>If you are indoors:</strong> Drop, Cover, and Hold On. Get under a sturdy piece of furniture and hold on. Stay away from windows, and outer walls.</li>
            <li><strong>If you are outdoors:</strong> Stay outdoors and move to an open area away from buildings, trees, and power lines.</li>
            <li><strong>If you are in a moving vehicle:</strong> Stop as quickly as safety permits and stay in the vehicle. Avoid stopping near or under buildings, trees, overpasses, and utility wires.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 mt-6 mb-2">After an Earthquake</h2>
          <ul className="list-disc list-inside space-y-2 text-slate-300">
            <li>Check yourself for injuries and get to a safe place.</li>
            <li>Check on others and provide aid if you are trained to do so.</li>
            <li>Be prepared for aftershocks.</li>
            <li>Listen to a battery-operated radio or television for the latest emergency information.</li>
            <li>Inspect your home for damage. If you smell gas, open a window and leave quickly.</li>
          </ul>
        </section>

        <div className="mt-6">
          <Link to="/learn" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            &larr; Back to Learn Topics
          </Link>
        </div>
      </div>
    </>
  );
};

export default WhatToDoPage;
