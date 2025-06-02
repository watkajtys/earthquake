// src/components/EarthquakeDetailModalComponent.test.jsx
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent';
import { UIStateProvider } from '../contexts/UIStateContext'; // Import UIStateProvider

// Mock EarthquakeDetailView as it's a complex child component with its own tests/data fetching
vi.mock('./EarthquakeDetailView', () => ({
  default: vi.fn(({ detailUrl, onClose, onDataLoadedForSeo }) => {
    // Simulate data loading for SEO
    React.useEffect(() => {
      act(() => {
        onDataLoadedForSeo({
          title: `Mock Title for ${detailUrl}`,
          place: `Mock Place for ${detailUrl}`,
          mag: 5.5,
          depth: 10,
          time: Date.now(),
          updated: Date.now(),
          shakemapIntensityImageUrl: 'mock_image_url.jpg',
          latitude: 34.0522,
          longitude: -118.2437,
        });
      });
    }, [detailUrl, onDataLoadedForSeo]);

    return (
      <div data-testid="mocked-earthquake-detail-view">
        <p>Detail URL: {detailUrl}</p>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }),
}));

// Mock SeoMetadata to prevent actual head manipulations during tests
vi.mock('./SeoMetadata', () => ({
  default: vi.fn((props) => <div data-testid="mocked-seo-metadata">{props.title}</div>),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ detailUrlParam: encodeURIComponent('test_detail_url') }), // Mock useParams
    };
});


// Define mock props that EarthquakeDetailModalComponent expects
const mockModalProps = {
    broaderEarthquakeData: [],
    dataSourceTimespanDays: 7,
    handleLoadMonthlyData: vi.fn(),
    hasAttemptedMonthlyLoad: false,
    isLoadingMonthly: false,
};

describe('EarthquakeDetailModalComponent', () => {
  const renderModal = (detailUrlParam = 'test_detail_url') => {
    const initialPath = `/quake/${encodeURIComponent(detailUrlParam)}`;
    render(
      <MemoryRouter initialEntries={[initialPath]}>
        <UIStateProvider> {/* ADDED: Wrap with UIStateProvider */}
          <Routes>
            <Route
              path="/quake/:detailUrlParam"
              element={<EarthquakeDetailModalComponent {...mockModalProps} />}
            />
          </Routes>
        </UIStateProvider>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    mockNavigate.mockClear();
    // Clear mocks for child components if they are stateful or have interaction counts
    vi.clearAllMocks();
  });

  test('renders EarthquakeDetailView with detailUrl from params and passes onClose', () => {
    renderModal('specific_quake_id_123');
    expect(screen.getByTestId('mocked-earthquake-detail-view')).toBeInTheDocument();
    expect(screen.getByText(/Detail URL: specific_quake_id_123/i)).toBeInTheDocument();
  });

  test('calls navigate with -1 when close button (simulated from child) is clicked', () => {
    renderModal();
    // Simulate click on the close button within the mocked EarthquakeDetailView
    const closeButton = screen.getByRole('button', { name: /Close/i });
    act(() => {
      closeButton.click();
    });
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  test('renders SeoMetadata with data derived from onDataLoadedForSeo callback', async () => {
    renderModal('seo_test_quake');
    // SeoMetadata mock will render the title it receives
    // The mock for EarthquakeDetailView calls onDataLoadedForSeo, which updates state for SeoMetadata
    await screen.findByTestId('mocked-seo-metadata'); // Wait for SEO data to be processed
    expect(screen.getByText(/Mock Title for seo_test_quake | Earthquake Details/i)).toBeInTheDocument();
  });

  test('uses decoded detailUrlParam for EarthquakeDetailView', () => {
    const complexParam = 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=ci39692450&format=geojson';
    renderModal(complexParam);
    expect(screen.getByText(`Detail URL: ${complexParam}`)).toBeInTheDocument();
  });

  // Test for console log added for UIStateContext (optional, for development verification)
  test('logs context and route params on mount', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    renderModal('logging_test_quake');
    // Check for the specific logs. Note: initial selectedEarthquakeId from context is null.
    expect(consoleSpy).toHaveBeenCalledWith('EarthquakeDetailModalComponent: context selectedEarthquakeId:', null);
    expect(consoleSpy).toHaveBeenCalledWith('EarthquakeDetailModalComponent: route detailUrlParam (decoded):', 'logging_test_quake');
    consoleSpy.mockRestore();
  });

});
