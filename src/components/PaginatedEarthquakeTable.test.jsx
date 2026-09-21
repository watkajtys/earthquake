import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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


const makeEarthquakes = count => Array.from({ length: count }, (_, index) => ({
  id: `event-${index}`,
  properties: { mag: 3, place: `Place ${index}`, time: 1700000000000 - index * 1000 },
  geometry: { coordinates: [0, 0, 1] },
}));

describe('PaginatedEarthquakeTable pagination and keyboard controls', () => {
  it.each([0, 1, 15, 16])('renders %i records without an empty populated page', count => {
    render(<PaginatedEarthquakeTable {...mockProps} itemsPerPage={15} earthquakes={makeEarthquakes(count)} />);
    expect(screen.queryAllByRole('button', { name: /M 3.0/ })).toHaveLength(Math.min(count, 15));
    expect(Boolean(screen.queryByRole('button', { name: 'Next' }))).toBe(count > 15);
    if (!count) expect(screen.getByText(/No earthquakes recorded/)).toBeInTheDocument();
  });

  it('clamps page two immediately when sixteen records shrink to one, and does not resurrect the old page', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PaginatedEarthquakeTable {...mockProps} itemsPerPage={15} earthquakes={makeEarthquakes(16)} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2 (16)')).toBeInTheDocument();
    rerender(<PaginatedEarthquakeTable {...mockProps} itemsPerPage={15} earthquakes={makeEarthquakes(1)} />);
    expect(screen.getByRole('button', { name: /Place 0/ })).toBeInTheDocument();
    rerender(<PaginatedEarthquakeTable {...mockProps} itemsPerPage={15} earthquakes={makeEarthquakes(16)} />);
    expect(screen.getByText('Page 1 of 2 (16)')).toBeInTheDocument();
  });

  it('clamps page five to the final remaining page and responds to page-size changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PaginatedEarthquakeTable {...mockProps} itemsPerPage={5} earthquakes={makeEarthquakes(25)} />);
    for (let page = 1; page < 5; page++) await user.click(screen.getByRole('button', { name: 'Next' }));
    rerender(<PaginatedEarthquakeTable {...mockProps} itemsPerPage={5} earthquakes={makeEarthquakes(10)} />);
    expect(screen.getByText('Page 2 of 2 (10)')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /M 3.0/ })).toHaveLength(5);
    rerender(<PaginatedEarthquakeTable {...mockProps} itemsPerPage={15} earthquakes={makeEarthquakes(10)} />);
    expect(screen.getAllByRole('button', { name: /M 3.0/ })).toHaveLength(10);
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('preserves a valid page on refresh but resets for a selected period or filter', async () => {
    const user = userEvent.setup();
    const props = { ...mockProps, earthquakes: makeEarthquakes(16), periodName: 'day' };
    const { rerender } = render(<PaginatedEarthquakeTable {...props} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    rerender(<PaginatedEarthquakeTable {...props} earthquakes={makeEarthquakes(17)} />);
    expect(screen.getByText('Page 2 of 4 (17)')).toBeInTheDocument();
    rerender(<PaginatedEarthquakeTable {...props} periodName="week" />);
    expect(screen.getByText('Page 1 of 4 (16)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    rerender(<PaginatedEarthquakeTable {...props} periodName="week" paginationKey="week:significant" />);
    expect(screen.getByText('Page 1 of 4 (16)')).toBeInTheDocument();
  });

  it('resets on sort changes and activates a native event button once per Enter or Space', async () => {
    const user = userEvent.setup();
    const onQuakeClick = vi.fn();
    render(<PaginatedEarthquakeTable {...mockProps} earthquakes={makeEarthquakes(16)} onQuakeClick={onQuakeClick} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.selectOptions(screen.getByLabelText('Sort by:'), 'mag');
    expect(screen.getByText('Page 1 of 4 (16)')).toBeInTheDocument();
    screen.getByRole('button', { name: /Place 0/ }).focus();
    await user.keyboard('{Enter}');
    expect(onQuakeClick).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onQuakeClick).toHaveBeenCalledTimes(2);
  });

  it('associates each repeated sort label with its own selector', () => {
    render(<><PaginatedEarthquakeTable {...mockProps} /><PaginatedEarthquakeTable {...mockProps} /></>);
    const selectors = screen.getAllByLabelText('Sort by:');
    expect(selectors).toHaveLength(2);
    expect(selectors[0].id).not.toBe(selectors[1].id);
  });
});
