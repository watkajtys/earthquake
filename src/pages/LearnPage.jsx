// src/pages/LearnPage.jsx
import React from 'react';
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
            {/* Adjusted main div for better desktop layout and to remove lg:hidden */}
            <div className="p-3 md:p-4 space-y-4 text-slate-200 lg:max-w-4xl lg:mx-auto">
                <h1 className="text-xl md:text-2xl font-bold text-indigo-400 sticky top-0 lg:static bg-slate-900 py-2 z-10 -mx-3 px-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:px-0 border-b border-slate-700 lg:border-b-0 mb-4">
                    Learn About Earthquakes
                </h1>

                <section className="space-y-3"> {/* Added section for better grouping */}
                    <h2 className="text-lg md:text-xl font-semibold text-indigo-300 mb-2 border-b border-slate-700 pb-1">Key Seismic Concepts</h2>
                    <InfoSnippet topic="magnitude" />
                    <InfoSnippet topic="depth" />
                    <InfoSnippet topic="intensity" />
                </section>

                <section className="space-y-3"> {/* Added section */}
                    <h2 className="text-lg md:text-xl font-semibold text-indigo-300 mb-2 border-b border-slate-700 pb-1">Understanding Earthquake Details</h2>
                <InfoSnippet topic="alerts" />
                <InfoSnippet topic="strike"/>
                <InfoSnippet topic="dip"/>
                <InfoSnippet topic="rake"/>
                <InfoSnippet topic="stressAxes"/>
                <InfoSnippet topic="beachball"/>
                <InfoSnippet topic="stationsUsed"/>
                <InfoSnippet topic="azimuthalGap"/>
                <InfoSnippet topic="rmsError"/>
                </section>

                {/* Add more sections or detailed explanations as needed */}
                 <section className="space-y-3">
                    <h2 className="text-lg md:text-xl font-semibold text-indigo-300 mb-2 border-b border-slate-700 pb-1">Further Topics</h2>
                    <p className="text-sm text-slate-300">
                        This section can be expanded with more information on earthquake preparedness, historical earthquakes, or advanced seismology topics.
                    </p>
                </section>
            </div>
        </>
    );
};

export default LearnPage;
