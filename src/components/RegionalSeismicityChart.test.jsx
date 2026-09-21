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

  test('retains available data while the monthly feed refreshes', () => {
    render(
      <RegionalSeismicityChart
        currentEarthquake={mockCurrentEarthquake}
        nearbyEarthquakesData={mockNearbyEarthquakesData7Days} // 7-day data is present
        dataSourceTimespanDays={30} // Expecting 30-day
        isLoadingMonthly={true} // Currently loading monthly
        hasAttemptedMonthlyLoad={true} // Attempted to load monthly
      />
    );
    expect(screen.queryByText(/Loading 30-day regional data.../i)).not.toBeInTheDocument();
    expect(screen.getByText(/Using the available 30-day feed/)).toBeInTheDocument();
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

  test('qualifies an empty seven-day result instead of claiming a full historical absence', () => {
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
    expect(screen.getByText(/No matching earthquakes.*available 7-day feed/)).toBeInTheDocument();
    expect(screen.getByText(/activity outside its coverage is unknown/)).toBeInTheDocument();
  });

  // Add more tests as needed for other functionalities.
});


it('distinguishes missing historical coverage from observed zero earthquakes', () => {
  render(<RegionalSeismicityChart currentEarthquake={{ ...mockCurrentEarthquake, properties: { time: Date.UTC(2020, 0, 1), mag: 5 } }} nearbyEarthquakesData={[]} dataSourceTimespanDays={30} dataSourceGeneratedAtMs={Date.UTC(2026, 8, 21)} />);
  expect(screen.getByText(/Historical activity is unavailable, not zero/)).toBeInTheDocument();
  expect(screen.queryByText(/No matching earthquakes/)).not.toBeInTheDocument();
});

it('uses the source generation time for stale feeds instead of treating request time as new coverage', () => {
  const end = Date.UTC(2020, 0, 8);
  render(<RegionalSeismicityChart currentEarthquake={{ ...mockCurrentEarthquake, properties: { time: end - 1000, mag: 5 } }} nearbyEarthquakesData={[]} dataSourceTimespanDays={7} dataSourceGeneratedAtMs={end} />);
  expect(screen.getByText(/No matching earthquakes.*available 7-day feed/)).toBeInTheDocument();
  expect(screen.queryByText(/Historical activity is unavailable/)).not.toBeInTheDocument();
});


it('keeps observed events on the partial first day without manufacturing earlier zero bars', () => {
  const end = new Date(2026, 8, 21, 12).getTime();
  const start = end - 7 * 86400000;
  const current = { ...mockCurrentEarthquake, properties: { time: end - 3600000, mag: 5 } };
  const nearby = [{ ...mockNearbyEarthquakesData7Days[0], properties: { time: start + 7200000, mag: 3 } }];
  const { container } = render(<RegionalSeismicityChart currentEarthquake={current} nearbyEarthquakesData={nearby} dataSourceTimespanDays={7} dataSourceGeneratedAtMs={end} />);
  const days = [...container.querySelectorAll('svg title')].map(title => title.textContent);
  expect(days[0]).toContain('1 event(s)');
  expect(days).toHaveLength(8);
  expect(screen.getByText(/missing history is not shown as zero activity/)).toBeInTheDocument();
});
