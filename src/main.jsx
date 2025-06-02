/**
 * @file Main entry point for the Seismic Activity Monitor application.
 * This file renders the root React component (`App`) into the DOM,
 * wrapping it with `BrowserRouter` for routing capabilities and
 * `StrictMode` for development-time checks.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './pages/HomePage.jsx'; // Updated import path
import { EarthquakeDataProvider } from './contexts/EarthquakeDataContext.jsx'; // Import the provider
import { UIStateProvider } from './contexts/UIStateContext.jsx'; // Import the UIStateProvider

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <EarthquakeDataProvider>
        <UIStateProvider>
          <App />
        </UIStateProvider>
      </EarthquakeDataProvider>
    </BrowserRouter>
  </StrictMode>,
);
