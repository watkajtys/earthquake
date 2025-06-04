import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Added beforeEach
import ClusterMiniMap from './ClusterMiniMap';
import EarthquakeMap from './EarthquakeMap';

// Mock EarthquakeMap to verify props
vi.mock('./EarthquakeMap', () => ({
  default: vi.fn(() => <div data-testid="mock-earthquake-map">Mock Earthquake Map</div>),
}));

// Helper function for test readability
const calculateAverageCoords = (quakes) => {
  if (!quakes || quakes.length === 0) {
    return { avgLat: null, avgLng: null };
  }
  let sumLat = 0;
  let sumLng = 0;
  let validCoordCount = 0;
  quakes.forEach(quake => {
    if (quake.geometry && Array.isArray(quake.geometry.coordinates) && quake.geometry.coordinates.length >= 2) {
      const lat = parseFloat(quake.geometry.coordinates[1]);
      const lng = parseFloat(quake.geometry.coordinates[0]);
      if (!isNaN(lat) && !isNaN(lng)) {
        sumLat += lat;
        sumLng += lng;
        validCoordCount++;
      }
    }
  });
  if (validCoordCount === 0) {
     // Fallback to first quake if available, or null. Consistent with component's fallback for avg.
    if (quakes.length > 0 && quakes[0].geometry && quakes[0].geometry.coordinates) {
        return { avgLat: quakes[0].geometry.coordinates[1], avgLng: quakes[0].geometry.coordinates[0] };
    }
    return { avgLat: null, avgLng: null };
  }
  return { avgLat: sumLat / validCoordCount, avgLng: sumLng / validCoordCount };
};


const now = Date.now();
const mockClusterBase = {
  id: 'test-cluster',
  locationName: 'Test Cluster Area',
  quakeCount: 3,
  maxMagnitude: 5.5, // This field is part of cluster data, but not directly used by ClusterMiniMap for EarthquakeMap props
  timeRange: 'Last hour',
  originalQuakes: [
    // q1 is latest
    { id: 'q1', properties: { mag: 5.5, place: 'Central Quake', time: now - 1000 }, geometry: { coordinates: [-118.0, 34.0, 10] } },
    { id: 'q2', properties: { mag: 4.0, place: 'North Quake', time: now - 2000 }, geometry: { coordinates: [-118.0, 35.0, 5] } },
    { id: 'q3', properties: { mag: 3.0, place: 'East Quake', time: now - 3000 }, geometry: { coordinates: [-117.0, 34.0, 12] } },
  ],
};

describe('ClusterMiniMap', () => {
  beforeEach(() => {
    EarthquakeMap.mockClear();
  });

  it('should render EarthquakeMap and pass correct props based on latest quake and geographic center', () => {
    render(<ClusterMiniMap cluster={mockClusterBase} />);
    expect(screen.getByTestId('mock-earthquake-map')).toBeInTheDocument();
    expect(EarthquakeMap).toHaveBeenCalledTimes(1);

    const passedProps = EarthquakeMap.mock.calls[0][0];
    const { originalQuakes } = mockClusterBase;

    // Expected latest quake (q1)
    const expectedLatestQuake = originalQuakes.find(q => q.id === 'q1');
    expect(passedProps.highlightQuakeLatitude).toBe(expectedLatestQuake.geometry.coordinates[1]);
    expect(passedProps.highlightQuakeLongitude).toBe(expectedLatestQuake.geometry.coordinates[0]);
    expect(passedProps.highlightQuakeMagnitude).toBe(expectedLatestQuake.properties.mag);
    expect(passedProps.highlightQuakeTitle).toBe(expectedLatestQuake.properties.place);

    // Expected geographic center
    const { avgLat, avgLng } = calculateAverageCoords(originalQuakes);
    expect(passedProps.mapCenterLatitude).toBeCloseTo(avgLat);
    expect(passedProps.mapCenterLongitude).toBeCloseTo(avgLng);

    // Expected nearbyQuakes (q2, q3)
    expect(passedProps.nearbyQuakes).toBeInstanceOf(Array);
    expect(passedProps.nearbyQuakes).toHaveLength(originalQuakes.length - 1);
    expect(passedProps.nearbyQuakes.find(q => q.id === expectedLatestQuake.id)).toBeUndefined();
    expect(passedProps.nearbyQuakes.find(q => q.id === 'q2')).toBeDefined();
    expect(passedProps.nearbyQuakes.find(q => q.id === 'q3')).toBeDefined();

    expect(passedProps.fitMapToBounds).toBe(true);
    expect(passedProps.shakeMapUrl).toBeNull();
    expect(passedProps.mainQuakeDetailUrl).toBeNull();
  });

  it('should correctly identify the latest quake when times differ', () => {
    const specificTimesCluster = {
      ...mockClusterBase,
      originalQuakes: [
        { id: 'q_old', properties: { mag: 3.0, place: 'Old Quake', time: now - 5000 }, geometry: { coordinates: [1, 1, 10] } },
        { id: 'q_latest', properties: { mag: 6.2, place: 'Latest Quake', time: now - 500 }, geometry: { coordinates: [2, 2, 20] } }, // This is the latest
        { id: 'q_mid', properties: { mag: 4.5, place: 'Mid Time Quake', time: now - 2500 }, geometry: { coordinates: [3, 3, 30] } },
      ],
    };
    render(<ClusterMiniMap cluster={specificTimesCluster} />);
    expect(EarthquakeMap).toHaveBeenCalledTimes(1);
    const passedProps = EarthquakeMap.mock.calls[0][0];
    const expectedLatestQuake = specificTimesCluster.originalQuakes.find(q => q.id === 'q_latest');

    expect(passedProps.highlightQuakeLatitude).toBe(expectedLatestQuake.geometry.coordinates[1]);
    expect(passedProps.highlightQuakeLongitude).toBe(expectedLatestQuake.geometry.coordinates[0]);
    expect(passedProps.highlightQuakeMagnitude).toBe(expectedLatestQuake.properties.mag);
    expect(passedProps.highlightQuakeTitle).toBe(expectedLatestQuake.properties.place);
    expect(passedProps.fitMapToBounds).toBe(true);
  });

  it('should handle a cluster with a single earthquake correctly', () => {
    const singleQuake = { id: 'q_single', properties: { mag: 5.0, place: 'Single Quake', time: now - 1000 }, geometry: { coordinates: [10, 20, 30] } };
    const singleQuakeCluster = {
      ...mockClusterBase,
      originalQuakes: [singleQuake],
    };
    render(<ClusterMiniMap cluster={singleQuakeCluster} />);
    expect(EarthquakeMap).toHaveBeenCalledTimes(1);
    const passedProps = EarthquakeMap.mock.calls[0][0];

    // Latest quake is the single quake
    expect(passedProps.highlightQuakeLatitude).toBe(singleQuake.geometry.coordinates[1]);
    expect(passedProps.highlightQuakeLongitude).toBe(singleQuake.geometry.coordinates[0]);
    expect(passedProps.highlightQuakeMagnitude).toBe(singleQuake.properties.mag);
    expect(passedProps.highlightQuakeTitle).toBe(singleQuake.properties.place);

    // Geographic center is the single quake's location
    expect(passedProps.mapCenterLatitude).toBe(singleQuake.geometry.coordinates[1]);
    expect(passedProps.mapCenterLongitude).toBe(singleQuake.geometry.coordinates[0]);

    // Nearby quakes is empty
    expect(passedProps.nearbyQuakes).toBeInstanceOf(Array);
    expect(passedProps.nearbyQuakes).toHaveLength(0);

    expect(passedProps.fitMapToBounds).toBe(true);
  });

  it('should render a placeholder if cluster data is null or undefined', () => {
    const { rerender } = render(<ClusterMiniMap cluster={null} />);
    expect(screen.getByText(/Loading map data or map disabled/i)).toBeInTheDocument();
    expect(EarthquakeMap).not.toHaveBeenCalled();

    rerender(<ClusterMiniMap cluster={undefined} />);
    expect(screen.getByText(/Loading map data or map disabled/i)).toBeInTheDocument();
    expect(EarthquakeMap).not.toHaveBeenCalled();
  });

  it('should render a placeholder if originalQuakes is empty', () => {
    render(<ClusterMiniMap cluster={{ ...mockClusterBase, originalQuakes: [] }} />);
    expect(screen.getByText(/No earthquakes in this cluster to display on map/i)).toBeInTheDocument();
    expect(EarthquakeMap).not.toHaveBeenCalled();
  });

  it('should render a placeholder if originalQuakes is not an array', () => {
    render(<ClusterMiniMap cluster={{ ...mockClusterBase, originalQuakes: null }} />);
    expect(screen.getByText(/No earthquakes in this cluster to display on map/i)).toBeInTheDocument();
    expect(EarthquakeMap).not.toHaveBeenCalled();
  });

  it('should render error placeholder if selected latest quake data is malformed (e.g. missing mag)', () => {
    const malformedCluster = {
      ...mockClusterBase,
      originalQuakes: [
        { id: 'q_older_valid', properties: { mag: 5.5, place: 'Older Valid Quake', time: now - 10000 }, geometry: { coordinates: [-118.0, 34.0, 10] } },
        { id: 'q_latest_malformed', properties: { /* mag is missing */ place: 'Latest Malformed', time: now - 500 }, geometry: { coordinates: [-119.0, 35.0, 5] } },
      ],
    };
    render(<ClusterMiniMap cluster={malformedCluster} />);
    expect(screen.getByText(/Latest quake data in cluster is malformed/i)).toBeInTheDocument();
    expect(EarthquakeMap).not.toHaveBeenCalled();
  });
});
