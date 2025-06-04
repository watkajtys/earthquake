import React from 'react';
import { render, screen } from '@testing-library/react';
import SimplifiedDepthProfile, { DEPTH_COMPARISONS as actualDepthComparisons } from './SimplifiedDepthProfile'; // Import const

// Mock the getMagnitudeColor utility function as it's not relevant to these tests
// and might cause issues if not properly handled in a test environment.
jest.mock('../utils/utils.js', () => ({
  getMagnitudeColor: jest.fn(() => '#000000'), // Return a default color
}));

describe('SimplifiedDepthProfile', () => {
  const defaultProps = {
    earthquakeDepth: 50, // Typical depth
    magnitude: 5.5,
  };

  // Test 1: Textual List Rendering (Heading)
  test('renders the textual list heading for comparisons', () => {
    render(<SimplifiedDepthProfile {...defaultProps} />);
    expect(screen.getByText('Real-World Depth & Height Comparisons:')).toBeInTheDocument();
  });

  // Test 2: Textual List Items Rendering (Names, Depths, Heights)
  test('renders all comparison items in the textual list with correct details', () => {
    render(<SimplifiedDepthProfile {...defaultProps} />);
    actualDepthComparisons.forEach(comp => {
      const expectedText = `${comp.name}: ${comp.depth.toFixed(1)} km${comp.isHeight ? ' (Height)' : ''}`;
      const testId = `comparison-text-item-${comp.name.replace(/\s+/g, '-').toLowerCase()}`;
      const listItem = screen.getByTestId(testId);
      expect(listItem).toHaveTextContent(expectedText);
    });
  });

  // Test 3: Visual Marker Label Rendering (Presence and Height indication)
  test('renders visual labels for comparison items on the chart', () => {
    render(<SimplifiedDepthProfile {...defaultProps} />);
    // Test a subset to avoid overly long tests, but include a depth and a height
    const sampleComparisons = [
      actualDepthComparisons.find(c => c.name === "Challenger Deep (ocean deepest)"),
      actualDepthComparisons.find(c => c.name === "Height of Mount Everest"),
      actualDepthComparisons.find(c => c.name === "Panama Canal Max Depth"), // A very shallow depth
    ].filter(Boolean); // Filter out undefined if names change

    sampleComparisons.forEach(comp => {
      const testId = `comparison-visual-label-${comp.name.replace(/\s+/g, '-').toLowerCase()}`;
      const visualLabel = screen.getByTestId(testId);
      expect(visualLabel).toBeInTheDocument();

      const expectedLabelText = `(${comp.depth.toFixed(1)} km${comp.isHeight ? ' H' : ''})`;
      expect(visualLabel).toHaveTextContent(expectedLabelText);

      // Check title attribute for full text
      const expectedTitle = `${comp.name}: ${comp.depth.toFixed(1)} km${comp.isHeight ? ' (Height)' : ''}`;
      expect(visualLabel).toHaveAttribute('title', expectedTitle);
    });
  });

  // Test 4: Handling of No Earthquake Depth Data
  test('displays fallback message when earthquakeDepth is null', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={null} magnitude={5.0} />);
    expect(screen.getByText('Depth information not available or invalid for this earthquake.')).toBeInTheDocument();
    // Ensure comparison lists are not present
    expect(screen.queryByTestId('comparison-text-list-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('depth-profile-chart')).not.toBeInTheDocument();
  });

   test('displays fallback message when earthquakeDepth is undefined', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={undefined} magnitude={5.0} />);
    expect(screen.getByText('Depth information not available or invalid for this earthquake.')).toBeInTheDocument();
    expect(screen.queryByTestId('comparison-text-list-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('depth-profile-chart')).not.toBeInTheDocument();
  });


  // Test 5: Rendering with a Zero Depth Earthquake
  test('renders correctly for a zero-depth earthquake', () => {
    render(<SimplifiedDepthProfile earthquakeDepth={0} magnitude={3.0} />);
    // Check for main earthquake label at 0km
    // This relies on the specific text content and structure of the main earthquake label
    // May need adjustment if the main label's rendering changes significantly
    expect(screen.getByText('0.0 km')).toBeInTheDocument(); // Main quake depth label

    // Check if a height comparison visual label is still rendered correctly
    const everestVisualLabel = screen.getByTestId('comparison-visual-label-height-of-mount-everest');
    expect(everestVisualLabel).toBeInTheDocument();
    expect(everestVisualLabel).toHaveTextContent('(8.8 km H)');

    // Check if a very shallow depth comparison (like Panama Canal) is rendered
     const panamaCanalVisualLabel = screen.getByTestId('comparison-visual-label-panama-canal-max-depth');
     expect(panamaCanalVisualLabel).toBeInTheDocument();
     expect(panamaCanalVisualLabel).toHaveTextContent('(0.0 km)'); // it's 0.018km, toFixed(1) makes it 0.0
  });

  // Test 6: Textual list applies two-column layout styling
  test('textual comparison list has two-column layout classes', () => {
    render(<SimplifiedDepthProfile {...defaultProps} />);
    const listElement = screen.getByTestId('comparison-text-list');
    expect(listElement).toHaveClass('md:grid');
    expect(listElement).toHaveClass('md:grid-cols-2');
    expect(listElement).toHaveClass('md:gap-x-4');
  });

});
