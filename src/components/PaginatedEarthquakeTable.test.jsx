import React from 'react';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { expect, describe, it, vi } from 'vitest';
import PaginatedEarthquakeTable from './PaginatedEarthquakeTable';

const mockEarthquakes = [
  {
    id: 'eq1',
    properties: { mag: 5.5, place: '10km N of Place A', time: Date.now() - 100000, url: 'http://example.com/eq1' },
    geometry: { coordinates: [-122, 37, 10] }, // lon, lat, depth
  },
  {
    id: 'eq2',
    properties: { mag: 4.2, place: '5km W of Place B', time: Date.now() - 200000, url: 'http://example.com/eq2' },
    geometry: { coordinates: [-121, 38, 5] },
  },
];

const mockProps = {
  title: 'Test Earthquakes',
  earthquakes: mockEarthquakes,
  isLoading: false,
  onQuakeClick: vi.fn(),
  itemsPerPage: 5,
  getMagnitudeColorStyle: vi.fn(mag => (mag > 5 ? 'bg-red-500 text-white' : 'bg-yellow-500 text-black')),
  formatTimeAgo: vi.fn(time => `${Math.floor(time / 60000)} min ago`),
  formatDate: vi.fn(time => new Date(time).toLocaleDateString()),
};

describe('PaginatedEarthquakeTable Accessibility', () => {
  it('should have no axe violations with mock data', async () => {
    const { container } = render(<PaginatedEarthquakeTable {...mockProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no axe violations when loading', async () => {
    const { container } = render(<PaginatedEarthquakeTable {...mockProps} isLoading={true} earthquakes={null} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no axe violations when empty', async () => {
    const { container } = render(<PaginatedEarthquakeTable {...mockProps} earthquakes={[]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
