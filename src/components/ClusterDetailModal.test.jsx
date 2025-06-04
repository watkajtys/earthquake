import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { expect, describe, it, vi } from 'vitest';
import ClusterDetailModal from './ClusterDetailModal';

// Mock ClusterMiniMap: The factory provides the mock implementation directly.
// The vi.fn() is defined inside the factory and assigned to the default export.
vi.mock('./ClusterMiniMap', () => ({
  default: vi.fn(() => <div data-testid="mock-cluster-mini-map">Mock Cluster Mini Map</div>),
}));

// Import ClusterMiniMap AFTER the vi.mock call.
// Vitest ensures this import receives the mocked version, where ClusterMiniMap.default is the vi.fn().
import ClusterMiniMap from './ClusterMiniMap';

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

describe('ClusterDetailModal', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockProps.onClose.mockClear();
    mockProps.formatDate.mockClear();
    mockProps.getMagnitudeColorStyle.mockClear();
    mockProps.onIndividualQuakeSelect.mockClear();

    // ClusterMiniMap.default is the vi.fn() from the factory.
    ClusterMiniMap.default.mockClear();
    // The factory sets the default rendering. If a test needs to override:
    // ClusterMiniMap.default.mockReturnValue(<AnotherJsx />);
    // For most tests here, the factory's return is fine, but we ensure it's reset if needed.
    ClusterMiniMap.default.mockReturnValue(<div data-testid="mock-cluster-mini-map">Mock Cluster Mini Map</div>);


    // Mock IntersectionObserver
    const mockIO = vi.fn();
    mockIO.prototype.observe = vi.fn();
    mockIO.prototype.unobserve = vi.fn();
    mockIO.prototype.disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', mockIO);
  });

  afterEach(() => {
    vi.unstubAllGlobals(); // Clean up global stubs
  });

  describe('Accessibility', () => {
    it('should have no axe violations when displaying cluster data', async () => {
      const { container } = render(<ClusterDetailModal {...mockProps} />);
      expect(screen.getByText(`Cluster: ${mockCluster.locationName}`)).toBeInTheDocument();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should return null and have no violations if cluster data is not provided', async () => {
      const { container } = render(<ClusterDetailModal {...mockProps} cluster={null} />);
      expect(container.firstChild).toBeNull();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Rendering and Content', () => {
    beforeEach(() => {
      render(<ClusterDetailModal {...mockProps} />);
    });

    it('renders cluster summary information correctly', () => {
      expect(screen.getByText(`Cluster: ${mockCluster.locationName}`)).toBeInTheDocument();
      expect(screen.getByText('Total Earthquakes:')).toBeInTheDocument();
      expect(screen.getByText(mockCluster.quakeCount.toString())).toBeInTheDocument();

      // Make assertion for Maximum Magnitude more specific
      const maxMagLabel = screen.getByText('Maximum Magnitude:');
      expect(maxMagLabel).toBeInTheDocument();
      expect(maxMagLabel.nextElementSibling.textContent).toBe(`M ${mockCluster.maxMagnitude.toFixed(1)}`);

      expect(screen.getByText('Active Period:')).toBeInTheDocument();
      expect(screen.getByText(mockCluster.timeRange)).toBeInTheDocument();
    });

    it('does NOT render "Depth Range"', () => {
      expect(screen.queryByText('Depth Range:')).not.toBeInTheDocument();
    });

    it('renders the ClusterMiniMap with correct props', () => {
      expect(screen.getByTestId('mock-cluster-mini-map')).toBeInTheDocument();
      // Check if ClusterMiniMap.default (the mock fn from factory) was called with correct props
      expect(ClusterMiniMap.default).toHaveBeenCalledWith(
        expect.objectContaining({
          cluster: mockCluster,
          onQuakeSelect: mockProps.onIndividualQuakeSelect, // This is the key check
        }),
        expect.anything() // For React's context argument
      );
    });

    it('renders the list of individual earthquakes', () => {
      expect(screen.getByText('Earthquakes in this Cluster')).toBeInTheDocument();

      // To handle potentially duplicate magnitude texts, find list items first
      const listItems = screen.getAllByRole('button', { name: /Click to view details for M/i });
      expect(listItems.length).toBe(mockCluster.originalQuakes.length);

      mockCluster.originalQuakes.forEach((quake, index) => {
        const listItem = listItems[index];
        // Use within to scope queries to the list item
        expect(within(listItem).getByText(`M ${quake.properties.mag.toFixed(1)}`)).toBeInTheDocument();
        expect(within(listItem).getByText(quake.properties.place)).toBeInTheDocument();

        // Check if formatDate was called for each quake's time
        expect(mockProps.formatDate).toHaveBeenCalledWith(quake.properties.time);
        // Check if the formatted date is displayed (assuming formatDate returns it directly)
        expect(screen.getByText(new Date(quake.properties.time).toLocaleDateString())).toBeInTheDocument();

        // Ensure individual depth is NOT displayed for each quake in the list
        const depthRegex = new RegExp(`Depth: ${quake.geometry.coordinates[2]}.* km`, 'i');
        expect(screen.queryByText(depthRegex)).not.toBeInTheDocument();

      });
    });

    it('calls getMagnitudeColorStyle for each earthquake in the list', () => {
        mockCluster.originalQuakes.forEach(quake => {
            expect(mockProps.getMagnitudeColorStyle).toHaveBeenCalledWith(quake.properties.mag);
        });
    });

    it('calls onClose when the close button is clicked', () => {
      screen.getByLabelText('Close modal').click();
      expect(mockProps.onClose).toHaveBeenCalledTimes(1);
    });

    // Additional tests for keyboard navigation, focus trapping, etc., can be added here
    // For example, testing if onIndividualQuakeSelect is called when an item is clicked
    it('calls onIndividualQuakeSelect when a quake item is clicked', () => {
      // Find the first quake item (using its text content as a proxy)
      const firstQuakeItem = screen.getByText(mockCluster.originalQuakes[0].properties.place);
      firstQuakeItem.click(); // Simulate click
      expect(mockProps.onIndividualQuakeSelect).toHaveBeenCalledWith(mockCluster.originalQuakes[0]);
      expect(mockProps.onIndividualQuakeSelect).toHaveBeenCalledTimes(1);
    });

  });
});
