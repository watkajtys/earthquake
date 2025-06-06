import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
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

// We need to ensure that MemoryRouter, Routes, Route are NOT from the mock,
// but useParams and useNavigate ARE.
// import { useParams as actualUseParams } from 'react-router-dom'; // No longer needed with direct import for mocking

const mockNavigate = vi.fn(); // This will be used by the useNavigate mock

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useParams: vi.fn(() => ({ detailUrlParam: encodeURIComponent('test-detail-url') })), // Default mock
    useNavigate: () => mockNavigate, // Default mock for useNavigate
  };
});
// END MOCKS

import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent';
import { useParams } from 'react-router-dom'; // Import the mocked version for use in tests
// These imports get the mocked versions because vi.mock is hoisted.
import EarthquakeDetailView from './EarthquakeDetailView';
import SeoMetadata from './SeoMetadata';

// Updated mock data structure to reflect what EarthquakeDetailView's onDataLoadedForSeo provides
const mockUsgsEventPageUrl = 'https://earthquake.usgs.gov/earthquakes/eventpage/testquake123';
const mockDetailViewPayloadFull = { // Renamed for clarity
  id: 'testquake123',
  properties: {
    mag: 6.5,
    place: '10km N of Testville',
    time: new Date('2023-10-26T10:00:00Z').getTime(),
    updated: new Date('2023-10-26T11:00:00Z').getTime(),
    detail: mockUsgsEventPageUrl,
  },
  geometry: {
    coordinates: [-118.456, 35.123, 15.2] // lon, lat, depth
  },
  shakemapIntensityImageUrl: 'https://example.com/shakemap.jpg',
};

const mockDetailViewPayloadMinimal = {
    id: 'testquakeMinimal',
    properties: {
        mag: 5.0,
        place: 'Somewhere',
        time: new Date('2023-11-01T00:00:00Z').getTime(),
        // updated, detail are optional and will be undefined in this mock
    },
    geometry: {
        coordinates: [-100.0, 40.0, 10.0]
    },
    // shakemapIntensityImageUrl will be undefined in this mock
};

const mockDetailViewPayloadNullGeo = {
    id: 'testquakeNullGeo',
    properties: {
        mag: 5.1,
        place: 'Near Null Island',
        time: new Date('2023-11-02T00:00:00Z').getTime(),
        updated: new Date('2023-11-02T01:00:00Z').getTime(),
        // detail is undefined in this mock
    },
    geometry: {
        coordinates: [null, null, null] // Null lon, lat, depth
    },
    shakemapIntensityImageUrl: null, // Explicitly null
};


describe('EarthquakeDetailModalComponent', () => {
  const defaultMockProps = { // Kept for potential direct prop overrides if needed later
    // Props that might be passed directly to EarthquakeDetailModalComponent if it had any
  };

  const defaultEarthquakeContextValue = {
    allEarthquakes: [],
    earthquakesLast7Days: [],
    loadMonthlyData: vi.fn(),
    hasAttemptedMonthlyLoad: false,
    isLoadingMonthly: false,
  };

  beforeEach(() => {
    mockNavigate.mockClear();
    if (EarthquakeDetailView.mockClear) EarthquakeDetailView.mockClear();
    if (SeoMetadata.mockClear) SeoMetadata.mockClear();
    mockOnDataLoadedForSeoCallback = undefined;
    mockOnCloseCallback = undefined;
    if (useEarthquakeDataState && useEarthquakeDataState.mockClear) {
        useEarthquakeDataState.mockClear();
    }
    // Setup default mock for useEarthquakeDataState for all tests unless overridden
    useEarthquakeDataState.mockReturnValue(defaultEarthquakeContextValue);
  });

  const renderComponent = (props = {}) => { // props can override defaults if ever needed
    return render(
      <MemoryRouter initialEntries={['/quake/test-detail-url']}>
        <Routes>
          <Route path="/quake/:detailUrlParam" element={<EarthquakeDetailModalComponent {...defaultMockProps} {...props} />} />
        </Routes>
      </MemoryRouter>
    );
  };

  test('renders without crashing and SeoMetadata initially receives undefined eventJsonLd', () => {
    renderComponent();
    expect(EarthquakeDetailView).toHaveBeenCalled();
    expect(SeoMetadata).toHaveBeenCalled();

    const initialSeoMetadataCall = SeoMetadata.mock.calls.find(call => call[0].eventJsonLd === undefined);
    expect(initialSeoMetadataCall).toBeDefined();
    if(initialSeoMetadataCall) {
        expect(initialSeoMetadataCall[0].eventJsonLd).toBeUndefined(); // Changed from toBeNull
    }
  });

  test('constructs and passes eventJsonLd to SeoMetadata when onDataLoadedForSeo is called', async () => {
    renderComponent();

    // Simulate EarthquakeDetailView calling onDataLoadedForSeo
    act(() => {
      if (mockOnDataLoadedForSeoCallback) {
        // Use the updated mock payload structure
        mockOnDataLoadedForSeoCallback(mockDetailViewPayloadFull);
      }
    });

    await waitFor(() => { // Ensure state updates and re-renders complete
      expect(SeoMetadata.mock.calls.length).toBeGreaterThanOrEqual(1); // It's called initially, then on update
    });

    const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];

    const { properties: props, geometry: geom, id: usgsEventId, shakemapIntensityImageUrl } = mockDetailViewPayloadFull;
    const titleDate = new Date(props.time).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'});
    const expectedPageTitle = `M ${props.mag} Earthquake - ${props.place} - ${titleDate} | Earthquakes Live`;
    const descriptionTime = new Date(props.time).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
    const expectedDescription = `Detailed report of the M ${props.mag} earthquake that struck near ${props.place} on ${titleDate} at ${descriptionTime} (UTC). Magnitude: ${props.mag}, Depth: ${geom.coordinates[2]} km. Location: ${geom.coordinates[1]?.toFixed(2)}, ${geom.coordinates[0]?.toFixed(2)}. Stay updated with Earthquakes Live.`;
    const expectedKeywords = `earthquake, seismic event, M ${props.mag}, ${props.place.split(', ').join(', ')}, earthquake details, usgs event, ${usgsEventId}`;
    const expectedCanonicalUrl = 'https://earthquakeslive.com/quake/test-detail-url'; // from useParams mock

    expect(lastSeoCall.eventJsonLd).toEqual({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: `M ${props.mag} - ${props.place}`,
        description: expectedDescription,
        startDate: new Date(props.time).toISOString(),
        location: {
          '@type': 'Place',
          name: props.place,
          geo: {
            '@type': 'GeoCoordinates',
            latitude: geom.coordinates[1],
            longitude: geom.coordinates[0],
            "elevation": -geom.coordinates[2] * 1000
          },
        },
        image: shakemapIntensityImageUrl,
        keywords: expectedKeywords.toLowerCase(),
        url: expectedCanonicalUrl,
        identifier: usgsEventId,
        sameAs: props.detail
    });
    // Also check other direct props of SeoMetadata
    expect(lastSeoCall.title).toBe(expectedPageTitle);
    expect(lastSeoCall.description).toBe(expectedDescription);
    expect(lastSeoCall.keywords).toBe(expectedKeywords);
    expect(lastSeoCall.canonicalUrl).toBe(expectedCanonicalUrl);
    expect(lastSeoCall.pageUrl).toBe(expectedCanonicalUrl);
    expect(lastSeoCall.type).toBe('article');
    expect(lastSeoCall.publishedTime).toBe(new Date(props.time).toISOString());
    expect(lastSeoCall.modifiedTime).toBe(new Date(props.updated).toISOString());
    expect(lastSeoCall.imageUrl).toBe(shakemapIntensityImageUrl);
  });

  test('handles missing optional seoData fields gracefully for eventJsonLd', async () => {
    renderComponent();

    act(() => {
      if (mockOnDataLoadedForSeoCallback) {
        mockOnDataLoadedForSeoCallback(mockDetailViewPayloadMinimal);
      }
    });

    await waitFor(() => {
        expect(SeoMetadata.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];

    const { properties: propsMinimal, geometry: geomMinimal, id: usgsEventIdMinimal } = mockDetailViewPayloadMinimal;
    const expectedNameMinimal = `M ${propsMinimal.mag} - ${propsMinimal.place}`;

    expect(lastSeoCall.eventJsonLd).toEqual(
      expect.objectContaining({
        '@type': 'Event',
        name: expectedNameMinimal,
        startDate: new Date(propsMinimal.time).toISOString(),
        location: expect.objectContaining({
            name: propsMinimal.place,
            geo: {
                '@type': 'GeoCoordinates',
                latitude: geomMinimal.coordinates[1],
                longitude: geomMinimal.coordinates[0],
                "elevation": -geomMinimal.coordinates[2] * 1000
            }
        }),
        identifier: usgsEventIdMinimal,
      })
    );
    expect(lastSeoCall.eventJsonLd.image).toBeUndefined();
    expect(lastSeoCall.eventJsonLd.sameAs).toBeUndefined();
    expect(lastSeoCall.modifiedTime).toBe(new Date(propsMinimal.time).toISOString());
  });

  test('handles seoData with null depth, latitude, longitude for eventJsonLd', async () => {
    renderComponent();

    act(() => {
      if (mockOnDataLoadedForSeoCallback) {
        mockOnDataLoadedForSeoCallback(mockDetailViewPayloadNullGeo);
      }
    });

    await waitFor(() => {
        expect(SeoMetadata.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];

    const { properties: propsNullGeo, id: usgsEventIdNullGeo } = mockDetailViewPayloadNullGeo;
    const expectedNameNullGeo = `M ${propsNullGeo.mag} - ${propsNullGeo.place}`;

    expect(lastSeoCall.eventJsonLd).toEqual(
      expect.objectContaining({
        '@type': 'Event',
        name: expectedNameNullGeo,
        location: expect.objectContaining({ name: propsNullGeo.place }),
        identifier: usgsEventIdNullGeo,
      })
    );
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
      // Override useParams mock for this test
      vi.mocked(useParams).mockReturnValueOnce({ detailUrlParam: "" }); // Use empty string

      render( // Render directly without initialEntries for this specific useParams case or provide matching route
        <MemoryRouter initialEntries={['/quake/']}> {/* Or a route that results in no param */}
            <Routes>
                <Route path="/quake/:detailUrlParam?" element={<EarthquakeDetailModalComponent />} />
            </Routes>
        </MemoryRouter>
      );
      expect(EarthquakeDetailView).not.toHaveBeenCalled();

      // Check SeoMetadata for default/initial URLs when detailUrlParam is missing
      const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];
      expect(lastSeoCall.pageUrl).toBe("https://earthquakeslive.com");
      expect(lastSeoCall.canonicalUrl).toBe("https://earthquakeslive.com");
    });

    test('renders EarthquakeDetailView when detailUrlParam is present', () => {
      // useParams is mocked globally to return 'test-detail-url'
      renderComponent();
      expect(EarthquakeDetailView).toHaveBeenCalled();
      const passedProps = EarthquakeDetailView.mock.calls[0][0];
      expect(passedProps.detailUrl).toBe('test-detail-url'); // Decoded version
    });
  });
});
