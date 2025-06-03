import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import EarthquakeFaultDiagramPanel from './EarthquakeFaultDiagramPanel';
import InteractiveFaultDiagram from './InteractiveFaultDiagram'; // For direct testing
// getFaultType is imported by EarthquakeFaultDiagramPanel, its own unit tests are trusted.

describe('EarthquakeFaultDiagramPanel', () => {
  const mockNp1Data = {
    strike: 330,
    dip: 40,
    rake: -90, // Normal fault
    description: 'Nodal Plane 1 description',
  };
  const mockNp2Data = {
    strike: 120,
    dip: 55,
    rake: -85, // Also normal
    description: 'Nodal Plane 2 description',
  };

  const defaultProps = {
    selectedFaultPlaneKey: 'np1',
    setSelectedFaultPlaneKey: jest.fn(),
    np1Data: mockNp1Data,
    np2Data: mockNp2Data,
    selectedFaultPlane: mockNp1Data,
    exhibitPanelClass: 'test-panel-class',
    exhibitTitleClass: 'test-title-class',
    diagramContainerClass: 'test-diagram-container-class',
    highlightClass: 'test-highlight-class',
  };

  test('renders correctly with typical valid props', () => {
    render(<EarthquakeFaultDiagramPanel {...defaultProps} />);
    expect(screen.getByText('How Did the Ground Break?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nodal Plane 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nodal Plane 2/i })).toBeInTheDocument();
  });

  describe('Strike, Dip, Rake Display and Tooltips', () => {
    beforeEach(() => {
      render(<EarthquakeFaultDiagramPanel {...defaultProps} />);
    });

    test('displays Strike, Dip, and Rake values', () => {
      expect(screen.getByText(/Strike:/i)).toBeInTheDocument();
      expect(screen.getByText(`${mockNp1Data.strike}°`)).toBeInTheDocument();
      expect(screen.getByText(/Dip:/i)).toBeInTheDocument();
      expect(screen.getByText(`${mockNp1Data.dip}°`)).toBeInTheDocument();
      expect(screen.getByText(/Rake:/i)).toBeInTheDocument();
      expect(screen.getByText(`${mockNp1Data.rake}°`)).toBeInTheDocument();
    });

    test('Strike has correct tooltip', () => {
      const strikeElement = screen.getByText(/Strike:/i).closest('span');
      expect(strikeElement).toHaveAttribute('title', 'The compass direction of the fault line (azimuth) as it would appear on a horizontal surface.');
    });

    test('Dip has correct tooltip', () => {
      const dipElement = screen.getByText(/Dip:/i).closest('span');
      expect(dipElement).toHaveAttribute('title', 'The angle the fault plane slopes down into the earth, measured from a horizontal surface to the fault plane.');
    });

    test('Rake has correct tooltip', () => {
      const rakeElement = screen.getByText(/Rake:/i).closest('span');
      expect(rakeElement).toHaveAttribute('title', expect.stringContaining('The direction one side of the fault moved relative to the other'));
    });
  });

  describe('Fault Type Display', () => {
    test('displays correct fault type name, icon, and description for Normal Fault', () => {
      render(<EarthquakeFaultDiagramPanel {...defaultProps} />); // rake -90
      expect(screen.getByText('Normal Fault')).toBeInTheDocument();
      expect(screen.getByText('⬇️⬆️')).toBeInTheDocument(); // Icon
      expect(screen.getByText(/One block of earth moves down relative to the other/i)).toBeInTheDocument();
    });

    test('displays correct fault type for Reverse Fault', () => {
      const reverseFaultProps = {
        ...defaultProps,
        selectedFaultPlane: { ...mockNp1Data, rake: 90 },
        np1Data: { ...mockNp1Data, rake: 90 },

      };
      render(<EarthquakeFaultDiagramPanel {...reverseFaultProps} />);
      expect(screen.getByText('Reverse/Thrust Fault')).toBeInTheDocument();
      expect(screen.getByText('⬆️⬇️')).toBeInTheDocument(); // Icon
    });
  });

  test('calls setSelectedFaultPlaneKey when NP2 button is clicked', () => {
    render(<EarthquakeFaultDiagramPanel {...defaultProps} />);
    const np2Button = screen.getByRole('button', { name: /Nodal Plane 2/i });
    fireEvent.click(np2Button);
    expect(defaultProps.setSelectedFaultPlaneKey).toHaveBeenCalledWith('np2');
  });

  describe('Conditional Rendering', () => {
    test('returns null if selectedFaultPlane is null', () => {
      const { container } = render(<EarthquakeFaultDiagramPanel {...defaultProps} selectedFaultPlane={null} />);
      expect(container.firstChild).toBeNull();
    });

    test('returns null if selectedFaultPlane.strike is NaN', () => {
      const { container } = render(
        <EarthquakeFaultDiagramPanel
          {...defaultProps}
          selectedFaultPlane={{ ...mockNp1Data, strike: NaN }}
          np1Data={{ ...mockNp1Data, strike: NaN }}
        />
      );
      expect(container.firstChild).toBeNull();
    });

     test('does not render NP1 button if np1Data.strike is NaN', () => {
      render(<EarthquakeFaultDiagramPanel {...defaultProps} np1Data={{ ...mockNp1Data, strike: NaN}} />);
      expect(screen.queryByRole('button', { name: /Nodal Plane 1/i })).not.toBeInTheDocument();
    });

    test('does not render NP2 button if np2Data.strike is NaN', () => {
      render(<EarthquakeFaultDiagramPanel {...defaultProps} np2Data={{ ...mockNp2Data, strike: NaN}} />);
      expect(screen.queryByRole('button', { name: /Nodal Plane 2/i })).not.toBeInTheDocument();
    });
  });

  test('matches snapshot with typical valid props', () => {
    const { container } = render(<EarthquakeFaultDiagramPanel {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });
});


describe('InteractiveFaultDiagram', () => {
  // Test InteractiveFaultDiagram directly for its specific content
  test('renders InteractiveFaultDiagram with Block A and Block B labels', () => {
    const planeData = { strike: 45, dip: 30, rake: -90 }; // Example data
    render(<InteractiveFaultDiagram planeData={planeData} planeKey="np1" />);

    // Check for SVG text elements. This might be fragile if text content changes slightly.
    expect(screen.getByText('Block A')).toBeInTheDocument();
    expect(screen.getByText('Block B')).toBeInTheDocument();
    expect(screen.getByText('Fault View (NP1)')).toBeInTheDocument(); // Title of diagram
  });

  test('InteractiveFaultDiagram matches snapshot with sample data', () => {
    const planeData = { strike: 45, dip: 30, rake: -90 };
    const { container } = render(<InteractiveFaultDiagram planeData={planeData} planeKey="np1" />);
    expect(container).toMatchSnapshot();
  });

  test('InteractiveFaultDiagram returns null if planeData.strike is NaN', () => {
    const planeData = { strike: NaN, dip:30, rake: -90 };
    const { container } = render(<InteractiveFaultDiagram planeData={planeData} planeKey="np1" />);
    expect(container.firstChild).toBeNull();
  });
});
