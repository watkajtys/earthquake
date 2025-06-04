import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarthquakeRegionalSeismicityPanel from './EarthquakeRegionalSeismicityPanel';

// Mock the child component RegionalSeismicityChart
// For Vitest, vi.mock is hoisted, so it's fine here.
vi.mock('../RegionalSeismicityChart', () => ({
  default: vi.fn(() => <div data-testid="regional-chart-mock">Mock Regional Chart</div>)
}));

describe('EarthquakeRegionalSeismicityPanel', () => {
  const mockDetailData = {
    id: 'mainQuake',
    properties: { time: new Date().getTime(), mag: 5.0 },
    geometry: { coordinates: [0,0,10] }
  };
  const mockBroaderData = [{
    id: 'regionalQuake1',
    properties: { time: new Date().getTime() - 100000, mag: 3.0 },
    geometry: { coordinates: [1,1,10] }
  }];

  // Clear mock history before each test
  beforeEach(() => {
    const MockedRegionalSeismicityChart = require('../RegionalSeismicityChart').default;
    if (MockedRegionalSeismicityChart.mockClear) {
        MockedRegionalSeismicityChart.mockClear();
    }
  });

  test('passes all relevant props to RegionalSeismicityChart', () => {
    const props = {
      detailData: mockDetailData,
      broaderEarthquakeData: mockBroaderData,
      dataSourceTimespanDays: 30,
      isLoadingMonthly: true,
      hasAttemptedMonthlyLoad: true,
      exhibitPanelClass: 'test-panel-class',
    };

    render(<EarthquakeRegionalSeismicityPanel {...props} />);

    const MockedRegionalSeismicityChart = require('../RegionalSeismicityChart').default;
    expect(MockedRegionalSeismicityChart).toHaveBeenCalledWith(
      expect.objectContaining({
        currentEarthquake: props.detailData,
        nearbyEarthquakesData: props.broaderEarthquakeData,
        dataSourceTimespanDays: props.dataSourceTimespanDays,
        isLoadingMonthly: props.isLoadingMonthly,
        hasAttemptedMonthlyLoad: props.hasAttemptedMonthlyLoad,
      }),
      expect.anything() // For the second argument (context/ref) if any
    );
  });

  test('returns null if detailData is not provided', () => {
    const { container } = render(
      <EarthquakeRegionalSeismicityPanel
        detailData={null}
        broaderEarthquakeData={mockBroaderData}
        dataSourceTimespanDays={7}
        isLoadingMonthly={false}
        hasAttemptedMonthlyLoad={false}
        exhibitPanelClass="test-class"
      />
    );
    // Expect the component to render nothing
    expect(container.firstChild).toBeNull();
  });

  test('passes isLoadingMonthly: false and hasAttemptedMonthlyLoad: false correctly', () => {
    const props = {
      detailData: mockDetailData,
      broaderEarthquakeData: mockBroaderData,
      dataSourceTimespanDays: 7,
      isLoadingMonthly: false,
      hasAttemptedMonthlyLoad: false,
      exhibitPanelClass: 'test-panel-class-false',
    };

    render(<EarthquakeRegionalSeismicityPanel {...props} />);

    const MockedRegionalSeismicityChart = require('../RegionalSeismicityChart').default;
    expect(MockedRegionalSeismicityChart).toHaveBeenCalledWith(
      expect.objectContaining({
        isLoadingMonthly: false,
        hasAttemptedMonthlyLoad: false,
        dataSourceTimespanDays: 7,
      }),
      expect.anything()
    );
  });
});
