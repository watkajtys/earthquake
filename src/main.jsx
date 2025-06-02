/**
 * @file Main entry point for the Seismic Activity Monitor application.
 * This file renders the root React component (`App`) into the DOM,
 * wrapping it with `BrowserRouter` for routing capabilities,
 * `EarthquakeDataProvider` for earthquake data, `UIStateProvider` for UI state,
 * and `StrictMode` for development-time checks.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './pages/HomePage.jsx';
import { EarthquakeDataProvider } from './contexts/EarthquakeDataContext.jsx';
import { UIStateProvider } from './contexts/UIStateContext.jsx'; // Import UIStateProvider

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <EarthquakeDataProvider>
        <UIStateProvider> {/* Wrap App with UIStateProvider */}
          <App />
        </UIStateProvider>
      </EarthquakeDataProvider>
    </BrowserRouter>
  </StrictMode>,
)
