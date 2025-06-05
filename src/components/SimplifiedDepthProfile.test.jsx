import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import SimplifiedDepthProfile, { DEPTH_COMPARISONS as actualDepthComparisons, getDynamicContextualComparisons } from './SimplifiedDepthProfile';

vi.mock('../utils/utils.js', () => ({
  getMagnitudeColor: vi.fn(() => '#000000'),
}));

const getSortedDepthComparisons = () => actualDepthComparisons.filter(c => !c.isHeight).sort((a, b) => a.depth - b.depth);

describe('SimplifiedDepthProfile', () => {
  test('displays fallback message and no contextual insights when earthquakeDepth is null', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={null} magnitude={5.0} />);
    expect(screen.getByText('Depth information not available or invalid for this earthquake.')).toBeInTheDocument();
    expect(screen.queryByTestId('contextual-insights-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('depth-profile-chart')).not.toBeInTheDocument();
  });

  test('displays fallback message and no contextual insights when earthquakeDepth is undefined', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={undefined} magnitude={5.0} />);
    expect(screen.getByText('Depth information not available or invalid for this earthquake.')).toBeInTheDocument();
    expect(screen.queryByTestId('contextual-insights-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('depth-profile-chart')).not.toBeInTheDocument();
  });

  test('renders correctly for a zero-depth earthquake', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={0} magnitude={3.0} />);
    const mainQuakeLabel = screen.getByTestId('earthquake-depth-label');
    expect(mainQuakeLabel).toBeInTheDocument();
    expect(mainQuakeLabel).toHaveTextContent('0.0 km');
  });
});

describe('SimplifiedDepthProfile - Dynamic Contextual Insights', () => {
  // Test cases based on the previous failures and re-evaluation of getDynamicContextualComparisons
  test('renders contextual insights heading and container', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={15} magnitude={4.0} />);
    expect(screen.getByTestId('contextual-insights-container')).toBeInTheDocument();
    expect(screen.getByText('Contextual Depth Insights:')).toBeInTheDocument();
  });

  test('shows correct "very similar" message for 2.1km depth', () => {
    // Input: 2.1km. Closest: Typical Geothermal Well (2.0km). Diff 0.1. 2.0 * 0.10 = 0.2. 0.1 <= 0.2 is true.
    render(<SimplifiedDepthProfile earthquakeDepth={2.1} magnitude={3.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent('2.1 km is nearly as deep as the Typical Geothermal Well Depth (2.0 km)!');
  });

  test('shows correct message for 1.0km depth (Eiffel Tower analogy)', () => {
    // Input: 1.0km. Not "very close". Not "even further". Analogy: Eiffel (depth > 0.5). 1.0/0.3 = 3.33 -> 3.
    // This tests that analogy logic is reached if "very close" and "even further" don't match.
    render(<SimplifiedDepthProfile earthquakeDepth={1.0} magnitude={3.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent('That\'s pretty deep! 1.0 km is like stacking 3 Eiffel Towers!');
  });

  test('shows correct message for 0.001km depth ("nearly as deep" to Panama Canal)', () => {
    // Input: 0.001km. Panama Canal Max Depth (0.018km). Diff: ~0.017. 0.017 <= 0.1 is true.
    // "Very close" rule takes precedence for small depths.
    render(<SimplifiedDepthProfile earthquakeDepth={0.001} magnitude={1.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    // Output of function for 0.001 is "0.0 km is nearly as deep as the Panama Canal Max Depth (0.0 km)!"
    // due to toFixed(1) on depth and benchmark.depth in the message.
    expect(insightsContainer).toHaveTextContent('0.0 km is nearly as deep as the Panama Canal Max Depth (0.0 km)!');
  });

  test('shows correct message for 70km depth ("even further down than" Avg Continental Crust)', () => {
    // Input: 70km. Not "very close". "even further": Avg Continental Crust (35km). 70 > 35 && 70 < 35*3=105. True.
    // "Even further down than" rule takes precedence over >70km fallback or Everest analogy (70/8.8 = ~8 Everests).
    render(<SimplifiedDepthProfile earthquakeDepth={70} magnitude={5.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent('That\'s incredibly deep! It\'s even further down than the Average Continental Crust (35.0 km)!');
  });

  test('shows correct message for 150km depth (Mount Everest analogy)', () => {
    // Input: 150km. Not "very close". Not "even further" (150 > 35*3=105).
    // Analogy: Everest (depth > 5km). 150/8.848 = 16.95 -> 17.
    render(<SimplifiedDepthProfile earthquakeDepth={150} magnitude={6.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent('Wow, 150.0 km is a long way down – that\'s like stacking about 17 Mount Everests on top of each other!');
  });

  test('shows correct message for 800km depth (Mount Everest analogy)', () => {
    // Input: 800km. Not "very close". Not "even further". Analogy: Everest (depth > 5km). 800/8.848 = 90.4 -> 90.
    // Everest analogy takes precedence over the "> 700km" fallback.
    render(<SimplifiedDepthProfile earthquakeDepth={800} magnitude={7.0} />);
    const insightsContainer = screen.getByTestId('contextual-insights-container');
    expect(insightsContainer).toHaveTextContent('Wow, 800.0 km is a long way down – that\'s like stacking about 90 Mount Everests on top of each other!');
  });

   test('contextual insights section is not rendered if earthquakeDepth is null', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={null} magnitude={5.0} />);
    expect(screen.queryByTestId('contextual-insights-container')).not.toBeInTheDocument();
  });
});


describe('getDynamicContextualComparisons direct tests (New Simplified Messages)', () => {
  const expectAbsenceOfOldPhrasing = (message) => {
    expect(message).not.toContain('Shallow-focus event');
    expect(message).not.toContain('Intermediate-focus earthquake');
    expect(message).not.toContain('Deep-focus earthquake');
    expect(message).not.toContain('originated within the Earth');
    expect(message).not.toContain('subduction zones');
    expect(message).not.toContain('oceanic slabs');
    expect(message).not.toContain('beyond our deepest listed benchmark');
    expect(message).not.toContain('deeper than the');
    expect(message).not.toContain('shallower than the');
  };

  test('should return a single message string in an array', () => {
    // Input: 30km.
    // Priority: 1) Not "very close".
    // 2) "even further": Kola Superdeep Borehole (12.262km). 30 > 12.262 && 30 < 12.262*3 (36.786) -> TRUE.
    // This is chosen over Everest analogy (30/8.848 = ~3 Everests).
    const result = getDynamicContextualComparisons(30, actualDepthComparisons);
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    expect(typeof result[0]).toBe('string');
    expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Kola Superdeep Borehole (deepest artificial point) (12.3 km)!');
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
      // Input: 40km. "even further": Avg Continental Crust (35km). 40 > 35 && 40 < 35*3 (105). True.
      const result = getDynamicContextualComparisons(40, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Average Continental Crust (35.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 15 km (vs Kola Superdeep Borehole 12.262 km)', () => {
      // Input: 15km. "even further": Kola (12.262km). 15 > 12.262 && 15 < 12.262*3 (36.786). True.
      const result = getDynamicContextualComparisons(15, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Kola Superdeep Borehole (deepest artificial point) (12.3 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 3.95 km (vs Deepest Gold Mine 4.0 km) - "nearly as deep" to Avg Ocean Depth', () => {
      // Input 3.95km.
      // Rule 1 "Very close": Avg Ocean Depth (3.7km) is checked before Deepest Gold Mine (4.0km) due to sort order.
      // Diff to Avg Ocean Depth (3.7km) is 0.25km. 3.7 * 0.10 (threshold) = 0.37km. 0.25 <= 0.37 is true.
      // So, "nearly as deep as Avg Ocean Depth" is chosen.
      const result = getDynamicContextualComparisons(3.95, actualDepthComparisons);
      expect(result[0]).toBe('4.0 km is nearly as deep as the Average Ocean Depth (3.7 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
  });

  describe('Relatable Analogies', () => {
    test('depth 0.7 km (Eiffel Tower)', () => {
      // Input: 0.7km. Not "very close". Not "even further". Analogy: Eiffel (depth > 0.5km). 0.7/0.3 = ~2.
      const result = getDynamicContextualComparisons(0.7, actualDepthComparisons);
      expect(result[0]).toBe('That\'s pretty deep! 0.7 km is like stacking 2 Eiffel Towers!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 0.3 km (Eiffel Tower, single) - now fallback', () => {
      // Input 0.3km. Not "very close". Not "even further".
      // No analogy: Eiffel requires depth > 0.5km.
      // Fallback: not 0, not <0.1. Final fallback message.
      const result = getDynamicContextualComparisons(0.3, actualDepthComparisons);
      expect(result[0]).toBe('That\'s an earthquake at 0.3 km deep.');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 5 km (Burj Khalifa) - now "nearly as deep" to Molloy Deep', () => {
      // Input 5km.
      // Rule 1 "Very close": Molloy Deep (5.55km). Diff 0.55km. 5.55 * 0.10 (threshold) = 0.555km. 0.55 <= 0.555 is true.
      // This "very close" rule takes precedence over Burj Khalifa analogy.
      const result = getDynamicContextualComparisons(5, actualDepthComparisons);
      expect(result[0]).toBe('5.0 km is nearly as deep as the Deepest Point in the Arctic Ocean (Molloy Deep) (5.5 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 57 km (Mount Everest) - now "even further down than" Avg Continental Crust', () => {
      // Input 57km. Not "very close".
      // Rule 2 "Even further down than": Avg Continental Crust (35km). 57 > 35 && 57 < 35*3 (105). True.
      // This takes precedence over Mount Everest analogy.
      const result = getDynamicContextualComparisons(57, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Average Continental Crust (35.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 100 km (Mount Everest) - now "even further down than" Avg Continental Crust', () => {
      // Input 100km. Not "very close".
      // Rule 2 "Even further down than": Avg Continental Crust (35km). 100 > 35 && 100 < 35*3 (105). True.
      // This takes precedence over Mount Everest analogy.
      const result = getDynamicContextualComparisons(100, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Average Continental Crust (35.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 8.8 km (Mount Everest, single) - now "nearly as deep" to Puerto Rico Trench', () => {
      // Input 8.8km.
      // Rule 1 "Very close": Puerto Rico Trench (8.376km). Diff ~0.424km. 8.376 * 0.10 (threshold) = ~0.837km. True.
      // This takes precedence over the single Mount Everest analogy.
      const result = getDynamicContextualComparisons(8.8, actualDepthComparisons);
      expect(result[0]).toBe('8.8 km is nearly as deep as the Deepest Point in the Atlantic Ocean (Puerto Rico Trench) (8.4 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
  });

  describe('Fallback Messages', () => {
    test('depth 0 km (Surface event) - now "nearly as deep" to Panama Canal', () => {
      // Input 0km.
      // Rule 1 "Very close": Panama Canal Max Depth (0.018km). Diff 0.018km. 0.018 <= 0.1 (absolute threshold). True.
      // This takes precedence over the "depth === 0" fallback.
      const result = getDynamicContextualComparisons(0, actualDepthComparisons);
      expect(result[0]).toBe('0.0 km is nearly as deep as the Panama Canal Max Depth (0.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 0.05 km (Very shallow) - now "nearly as deep" to Panama Canal', () => {
      // Input 0.05km.
      // Rule 1 "Very close": Panama Canal Max Depth (0.018km). Diff ~0.032km. 0.018 <= 0.1 (absolute threshold). True.
      // This takes precedence over the "depth < 0.1" fallback.
      // Output message uses .toFixed(1) for depth, so 0.05 becomes 0.1 in the message.
      const result = getDynamicContextualComparisons(0.05, actualDepthComparisons);
      expect(result[0]).toBe('0.1 km is nearly as deep as the Panama Canal Max Depth (0.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
    test('depth 80 km (Deep fallback) - now "even further down than" Avg Continental Crust', () => {
      // Input 80km. Not "very close".
      // Rule 2 "Even further down than": Avg Continental Crust (35km). 80 > 35 && 80 < 35*3 (105). True.
      // This takes precedence over Everest analogy or ">70km" fallback.
      const result = getDynamicContextualComparisons(80, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Average Continental Crust (35.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });

    test('depth 750 km (Exceptionally Deep fallback) - now Everest analogy', () => {
      // Input 750km. Not "very close". Not "even further".
      // Rule 3 Analogy: Mount Everest (depth > 5km). 750/8.848 = ~85 Everests.
      // This takes precedence over the ">700km" fallback.
      const result = getDynamicContextualComparisons(750, actualDepthComparisons);
      expect(result[0]).toBe('Wow, 750.0 km is a long way down – that\'s like stacking about 85 Mount Everests on top of each other!');
      expectAbsenceOfOldPhrasing(result[0]);
    });

    test('depth 450 km (Very Deep fallback) - now Everest analogy', () => {
      // Input 450km. Not "very close". Not "even further".
      // Rule 3 Analogy: Mount Everest (depth > 5km). 450/8.848 = ~51 Everests.
      // This takes precedence over the ">300km" fallback.
      const result = getDynamicContextualComparisons(450, actualDepthComparisons);
      expect(result[0]).toBe('Wow, 450.0 km is a long way down – that\'s like stacking about 51 Mount Everests on top of each other!');
      expectAbsenceOfOldPhrasing(result[0]);
    });

    test('depth 75 km (Deep fallback, if no analogy/comparison fits) - now "even further down than" Avg Continental Crust', () => {
      // Input 75km. Not "very close".
      // Rule 2 "Even further down than": Avg Continental Crust (35km). 75 > 35 && 75 < 35*3 (105). True.
      // This takes precedence over Everest analogy or ">70km" fallback.
      const result = getDynamicContextualComparisons(75, actualDepthComparisons);
       expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Average Continental Crust (35.0 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });

    test('depth 25 km (Generic fallback - still "even further down than Kola")', () => {
      // Input 25km. Not "very close".
      // Rule 2 "Even further down than": Kola (12.262km). 25 > 12.262 && 25 < 12.262*3 (36.786). True.
      // This was already correctly predicted and takes precedence over Everest analogy.
      const result = getDynamicContextualComparisons(25, actualDepthComparisons);
      expect(result[0]).toBe('That\'s incredibly deep! It\'s even further down than the Kola Superdeep Borehole (deepest artificial point) (12.3 km)!');
      expectAbsenceOfOldPhrasing(result[0]);
    });
     test('depth 0.2 km (Generic fallback for very shallow, no analogy)', () => {
      // Input 0.2km. Not "very close". Not "even further". No analogy (Eiffel > 0.5km).
      // Fallback: not 0, not <0.1. Final fallback message.
      const result = getDynamicContextualComparisons(0.2, actualDepthComparisons);
      expect(result[0]).toBe('That\'s an earthquake at 0.2 km deep.');
      expectAbsenceOfOldPhrasing(result[0]);
    });
  });
});
