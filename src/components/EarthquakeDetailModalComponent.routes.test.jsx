import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent.jsx';
import EarthquakeDetailView from './EarthquakeDetailView';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext';

vi.mock('../contexts/EarthquakeDataContext', () => ({ useEarthquakeDataState: vi.fn() }));
vi.mock('./EarthquakeDetailView', () => ({ default: vi.fn(() => <p>Event details</p>) }));
vi.mock('./SeoMetadata', () => ({ default: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  useEarthquakeDataState.mockReturnValue({ allEarthquakes: [], earthquakesLast7Days: [], monthlyHasLoaded: false });
});
it.each([
  ['/quake/m-0.5-test-location-nc123', 'nc123'], ['/quake/munknown-test-location-nc123', 'nc123'],
  ['/quake/nc123', 'nc123'], ['/quake/id/us-test_1', 'us-test_1'],
  [`/quake/${encodeURIComponent('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/nc123.geojson')}`, 'nc123'],
])('resolves raw browser path %s consistently with the Worker', (path, id) => {
  render(<MemoryRouter initialEntries={[path]}><EarthquakeDetailModalComponent /></MemoryRouter>);
  expect(EarthquakeDetailView.mock.lastCall[0].detailUrl).toBe(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`);
});
it.each(['/quake/%E0%A4%A', '/quake/%252F', `/quake/${encodeURIComponent('https://attacker.example/detail/nc123.geojson')}`])('renders a terminal invalid-route state for %s', (path) => {
  render(<MemoryRouter initialEntries={[path]}><EarthquakeDetailModalComponent /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Earthquake not found' })).toBeInTheDocument();
  expect(EarthquakeDetailView).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
});
it('does not label an attempted but failed monthly load as30-day coverage', () => {
  const weekly = [{ id: 'weekly-event' }];
  const retry = vi.fn();
  useEarthquakeDataState.mockReturnValue({ allEarthquakes: [], earthquakesLast7Days: weekly, monthlyHasLoaded: false,
    hasAttemptedMonthlyLoad: true, monthlyError: 'offline', loadMonthlyData: retry, weeklySourceGeneratedAtMs: 123 });
  render(<MemoryRouter initialEntries={['/quake/nc123']}><EarthquakeDetailModalComponent /></MemoryRouter>);
  expect(EarthquakeDetailView.mock.lastCall[0]).toMatchObject({ dataSourceTimespanDays: 7, broaderEarthquakeData: weekly,
    monthlyError: 'offline', handleLoadMonthlyData: retry, dataSourceGeneratedAtMs: 123 });
});
