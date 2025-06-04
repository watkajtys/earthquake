import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest'; // Added beforeEach, afterEach
import ClusterDetailModal from './ClusterDetailModal';

// Mock EarthquakeMap
vi.mock('./EarthquakeMap', () => ({
  default: vi.fn((props, ref) => <div data-testid="mock-earthquake-map">Mock Earthquake Map</div>)
}));
import EarthquakeMap from './EarthquakeMap'; // Import the mock

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

// Shared beforeEach and afterEach for all describe blocks if needed, or keep them scoped
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
  vi.clearAllMocks(); // Clear mocks after each test
});

describe('ClusterDetailModal Accessibility', () => {
  // beforeEach and afterEach are now top-level for this example, or could be duplicated/scoped
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

describe('EarthquakeMap Integration', () => {
  it('should render EarthquakeMap with correct props when cluster data is provided', () => {
    render(<ClusterDetailModal {...mockProps} />);

    expect(EarthquakeMap).toHaveBeenCalled();
    expect(screen.getByTestId('mock-earthquake-map')).toBeInTheDocument();

    // originalQuakes are sorted by time in the component to become sortedQuakes
    // For this test, mockCluster.originalQuakes is already effectively sorted for our needs.
    const expectedSortedQuakes = [...mockCluster.originalQuakes].sort((a, b) => (b.properties?.time || 0) - (a.properties?.time || 0));


    expect(EarthquakeMap).toHaveBeenCalledWith(
      expect.objectContaining({
        earthquakesToPlot: expectedSortedQuakes,
        // No longer passing individual lat/lon/mag/title/zoom for main display here
      }),
      undefined
    );
  });

  it('should pass default props to EarthquakeMap if cluster has no quakes', () => {
    const emptyClusterProps = {
      ...mockProps,
      cluster: {
        ...mockCluster,
        originalQuakes: [],
        quakeCount: 0,
        maxMagnitude: 0,
      },
    };
    render(<ClusterDetailModal {...emptyClusterProps} />);

    expect(EarthquakeMap).toHaveBeenCalled();
    expect(screen.getByTestId('mock-earthquake-map')).toBeInTheDocument();

    expect(EarthquakeMap).toHaveBeenCalledWith(
      expect.objectContaining({
        earthquakesToPlot: [],
        latitude: 0,
        longitude: 0,
        magnitude: 0,
        title: "No cluster data available", // Updated title for this case
        nearbyQuakes: [], // Component explicitly passes this for fallback
        // zoom is no longer passed from here
      }),
      undefined
    );
  });
});
