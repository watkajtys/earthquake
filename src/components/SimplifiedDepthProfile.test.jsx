import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest'; // Import vi
import SimplifiedDepthProfile, { DEPTH_COMPARISONS as actualDepthComparisons } from './SimplifiedDepthProfile'; // Import const

// Mock the getMagnitudeColor utility function as it's not relevant to these tests
// and might cause issues if not properly handled in a test environment.
vi.mock('../utils/utils.js', () => ({
  getMagnitudeColor: vi.fn(() => '#000000'), // Return a default color
}));

// Helper to get only depth comparisons, sorted
const getSortedDepthComparisons = () => actualDepthComparisons.filter(c => !c.isHeight).sort((a, b) => a.depth - b.depth);


describe('SimplifiedDepthProfile', () => {
  const defaultProps = {
    earthquakeDepth: 50, // Typical depth, deeper than Average Continental Crust (35km), shallower than diagram max (700km)
    magnitude: 5.5,
  };

  // Visual markers for comparisons are removed, so this test is no longer needed.
  // test('renders visual labels for comparison items on the chart', () => { ... });

  // Test for Handling of No Earthquake Depth Data
  test('displays fallback message and no contextual insights when earthquakeDepth is null', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={null} magnitude={5.0} />);
    expect(screen.getByText('Depth information not available or invalid for this earthquake.')).toBeInTheDocument();
    expect(screen.queryByTestId('contextual-insights-container')).not.toBeInTheDocument();
    // Static list details element is removed, so no need to check for its absence.
    expect(screen.queryByTestId('depth-profile-chart')).not.toBeInTheDocument();
  });

  test('displays fallback message and no contextual insights when earthquakeDepth is undefined', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={undefined} magnitude={5.0} />);
    expect(screen.getByText('Depth information not available or invalid for this earthquake.')).toBeInTheDocument();
    expect(screen.queryByTestId('contextual-insights-container')).not.toBeInTheDocument();
    // Static list details element is removed.
    expect(screen.queryByTestId('depth-profile-chart')).not.toBeInTheDocument();
  });

  // Test for Rendering with a Zero Depth Earthquake
  test('renders correctly for a zero-depth earthquake', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={0} magnitude={3.0} />);
    const mainQuakeLabel = screen.getByTestId('earthquake-depth-label');
    expect(mainQuakeLabel).toBeInTheDocument();
    expect(mainQuakeLabel).toHaveTextContent('0.0 km');
    // Visual labels for comparisons on chart are removed.
  });
});

describe('SimplifiedDepthProfile - Dynamic Contextual Insights', () => {
  const sortedDepthComparisons = getSortedDepthComparisons();

  test('renders contextual insights heading and container', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={15} magnitude={4.0} />);
    expect(screen.getByTestId('contextual-insights-container')).toBeInTheDocument();
    expect(screen.getByText('Contextual Depth Insights:')).toBeInTheDocument();
  });

  test('shows "very similar" message when depth is close to a benchmark', () => {
    // Krubera Cave is 2.197 km. 5% is ~0.11. So 2.1km should be "very similar".
    render(<SimplifiedDepthProfile earthquakeDepth={2.1} magnitude={3.0} />);
    const insight = screen.getByText(/very similar to the Krubera Cave \(deepest cave\)/i);
    expect(insight).toBeInTheDocument();
    expect(insight).toHaveTextContent('This depth of 2.1 km is very similar to the Krubera Cave (deepest cave) (2.2 km).');
  });

  test('shows "deeper than X, shallower than Y" message', () => {
    // Test with a depth of 1.0 km.
    // This should be deeper than Burj Khalifa (0.828km) and shallower than Grand Canyon (1.83km)
    // And not "very close" to either.
    // Burj Khalifa: 0.828km. 5% = 0.0414. Range [0.7866, 0.8694] -> 1.0km is not very close.
    // Grand Canyon: 1.83km. 5% = 0.0915. Range [1.7385, 1.9215] -> 1.0km is not very close.
    render(<SimplifiedDepthProfile earthquakeDepth={1.0} magnitude={3.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent('At 1.0 km, this event is deeper than the Burj Khalifa (0.8 km).');
    // Corrected expectation based on sorted list: Lake Baikal (1.6km) is the next shallowest after Burj Khalifa (0.8km) for a 1.0km depth.
    expect(insightsContainer).toHaveTextContent('It is shallower than the Depth of Lake Baikal (deepest lake) (1.6 km).');
  });

  test('shows "shallower than all" message', () => {
    const shallowestDepthBenchmark = sortedDepthComparisons[0]; // e.g. Panama Canal at 0.018km
    render(<SimplifiedDepthProfile earthquakeDepth={0.001} magnitude={1.0} />); // Shallower than Panama Canal
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent(`This depth of 0.0 km is shallower than all listed depth benchmarks, starting with the ${shallowestDepthBenchmark.name} (${shallowestDepthBenchmark.depth.toFixed(1)} km).`);
  });

  test('shows message for depth within Lithospheric Mantle', () => {
    // Lithospheric Mantle: 35-100 km. Deepest benchmark (Avg Continental Crust) is 35km.
    // 70km is > (35km + some_small_buffer_if_any_for_significantly_deeper_check)
    // but the new logic for "significantly deeper" is 50km beyond the deepest benchmark.
    // Deepest benchmark is "Average Continental Crust" at 35km. 35+50 = 85km.
    // So, 70km is deeper than all benchmarks, but NOT "significantly deeper" by that 50km rule.
    // It should use the "beyond our deepest listed benchmark" message.
    const deepestComp = sortedDepthComparisons[sortedDepthComparisons.length -1];
    render(<SimplifiedDepthProfile earthquakeDepth={70} magnitude={5.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    // If 70km is NOT considered "significantly deeper" than 35km by 50km, this is the expected message:
    expect(insightsContainer).toHaveTextContent(`This depth of 70.0 km is beyond our deepest listed benchmark, the ${deepestComp.name} (${deepestComp.depth.toFixed(1)} km).`);
    // If it WERE "significantly deeper" (e.g. if threshold was smaller, or deepest benchmark shallower), it would be:
    // expect(insightsContainer).toHaveTextContent("At 70 km, this earthquake originated deep within the Earth's Lithospheric Mantle.");
  });

  test('shows message for depth within Asthenosphere (Upper Mantle)', () => {
    // Asthenosphere: 100-700 km. Deepest benchmark 35km. 35+50=85km. 150km is > 85km.
    render(<SimplifiedDepthProfile earthquakeDepth={150} magnitude={6.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent("At 150 km, this earthquake originated deep within the Earth's Asthenosphere (Upper Mantle).");
  });

  test('shows message for depth beyond mapped Asthenosphere', () => {
    // Layers go down to 700km. Deepest benchmark 35km. 35+50=85km. 800km is > 85km.
    render(<SimplifiedDepthProfile earthquakeDepth={800} magnitude={7.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent("At 800 km, this earthquake occurred at an exceptionally profound depth within the Earth, below the typically mapped Asthenosphere.");
  });

   test('contextual insights section is not rendered if earthquakeDepth is null', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={null} magnitude={5.0} />);
    expect(screen.queryByTestId('contextual-insights-container')).not.toBeInTheDocument();
  });
});

// Static list and its collapsible behavior tests are removed.
