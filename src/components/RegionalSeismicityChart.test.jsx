import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegionalSeismicityChart from './RegionalSeismicityChart';

// Mock necessary props and data
const mockCurrentEarthquake = {
  id: 'evt001',
  properties: { time: new Date().getTime(), mag: 5.0 },
  geometry: { coordinates: [0, 0, 10] },
};

const mockNearbyEarthquakesData7Days = [
  { id: 'evt002', properties: { time: new Date().getTime() - 86400000, mag: 2.5 }, geometry: { coordinates: [0.1, 0.1, 5] } },
];

describe('RegionalSeismicityChart Loading States', () => {
  test('renders loading skeleton if nearbyEarthquakesData is null', () => {
    render(
      <RegionalSeismicityChart
        currentEarthquake={mockCurrentEarthquake}
        nearbyEarthquakesData={null}
        dataSourceTimespanDays={7}
        isLoadingMonthly={false}
        hasAttemptedMonthlyLoad={false}
      />
    );
    expect(screen.getByText(/Loading regional data.../i)).toBeInTheDocument();
  });

  test('renders loading skeleton for 30-day data if conditions met, even with 7-day data present', () => {
    render(
      <RegionalSeismicityChart
        currentEarthquake={mockCurrentEarthquake}
        nearbyEarthquakesData={mockNearbyEarthquakesData7Days} // 7-day data is present
        dataSourceTimespanDays={30} // Expecting 30-day
        isLoadingMonthly={true} // Currently loading monthly
        hasAttemptedMonthlyLoad={true} // Attempted to load monthly
      />
    );
    expect(screen.getByText(/Loading 30-day regional data.../i)).toBeInTheDocument();
  });

  test('renders loading skeleton with default message if nearbyEarthquakesData is undefined and not specifically waiting for 30-day data', () => {
    render(
      <RegionalSeismicityChart
        currentEarthquake={mockCurrentEarthquake}
        nearbyEarthquakesData={undefined}
        dataSourceTimespanDays={7} // Not expecting 30-day specifically
        isLoadingMonthly={false}
        hasAttemptedMonthlyLoad={false}
      />
    );
    expect(screen.getByText(/Loading regional data.../i)).toBeInTheDocument();
  });

  test('does not render loading skeleton if data is present and not waiting for monthly data', () => {
    render(
      <RegionalSeismicityChart
        currentEarthquake={mockCurrentEarthquake}
        nearbyEarthquakesData={mockNearbyEarthquakesData7Days}
        dataSourceTimespanDays={7}
        isLoadingMonthly={false}
        hasAttemptedMonthlyLoad={false}
      />
    );
    // Check for an element that should be present when data is loaded, e.g., chart title or specific text
    // For simplicity, we'll check that the loading message is NOT there.
    expect(screen.queryByText(/Loading regional data.../i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading 30-day regional data.../i)).not.toBeInTheDocument();
    // Add a more specific check for rendered content if possible, e.g., the chart title
    expect(screen.getByText(/Regional Activity Prior to Event/i)).toBeInTheDocument();
  });

  test('renders "Select an earthquake" message if currentEarthquake is null', () => {
    render(
      <RegionalSeismicityChart
        currentEarthquake={null}
        nearbyEarthquakesData={mockNearbyEarthquakesData7Days}
        dataSourceTimespanDays={7}
        isLoadingMonthly={false}
        hasAttemptedMonthlyLoad={false}
      />
    );
    expect(screen.getByText(/Select an earthquake to see regional seismicity./i)).toBeInTheDocument();
  });

  test('renders "No other significant earthquakes" message if regionalEvents is empty', () => {
    // This requires nearbyEarthquakesData that will result in an empty regionalEvents list
    // e.g., events outside the radius or time window. For this test, pass an empty array.
    render(
      <RegionalSeismicityChart
        currentEarthquake={mockCurrentEarthquake}
        nearbyEarthquakesData={[]} // No nearby events
        dataSourceTimespanDays={7}
        isLoadingMonthly={false}
        hasAttemptedMonthlyLoad={false}
      />
    );
    expect(screen.getByText(/No other significant earthquakes recorded/i)).toBeInTheDocument();
  });

  // Add more tests as needed for other functionalities.
});
