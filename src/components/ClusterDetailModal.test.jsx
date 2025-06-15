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

// Updated mock for getMagnitudeColorStyle to match the actual implementation
const mockGetMagnitudeColorStyleFn = vi.fn(magnitude => {
  if (magnitude === null || magnitude === undefined) return 'bg-slate-600 text-slate-100';
  if (magnitude < 1.0) return 'bg-cyan-800 text-slate-100';
  if (magnitude < 2.5) return 'bg-cyan-700 text-slate-100';
  if (magnitude < 4.0) return 'bg-emerald-700 text-slate-100';
  if (magnitude < 5.0) return 'bg-yellow-700 text-slate-100';
  if (magnitude < 6.0) return 'bg-orange-700 text-slate-100';
  if (magnitude < 7.0) return 'bg-orange-800 text-white';
  if (magnitude < 8.0) return 'bg-red-800 text-white';
  return 'bg-red-900 text-white';
});

const mockProps = {
  cluster: mockCluster,
  onClose: vi.fn(),
  formatDate: vi.fn(time => new Date(time).toLocaleDateString()),
  getMagnitudeColorStyle: mockGetMagnitudeColorStyleFn,
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
      expect(sharedParent).toBe(locationEl.parentElement); // Magnitude and Location are in the same div
      expect(sharedParent.className).toMatch(/flex justify-between items-center/);


      // 2. Check if button has the correct background and text color classes from getMagnitudeColorStyle
      const expectedStyle = mockProps.getMagnitudeColorStyle(quake.properties.mag);
      const [expectedBgClass, expectedTextColorClass] = expectedStyle.split(' ');

      expect(quakeButtonElement.className).toContain(expectedBgClass);
      expect(quakeButtonElement.className).toContain(expectedTextColorClass);

      // Check for border class based on whether magnitude style was applied or it's a fallback
      if (quake.properties.mag !== null && quake.properties.mag !== undefined) {
        expect(quakeButtonElement.className).toContain('border-transparent');
      } else {
        expect(quakeButtonElement.className).toContain('border-slate-600'); // Fallback border
      }

      // 3. Verify Magnitude and Location text elements do NOT have their own color classes (they inherit)
      // Magnitude element's class is "text-sm font-semibold"
      // Location element's class is "text-xs truncate ml-2"
      expect(magnitudeEl.className).not.toMatch(/text-(?!sm)/); // Ensure no other text color like text-slate-XXX
      expect(locationEl.className).not.toMatch(/text-(?!xs)/);   // Ensure no other text color

      // 4. Check Date/Depth div for correct text color
      // The date/depth div is the second child div of the button
      // eslint-disable-next-line testing-library/no-node-access
      const dateDepthDiv = quakeButtonElement.children[1];
      expect(dateDepthDiv).not.toBeNull();
      expect(dateDepthDiv.className).toContain('text-slate-300');
      expect(dateDepthDiv.className).toContain('text-xxs'); // Keep other classes

      expect(mockProps.getMagnitudeColorStyle).toHaveBeenCalledWith(quake.properties.mag);
    });
  });
});
