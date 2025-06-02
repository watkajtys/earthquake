// src/contexts/UIStateContext.jsx
import React, { createContext, useState, useContext, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const UIStateContext = createContext();

export const UIStateProvider = ({ children }) => {
    const [selectedEarthquakeId, setSelectedEarthquakeId] = useState(null);
    const [selectedClusterId, setSelectedClusterId] = useState(null);

    const [searchParams, setSearchParams] = useSearchParams();
    const [activeSidebarView, setActiveSidebarViewState] = useState(searchParams.get('sidebarActiveView') || 'overview_panel');

    const setActiveSidebarView = useCallback((view) => {
        setActiveSidebarViewState(view);
        setSearchParams(prevParams => {
            const newParams = new URLSearchParams(prevParams);
            newParams.set('sidebarActiveView', view);
            return newParams;
        });
    }, [setSearchParams]);

    const value = {
        selectedEarthquakeId,
        setSelectedEarthquakeId,
        selectedClusterId,
        setSelectedClusterId,
        activeSidebarView,
        setActiveSidebarView,
    };

    return (
        <UIStateContext.Provider value={value}>
            {children}
        </UIStateContext.Provider>
    );
};

export const useUIState = () => {
    const context = useContext(UIStateContext);
    if (context === undefined) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
};
