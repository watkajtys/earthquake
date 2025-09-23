// src/pages/learn/EarthquakeSafetyPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

/**
 * Renders the "Earthquake Safety and Preparedness" learning page.
 * This page provides practical advice on what to do before, during, and after an earthquake.
 *
 * @component
 * @returns {JSX.Element} The EarthquakeSafetyPage component.
 */
const EarthquakeSafetyPage = () => {
  return (
    <>
      <SeoMetadata
        title="Earthquake Safety: Before, During & After | Learn | Seismic Monitor"
        description="Learn how to prepare for an earthquake, what to do during the shaking (Drop, Cover, and Hold On), and how to stay safe afterward. Your guide to earthquake preparedness."
        keywords="earthquake safety, earthquake preparedness, what to do in an earthquake, drop cover hold on, earthquake kit, seismic safety, emergency preparedness"
        pageUrl="https://earthquakeslive.com/learn/earthquake-safety"
        canonicalUrl="https://earthquakeslive.com/learn/earthquake-safety"
        type="article"
      />
      <div className="p-3 md:p-4 space-y-4 text-slate-200 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">
          Earthquake Safety: How to Prepare and Respond
        </h1>
        <div className="space-y-4">
          <p className="text-lg">
            Earthquakes can strike without warning, so preparation is key to staying safe. Knowing what to do before, during, and after the shaking can protect you and your loved ones.
          </p>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">Before an Earthquake: Prepare Your Home and Family</h2>
          <p>
            The best way to reduce risk is to prepare in advance.
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Secure Your Space:</strong> Anchor heavy furniture like bookshelves and water heaters to walls. Store heavy items on lower shelves.</li>
            <li><strong>Create a Plan:</strong> Identify safe spots in each room (under a sturdy table, against an interior wall). Establish a meeting point for your family after an earthquake.</li>
            <li><strong>Build an Emergency Kit:</strong> Your kit should include water, non-perishable food, a flashlight, a first-aid kit, a whistle, and any necessary medications.</li>
            <li><strong>Know Your Utilities:</strong> Learn how to shut off gas, water, and electricity in your home.</li>
          </ul>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">During an Earthquake: Drop, Cover, and Hold On</h2>
          <p>
            This simple phrase can save your life.
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>If you are indoors,</strong> DROP to the ground, take COVER under a sturdy desk or table, and HOLD ON to it until the shaking stops. If there's no table, cover your head and neck with your arms and crawl to an interior wall.</li>
            <li><strong>If you are outdoors,</strong> stay outdoors and move to an open area away from buildings, trees, and power lines.</li>
            <li><strong>If you are in a vehicle,</strong> pull over to a clear location, stop, and stay in the vehicle with your seatbelt fastened until the shaking stops. Avoid bridges and overpasses.</li>
          </ul>

          <h2 className="text-xl md:text-2xl font-semibold text-indigo-300 pt-2">After an Earthquake: Stay Safe and Informed</h2>
          <p>
            The danger is not over when the shaking stops. Be prepared for aftershocks.
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Check for Injuries:</strong> Administer first aid if you are trained.</li>
            <li><strong>Check for Hazards:</strong> Look for fires, gas leaks, and structural damage. If you smell gas, open a window and leave immediately.</li>
            <li><strong>Stay Informed:</strong> Use a battery-powered radio or your phone to listen for emergency updates and instructions.</li>
            <li><strong>Evacuate if Necessary:</strong> If your home is damaged, get out. Follow your family's emergency plan.</li>
          </ul>
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

export default EarthquakeSafetyPage;
