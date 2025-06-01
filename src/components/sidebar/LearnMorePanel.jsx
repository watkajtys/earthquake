// src/components/sidebar/LearnMorePanel.jsx
import React from 'react';
import InfoSnippet from '../InfoSnippet';

const LearnMorePanel = () => {
    return (
        <div className="p-2 bg-slate-700 rounded-md">
            <h3 className="text-md font-semibold text-indigo-400 mb-2">Learn About Earthquakes</h3>
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
        </div>
    );
};

export default LearnMorePanel;
