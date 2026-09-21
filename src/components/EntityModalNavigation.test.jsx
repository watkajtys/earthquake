import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ClusterDetailModalWrapper from './ClusterDetailModalWrapper.jsx';
import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent.jsx';
import { buildClusterPath, buildEarthquakePath, buildModalNavigationState } from '../utils/entityRoutes.js';

vi.mock('../services/clusterApiService.js', () => ({ fetchClusterWithQuakes: vi.fn(async () => ({
  id: 'cluster1', slug: 'stored-cluster', quakeCount: 1, strongestQuakeId: 'us123', maxMagnitude: 3,
  quakes: [{ id: 'us123', properties: { mag: 3, time: 1750000000000 }, geometry: { coordinates: [0, 0, 1] } }],
})) }));
vi.mock('../contexts/EarthquakeDataContext', () => ({ useEarthquakeDataState: () => ({ earthquakesLast7Days: [] }) }));
vi.mock('./SeoMetadata', () => ({ default: () => null }));
vi.mock('./ClusterDetailModal', () => ({ default: ({ cluster, onClose, onIndividualQuakeSelect }) => <div>
  <button onClick={() => onIndividualQuakeSelect(cluster.strongestQuake)}>Open earthquake</button>
  <button onClick={onClose}>Close cluster</button>
</div> }));
vi.mock('./EarthquakeDetailView', () => ({ default: ({ onClose }) => <button onClick={onClose}>Close earthquake</button> }));

function RoutedFlow() {
  const location = useLocation();
  const navigate = useNavigate();
  const open = path => navigate(path, { state: buildModalNavigationState(location) });
  return <>
    <output data-testid="current-location">{location.pathname}{location.search}{location.hash}</output>
    <Routes>
      <Route path="/overview" element={<button onClick={() => open(buildClusterPath({ slug: 'stored-cluster' }))}>Open cluster</button>} />
      <Route path="/cluster/*" element={<ClusterDetailModalWrapper onIndividualQuakeSelect={quake => open(buildEarthquakePath(quake))} />} />
      <Route path="/quake/*" element={<EarthquakeDetailModalComponent />} />
      <Route path="/" element={<p>Home</p>} />
    </Routes>
  </>;
}

describe('nested detail return navigation through real router history', () => {
  it('returns overview → cluster → earthquake → cluster → overview including query and fragment', async () => {
    render(<MemoryRouter initialEntries={['/overview?sort=recent#clusters']}><RoutedFlow /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open cluster' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open earthquake' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/quake/id/us123');
    fireEvent.click(screen.getByRole('button', { name: 'Close earthquake' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close cluster' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/overview?sort=recent#clusters');
    expect(screen.getByRole('button', { name: 'Open cluster' })).toBeInTheDocument();
  });
  it('drops an unsafe parent return state and closes the parent to home', async () => {
    render(<MemoryRouter initialEntries={[{ pathname: '/quake/id/us123', state: {
      inAppNavigation: true, returnTo: '/cluster/stored-cluster',
      returnState: { inAppNavigation: true, returnTo: '//attacker.example' },
    } }]}><RoutedFlow /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Close earthquake' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close cluster' }));
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
