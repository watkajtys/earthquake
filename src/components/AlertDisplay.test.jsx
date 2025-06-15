import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom'; // Import MemoryRouter
import AlertDisplay from './AlertDisplay';
import { EarthquakeDataContext } from '../contexts/earthquakeDataContextUtils'; // Import the context

// Mock ALERT_LEVELS constant as it's used by the component
const ALERT_LEVELS = {
  GREEN: { text: 'GREEN', colorClass: 'bg-green-500', detailsColorClass: 'border-green-700' },
  YELLOW: { text: 'YELLOW', colorClass: 'bg-yellow-500', detailsColorClass: 'border-yellow-700' },
  ORANGE: { text: 'ORANGE', colorClass: 'bg-orange-500', detailsColorClass: 'border-orange-700' },
  RED: { text: 'RED', colorClass: 'bg-red-500', detailsColorClass: 'border-red-700' },
};

// Helper function to render with providers
const renderWithProviders = (ui, { providerProps, ...renderOptions } = {}) => {
  return render(
    <MemoryRouter>
      <EarthquakeDataContext.Provider value={providerProps}>
        {ui}
      </EarthquakeDataContext.Provider>
    </MemoryRouter>,
    renderOptions
  );
};

describe('AlertDisplay', () => {
  const mockProviderProps = {
    tsunamiTriggeringQuake: null,
    activeAlertTriggeringQuakes: [],
    // Add other context values if AlertDisplay starts using them
  };

  it('renders null when no alert config and no tsunami warning', () => {
    const { container } = renderWithProviders(
      <AlertDisplay currentAlertConfig={null} hasRecentTsunamiWarning={false} ALERT_LEVELS={ALERT_LEVELS} />,
      { providerProps: mockProviderProps }
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders alert message when currentAlertConfig is provided', () => {
    const alertConfig = {
      text: 'RED',
      description: 'Significant event ongoing.',
    };
    const providerPropsWithAlertQuake = {
      ...mockProviderProps,
      activeAlertTriggeringQuakes: [{ id: 'testquake1', properties: { detail: 'some/url/testquake1.geojson' } }],
    };
    renderWithProviders(
      <AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={false} ALERT_LEVELS={ALERT_LEVELS} />,
      { providerProps: providerPropsWithAlertQuake }
    );
    expect(screen.getByText('Active USGS Alert: RED')).toBeInTheDocument();
    expect(screen.getByText('Significant event ongoing.')).toBeInTheDocument();
    const alertDiv = screen.getByText('Active USGS Alert: RED').parentElement;
    expect(alertDiv).toHaveClass(ALERT_LEVELS.RED.detailsColorClass);
  });

  it('renders tsunami warning message when hasRecentTsunamiWarning is true and no currentAlertConfig', () => {
    const providerPropsWithTsunamiQuake = {
      ...mockProviderProps,
      tsunamiTriggeringQuake: { id: 'tsunamiquake1', properties: { detail: 'some/url/tsunamiquake1.geojson' } },
    };
    renderWithProviders(
      <AlertDisplay currentAlertConfig={null} hasRecentTsunamiWarning={true} ALERT_LEVELS={ALERT_LEVELS} />,
      { providerProps: providerPropsWithTsunamiQuake }
    );
    expect(screen.getByText('Tsunami Information')).toBeInTheDocument();
    expect(screen.getByText('Recent quakes may indicate tsunami activity. Please check official channels for alerts.')).toBeInTheDocument();
    const warningDiv = screen.getByText('Tsunami Information').parentElement;
    expect(warningDiv).toHaveClass('bg-sky-700 bg-opacity-40 border-l-4 border-sky-500 text-sky-200');
  });

  it('renders only alert message if both alertConfig and tsunami warning are present', () => {
    const alertConfig = {
      text: 'YELLOW',
      description: 'Minor event advisory.',
    };
    const providerPropsWithBoth = {
      ...mockProviderProps,
      activeAlertTriggeringQuakes: [{ id: 'testquake2', properties: { detail: 'some/url/testquake2.geojson' } }],
      tsunamiTriggeringQuake: { id: 'tsunamiquake2', properties: { detail: 'some/url/tsunamiquake2.geojson' } },
    };
    renderWithProviders(
      <AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={true} ALERT_LEVELS={ALERT_LEVELS} />,
      { providerProps: providerPropsWithBoth }
    );
    expect(screen.getByText('Active USGS Alert: YELLOW')).toBeInTheDocument();
    expect(screen.queryByText('Tsunami Information')).toBeNull();
  });

  it('uses default color class if alert level text does not match ALERT_LEVELS keys', () => {
    const alertConfig = {
      text: 'PURPLE', // Not in our mocked ALERT_LEVELS
      description: 'Unknown alert level.',
    };
    // No specific quake needed for this color test, but provider is still needed
    renderWithProviders(
      <AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={false} ALERT_LEVELS={ALERT_LEVELS} />,
      { providerProps: mockProviderProps }
    );
    expect(screen.getByText('Active USGS Alert: PURPLE')).toBeInTheDocument();
    const alertDiv = screen.getByText('Active USGS Alert: PURPLE').parentElement;
    expect(alertDiv).not.toHaveClass(ALERT_LEVELS.RED.detailsColorClass);
    expect(alertDiv).not.toHaveClass(ALERT_LEVELS.YELLOW.colorClass);
  });
});
