// src/components/ClusterDetailModalWrapper.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useParams, useNavigate } from 'react-router-dom';
import ClusterDetailModalWrapper from './ClusterDetailModalWrapper';

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual, // Preserve other exports like MemoryRouter
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});

describe('ClusterDetailModalWrapper', () => {
  it('should import without errors', () => {
    // This test primarily checks if the import itself causes a crash.
    // If the import fails due to a module-level error, the test runner will catch it here.
    expect(typeof ClusterDetailModalWrapper).toBe('function');
  });

  it('should render without crashing with minimal valid props', () => {
    // Setup mock implementations for this specific test
    const mockNavigate = vi.fn();
    // It's important to use vi.mocked on the imported hooks if you need type safety,
    // but direct assignment to the vi.fn() created in vi.mock should also work.
    // For simplicity here, we'll rely on the vi.mock setup.
    // const mockUseParams = vi.mocked(useParams); // Not strictly needed if already vi.fn()
    // const mockUseNavigate = vi.mocked(useNavigate); // Not strictly needed if already vi.fn()

    useParams.mockReturnValue({ clusterId: 'test-cluster-id' });
    useNavigate.mockReturnValue(mockNavigate);

    const props = {
      overviewClusters: [], // Empty array, should lead to "Not Found"
      displayedClusterId: 'test-cluster-id', // The ID it will try to find
      formatDate: vi.fn(timestamp => new Date(timestamp).toISOString()),
      getMagnitudeColorStyle: vi.fn(() => 'bg-slate-500'),
      onIndividualQuakeSelect: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={['/cluster/test-cluster-id']}>
        <ClusterDetailModalWrapper {...props} />
      </MemoryRouter>
    );

    // Expect the "Cluster Not Found" message.
    expect(screen.getByText(/cluster not found/i)).toBeInTheDocument();
  });
});
