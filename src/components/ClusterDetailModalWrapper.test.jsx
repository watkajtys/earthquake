import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ClusterDetailModalWrapper from './ClusterDetailModalWrapper';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext.jsx';
import { fetchClusterDefinition } from '../services/clusterApiService.js';
import { findActiveClusters } from '../utils/clusterUtils.js';

// Mock dependencies
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});
vi.mock('../contexts/EarthquakeDataContext.jsx');
vi.mock('../services/clusterApiService.js');
vi.mock('../utils/clusterUtils.js');
vi.mock('./ClusterDetailModal', () => ({
  default: vi.fn(({ cluster }) => <div data-testid="cluster-detail-modal" data-cluster={JSON.stringify(cluster)}>Mock ClusterDetailModal</div>),
}));
vi.mock('./SeoMetadata', () => ({
  default: vi.fn((props) => <div data-testid="seo-metadata" data-props={JSON.stringify(props)}>Mock SeoMetadata</div>),
}));

const mockNavigate = vi.fn();

describe('ClusterDetailModalWrapper', () => {
  const mockOverviewClusters = [
    { id: 'prop_cluster_123', name: 'Cluster From Prop', originalQuakes: [], quakeCount: 1, maxMagnitude: 5.0, locationName: "Prop Location", _earliestTimeInternal: Date.now(), _latestTimeInternal: Date.now(), strongestQuake: {id: 'eqProp', properties: {place: "Prop Location", time: Date.now(), mag: 5.0}, geometry: {coordinates: [0,0]}} },
  ];
  const mockFormatDate = vi.fn(date => new Date(date).toLocaleDateString());
  const mockGetMagnitudeColorStyle = vi.fn(() => "mock-style");
  const mockOnIndividualQuakeSelect = vi.fn();
  const mockFormatTimeAgo = vi.fn(time => `${time} ago`);
  const mockFormatTimeDuration = vi.fn(time => `${time} duration`);

  const mockEarthquake1 = { id: 'eq1', properties: { mag: 3.5, time: Date.now() - 100000, place: 'Location 1' }, geometry: { coordinates: [10, 10] } };
  const mockEarthquake2 = { id: 'eq2', properties: { mag: 4.0, time: Date.now() - 50000, place: 'Location 2' }, geometry: { coordinates: [20, 20] } };
  const mockEarthquake3 = { id: 'eq3', properties: { mag: 4.5, time: Date.now(), place: 'Location 3 Strongest' }, geometry: { coordinates: [30, 30] } };

  const defaultEarthquakeContext = {
    allEarthquakes: [mockEarthquake1, mockEarthquake2, mockEarthquake3],
    earthquakesLast72Hours: [mockEarthquake2, mockEarthquake3],
    isLoadingWeekly: false,
    isLoadingMonthly: false,
    isInitialAppLoad: false,
    hasAttemptedMonthlyLoad: true,
  };

  const renderComponent = (clusterIdParam, currentOverviewClusters = mockOverviewClusters, currentAreParentClustersLoading = false, currentEarthquakeContext = defaultEarthquakeContext) => {
    vi.mocked(useParams).mockReturnValue({ clusterId: clusterIdParam });
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useEarthquakeDataState).mockReturnValue(currentEarthquakeContext);

    return render(
      <MemoryRouter initialEntries={[`/cluster/${clusterIdParam}`]}>
        <Routes>
          <Route path="/cluster/:clusterId" element={
            <ClusterDetailModalWrapper
              overviewClusters={currentOverviewClusters}
              formatDate={mockFormatDate}
              getMagnitudeColorStyle={mockGetMagnitudeColorStyle}
              onIndividualQuakeSelect={mockOnIndividualQuakeSelect}
              formatTimeAgo={mockFormatTimeAgo}
              formatTimeDuration={mockFormatTimeDuration}
              areParentClustersLoading={currentAreParentClustersLoading}
            />
          } />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading state if parent clusters are loading', async () => {
    renderComponent('some_id', [], true);
    expect(screen.getByText(/Loading Cluster Details/i)).toBeInTheDocument();
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Loading Cluster...'));
    expect(fetchClusterDefinition).not.toHaveBeenCalled();
    expect(findActiveClusters).not.toHaveBeenCalled();
  });

  it('shows loading state if context data is busy (monthly)', async () => {
    renderComponent('some_id', [], false, { ...defaultEarthquakeContext, isLoadingMonthly: true, allEarthquakes: [] });
    expect(screen.getByText(/Loading Cluster Details/i)).toBeInTheDocument();
     expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Loading Cluster...'));
  });

  it('shows loading state if context data is busy (weekly/initial)', async () => {
    renderComponent('some_id', [], false, { ...defaultEarthquakeContext, hasAttemptedMonthlyLoad: false, isLoadingWeekly: true, earthquakesLast72Hours: [] });
    expect(screen.getByText(/Loading Cluster Details/i)).toBeInTheDocument();
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Loading Cluster...'));
  });

  it('finds cluster from overviewClusters prop successfully', async () => {
    renderComponent('prop_cluster_123');
    await waitFor(() => {
      expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('cluster-detail-modal');
    const modalData = JSON.parse(modal.getAttribute('data-cluster'));
    expect(modalData.id).toBe('prop_cluster_123');
    expect(fetchClusterDefinition).not.toHaveBeenCalled();
    expect(findActiveClusters).not.toHaveBeenCalled();
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Earthquake Cluster: Prop Location"'));
  });

  it('reconstructs cluster via findActiveClusters if not in props', async () => {
    const reconstructId = `overview_cluster_${mockEarthquake3.id}_2`; // eq3 is strongest
    const reconstructedClusterArray = [mockEarthquake2, mockEarthquake3];
    vi.mocked(findActiveClusters).mockReturnValue([reconstructedClusterArray]);

    renderComponent(reconstructId, [], false, {...defaultEarthquakeContext, allEarthquakes: [mockEarthquake1, mockEarthquake2, mockEarthquake3], hasAttemptedMonthlyLoad: true});

    await waitFor(() => {
      expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('cluster-detail-modal');
    const modalData = JSON.parse(modal.getAttribute('data-cluster'));
    expect(modalData.id).toBe(reconstructId);
    expect(modalData.quakeCount).toBe(2);
    expect(modalData.strongestQuakeId).toBe(mockEarthquake3.id);
    expect(findActiveClusters).toHaveBeenCalled();
    expect(fetchClusterDefinition).not.toHaveBeenCalled(); // Should not be called if reconstruction works
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining(`"title":"Earthquake Cluster: ${mockEarthquake3.properties.place}"`));
  });

  it('fetches cluster via fetchClusterDefinition if other methods fail', async () => {
    const fetchId = 'fetched_cluster_789';
    const mockFetchedDefinition = { earthquakeIds: [mockEarthquake1.id, mockEarthquake2.id], strongestQuakeId: mockEarthquake2.id, updatedAt: Date.now() };
    vi.mocked(fetchClusterDefinition).mockResolvedValue(mockFetchedDefinition);
    vi.mocked(findActiveClusters).mockReturnValue([]); // Ensure reconstruction attempt fails

    renderComponent(fetchId, [], false, {...defaultEarthquakeContext, allEarthquakes: [mockEarthquake1, mockEarthquake2]});

    await waitFor(() => {
      expect(screen.getByTestId('cluster-detail-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('cluster-detail-modal');
    const modalData = JSON.parse(modal.getAttribute('data-cluster'));
    expect(modalData.id).toBe(fetchId);
    expect(modalData.quakeCount).toBe(2);
    expect(modalData.strongestQuakeId).toBe(mockEarthquake2.id);
    expect(fetchClusterDefinition).toHaveBeenCalledWith(fetchId);
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining(`"title":"Earthquake Cluster: ${mockEarthquake2.properties.place}"`));
  });

  it('shows "Cluster not found" if all methods exhausted', async () => {
    const nonExistentId = 'non_existent_id_123';
    vi.mocked(findActiveClusters).mockReturnValue([]);
    vi.mocked(fetchClusterDefinition).mockResolvedValue(null);

    renderComponent(nonExistentId, []);

    await waitFor(() => {
      expect(screen.getByText(/Cluster details could not be found/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('cluster-detail-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Cluster Not Found"'));
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"noindex":true'));
  });

  it('shows "No cluster ID specified" if clusterId is missing', async () => {
    renderComponent(null); // or undefined
    await waitFor(() => {
      expect(screen.getByText(/No cluster ID specified/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"title":"Cluster Not Found"'));
     expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"noindex":true'));
  });

  it('handles error during fetchClusterDefinition', async () => {
    const errorId = 'error_fetch_id';
    vi.mocked(findActiveClusters).mockReturnValue([]); // Ensure reconstruction fails
    vi.mocked(fetchClusterDefinition).mockRejectedValue(new Error("Network Error"));

    renderComponent(errorId, []);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch cluster details/i)).toBeInTheDocument();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error fetching cluster definition ${errorId} from worker:`, expect.any(Error));
    expect(screen.getByTestId('seo-metadata')).toHaveAttribute('data-props', expect.stringContaining('"description":"Failed to fetch cluster details."'));
    consoleErrorSpy.mockRestore();
  });

});
