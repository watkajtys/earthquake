import React, { useState, useContext, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UIStateContext } from './uiStateContextUtils.js';

/**
 * @file Manages the UI state of the application, including sidebar view, feed period, and globe focus.
 * @module UIStateContext
 */

/**
 * Provides UI state to its children components.
 * This provider manages the active sidebar view, the selected feed period, and globe-focusing parameters,
 * syncing relevant states with URL search parameters.
 *
 * @param {object} props - The component props.
 * @param {React.ReactNode} props.children - The child components that will have access to this context.
 * @returns {JSX.Element} The `UIStateProvider` component.
 */
export const UIStateProvider = ({ children }) => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Sidebar View State
    const [activeSidebarView, setActiveSidebarView_internal] = useState(
        searchParams.get('sidebarActiveView') || 'overview_panel'
    );
    const [activeFeedPeriod, setActiveFeedPeriod_internal] = useState(
        searchParams.get('activeFeedPeriod') || 'last_24_hours'
    );
    const [globeFocusLng, setGlobeFocusLng_internal] = useState(0);
    const [focusedNotableQuake, setFocusedNotableQuake_internal] = useState(null);

    // PERFORMANCE & SYNC NOTE:
    // This effect synchronizes the 'activeSidebarView' state FROM the URL search parameters.
    // It intentionally only depends on 'searchParams'. This ensures that changes triggered
    // by browser navigation (back/forward buttons) or direct URL manipulation update the state.
    // Programmatic changes to sidebar view initiated by the app (e.g., button clicks)
    // are handled by 'changeSidebarView', which updates both the internal state
    // and the URL search parameters. Keeping 'activeSidebarView' out of the dependency array
    // here prevents potential redundant state updates if 'searchParams' and 'activeSidebarView'
    // were to update in a way that re-triggers this effect unnecessarily.
    // Effect to update activeSidebarView from URL search parameter.
    useEffect(() => {
        const currentQueryParam = searchParams.get('sidebarActiveView');
        if (currentQueryParam && currentQueryParam !== activeSidebarView) {
            setActiveSidebarView_internal(currentQueryParam);
        }
    }, [searchParams]);

    /**
     * Updates the active sidebar view and syncs it with the URL search parameter.
     *
     * @param {string} view - The identifier for the new sidebar view. Defaults to 'overview_panel'.
     */
    const changeSidebarView = useCallback((view) => {
        const newView = view || 'overview_panel';
        setActiveSidebarView_internal(newView);
        if (searchParams.get('sidebarActiveView') !== newView) {
            setSearchParams(prevParams => {
                const newSearchQuery = new URLSearchParams(prevParams);
                newSearchQuery.set('sidebarActiveView', newView);
                return newSearchQuery;
            }, { replace: true });
        }
    }, [setSearchParams, searchParams]);

    // PERFORMANCE & SYNC NOTE:
    // This effect synchronizes the 'activeFeedPeriod' state FROM the URL search parameters.
    // It intentionally only depends on 'searchParams'. This ensures that changes triggered
    // by browser navigation or direct URL manipulation update the state.
    // Programmatic changes to the feed period initiated by the app
    // are handled by 'changeActiveFeedPeriod', which updates both the internal state
    // and the URL search parameters. Keeping 'activeFeedPeriod' out of the dependency array
    // here prevents potential redundant state updates.
    // Effect to update activeFeedPeriod from URL search parameter.
    useEffect(() => {
        const currentQueryParam = searchParams.get('activeFeedPeriod');
        if (currentQueryParam && currentQueryParam !== activeFeedPeriod) {
            setActiveFeedPeriod_internal(currentQueryParam);
        }
    }, [searchParams]);

    /**
     * Updates the active earthquake feed period and syncs it with the URL search parameter.
     *
     * @param {string} period - The identifier for the new feed period. Defaults to 'last_24_hours'.
     */
    const changeActiveFeedPeriod = useCallback((period) => {
        const newPeriod = period || 'last_24_hours';
        setActiveFeedPeriod_internal(newPeriod);
        if (searchParams.get('activeFeedPeriod') !== newPeriod) {
            setSearchParams(prevParams => {
                const newSearchQuery = new URLSearchParams(prevParams);
                newSearchQuery.set('activeFeedPeriod', newPeriod);
                return newSearchQuery;
            }, { replace: true });
        }
    }, [setSearchParams, searchParams]);

    /**
     * Sets the target longitude for focusing the interactive globe.
     * This state is not synced with the URL.
     *
     * @param {number} lng - The longitude value for the globe to focus on.
     */
    const setGlobeFocusLng = useCallback((lng) => {
        setGlobeFocusLng_internal(lng);
    }, []);

    /**
     * Sets the data for a notable earthquake to be highlighted in the UI.
     * This state is not synced with the URL.
     *
     * @param {object|null} quake - The earthquake data object, or `null` to clear the focus.
     */
    const setFocusedNotableQuake = useCallback((quake) => {
        setFocusedNotableQuake_internal(quake);
    }, []);

    // Context value includes current states and their respective updater functions.
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

/**
 * Custom hook for consuming the `UIStateContext`.
 * This hook provides access to the UI states and their setter functions.
 * It will throw an error if used outside of a `UIStateProvider` to ensure state consistency.
 *
 * @returns {object} The context value, including UI states and their corresponding setters.
 * @throws {Error} If the hook is not used within a `UIStateProvider`.
 */
export const useUIState = () => {
    const context = useContext(UIStateContext);
    if (context === undefined) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
};
