import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent';
import EarthquakeDetailView from './EarthquakeDetailView';
import SeoMetadata from './SeoMetadata';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Mocked

// MOCKS (Global/Common Mocks)
const mockUseParamsGlobal = vi.fn();
const mockNavigateGlobal = vi.fn(); // Kept if any remaining tests might need it, or for renderComponent consistency

// Mock the context hook (Common default mock)
vi.mock('../contexts/EarthquakeDataContext', async () => {
  const actual = await vi.importActual('../contexts/EarthquakeDataContext');
  return {
    ...actual,
    useEarthquakeDataState: vi.fn(),
  };
});

// Common mock for EarthquakeDetailView (can be overridden in specific test files if needed)
vi.mock('./EarthquakeDetailView', () => ({
  default: vi.fn(() => <div data-testid="mock-detail-view">Mock Detail View</div>)
}));

// Common mock for SeoMetadata (can be overridden)
vi.mock('./SeoMetadata', () => ({
  default: vi.fn(() => null)
}));

// Selective mock for react-router-dom (Common)
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useParams: (...args) => mockUseParamsGlobal(...args),
    useNavigate: () => mockNavigateGlobal,
  };
});

describe('EarthquakeDetailModalComponent Common/Rendering', () => {
  const defaultEarthquakeContextValue = {
    allEarthquakes: [],
    earthquakesLast7Days: [],
    loadMonthlyData: vi.fn(),
    hasAttemptedMonthlyLoad: false,
    isLoadingMonthly: false,
  };

  beforeEach(() => {
    mockNavigateGlobal.mockClear();
    mockUseParamsGlobal.mockImplementation(() => ({ '*': encodeURIComponent('test-detail-url') }));
    if (EarthquakeDetailView.mockClear) EarthquakeDetailView.mockClear();
    if (SeoMetadata.mockClear) SeoMetadata.mockClear();
    if (useEarthquakeDataState && useEarthquakeDataState.mockClear) {
        useEarthquakeDataState.mockClear();
    }
    useEarthquakeDataState.mockReturnValue(defaultEarthquakeContextValue);
  });

  // renderComponent helper can be kept here if it's generic enough
  const renderComponent = (props = {}, initialEntries = ['/quake/test-detail-url']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/quake/*" element={<EarthquakeDetailModalComponent {...props} />} />
        </Routes>
      </MemoryRouter>
    );
  };

  test('renders EarthquakeDetailView when a detailUrlParam is provided', () => {
    // This is a basic render test ensuring the core child component is rendered
    // when parameters are as expected by default mocks.
    renderComponent();
    expect(EarthquakeDetailView).toHaveBeenCalled();
    // SeoMetadata is also rendered by default
    expect(SeoMetadata).toHaveBeenCalled();
  });

  test('does not render EarthquakeDetailView if detailUrlParam is missing', () => {
    mockUseParamsGlobal.mockReturnValueOnce({ '*': undefined }); // Override for this test
    renderComponent(undefined, ['/quake/']); // Ensure route matches a state where param is missing
    expect(EarthquakeDetailView).not.toHaveBeenCalled();
    // SeoMetadata would still be called, but with default values for URLs
    expect(SeoMetadata).toHaveBeenCalled();
    const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];
    expect(lastSeoCall.pageUrl).toBe("https://earthquakeslive.com");
  });

});
