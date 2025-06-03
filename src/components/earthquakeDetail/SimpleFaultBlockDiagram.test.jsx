import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SimpleFaultBlockDiagram from './SimpleFaultBlockDiagram';

describe('SimpleFaultBlockDiagram', () => {
  const faultTypes = {
    normal: { name: "Normal Fault", icon: "⬇️⬆️", description: "..." },
    reverse: { name: "Reverse/Thrust Fault", icon: "⬆️⬇️", description: "..." },
    leftLateral: { name: "Left-Lateral Strike-Slip Fault", icon: "⬅️➡️", description: "..." },
    rightLateral: { name: "Right-Lateral Strike-Slip Fault", icon: "➡️⬅️", description: "..." },
    obliqueNormalLeft: { name: "Oblique Normal Fault (Left-Lateral component)", icon: "↙️↗️", description: "..." },
    obliqueReverseRight: { name: "Oblique Reverse Fault (Right-Lateral component)", icon: "↗️↙️", description: "..." },
    unknown: { name: "Unknown Fault Type", icon: "❓", description: "..." },
  };

  test('renders Normal Fault diagram and matches snapshot', () => {
    const { container } = render(<SimpleFaultBlockDiagram faultType={faultTypes.normal} />);
    // Check for a key element if possible, e.g., HW/FW labels for dip-slip faults
    expect(screen.getByText('HW')).toBeInTheDocument();
    expect(screen.getByText('FW')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  test('renders Reverse/Thrust Fault diagram and matches snapshot', () => {
    const { container } = render(<SimpleFaultBlockDiagram faultType={faultTypes.reverse} />);
    expect(screen.getByText('HW')).toBeInTheDocument();
    expect(screen.getByText('FW')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  test('renders Left-Lateral Strike-Slip Fault diagram and matches snapshot', () => {
    const { container } = render(<SimpleFaultBlockDiagram faultType={faultTypes.leftLateral} />);
    // For strike-slip, specific labels like HW/FW are not typically used in this simple representation
    // Rely on snapshot for SVG structure.
    expect(container.querySelector('svg')).toBeInTheDocument(); // Basic check
    expect(container).toMatchSnapshot();
  });

  test('renders Right-Lateral Strike-Slip Fault diagram and matches snapshot', () => {
    const { container } = render(<SimpleFaultBlockDiagram faultType={faultTypes.rightLateral} />);
    expect(container.querySelector('svg')).toBeInTheDocument(); // Basic check
    expect(container).toMatchSnapshot();
  });

  test('renders Oblique Normal Fault as Normal Fault diagram and matches snapshot', () => {
    const { container } = render(<SimpleFaultBlockDiagram faultType={faultTypes.obliqueNormalLeft} />);
    // Should render the Normal fault diagram (dominant component)
    expect(screen.getByText('HW')).toBeInTheDocument();
    expect(screen.getByText('FW')).toBeInTheDocument();
    expect(container).toMatchSnapshot(); // Will be similar/identical to Normal Fault snapshot
  });

  test('renders Oblique Reverse Fault as Reverse Fault diagram and matches snapshot', () => {
    const { container } = render(<SimpleFaultBlockDiagram faultType={faultTypes.obliqueReverseRight} />);
    // Should render the Reverse fault diagram
    expect(screen.getByText('HW')).toBeInTheDocument();
    expect(screen.getByText('FW')).toBeInTheDocument();
    expect(container).toMatchSnapshot(); // Will be similar/identical to Reverse Fault snapshot
  });


  test('renders Unknown Fault Type placeholder and matches snapshot', () => {
    const { container } = render(<SimpleFaultBlockDiagram faultType={faultTypes.unknown} />);
    expect(screen.getByText('?')).toBeInTheDocument(); // Check for the question mark
    expect(container).toMatchSnapshot();
  });

  describe('Invalid/Missing Props', () => {
    test('renders placeholder or specific message if faultType is null', () => {
      render(<SimpleFaultBlockDiagram faultType={null} />);
      // The component currently renders a div with "Fault diagram unavailable."
      expect(screen.getByText('Fault diagram unavailable.')).toBeInTheDocument();
    });

    test('renders placeholder or specific message if faultType.name is undefined', () => {
      render(<SimpleFaultBlockDiagram faultType={{ description: "No name" }} />);
      expect(screen.getByText('Fault diagram unavailable.')).toBeInTheDocument();
    });

    test('renders Unknown placeholder if faultType.name is not recognized and matches snapshot', () => {
        const { container } = render(<SimpleFaultBlockDiagram faultType={{ name: "Some Weird Fault" }} />);
        expect(screen.getByText('?')).toBeInTheDocument();
        expect(container).toMatchSnapshot();
    });
  });
});
