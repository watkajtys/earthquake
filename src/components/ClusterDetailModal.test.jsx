import React from 'react';
import { render, screen, within } from '@testing-library/react'; // Added 'within'
import { axe } from 'jest-axe';
import { expect, describe, it, vi } from 'vitest';
import ClusterDetailModal from './ClusterDetailModal';

const mockCluster = {
  id: 'cluster1',
  locationName: 'Test Cluster Region',
  quakeCount: 5,
  maxMagnitude: 5.8,
  timeRange: 'Over the last 2 hours',
  originalQuakes: [
    { id: 'q1', properties: { mag: 5.8, place: 'Place A', time: Date.now() - 1000 }, geometry: { coordinates: [10, 20, 5] } },
    { id: 'q2', properties: { mag: 4.5, place: 'Place B', time: Date.now() - 2000 }, geometry: { coordinates: [10.1, 20.1, 6] } },
  ],
};

const mockProps = {
  cluster: mockCluster,
  onClose: vi.fn(),
  formatDate: vi.fn(time => new Date(time).toLocaleDateString()),
  getMagnitudeColorStyle: vi.fn(mag => (mag > 5 ? 'bg-red-500 text-white' : 'bg-yellow-500 text-black')),
  onIndividualQuakeSelect: vi.fn(),
};

// Mock ClusterMiniMap as it's a child component that might have its own complexities
vi.mock('./ClusterMiniMap', () => ({
  default: () => <div data-testid="mock-cluster-mini-map">Mock Cluster Mini Map</div>,
}));

describe('ClusterDetailModal Accessibility', () => {
  beforeEach(() => {
    // Mock IntersectionObserver if any child components might use it
    const MockIntersectionObserver = vi.fn();
    MockIntersectionObserver.prototype.observe = vi.fn();
    MockIntersectionObserver.prototype.unobserve = vi.fn();
    MockIntersectionObserver.prototype.disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should have no axe violations when displaying cluster data', async () => {
    const { container } = render(<ClusterDetailModal {...mockProps} />);

    // Ensure modal content is rendered
    expect(screen.getByText(`Cluster: ${mockCluster.locationName}`)).toBeInTheDocument();
    expect(screen.getByText(`Total Earthquakes:`)).toBeInTheDocument(); // Check for part of the content

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should return null and have no violations if cluster data is not provided', async () => {
    const { container } = render(<ClusterDetailModal {...mockProps} cluster={null} />);
    expect(container.firstChild).toBeNull(); // Check that nothing is rendered

    // Running axe on an empty container should ideally have no violations.
    // Or, more accurately, test that the component doesn't render anything to test.
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('ClusterDetailModal Quake Item Rendering', () => {
  beforeEach(() => {
    // Mock IntersectionObserver if any child components might use it
    const MockIntersectionObserver = vi.fn();
    MockIntersectionObserver.prototype.observe = vi.fn();
    MockIntersectionObserver.prototype.unobserve = vi.fn();
    MockIntersectionObserver.prototype.disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks(); // Clear mocks to ensure test isolation
  });

  it('should render magnitude and location on the same line with correct magnitude color', () => {
    render(<ClusterDetailModal {...mockProps} />);

    mockCluster.originalQuakes.forEach(quake => {
      const magnitudeText = `M ${quake.properties.mag.toFixed(1)}`;
      const locationText = quake.properties.place;
      const quakeItemTitle = `Click to view details for ${magnitudeText} - ${locationText}`;

      const quakeButtonElement = screen.getByTitle(quakeItemTitle);
      // eslint-disable-next-line testing-library/no-node-access
      expect(quakeButtonElement).toBeInTheDocument(); // Ensure the button itself is found

      // Use `within` to scope queries to this specific quake item's button
      const utils = within(quakeButtonElement);
      const magnitudeEl = utils.getByText(magnitudeText);
      const locationEl = utils.getByText(locationText);

      // 1. Check if magnitude and location are on the same line
      // Both magnitudeEl (<p>) and locationEl (<p>) should be direct children of the same flex div
      // eslint-disable-next-line testing-library/no-node-access
      const sharedParent = magnitudeEl.parentElement;
      // eslint-disable-next-line testing-library/no-node-access
      expect(sharedParent).toBe(locationEl.parentElement);
      expect(sharedParent.className).toContain('flex');
      expect(sharedParent.className).toContain('justify-between');
      expect(sharedParent.className).toContain('items-center');


      // 2. Check if magnitude is colored correctly
      const expectedColorClass = mockProps.getMagnitudeColorStyle(quake.properties.mag);
      // The magnitude text is inside a <p> tag which should have the color class
      expect(magnitudeEl.className).toContain(expectedColorClass.split(' ')[0]); // Check first class if multiple (e.g. bg-red-500)
      if (expectedColorClass.split(' ').length > 1) {
        expect(magnitudeEl.className).toContain(expectedColorClass.split(' ')[1]); // Check second class if multiple (e.g. text-white)
      }
      expect(mockProps.getMagnitudeColorStyle).toHaveBeenCalledWith(quake.properties.mag);
    });
  });
});
