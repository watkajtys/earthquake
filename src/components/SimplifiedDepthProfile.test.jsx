import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SimplifiedDepthProfile from './SimplifiedDepthProfile';

// Mock getMagnitudeColor as it's an external util not directly tested here
jest.mock('../utils/utils.js', () => ({
  getMagnitudeColor: jest.fn(() => '#ff0000'), // return a consistent color
}));

describe('SimplifiedDepthProfile', () => {
  const defaultProps = {
    earthquakeDepth: 33,
    magnitude: 5.5,
  };

  test('renders without crashing with valid props', () => {
    render(<SimplifiedDepthProfile {...defaultProps} />);
    expect(screen.getByText('Simplified Depth Profile')).toBeInTheDocument();
  });

  test('displays the correct depth and magnitude in the introductory paragraph', () => {
    render(<SimplifiedDepthProfile {...defaultProps} />);
    expect(screen.getByText(/M5.5 event at 33.0 km/i)).toBeInTheDocument();
  });

  describe('getDepthComparisonText integration', () => {
    const testCases = [
      { depth: 0.5, expectedText: /very shallow, happening just beneath the surface/i },
      { depth: 3, expectedText: /upper crust, comparable to the depth of the world's deepest mines/i },
      { depth: 10, expectedText: /Mariana Trench, the deepest point in our oceans/i },
      { depth: 20, expectedText: /Earth's crust\. For comparison, Mount Everest is about 8\.8 km tall/i },
      { depth: 40, expectedText: /uppermost part of the Earth's mantle, just below the crust/i },
      { depth: 80, expectedText: /Earth's lithospheric mantle, the rigid outer part of the Earth/i },
      { depth: 150, expectedText: /Deep into the Earth's upper mantle \(asthenosphere\)/i },
      { depth: 400, expectedText: /Very deep within the Earth's mantle\. Earthquakes this deep are less common/i },
      { depth: 750, expectedText: /Extremely deep, well within the Earth's mantle/i },
    ];

    testCases.forEach(({ depth, expectedText }) => {
      test(`renders correct comparison text for depth ${depth} km`, () => {
        render(<SimplifiedDepthProfile earthquakeDepth={depth} magnitude={4} />);
        expect(screen.getByText(expectedText)).toBeInTheDocument();
      });
    });
     test('renders specific text if depth is exactly 0', () => {
      render(<SimplifiedDepthProfile earthquakeDepth={0} magnitude={2} />);
      // The getDepthComparisonText handles 0 as < 1km.
      expect(screen.getByText(/very shallow, happening just beneath the surface/i)).toBeInTheDocument();
      // Also check the layer name in the intro paragraph
      expect(screen.getByText(/M2.0 event at 0.0 km \(approx. within Surface\)/i)).toBeInTheDocument();
    });
  });

  describe('Handling Invalid/Missing Depth', () => {
    test('renders "Depth information not available..." message if earthquakeDepth is null', () => {
      render(<SimplifiedDepthProfile earthquakeDepth={null} magnitude={5} />);
      expect(screen.getByText(/Depth information not available or invalid for this earthquake\./i)).toBeInTheDocument();
    });

    test('renders "Depth information not available..." message if earthquakeDepth is undefined', () => {
      render(<SimplifiedDepthProfile earthquakeDepth={undefined} magnitude={5} />);
      expect(screen.getByText(/Depth information not available or invalid for this earthquake\./i)).toBeInTheDocument();
    });

    test('renders "Depth information not available..." message if earthquakeDepth is NaN', () => {
      render(<SimplifiedDepthProfile earthquakeDepth={NaN} magnitude={5} />);
      expect(screen.getByText(/Depth information not available or invalid for this earthquake\./i)).toBeInTheDocument();
    });

    test('comparison text paragraph is not present if depth is invalid', () => {
      // The getDepthComparisonText function itself returns a message for null/NaN depth,
      // but SimplifiedDepthProfile has an early exit for invalid depth.
      const { container } = render(<SimplifiedDepthProfile earthquakeDepth={null} magnitude={5} />);
      // Check that the p tag for comparison text is NOT there.
      // It has a class "text-sm text-slate-700 my-2"
      expect(container.querySelector('p.text-sm.text-slate-700.my-2')).not.toBeInTheDocument();
    });
  });

  describe('SVG Layers and Hypocenter', () => {
    test('renders SVG layers text', () => {
      render(<SimplifiedDepthProfile {...defaultProps} />);
      expect(screen.getByText(/Sedimentary\/Upper Crust/i)).toBeInTheDocument();
      expect(screen.getByText(/Continental Crust/i)).toBeInTheDocument();
      expect(screen.getByText(/Lithospheric Mantle/i)).toBeInTheDocument();
      expect(screen.getByText(/Asthenosphere \(Upper Mantle\)/i)).toBeInTheDocument();
    });

    test('renders hypocenter marker when depth is valid', () => {
      const { container } = render(<SimplifiedDepthProfile {...defaultProps} />);
      // Check for the presence of the SVG group that contains the animated circles for the hypocenter
      // This is a bit fragile if class names change, but good for a basic check.
      // The marker itself is an SVG <g><circle...></g> structure. The line has class "absolute left-1/4 w-0.5 bg-red-600"
      expect(container.querySelector('div.absolute.left-1\/4.w-0\\.5.bg-red-600')).toBeInTheDocument();
    });
  });

  test('matches snapshot with typical valid props', () => {
    const { container } = render(<SimplifiedDepthProfile {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });
});
