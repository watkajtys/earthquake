import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import EarthquakeBeachballPanel from './EarthquakeBeachballPanel';
// SimpleFaultBlockDiagram is a child, getFaultType is used internally. Their own tests are trusted.

// Mock getBeachballPathsAndType as it's a complex util for SVG path generation
// and not the primary focus of this component's integration test.
// We just need it to not error out and return some basic structure.
jest.mock('../../utils/detailViewUtils.js', () => {
  const originalModule = jest.requireActual('../../utils/detailViewUtils.js');
  return {
    ...originalModule, // Import and retain all original exports
    getBeachballPathsAndType: jest.fn(() => ({
      shadedPaths: ['M10 10 H 90 V 90 H 10 L 10 10'], // Dummy path
      nodalPlanes: [{ type: 'line', x1: 10, y1: 60, x2: 110, y2: 60 }], // Dummy plane
    })),
  };
});


describe('EarthquakeBeachballPanel', () => {
  const mockNp1Data = { strike: 30, dip: 70, rake: -90 }; // Normal
  const mockNp2Data = { strike: 210, dip: 20, rake: -90 }; // Normal
  const mockPAxis = { azimuth: 120, plunge: 5 };
  const mockTAxis = { azimuth: 300, plunge: 85 };

  const defaultProps = {
    momentTensorProductProps: { 'scalar-moment': '1.2e+20' }, // Needs some value to pass initial check
    np1Data: mockNp1Data,
    np2Data: mockNp2Data,
    selectedFaultPlaneKey: 'np1',
    pAxis: mockPAxis,
    tAxis: mockTAxis,
    exhibitPanelClass: 'test-panel',
    exhibitTitleClass: 'test-title',
    diagramContainerClass: 'test-diagram-container',
    captionClass: 'test-caption',
  };

  test('renders correctly with typical valid props', () => {
    render(<EarthquakeBeachballPanel {...defaultProps} />);
    expect(screen.getByText('"Beach Ball" & Fault Type')).toBeInTheDocument();
  });

  test('renders the beachball SVG and P/T axis labels', () => {
    render(<EarthquakeBeachballPanel {...defaultProps} />);
    // Check for the container that has the grid layout for beachball and block diagram
    const diagramContainer = screen.getByTestId('beachball-diagram-container');
    expect(diagramContainer).toBeInTheDocument();

    // Check for P and T labels (their presence implies the SVG rendered somewhat)
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  test('integrates SimpleFaultBlockDiagram and displays its content (e.g., Normal Fault)', () => {
    render(<EarthquakeBeachballPanel {...defaultProps} />);
    // Based on rake: -90 (Normal Fault), SimpleFaultBlockDiagram should show HW/FW
    expect(screen.getByText('HW')).toBeInTheDocument(); // From SimpleFaultBlockDiagram
    expect(screen.getByText('FW')).toBeInTheDocument(); // From SimpleFaultBlockDiagram
  });

  test('renders the updated detailed caption with fault type', () => {
    render(<EarthquakeBeachballPanel {...defaultProps} />);
    expect(screen.getByText(/This 'Normal Fault' earthquake/i)).toBeInTheDocument();
    // Check for new key phrases
    expect(screen.getByText(/Shaded quadrants show where rock was compressed by the fault movement/i)).toBeInTheDocument();
    expect(screen.getByText(/White quadrants show where rock was pulled apart \(dilatation\)/i)).toBeInTheDocument();
    expect(screen.getByText(/The 'P' \(Pressure\) axis points to the center of the compressional quadrants, indicating the main direction of squeezing/i)).toBeInTheDocument();
    expect(screen.getByText(/The 'T' \(Tension\) axis points to the center of the dilatational quadrants, indicating the main direction of stretching/i)).toBeInTheDocument();
  });

  test('renders a generic caption if fault type is Unknown', () => {
     const propsWithUnknownFault = {
      ...defaultProps,
      np1Data: { ...mockNp1Data, rake: 999 }, // Rake that results in "Unknown Fault Type"
      np2Data: { ...mockNp2Data, rake: 999 },
    };
    render(<EarthquakeBeachballPanel {...propsWithUnknownFault} />);
    expect(screen.getByText(/The 'beachball' diagram \(left\) and simplified block diagram \(right\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/This '.*' earthquake/i)).not.toBeInTheDocument(); // Ensure specific fault name isn't there
    expect(screen.getByText("?")).toBeInTheDocument(); // From SimpleFaultBlockDiagram for unknown
  });


  describe('Conditional Rendering', () => {
    test('returns null if momentTensorProductProps is missing', () => {
      const { container } = render(<EarthquakeBeachballPanel {...defaultProps} momentTensorProductProps={null} />);
      expect(container.firstChild).toBeNull();
    });

    test('returns null if essential nodal plane data is missing (e.g. np1Data.strike is NaN)', () => {
        // The panel's top-level conditional check is:
        // !(momentTensorProductProps && (isValidNumber(np1Data?.strike) || isValidNumber(np2Data?.strike) || isValidNumber(pAxis?.azimuth) || isValidNumber(tAxis?.azimuth)))
        // So if all of these are false, it returns null.
      const { container } = render(
        <EarthquakeBeachballPanel
          {...defaultProps}
          np1Data={{strike: NaN}}
          np2Data={{strike: NaN}}
          pAxis={{azimuth: NaN}}
          tAxis={{azimuth: NaN}}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    test('renders placeholder for SimpleFaultBlockDiagram if rake is invalid', () => {
      const propsWithInvalidRake = {
        ...defaultProps,
        np1Data: { ...mockNp1Data, rake: NaN },
      };
      render(<EarthquakeBeachballPanel {...propsWithInvalidRake} />);
      // SimpleFaultBlockDiagram internally shows "?" for unknown/invalid fault types
      expect(screen.getByText('?')).toBeInTheDocument();
      // Caption should still render, but might be generic for fault type
      expect(screen.getByText(/The 'beachball' diagram \(left\) and simplified block diagram \(right\)/i)).toBeInTheDocument();
    });
  });

  test('matches snapshot with typical valid props', () => {
    const { container } = render(<EarthquakeBeachballPanel {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });
});
