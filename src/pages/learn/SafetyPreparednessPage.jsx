// src/pages/learn/SafetyPreparednessPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Earthquake Safety and Preparedness" learning page.
 * This page provides practical advice on how to prepare for, survive, and recover from an earthquake.
 *
 * @component
 * @returns {JSX.Element} The SafetyPreparednessPage component.
 */
const SafetyPreparednessPage = () => {
  return (
    <>
      <SeoMetadata
        title="Earthquake Safety and Preparedness | Learn | Seismic Monitor"
        description="Learn how to prepare for an earthquake, what to do during the shaking, and how to stay safe afterward. Your guide to earthquake safety."
        keywords="earthquake safety, earthquake preparedness, what to do in an earthquake, earthquake kit, drop cover and hold on, learn seismology"
        pageUrl="https://earthquakeslive.com/learn/safety-preparedness"
        canonicalUrl="https://earthquakeslive.com/learn/safety-preparedness"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Earthquake Safety and Preparedness
        </h1>
        <p className="text-slate-300">
          Being prepared for an earthquake can make a significant difference in your safety and recovery.
          This guide outlines essential steps to take before, during, and after an earthquake.
        </p>

        <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-4">Before an Earthquake</h2>
        <ul className="list-disc list-inside space-y-2 text-slate-300">
          <li><strong>Secure Your Space:</strong> Bolt and brace water heaters and gas appliances. Secure heavy furniture, cupboards, and appliances to walls. Store heavy and breakable objects on low shelves.</li>
          <li><strong>Create a Plan:</strong> Identify safe spots in each room (under a sturdy table, against an interior wall). Establish a meeting point for your family after an earthquake.</li>
          <li><strong>Prepare a Disaster Kit:</strong> Assemble a kit with water, non-perishable food, a flashlight, a first-aid kit, a whistle, and any necessary medications.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-4">During an Earthquake</h2>
        <ul className="list-disc list-inside space-y-2 text-slate-300">
          <li><strong>Drop, Cover, and Hold On:</strong> If you are indoors, drop to the ground, take cover under a sturdy table or desk, and hold on until the shaking stops.</li>
          - <li><strong>Stay Indoors:</strong> Do not run outside or to other rooms during an earthquake. You are less likely to be injured if you stay where you are.</li>
          - <li><strong>If Outdoors:</strong> Move to an open area away from buildings, trees, and power lines.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-4">After an Earthquake</h2>
        <ul className="list-disc list-inside space-y-2 text-slate-300">
          <li><strong>Check for Injuries:</strong> Provide first aid for any injuries.</li>
          <li><strong>Check for Hazards:</strong> Look for and extinguish small fires. Check for gas leaks. If you smell gas, open all the windows and leave the house.</li>
          <li><strong>Be Prepared for Aftershocks:</strong> Aftershocks are smaller earthquakes that can occur after the main event. Be prepared to Drop, Cover, and Hold On again.</li>
        </ul>

        <div className="mt-6">
          <Link to="/learn" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            &larr; Back to Learn Topics
          </Link>
        </div>
      </div>
    </>
  );
};

export default SafetyPreparednessPage;
