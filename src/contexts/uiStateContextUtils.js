/**
 * @file Defines the context and utility functions for managing the application's UI state.
 * @module uiStateContextUtils
 */

import { createContext } from 'react';

/**
 * React Context for managing the global UI state.
 * This context provides access to UI-related states, such as the active sidebar view,
 * selected feed period, and parameters for focusing the interactive globe.
 *
 * @type {React.Context<object|undefined>}
 */
export const UIStateContext = createContext(undefined);
