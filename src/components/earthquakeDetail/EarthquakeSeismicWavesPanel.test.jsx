import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarthquakeSeismicWavesPanel from './EarthquakeSeismicWavesPanel';

describe('EarthquakeSeismicWavesPanel', () => {
  const defaultProps = {
    exhibitPanelClass: 'test-panel-class',
    exhibitTitleClass: 'test-title-class',
    captionClass: 'test-caption-class',
  };

  beforeEach(() => {
    render(<EarthquakeSeismicWavesPanel {...defaultProps} />);
  });

  test('renders the main title', () => {
    expect(screen.getByText('Understanding Seismic Waves')).toBeInTheDocument();
  });

  test('renders P-Waves section with title and description', () => {
    expect(screen.getByText('P-Waves (Primary)')).toBeInTheDocument();
    expect(screen.getByText('Fastest, compressional.')).toBeInTheDocument();
  });

  test('renders S-Waves section with title and description', () => {
    expect(screen.getByText('S-Waves (Secondary)')).toBeInTheDocument();
    expect(screen.getByText('Slower, shear, solids only.')).toBeInTheDocument();
  });

  test('renders SVG for P-Waves animation', () => {
    // Check for the presence of the SVG based on a unique element or structure if possible
    // For now, we'll check if the "Push-Pull Motion →" text within that SVG's section is there.
    // This is an indirect check for the SVG's conceptual presence.
    const pWaveContainer = screen.getByText('P-Waves (Primary)').closest('div');
    expect(pWaveContainer.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('Push-Pull Motion →')).toBeInTheDocument();

  });

  test('renders SVG for S-Waves animation', () => {
    const sWaveContainer = screen.getByText('S-Waves (Secondary)').closest('div');
    expect(sWaveContainer.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('Side-to-Side Motion ↕')).toBeInTheDocument();
  });

  describe('Earth Cross-Section Diagram', () => {
    test('renders the title for the Earth cross-section diagram', () => {
      expect(screen.getByText('P & S Wave Travel Through Earth')).toBeInTheDocument();
    });

    test('renders the SVG for the Earth cross-section', () => {
      // Check for a unique element within this specific SVG, e.g., a layer label
      // or the presence of the SVG itself within the correct section.
      const crossSectionTitle = screen.getByText('P & S Wave Travel Through Earth');
      const sectionDiv = crossSectionTitle.closest('div');
      expect(sectionDiv.querySelector('svg')).toBeInTheDocument();
      // Check for a layer name as a proxy for SVG content
      expect(screen.getByText('Outer Core (Liquid)')).toBeInTheDocument();
    });

    test('renders the caption for the Earth cross-section diagram', () => {
      expect(screen.getByText(/P-waves \(e\.g\., blue lines\) are compressional and can travel through all of Earth's layers/i)).toBeInTheDocument();
      expect(screen.getByText(/This creates an "S-wave shadow zone"/i)).toBeInTheDocument();
    });
  });

  test('renders the caption about surface waves', () => {
    expect(screen.getByText(/Surface waves \(Love & Rayleigh\) arrive later and often cause most shaking\./i)).toBeInTheDocument();
  });

  test('matches snapshot with typical props', () => {
    // Re-render for snapshot to ensure it's clean
    const { container } = render(<EarthquakeSeismicWavesPanel {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });
});
