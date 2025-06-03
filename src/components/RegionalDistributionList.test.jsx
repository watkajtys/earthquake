import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RegionalDistributionList from './RegionalDistributionList';
import { REGIONS } from '../constants/appConstants'; // Import REGIONS

// Mock SkeletonListItem
vi.mock('./skeletons/SkeletonListItem', () => ({
  default: vi.fn(() => <div data-testid="skeleton-list-item">Skeleton Item</div>),
}));

const mockGetRegionForEarthquake = vi.fn();

const mockEarthquakes = [
  { id: 'eq1', properties: { place: 'Region A area' } },
  { id: 'eq2', properties: { place: 'Region B spot' } },
  { id: 'eq3', properties: { place: 'Region A again' } },
];

// Find specific regions from the imported REGIONS constant for mocking
const regionA = REGIONS.find(r => r.name === 'California & W. USA');
const regionB = REGIONS.find(r => r.name === 'Alaska & W. Canada');
const unmappedRegion = { name: 'Unmapped', color: '#ccc' }; // Fallback

describe('RegionalDistributionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mock implementation for getRegionForEarthquake
    mockGetRegionForEarthquake.mockImplementation(quake => {
      if (quake.properties.place.includes('Region A')) return regionA || unmappedRegion;
      if (quake.properties.place.includes('Region B')) return regionB || unmappedRegion;
      return unmappedRegion;
    });
  });

  it('renders skeleton items when isLoading is true', () => {
    render(
      <RegionalDistributionList
        earthquakes={null}
        isLoading={true}
        getRegionForEarthquake={mockGetRegionForEarthquake}
        titleSuffix="(Test Suffix)"
      />
    );
    expect(screen.getByText('Regional Distribution (Test Suffix)')).toBeInTheDocument();
    const skeletonItems = screen.getAllByTestId('skeleton-list-item');
    expect(skeletonItems.length).toBe(5); // As per component logic
  });

  it('renders regional data correctly when earthquakes are provided', () => {
    render(
      <RegionalDistributionList
        earthquakes={mockEarthquakes}
        isLoading={false}
        getRegionForEarthquake={mockGetRegionForEarthquake}
        titleSuffix="(With Data)"
      />
    );

    expect(screen.getByText('Regional Distribution (With Data)')).toBeInTheDocument();

    // Check if getRegionForEarthquake was called for each earthquake
    expect(mockGetRegionForEarthquake).toHaveBeenCalledTimes(mockEarthquakes.length);
    mockEarthquakes.forEach(quake => {
      expect(mockGetRegionForEarthquake).toHaveBeenCalledWith(quake);
    });

    // Assuming Region A (California) was mapped twice and Region B (Alaska) once
    // Need to ensure regionA and regionB are valid from REGIONS
    if (regionA) {
        const regionAElement = screen.getByText(regionA.name);
        expect(regionAElement).toBeInTheDocument();
        expect(regionAElement.closest('li').textContent).toContain('2'); // Count for Region A
    }
    if (regionB) {
        const regionBElement = screen.getByText(regionB.name);
        expect(regionBElement).toBeInTheDocument();
        expect(regionBElement.closest('li').textContent).toContain('1'); // Count for Region B
    }
  });

  it('renders "No regional earthquake data." when earthquakes array is empty', () => {
    render(
      <RegionalDistributionList
        earthquakes={[]}
        isLoading={false}
        getRegionForEarthquake={mockGetRegionForEarthquake}
        titleSuffix="(Empty Data)"
      />
    );
    expect(screen.getByText('Regional Distribution (Empty Data)')).toBeInTheDocument();
    expect(screen.getByText('No regional earthquake data.')).toBeInTheDocument();
  });

  it('renders "No regional earthquake data." when earthquakes is null and not loading', () => {
    render(
      <RegionalDistributionList
        earthquakes={null}
        isLoading={false}
        getRegionForEarthquake={mockGetRegionForEarthquake}
        titleSuffix="(Null Data)"
      />
    );
    expect(screen.getByText('Regional Distribution (Null Data)')).toBeInTheDocument();
    expect(screen.getByText('No regional earthquake data.')).toBeInTheDocument();
  });

  it('returns null if titleSuffix contains "(Last Hour)" and earthquakes array is empty', () => {
    const { container } = render(
      <RegionalDistributionList
        earthquakes={[]}
        isLoading={false}
        getRegionForEarthquake={mockGetRegionForEarthquake}
        titleSuffix="(Last Hour)"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null if titleSuffix contains "(Last Hour)" and regionalData is empty even with earthquakes', () => {
    // Scenario where getRegionForEarthquake returns regions not in REGIONS, leading to empty regionalData
    mockGetRegionForEarthquake.mockImplementation(() => ({ name: 'NonExistent Region', color: '#000' }));
    const { container } = render(
      <RegionalDistributionList
        earthquakes={mockEarthquakes} // Has earthquakes
        isLoading={false}
        getRegionForEarthquake={mockGetRegionForEarthquake}
        titleSuffix="(Last Hour)" // But is for last hour
      />
    );
    expect(container.firstChild).toBeNull(); // Should still be null because regionalData will be empty
  });

  it('displays regions sorted by count', () => {
    // Ensure REGIONS has at least two distinct regions for this test
    const localRegionA_name = 'California & W. USA';
    const localRegionB_name = 'Alaska & W. Canada';

    const localRegionA = REGIONS.find(r => r.name === localRegionA_name) || { name: localRegionA_name, color: 'blue' };
    const localRegionB = REGIONS.find(r => r.name === localRegionB_name) || { name: localRegionB_name, color: 'red'};

    const specificEarthquakes = [
      { id: 'eqA1', properties: { place: `${localRegionA_name} Quake` } }, // Use full name for place matching
      { id: 'eqB1', properties: { place: `${localRegionB_name} Quake` } },
      { id: 'eqB2', properties: { place: `${localRegionB_name} Quake again` } },
    ];
    mockGetRegionForEarthquake.mockImplementation(quake => {
      if (quake.properties.place.includes(localRegionA_name)) return localRegionA;
      if (quake.properties.place.includes(localRegionB_name)) return localRegionB;
      return unmappedRegion;
    });

    render(
      <RegionalDistributionList
        earthquakes={specificEarthquakes}
        isLoading={false}
        getRegionForEarthquake={mockGetRegionForEarthquake}
      />
    );

    const listItems = screen.getAllByRole('listitem');
    // Alaska & W. Canada should appear before California & W. USA due to higher count
    expect(listItems[0].textContent).toContain(localRegionB.name); // Alaska & W. Canada with count 2
    expect(listItems[0].textContent).toContain('2');
    expect(listItems[1].textContent).toContain(localRegionA.name); // California & W. USA with count 1
    expect(listItems[1].textContent).toContain('1');
  });
});
