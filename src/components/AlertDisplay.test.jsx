import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom'; // Import MemoryRouter
import AlertDisplay from './AlertDisplay';
import { EarthquakeDataContext } from '../contexts/earthquakeDataContextUtils'; // Import the context
import { getMagnitudeColorStyle } from '../utils/utils'; // Import the actual utility
import { ALERT_LEVELS as 실제ALERT_LEVELS } from '../constants/appConstants'; // Import actual constants

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
      <AlertDisplay currentAlertConfig={null} hasRecentTsunamiWarning={false} ALERT_LEVELS={실제ALERT_LEVELS} />,
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
      <AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={false} ALERT_LEVELS={실제ALERT_LEVELS} />,
      { providerProps: providerPropsWithAlertQuake }
    );
    expect(screen.getByText('Active USGS Alert: RED')).toBeInTheDocument();
    expect(screen.getByText('Significant event ongoing.')).toBeInTheDocument();
    const alertDiv = screen.getByText('Active USGS Alert: RED').parentElement;

    // Replicate component's logic for expected classes
    const expectedPagerMag = 7.5; // Based on getPagerMagnitudeForStyling('RED')
    const expectedBaseClasses = getMagnitudeColorStyle(expectedPagerMag);
    // The component adds "p-2.5 rounded-lg shadow-md text-xs cursor-pointer"
    // We need to check for each part if necessary, or for a key class like bg-red-500
    expect(alertDiv).toHaveClass(expectedBaseClasses.split(' ')[0]); // Check for bg-red-500 (the first class)
    expect(alertDiv).toHaveClass('p-2.5', 'rounded-lg', 'shadow-md', 'text-xs', 'cursor-pointer');
  });

  it('renders tsunami warning message when hasRecentTsunamiWarning is true and no currentAlertConfig', () => {
    const providerPropsWithTsunamiQuake = {
      ...mockProviderProps,
      tsunamiTriggeringQuake: { id: 'tsunamiquake1', properties: { detail: 'some/url/tsunamiquake1.geojson' } },
    };
    renderWithProviders(
      <AlertDisplay currentAlertConfig={null} hasRecentTsunamiWarning={true} ALERT_LEVELS={실제ALERT_LEVELS} />,
      { providerProps: providerPropsWithTsunamiQuake }
    );
    expect(screen.getByText('Tsunami Information')).toBeInTheDocument();
    expect(screen.getByText('Recent quakes may indicate tsunami activity. Please check official channels for alerts.')).toBeInTheDocument();
    const warningDiv = screen.getByText('Tsunami Information').parentElement;

    // Replicate component's logic for expected classes
    const expectedTsunamiBaseClasses = getMagnitudeColorStyle(1.5); // Component uses M1.5 for tsunami
    expect(warningDiv).toHaveClass(expectedTsunamiBaseClasses.split(' ')[0]); // Check for bg-cyan-400
    expect(warningDiv).toHaveClass('p-2.5', 'rounded-lg', 'shadow-md', 'text-xs', 'cursor-pointer');
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
      <AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={true} ALERT_LEVELS={실제ALERT_LEVELS} />,
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
      <AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={false} ALERT_LEVELS={실제ALERT_LEVELS} />,
      { providerProps: mockProviderProps }
    );
    expect(screen.getByText('Active USGS Alert: PURPLE')).toBeInTheDocument();
    const alertDiv = screen.getByText('Active USGS Alert: PURPLE').parentElement;
    // For an unknown alert, getMagnitudeColorStyle(null) is called by component
    const expectedUnknownBaseClasses = getMagnitudeColorStyle(null);
    expect(alertDiv).toHaveClass(expectedUnknownBaseClasses.split(' ')[0]);
    expect(alertDiv).toHaveClass('p-2.5', 'rounded-lg', 'shadow-md', 'text-xs', 'cursor-pointer');
  });
});
