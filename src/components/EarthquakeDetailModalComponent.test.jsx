import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { EarthquakeDataContext, useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Import context and hook

// MOCKS MUST BE AT THE TOP (or at least before imports that use them)
// Mock the context hook
vi.mock('../contexts/EarthquakeDataContext', async () => {
  const actual = await vi.importActual('../contexts/EarthquakeDataContext');
  return {
    ...actual, // Preserve actual exports like EarthquakeDataContext
    useEarthquakeDataState: vi.fn(), // Mock the hook
  };
});

let mockOnDataLoadedForSeoCallback;
let mockOnCloseCallback;

vi.mock('./EarthquakeDetailView', () => ({
  default: vi.fn(({ onDataLoadedForSeo, onClose }) => {
    mockOnDataLoadedForSeoCallback = onDataLoadedForSeo;
    mockOnCloseCallback = onClose;
    return <div data-testid="mock-detail-view">Mock Detail View</div>;
  })
}));

vi.mock('./SeoMetadata', () => ({
  default: vi.fn(() => null)
}));

const mockNavigate = vi.fn();
// We need to ensure that MemoryRouter, Routes, Route are NOT from the mock,
// but useParams and useNavigate ARE.
// So, we selectively mock, and import the non-mocked parts directly.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual, // Spread actual to ensure things like Link, MemoryRouter etc. are included
    useParams: () => ({ detailUrlParam: encodeURIComponent('test-detail-url') }),
    useNavigate: () => mockNavigate,
  };
});
// END MOCKS

import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent';
// These imports get the mocked versions because vi.mock is hoisted.
import EarthquakeDetailView from './EarthquakeDetailView';
import SeoMetadata from './SeoMetadata';


describe('EarthquakeDetailModalComponent', () => {
  const defaultMockProps = {
    broaderEarthquakeData: [],
    dataSourceTimespanDays: 7,
    handleLoadMonthlyData: vi.fn(),
    hasAttemptedMonthlyLoad: false,
    isLoadingMonthly: false,
  };

  const defaultEarthquakeContextValue = {
    allEarthquakes: [],
    earthquakesLast7Days: [],
    loadMonthlyData: vi.fn(),
    hasAttemptedMonthlyLoad: false,
    isLoadingMonthly: false,
  };

  beforeEach(() => {
    // Clear mock call history
    mockNavigate.mockClear();
    // For vi.fn(), use .mockClear()
    if (EarthquakeDetailView.mockClear) EarthquakeDetailView.mockClear();
    if (SeoMetadata.mockClear) SeoMetadata.mockClear();
    // Ensure the functions themselves are cleared if they are vi.fn mocks
    if (EarthquakeDetailView && EarthquakeDetailView.mock) EarthquakeDetailView.mockClear();
    if (SeoMetadata && SeoMetadata.mock) SeoMetadata.mockClear();
    mockOnDataLoadedForSeoCallback = undefined;
    mockOnCloseCallback = undefined;
    // defaultEarthquakeContextValue.loadMonthlyData.mockClear(); // No longer using this structure for context
    // Clear the mock for the hook if it's a spy or vi.fn()
    if (useEarthquakeDataState && useEarthquakeDataState.mockClear) {
        useEarthquakeDataState.mockClear();
    }
  });

  // Modified renderComponent to not rely on defaultEarthquakeContextValue if useEarthquakeDataState is mocked for each test
  const renderComponent = (props = defaultMockProps) => { // Removed earthquakeContextValue from params
    // Mock return value for useEarthquakeDataState will be set in each test
    // If a default is needed here, set it before render:
    // useEarthquakeDataState.mockReturnValue(defaultEarthquakeContextValue);
    return render(
      <MemoryRouter initialEntries={['/quake/test-detail-url']}>
        {/* EarthquakeDataContext.Provider might not be needed if the hook is fully mocked */}
        <Routes>
          <Route path="/quake/:detailUrlParam" element={<EarthquakeDetailModalComponent {...props} />} />
        </Routes>
      </MemoryRouter>
    );
  };

  test('renders without crashing and SeoMetadata initially receives null eventJsonLd', () => {
    // Setup a default mock for useEarthquakeDataState for this test
    useEarthquakeDataState.mockReturnValue(defaultEarthquakeContextValue);
    renderComponent();
    expect(EarthquakeDetailView).toHaveBeenCalled();
    expect(SeoMetadata).toHaveBeenCalled();

    // Check initial call to SeoMetadata (before onDataLoadedForSeo is called)
    const initialSeoMetadataCall = SeoMetadata.mock.calls.find(call => call[0].eventJsonLd === null || call[0].eventJsonLd === undefined);
    expect(initialSeoMetadataCall).toBeDefined();
    if(initialSeoMetadataCall) { // ensure it was found
        expect(initialSeoMetadataCall[0].eventJsonLd).toBeNull();
    }
  });

  test('constructs and passes eventJsonLd to SeoMetadata when onDataLoadedForSeo is called', async () => {
    renderComponent();

    const mockSeoPayload = {
      title: 'M 6.5 - Test Region',
      place: '10km N of Testville',
      time: new Date('2023-10-26T10:00:00Z').getTime(),
      updated: new Date('2023-10-26T10:05:00Z').getTime(),
      mag: 6.5,
      depth: 15.2,
      latitude: 35.123,
      longitude: -118.456,
      shakemapIntensityImageUrl: 'https://example.com/shakemap.jpg',
    };

    // Simulate EarthquakeDetailView calling onDataLoadedForSeo
    act(() => {
      if (mockOnDataLoadedForSeoCallback) {
        mockOnDataLoadedForSeoCallback(mockSeoPayload);
      }
    });

    // Check the last call to SeoMetadata (it re-renders)
    const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];

    const expectedPageTitle = `M ${mockSeoPayload.mag} Earthquake - ${mockSeoPayload.place} - ${new Date(mockSeoPayload.time).toLocaleDateString()}`;
    const expectedPageDescription = `Detailed information about the M ${mockSeoPayload.mag} earthquake that occurred near ${mockSeoPayload.place} on ${new Date(mockSeoPayload.time).toUTCString()}. Depth: ${mockSeoPayload.depth} km.`;
    const expectedPageKeywords = `earthquake, seismic event, M ${mockSeoPayload.mag}, ${mockSeoPayload.place}, earthquake details, usgs event`;
    const expectedCanonicalUrl = 'https://earthquakeslive.com/quake/test-detail-url';

    expect(lastSeoCall.eventJsonLd).toEqual(
      expect.objectContaining({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: expectedPageTitle,
        description: expectedPageDescription,
        startDate: new Date(mockSeoPayload.time).toISOString(),
        endDate: new Date(mockSeoPayload.time).toISOString(),
        url: expectedCanonicalUrl,
        identifier: 'test-detail-url',
        keywords: expectedPageKeywords,
        image: mockSeoPayload.shakemapIntensityImageUrl,
        subjectOf: {
            '@type': 'WebPage',
            url: expectedCanonicalUrl,
        },
        location: expect.objectContaining({
          '@type': 'Place',
          name: mockSeoPayload.place,
          geo: expect.objectContaining({ // component adds geo if lat/lon are numbers
            '@type': 'GeoCoordinates',
            latitude: mockSeoPayload.latitude,
            longitude: mockSeoPayload.longitude,
            // component does not add elevation to eventJsonLd.location.geo
          }),
        }),
        // organizer is no longer part of the component's output
      })
    );
    // Also check other direct props of SeoMetadata
    expect(lastSeoCall.title).toBe(expectedPageTitle);
    expect(lastSeoCall.description).toBe(expectedPageDescription);
    expect(lastSeoCall.keywords).toBe(expectedPageKeywords);
    expect(lastSeoCall.canonicalUrl).toBe(expectedCanonicalUrl);
    expect(lastSeoCall.pageUrl).toBe(expectedCanonicalUrl);
    expect(lastSeoCall.type).toBe('article');
    expect(lastSeoCall.publishedTime).toBe(new Date(mockSeoPayload.time).toISOString());
    expect(lastSeoCall.modifiedTime).toBe(new Date(mockSeoPayload.updated).toISOString());
    expect(lastSeoCall.imageUrl).toBe(mockSeoPayload.shakemapIntensityImageUrl);
  });

  test('handles missing optional seoData fields gracefully for eventJsonLd', () => {
    renderComponent();

    const mockSeoPayloadMinimal = {
      title: 'M 5.0 - Minimal Data Event',
      place: 'Somewhere',
      time: new Date('2023-11-01T00:00:00Z').getTime(),
      mag: 5.0,
      // No depth, latitude, longitude, shakemapIntensityImageUrl
    };

    act(() => {
      if (mockOnDataLoadedForSeoCallback) {
        mockOnDataLoadedForSeoCallback(mockSeoPayloadMinimal);
      }
    });

    const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];

    const expectedPageTitleMinimal = `M ${mockSeoPayloadMinimal.mag} Earthquake - ${mockSeoPayloadMinimal.place} - ${new Date(mockSeoPayloadMinimal.time).toLocaleDateString()}`;
    expect(lastSeoCall.eventJsonLd).toEqual(
      expect.objectContaining({
        '@type': 'Event',
        name: expectedPageTitleMinimal, // Updated to match component logic
        startDate: new Date(mockSeoPayloadMinimal.time).toISOString(),
        location: expect.objectContaining({
          '@type': 'Place',
          name: mockSeoPayloadMinimal.place,
        }),
      })
    );
    // Check that geo is not present if coordinates were missing (as per component logic)
    expect(lastSeoCall.eventJsonLd.location.geo).toBeUndefined();
    expect(lastSeoCall.imageUrl).toBeNull(); // Since shakemapIntensityImageUrl was missing
    // Check that times are handled (publishedTime will exist, modifiedTime will fallback to publishedTime or be undefined if time itself is missing)
    expect(lastSeoCall.publishedTime).toBe(new Date(mockSeoPayloadMinimal.time).toISOString());
    // If 'updated' is missing in payload, component falls back to 'time' for modifiedTime
    expect(lastSeoCall.modifiedTime).toBe(new Date(mockSeoPayloadMinimal.time).toISOString());
  });

  test('handles seoData with null depth, latitude, longitude for eventJsonLd', () => {
    renderComponent();

    const mockSeoPayloadNullGeo = {
      title: 'M 5.1 - Null Geo Event',
      place: 'Near Null Island',
      time: new Date('2023-11-02T00:00:00Z').getTime(),
      mag: 5.1,
      depth: null,
      latitude: null,
      longitude: null,
    };

    act(() => {
      if (mockOnDataLoadedForSeoCallback) {
        mockOnDataLoadedForSeoCallback(mockSeoPayloadNullGeo);
      }
    });

    const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];

    const expectedPageTitleNullGeo = `M ${mockSeoPayloadNullGeo.mag} Earthquake - ${mockSeoPayloadNullGeo.place} - ${new Date(mockSeoPayloadNullGeo.time).toLocaleDateString()}`;
    expect(lastSeoCall.eventJsonLd).toEqual(
      expect.objectContaining({
        '@type': 'Event',
        name: expectedPageTitleNullGeo, // Corrected expected name
        location: expect.objectContaining({
          '@type': 'Place',
          name: mockSeoPayloadNullGeo.place,
          // geo should be undefined because latitude/longitude are null
        }),
      })
    );
    // Geo property should not exist if lat/lon are null (as per component logic)
    expect(lastSeoCall.eventJsonLd.location.geo).toBeUndefined();
  });


  test('calls navigate(-1) when onClose is triggered from EarthquakeDetailView', () => {
    useEarthquakeDataState.mockReturnValue(defaultEarthquakeContextValue); // Setup mock for this test
    renderComponent();

    expect(mockNavigate).not.toHaveBeenCalled();

    act(() => {
      if (mockOnCloseCallback) {
        mockOnCloseCallback();
      }
    });

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  describe('dataSourceTimespanDays logic', () => {
    // No need to mock react-router-dom here as it's done globally at the top of the file
    // Ensure EarthquakeDetailView mock is also available (done globally)

    test('passes dataSourceTimespanDays as 30 to EarthquakeDetailView when hasAttemptedMonthlyLoad is true', () => {
      useEarthquakeDataState.mockReturnValue({
        allEarthquakes: [{ id: 'eq1', properties: {}, geometry: {} }],
        earthquakesLast7Days: [],
        loadMonthlyData: vi.fn(),
        hasAttemptedMonthlyLoad: true, // Key for this test
        isLoadingMonthly: false,
      });

      renderComponent(); // Uses the props passed to EarthquakeDetailModalComponent

      // Check props passed to the mocked EarthquakeDetailView
      // The mock for EarthquakeDetailView is at the top, using vi.mock
      // We can use the imported EarthquakeDetailView directly as it's already the mock
      // The mock is defined to take only one 'props' argument.
      // Check the first argument of the first call
      expect(EarthquakeDetailView.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          dataSourceTimespanDays: 30,
        })
      );
    });

    test('passes dataSourceTimespanDays as 7 to EarthquakeDetailView when hasAttemptedMonthlyLoad is false', () => {
      useEarthquakeDataState.mockReturnValue({
        allEarthquakes: [],
        earthquakesLast7Days: [{ id: 'eq2', properties: {}, geometry: {} }],
        loadMonthlyData: vi.fn(),
        hasAttemptedMonthlyLoad: false, // Key for this test
        isLoadingMonthly: false,
      });

      renderComponent();

      // Use the imported EarthquakeDetailView directly
      // The mock is defined to take only one 'props' argument.
      // Check the first argument of the first call
      expect(EarthquakeDetailView.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          dataSourceTimespanDays: 7,
        })
      );
    });
  });
});
