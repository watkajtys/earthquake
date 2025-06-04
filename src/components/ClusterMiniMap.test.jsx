import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClusterMiniMap from './ClusterMiniMap';
import EarthquakeMap from './EarthquakeMap'; // Actual component

// Mock EarthquakeMap to verify props
vi.mock('./EarthquakeMap', () => ({
  default: vi.fn(() => <div data-testid="mock-earthquake-map">Mock Earthquake Map</div>),
}));

const mockClusterBase = {
  id: 'test-cluster',
  locationName: 'Test Cluster Area',
  quakeCount: 3,
  maxMagnitude: 0, // Will be overridden
  timeRange: 'Last hour',
  originalQuakes: [
    { id: 'q1', properties: { mag: 5.5, place: 'Central Quake', time: Date.now() - 1000 }, geometry: { coordinates: [-118.2437, 34.0522, 10] } }, // LA
    { id: 'q2', properties: { mag: 4.0, place: 'North Quake', time: Date.now() - 2000 }, geometry: { coordinates: [-118.2437, 34.1522, 5] } },  // Slightly North of LA
    { id: 'q3', properties: { mag: 3.0, place: 'East Quake', time: Date.now() - 3000 }, geometry: { coordinates: [-118.1437, 34.0522, 12] } },   // Slightly East of LA
  ],
};

// Test suite for ClusterMiniMap
describe('ClusterMiniMap', () => {
  beforeEach(() => {
    // Clear mock call history before each test
    EarthquakeMap.mockClear();
  });

  it('should render the EarthquakeMap component', () => {
    render(<ClusterMiniMap cluster={mockClusterBase} />);
    expect(screen.getByTestId('mock-earthquake-map')).toBeInTheDocument();
  });

  it('should identify the highest magnitude quake and pass its details to EarthquakeMap', () => {
    const clusterWithSpecificMax = {
      ...mockClusterBase,
      originalQuakes: [
        { id: 'q_low', properties: { mag: 3.0, place: 'Low Mag Quake', time: Date.now() - 1000 }, geometry: { coordinates: [1, 1, 10] } },
        { id: 'q_high', properties: { mag: 6.2, place: 'High Mag Quake', time: Date.now() - 2000 }, geometry: { coordinates: [2, 2, 20] } },
        { id: 'q_mid', properties: { mag: 4.5, place: 'Mid Mag Quake', time: Date.now() - 3000 }, geometry: { coordinates: [3, 3, 30] } },
      ],
    };
    render(<ClusterMiniMap cluster={clusterWithSpecificMax} />);

    expect(EarthquakeMap).toHaveBeenCalledTimes(1);
    const passedProps = EarthquakeMap.mock.calls[0][0];

    expect(passedProps.latitude).toBe(2); // from q_high
    expect(passedProps.longitude).toBe(2); // from q_high
    expect(passedProps.magnitude).toBe(6.2);
    expect(passedProps.title).toBe('High Mag Quake');
  });

  it('should pass other quakes to EarthquakeMap as nearbyQuakes', () => {
    const clusterWithSpecificMax = {
      ...mockClusterBase,
      originalQuakes: [
        { id: 'q_low', properties: { mag: 3.0, place: 'Low Mag Quake', time: Date.now() - 1000 }, geometry: { coordinates: [1, 1, 10] } },
        { id: 'q_high', properties: { mag: 6.2, place: 'High Mag Quake', time: Date.now() - 2000 }, geometry: { coordinates: [2, 2, 20] } },
        { id: 'q_mid', properties: { mag: 4.5, place: 'Mid Mag Quake', time: Date.now() - 3000 }, geometry: { coordinates: [3, 3, 30] } },
      ],
    };
    render(<ClusterMiniMap cluster={clusterWithSpecificMax} />);

    expect(EarthquakeMap).toHaveBeenCalledTimes(1);
    const passedProps = EarthquakeMap.mock.calls[0][0];

    expect(passedProps.nearbyQuakes).toBeInstanceOf(Array);
    expect(passedProps.nearbyQuakes).toHaveLength(2);
    // Check if q_high is NOT in nearbyQuakes
    expect(passedProps.nearbyQuakes.find(q => q.id === 'q_high')).toBeUndefined();
    // Check if q_low and q_mid ARE in nearbyQuakes
    expect(passedProps.nearbyQuakes.find(q => q.id === 'q_low')).toBeDefined();
    expect(passedProps.nearbyQuakes.find(q => q.id === 'q_mid')).toBeDefined();
  });

  it('should handle a cluster with a single earthquake correctly', () => {
    const singleQuakeCluster = {
      ...mockClusterBase,
      originalQuakes: [
        { id: 'q_single', properties: { mag: 5.0, place: 'Single Quake', time: Date.now() - 1000 }, geometry: { coordinates: [10, 20, 30] } },
      ],
    };
    render(<ClusterMiniMap cluster={singleQuakeCluster} />);

    expect(EarthquakeMap).toHaveBeenCalledTimes(1);
    const passedProps = EarthquakeMap.mock.calls[0][0];

    expect(passedProps.latitude).toBe(20); // Note: lat is coord[1]
    expect(passedProps.longitude).toBe(10); // Note: lon is coord[0]
    expect(passedProps.magnitude).toBe(5.0);
    expect(passedProps.title).toBe('Single Quake');
    expect(passedProps.nearbyQuakes).toBeInstanceOf(Array);
    expect(passedProps.nearbyQuakes).toHaveLength(0);
  });

  it('should render a placeholder if cluster data is null or undefined', () => {
    const { rerender } = render(<ClusterMiniMap cluster={null} />);
    expect(screen.getByText(/Loading map data or map disabled/i)).toBeInTheDocument(); // Or whatever placeholder text is used

    rerender(<ClusterMiniMap cluster={undefined} />);
    expect(screen.getByText(/Loading map data or map disabled/i)).toBeInTheDocument();
  });

  it('should render a placeholder if originalQuakes is empty or not an array', () => {
    const { rerender } = render(<ClusterMiniMap cluster={{ ...mockClusterBase, originalQuakes: [] }} />);
    expect(screen.getByText(/No earthquakes in this cluster to display on map/i)).toBeInTheDocument();

    rerender(<ClusterMiniMap cluster={{ ...mockClusterBase, originalQuakes: null }} />);
    expect(screen.getByText(/No earthquakes in this cluster to display on map/i)).toBeInTheDocument();
  });

});
