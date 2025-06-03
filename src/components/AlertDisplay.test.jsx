import React from 'react';
import { render, screen } from '@testing-library/react';
import AlertDisplay from './AlertDisplay'; // Assuming the component is in the same folder
import { vi } from 'vitest'; // Import vi for mocking if needed for other tests

// Mock ALERT_LEVELS constant as it's used by the component
const ALERT_LEVELS = {
  GREEN: { text: 'GREEN', colorClass: 'bg-green-500', detailsColorClass: 'border-green-700' },
  YELLOW: { text: 'YELLOW', colorClass: 'bg-yellow-500', detailsColorClass: 'border-yellow-700' },
  ORANGE: { text: 'ORANGE', colorClass: 'bg-orange-500', detailsColorClass: 'border-orange-700' },
  RED: { text: 'RED', colorClass: 'bg-red-500', detailsColorClass: 'border-red-700' },
  // Add any other levels your component might use
};

describe('AlertDisplay', () => {
  it('renders null when no alert config and no tsunami warning', () => {
    const { container } = render(
      <AlertDisplay currentAlertConfig={null} hasRecentTsunamiWarning={false} ALERT_LEVELS={ALERT_LEVELS} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders alert message when currentAlertConfig is provided', () => {
    const alertConfig = {
      text: 'RED',
      description: 'Significant event ongoing.',
    };
    render(<AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={false} ALERT_LEVELS={ALERT_LEVELS} />);
    expect(screen.getByText('Active USGS Alert: RED')).toBeInTheDocument();
    expect(screen.getByText('Significant event ongoing.')).toBeInTheDocument();
    // Check for color class (optional, depends on how strict you want to be)
    const alertDiv = screen.getByText('Active USGS Alert: RED').parentElement;
    expect(alertDiv).toHaveClass(ALERT_LEVELS.RED.detailsColorClass);
  });

  it('renders tsunami warning message when hasRecentTsunamiWarning is true and no currentAlertConfig', () => {
    render(<AlertDisplay currentAlertConfig={null} hasRecentTsunamiWarning={true} ALERT_LEVELS={ALERT_LEVELS} />);
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
    render(<AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={true} ALERT_LEVELS={ALERT_LEVELS} />);
    expect(screen.getByText('Active USGS Alert: YELLOW')).toBeInTheDocument();
    expect(screen.queryByText('Tsunami Information')).toBeNull(); // Tsunami info should not be shown
  });

  it('uses default color class if alert level text does not match ALERT_LEVELS keys', () => {
    const alertConfig = {
      text: 'PURPLE', // Not in our mocked ALERT_LEVELS
      description: 'Unknown alert level.',
    };
    render(<AlertDisplay currentAlertConfig={alertConfig} hasRecentTsunamiWarning={false} ALERT_LEVELS={ALERT_LEVELS} />);
    expect(screen.getByText('Active USGS Alert: PURPLE')).toBeInTheDocument();
    const alertDiv = screen.getByText('Active USGS Alert: PURPLE').parentElement;
    // Assuming a default class or lack of specific color class if not found
    // The component uses: ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.detailsColorClass || ALERT_LEVELS[currentAlertConfig.text.toUpperCase()]?.colorClass
    // If both are undefined, it will not have those specific classes. Let's test that it doesn't have a known one.
    expect(alertDiv).not.toHaveClass(ALERT_LEVELS.RED.detailsColorClass);
    expect(alertDiv).not.toHaveClass(ALERT_LEVELS.YELLOW.colorClass);
  });
});
