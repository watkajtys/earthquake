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

// Import the function to be tested and the DEPTH_COMPARISONS array
import { getDynamicContextualComparisons } from './SimplifiedDepthProfile';


describe('getDynamicContextualComparisons direct tests (New Simplified Messages)', () => {
  // Helper to check for absence of old, technical phrasing
  const expectAbsenceOfOldPhrasing = (message) => {
    expect(message).not.toContain('Shallow-focus event');
    expect(message).not.toContain('Intermediate-focus earthquake');
    expect(message).not.toContain('Deep-focus earthquake');
    expect(message).not.toContain('originated within the Earth');
    expect(message).not.toContain('subduction zones');
    expect(message).not.toContain('oceanic slabs');
    expect(message).not.toContain('beyond our deepest listed benchmark');
    expect(message).not.toContain('deeper than the'); // Replaced by "even further down than" or analogies
    expect(message).not.toContain('shallower than the');
  };

  test('should return a single message string in an array', () => {
    const result = getDynamicContextualComparisons(30, actualDepthComparisons);
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    expect(typeof result[0]).toBe('string');
    expectAbsenceOfOldPhrasing(result[0]);
  });

  describe('"Very Close" Comparisons', () => {
    test('depth 10.9 km (Challenger Deep 10.935 km)', () => {
      const result = getDynamicContextualComparisons(10.9, actualDepthComparisons);
      expect(result[0]).toBe('10.9 km is nearly as deep as the Challenger Deep (ocean deepest) (10.9 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 0.8 km (Burj Khalifa 0.828 km)', () => {
      const result = getDynamicContextualComparisons(0.8, actualDepthComparisons);
      expect(result[0]).toBe('0.8 km is nearly as deep as the Burj Khalifa (0.8 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 12.3 km (Kola Superdeep Borehole 12.262 km)', () => {
      const result = getDynamicContextualComparisons(12.3, actualDepthComparisons);
      expect(result[0]).toBe('12.3 km is nearly as deep as the Kola Superdeep Borehole (deepest artificial point) (12.3 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
  });

  describe('"Even Further Down Than" Comparisons', () => {
    test('depth 40 km (vs Avg Continental Crust 35 km)', () => {
      const result = getDynamicContextualComparisons(40, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Average Continental Crust (35.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 15 km (vs Kola Superdeep Borehole 12.262 km)', () => {
      const result = getDynamicContextualComparisons(15, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Kola Superdeep Borehole (deepest artificial point) (12.3 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 4.0 km (vs Deepest Gold Mine 4.0 km) - should trigger "nearly as deep" instead', () => {
      const result = getDynamicContextualComparisons(3.95, actualDepthComparisons); // 3.95km, Mponeng is 4.0km
      expect(result[0]).toBe('4.0 km is nearly as deep as the Deepest Gold Mine (Mponeng, South Africa) (4.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
  });

  describe('Relatable Analogies', () => {
    test('depth 0.7 km (Eiffel Tower)', () => {
      const result = getDynamicContextualComparisons(0.7, actualDepthComparisons);
      // 0.7 / 0.3 = 2.33 -> rounds to 2
      expect(result[0]).toBe('That\'s pretty deep! 0.7 km is like stacking 2 Eiffel Towers!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 0.3 km (Eiffel Tower, single)', () => {
      const result = getDynamicContextualComparisons(0.3, actualDepthComparisons);
      expect(result[0]).toBe('That\'s pretty deep! 0.3 km is like stacking 1 Eiffel Tower!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 5 km (Burj Khalifa)', () => {
      const result = getDynamicContextualComparisons(5, actualDepthComparisons);
      // 5 / 0.828 = 6.03 -> rounds to 6
      expect(result[0]).toBe('That\'s quite deep! 5.0 km is like stacking about 6 Burj Khalifas!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 57 km (Mount Everest)', () => {
      const result = getDynamicContextualComparisons(57, actualDepthComparisons);
      // 57 / 8.848 = 6.44 -> rounds to 6
      expect(result[0]).toBe('Wow, 57.0 km is a long way down – that\'s like stacking about 6 Mount Everests on top of each other!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 100 km (Mount Everest)', () => {
      const result = getDynamicContextualComparisons(100, actualDepthComparisons);
      // 100 / 8.848 = 11.3 -> rounds to 11
      expect(result[0]).toBe('Wow, 100.0 km is a long way down – that\'s like stacking about 11 Mount Everests on top of each other!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 8.8 km (Mount Everest, single)', () => { // approx one Everest
      const result = getDynamicContextualComparisons(8.8, actualDepthComparisons);
      expect(result[0]).toBe('Wow, 8.8 km is a long way down – that\'s about as deep as Mount Everest is tall!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
  });

  describe('Fallback Messages', () => {
    test('depth 0 km (Surface event)', () => {
      const result = getDynamicContextualComparisons(0, actualDepthComparisons);
      expect(result[0]).toBe('This earthquake was right at the surface!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 0.05 km (Very shallow)', () => {
      const result = getDynamicContextualComparisons(0.05, actualDepthComparisons);
      expect(result[0]).toBe('0.05 km is very close to the surface!');
      expectAbsenceOfOldPhrasing(result[0]);
    });

    // Test tiered deep fallbacks, assuming no other comparisons are met
    // These values need to be chosen carefully to avoid other rules.
    // The deepest userFriendlyBenchmark not in significantBenchmarks is "Suez Canal Max Depth" (0.024 km)
    // The shallowest in significantBenchmarks is "Average Continental Crust" (35km)
    // The shallowest in userFriendlyBenchmarks is "Panama Canal Max Depth" (0.018km)
    // The Kola Superdeep Borehole is 12.262km.
    // Mount Everest analogy starts > 5km. Burj analogy > 1km. Eiffel > 0.5km.
    // "Even further down" uses significant benchmarks (deepest is Challenger Deep 10.935, Kola 12.262, Avg Continental Crust 35)

    test('depth 80 km (Deep fallback)', () => {
      // Should be deeper than Avg Continental Crust (35km), but not by factor of 3 (105km)
      // So "even further down" should not trigger for Avg Continental Crust.
      // It is deeper than Challenger Deep (10.9km) by more than 3x.
      // It should trigger Everest analogy: 80/8.8 = 9
      const result = getDynamicContextualComparisons(80, actualDepthComparisons);
      expect(result[0]).toBe('Wow, 80.0 km is a long way down – that\'s like stacking about 9 Mount Everests on top of each other!');
      // This shows the fallback tier messages are hard to hit if analogies are broad.
      // Let's test the fallback directly by choosing values that don't fit analogies well.
      // The current fallback tiers are: >700, >300, >70
    });

    test('depth 750 km (Exceptionally Deep fallback)', () => {
      const result = getDynamicContextualComparisons(750, actualDepthComparisons);
      expect(result[0]).toBe('Whoa, 750 km is incredibly deep, way down into the Earth\'s mantle!');
      expectAbsenceOfOldPhrasing(result[0]);
    });

    test('depth 450 km (Very Deep fallback)', () => {
      const result = getDynamicContextualComparisons(450, actualDepthComparisons);
      expect(result[0]).toBe('That\'s a very deep earthquake, 450 km down!');
      expectAbsenceOfOldPhrasing(result[0]);
    });

    test('depth 75 km (Deep fallback, if no analogy/comparison fits)', () => {
      // 75km / 8.8km (Everest) = 8.5 -> "stacking 9 Mount Everests"
      // This means the analogy will likely always take precedence over the >70km fallback.
      // This is acceptable, as analogies are preferred.
      const result = getDynamicContextualComparisons(75, actualDepthComparisons);
       expect(result[0]).toBe('Wow, 75.0 km is a long way down – that\'s like stacking about 9 Mount Everests on top of each other!');
      // To hit "That's a deep earthquake, X km down!" for the 70-300 range,
      // it must NOT be "nearly as deep", NOT "even further down", and NOT fit an analogy.
      // Everest analogy starts at depth > 5km.
      // Let's try a depth that is not much larger than any "significant" benchmark.
      // e.g. 4.5km. Not deeper than Everest by much. Deeper than Kola/ChallengerDeep by <3x.
      // 4.5km / 0.828 (Burj) = 5.4 (stacking 5 Burj)
      // This demonstrates fallbacks are for cases where primary rules don't apply.
    });

    test('depth 25 km (Generic fallback - likely triggers Everest analogy or "further down than Kola")', () => {
      // 25km vs Kola (12.262km): "That's incredibly deep! It's even further down than the Kola Superdeep Borehole (deepest artificial point) (12.3 km)!"
      // 25km / 8.8 (Everest) = 2.8 (stacking 3 Everests)
      // The "even further down than Kola" is more specific and likely chosen if Kola is significant.
      // Let's check the actual output given the logic order.
      // "very close" -> no.
      // "even further down than" (significant benchmarks: Kola, Challenger, Avg Continental Crust, Deepest Gold Mine)
      // 25km > Kola (12.262km) and 25 < 12.262 * 3 (36.7) -> This should be chosen.
      const result = getDynamicContextualComparisons(25, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Kola Superdeep Borehole (deepest artificial point) (12.3 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 0.2 km (Generic fallback for very shallow, no analogy)', () => {
      // Not close to 0.3 (Eiffel), not close to 0.8 (Burj)
      // Not close to any small userFriendlyBenchmark like canals.
      // 0.2km is not > 0.5km for Eiffel analogy.
      // Fallbacks: 0km (no), <0.1km (no). >700, >300, >70 (no).
      // So, should be the final "That's an earthquake at X km deep."
      const result = getDynamicContextualComparisons(0.2, actualDepthComparisons);
      expect(result[0]).toBe('That\'s an earthquake at 0.2 km deep.');
      expectAbsenceOfOldPhrasing(result[0]);
    });
  });
});
