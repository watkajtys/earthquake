import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const UIStateContext = createContext();

// Provider component
export const UIStateProvider = ({ children }) => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Sidebar View State
    const [activeSidebarView, setActiveSidebarView_internal] = useState(
        searchParams.get('sidebarActiveView') || 'overview_panel'
    );

    // Active Feed Period State
    const [activeFeedPeriod, setActiveFeedPeriod_internal] = useState(
        searchParams.get('activeFeedPeriod') || 'last_24_hours' // Default feed period
    );

    // Globe Focus Longitude State
    const [globeFocusLng, setGlobeFocusLng_internal] = useState(0);

    // Focused Notable Quake State
    const [focusedNotableQuake, setFocusedNotableQuake_internal] = useState(null);


    // Effect for activeSidebarView URL sync
    useEffect(() => {
        const currentQueryParam = searchParams.get('sidebarActiveView');
        if (currentQueryParam && currentQueryParam !== activeSidebarView) {
            setActiveSidebarView_internal(currentQueryParam);
        }
    }, [searchParams]); // Removed activeSidebarView from dependencies

    const changeSidebarView = useCallback((view) => {
        const newView = view || 'overview_panel';
        setActiveSidebarView_internal(newView);
        if (searchParams.get('sidebarActiveView') !== newView) {
            setSearchParams(prevParams => {
                const newSearchQuery = new URLSearchParams(prevParams);
                newSearchQuery.set('sidebarActiveView', newView);
                return newSearchQuery;
            }, { replace: true }); // Using replace to avoid multiple history entries for simple UI changes
        }
    }, [setSearchParams, searchParams]);


    // Effect for activeFeedPeriod URL sync
    useEffect(() => {
        const currentQueryParam = searchParams.get('activeFeedPeriod');
        if (currentQueryParam && currentQueryParam !== activeFeedPeriod) {
            setActiveFeedPeriod_internal(currentQueryParam);
        }
    }, [searchParams]); // Removed activeFeedPeriod from dependencies

    const changeActiveFeedPeriod = useCallback((period) => {
        const newPeriod = period || 'last_24_hours'; // Default if null/empty
        setActiveFeedPeriod_internal(newPeriod);
        if (searchParams.get('activeFeedPeriod') !== newPeriod) {
            setSearchParams(prevParams => {
                const newSearchQuery = new URLSearchParams(prevParams);
                newSearchQuery.set('activeFeedPeriod', newPeriod);
                // Preserve other params like sidebarActiveView
                // const currentSidebarView = prevParams.get('sidebarActiveView');
                // if (currentSidebarView) newSearchQuery.set('sidebarActiveView', currentSidebarView);
                return newSearchQuery;
            }, { replace: true });
        }
    }, [setSearchParams, searchParams]);

    // Setter for globeFocusLng (no URL sync)
    const setGlobeFocusLng = useCallback((lng) => {
        setGlobeFocusLng_internal(lng);
    }, []);

    // Setter for focusedNotableQuake (no URL sync)
    const setFocusedNotableQuake = useCallback((quake) => {
        setFocusedNotableQuake_internal(quake);
    }, []);


    const value = {
        activeSidebarView,
        setActiveSidebarView: changeSidebarView,
        
        activeFeedPeriod,
        setActiveFeedPeriod: changeActiveFeedPeriod,

        globeFocusLng,
        setGlobeFocusLng,

        focusedNotableQuake,
        setFocusedNotableQuake,
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

// Trivial change to attempt to bust cache
// [end of src/contexts/UIStateContext.jsx]
