import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent';
import EarthquakeDetailView from './EarthquakeDetailView';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Mocked

// MOCKS
const mockUseParamsGlobal = vi.fn(); // Needed for component to render
const mockNavigateGlobal = vi.fn();

vi.mock('../contexts/EarthquakeDataContext', async () => {
  const actual = await vi.importActual('../contexts/EarthquakeDataContext');
  return {
    ...actual,
    useEarthquakeDataState: vi.fn(),
  };
});

let mockOnCloseCallback;

vi.mock('./EarthquakeDetailView', () => ({
  default: vi.fn(({ onClose }) => {
    mockOnCloseCallback = onClose;
    return <div data-testid="mock-detail-view">Mock Detail View</div>;
  })
}));

// Mock react-router-dom for useNavigate and useParams
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useParams: (...args) => mockUseParamsGlobal(...args),
    useNavigate: () => mockNavigateGlobal,
  };
});

describe('EarthquakeDetailModalComponent Navigation', () => {
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
    mockOnCloseCallback = undefined;
    if (useEarthquakeDataState && useEarthquakeDataState.mockClear) {
        useEarthquakeDataState.mockClear();
    }
    useEarthquakeDataState.mockReturnValue(defaultEarthquakeContextValue);
  });

  const renderComponent = (props = {}) => {
    return render(
      <MemoryRouter initialEntries={['/quake/test-detail-url']}>
        <Routes>
          <Route path="/quake/*" element={<EarthquakeDetailModalComponent {...props} />} />
        </Routes>
      </MemoryRouter>
    );
  };

  test('calls navigate(-1) when onClose is triggered from EarthquakeDetailView', () => {
    const history = { length: 3 };
    render(
      <MemoryRouter initialEntries={['/some-previous-page', '/quake/test-detail-url']}>
        <Routes>
          <Route path="/quake/*" element={<EarthquakeDetailModalComponent history={history} />} />
          <Route path="/some-previous-page" element={<div>Previous Page</div>} />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    act(() => {
      if (mockOnCloseCallback) {
        mockOnCloseCallback();
      } else {
        // Fail test if callback wasn't captured, means mock setup is wrong
        throw new Error("mockOnCloseCallback was not set by EarthquakeDetailView mock");
      }
    });

    expect(mockNavigateGlobal).toHaveBeenCalledWith(-1);
  });
});
