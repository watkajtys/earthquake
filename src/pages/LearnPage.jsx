// src/pages/LearnPage.jsx
import React from 'react';
import { Link } from 'react-router-dom'; // Added Link import
import SeoMetadata from '../components/SeoMetadata';
import InfoSnippet from '../components/InfoSnippet';
// Import any other components specific to the previous inline learn page content

const LearnPage = () => {
    // This component will replicate the JSX structure previously under the /learn Route in HomePage.jsx
    return (
        <>
            <SeoMetadata
                title="Learn About Earthquakes | Seismic Science & Terminology Explained"
                description="Understand earthquake science: magnitude, depth, fault types, seismic waves, PAGER alerts, and how to interpret earthquake data. Your guide to seismology."
                keywords="earthquake science, seismology basics, earthquake magnitude, earthquake depth, fault types, seismic waves, PAGER alerts, earthquake education, seismology terms"
                pageUrl="https://earthquakeslive.com/learn"
                canonicalUrl="https://earthquakeslive.com/learn"
                locale="en_US"
                type="website"
            />
            <div className="p-3 md:p-4 h-full space-y-2 text-slate-200 lg:hidden">
                <h2 className="text-lg font-semibold text-indigo-400 sticky top-0 bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 border-b border-slate-700">
                    Learn About Earthquakes
                </h2>
                <InfoSnippet topic="magnitude" />
                <InfoSnippet topic="depth" />
                <InfoSnippet topic="intensity" />
                <InfoSnippet topic="alerts" />
                <InfoSnippet topic="strike"/>
                <InfoSnippet topic="dip"/>
                <InfoSnippet topic="rake"/>
                <InfoSnippet topic="stressAxes"/>
                <InfoSnippet topic="beachball"/>
                <InfoSnippet topic="stationsUsed"/>
                <InfoSnippet topic="azimuthalGap"/>
                <InfoSnippet topic="rmsError"/>

                {/* New section for further reading */}
                <div className="mt-6 pt-4 border-t border-slate-700">
                    <h3 className="text-md font-semibold text-indigo-300 mb-3">
                        Further Reading & In-depth Topics
                    </h3>
                    <ul className="space-y-2 list-disc list-inside pl-1">
                        <li>
                            <Link to="/learn/magnitude-vs-intensity" className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">
                                Understanding Earthquake Magnitude vs. Intensity
                            </Link>
                        </li>
                        <li>
                            <Link to="/learn/measuring-earthquakes" className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">
                                How Earthquakes Are Measured (Seismographs & Scales)
                            </Link>
                        </li>
                        <li>
                            <Link to="/learn/plate-tectonics" className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">
                                Plate Tectonics and Earthquakes
                            </Link>
                        </li>
                    </ul>
                </div>
                 {/* ... other content from /learn route ... */}
            </div>
        </>
    );
};

export default LearnPage;
