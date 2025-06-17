import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent';
import EarthquakeDetailView from './EarthquakeDetailView';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Mocked
import SeoMetadata from './SeoMetadata'; // Mocked even if not main subject, as component renders it

// MOCKS
const mockUseParamsGlobal = vi.fn();

vi.mock('../contexts/EarthquakeDataContext', async () => {
  const actual = await vi.importActual('../contexts/EarthquakeDataContext');
  return {
    ...actual,
    useEarthquakeDataState: vi.fn(),
  };
});

vi.mock('./EarthquakeDetailView', () => ({
  default: vi.fn(() => <div data-testid="mock-detail-view">Mock Detail View</div>)
}));

vi.mock('./SeoMetadata', () => ({ // Basic mock for SeoMetadata
    default: vi.fn(() => null)
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useParams: (...args) => mockUseParamsGlobal(...args),
    // useNavigate mock not strictly needed here but often part of global setup
    useNavigate: () => vi.fn(),
  };
});


describe('EarthquakeDetailModalComponent Data and URL Handling', () => {
  const defaultEarthquakeContextValue = {
    allEarthquakes: [],
    earthquakesLast7Days: [],
    loadMonthlyData: vi.fn(),
    hasAttemptedMonthlyLoad: false,
    isLoadingMonthly: false,
  };

  beforeEach(() => {
    mockUseParamsGlobal.mockImplementation(() => ({ '*': encodeURIComponent('test-detail-url') }));
    if (EarthquakeDetailView.mockClear) EarthquakeDetailView.mockClear();
    if (useEarthquakeDataState && useEarthquakeDataState.mockClear) {
        useEarthquakeDataState.mockClear();
    }
    useEarthquakeDataState.mockReturnValue(defaultEarthquakeContextValue);
    if (SeoMetadata.mockClear) SeoMetadata.mockClear();
  });

  const renderComponentWithInitialEntry = (initialEntry, props = {}) => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/quake/*" element={<EarthquakeDetailModalComponent {...props} />} />
        </Routes>
      </MemoryRouter>
    );
  };

  const renderComponent = (props = {}) => { // Default initial entry for most tests
    return renderComponentWithInitialEntry('/quake/test-detail-url', props);
  }


  test('handles URL parameters with encoded slashes', () => {
    const encodedUrl = encodeURIComponent('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us6000qjgf.geojson');
    mockUseParamsGlobal.mockReturnValueOnce({ '*': encodedUrl });

    // Use a specific initial entry that matches the param for this test
    renderComponentWithInitialEntry(`/quake/${encodedUrl}`);

    expect(EarthquakeDetailView).toHaveBeenCalled();
    const passedProps = EarthquakeDetailView.mock.calls[EarthquakeDetailView.mock.calls.length - 1][0];
    expect(passedProps.detailUrl).toBe(decodeURIComponent(encodedUrl));
  });

  describe('dataSourceTimespanDays logic', () => {
    test('passes correct props to EarthquakeDetailView when hasAttemptedMonthlyLoad is true', () => {
      const mockLoadMonthly = vi.fn();
      const mockAllEarthquakes = [{ id: 'a1' }];
      useEarthquakeDataState.mockReturnValue({
        allEarthquakes: mockAllEarthquakes,
        earthquakesLast7Days: [{id: 's7'}],
        loadMonthlyData: mockLoadMonthly,
        hasAttemptedMonthlyLoad: true,
        isLoadingMonthly: false,
      });

      renderComponent();

      const passedProps = EarthquakeDetailView.mock.calls[0][0];
      expect(passedProps.dataSourceTimespanDays).toBe(30);
      expect(passedProps.broaderEarthquakeData).toBe(mockAllEarthquakes);
      expect(passedProps.handleLoadMonthlyData).toBe(mockLoadMonthly);
      expect(passedProps.hasAttemptedMonthlyLoad).toBe(true);
    });

    test('passes correct props to EarthquakeDetailView when hasAttemptedMonthlyLoad is false', () => {
      const mockLoadMonthly = vi.fn();
      const mock7DayEarthquakes = [{ id: 's7' }];
      useEarthquakeDataState.mockReturnValue({
        allEarthquakes: [],
        earthquakesLast7Days: mock7DayEarthquakes,
        loadMonthlyData: mockLoadMonthly,
        hasAttemptedMonthlyLoad: false,
        isLoadingMonthly: false,
      });

      renderComponent();

      const passedProps = EarthquakeDetailView.mock.calls[0][0];
      expect(passedProps.dataSourceTimespanDays).toBe(7);
      expect(passedProps.broaderEarthquakeData).toBe(mock7DayEarthquakes);
      expect(passedProps.handleLoadMonthlyData).toBe(mockLoadMonthly);
      expect(passedProps.hasAttemptedMonthlyLoad).toBe(false);
    });
  });

  describe('Handling of detailUrlParam', () => {
    test('does not render EarthquakeDetailView if detailUrlParam is missing/invalid', () => {
      mockUseParamsGlobal.mockReturnValueOnce({ '*': undefined });

      renderComponentWithInitialEntry('/quake/'); // Initial entry that would lead to undefined '*'

      expect(EarthquakeDetailView).not.toHaveBeenCalled();

      // Check SeoMetadata for default/initial URLs when detailUrlParam is missing
      // This check is secondary for this test file, but good for completeness if it's simple
      const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];
      expect(lastSeoCall.pageUrl).toBe("https://earthquakeslive.com");
      expect(lastSeoCall.canonicalUrl).toBe("https://earthquakeslive.com");
    });

    test('renders EarthquakeDetailView when detailUrlParam is present', () => {
      // mockUseParamsGlobal is already set to return 'test-detail-url' in beforeEach
      renderComponent();
      expect(EarthquakeDetailView).toHaveBeenCalled();
      const passedProps = EarthquakeDetailView.mock.calls[0][0];
      // The component constructs the full URL. If param is 'test-detail-url', it becomes the eventID.
      expect(passedProps.detailUrl).toBe('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/test-detail-url.geojson');
    });
  });
});
