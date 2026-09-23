import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EarthquakeDetailModalComponent from './EarthquakeDetailModalComponent';
import EarthquakeDetailView from './EarthquakeDetailView';
import SeoMetadata from './SeoMetadata';
import { useEarthquakeDataState } from '../contexts/EarthquakeDataContext'; // Mocked

// MOCKS (subset relevant for SEO tests, others might be needed if renderComponent is complex)
const mockUseParamsGlobal = vi.fn();
// mockNavigateGlobal might not be needed if navigation tests are separate

vi.mock('../contexts/EarthquakeDataContext', async () => {
  const actual = await vi.importActual('../contexts/EarthquakeDataContext');
  return {
    ...actual,
    useEarthquakeDataState: vi.fn(),
  };
});

let mockOnDataLoadedForSeoCallback;
let mockOnDetailNotFoundForSeoCallback;
// let mockOnCloseCallback; // Not directly used in SEO tests

vi.mock('./EarthquakeDetailView', () => ({
  default: vi.fn(({ onDataLoadedForSeo, onDetailNotFoundForSeo }) => {
    mockOnDataLoadedForSeoCallback = onDataLoadedForSeo;
    mockOnDetailNotFoundForSeoCallback = onDetailNotFoundForSeo;
    // mockOnCloseCallback = onClose; // Keep if renderComponent needs it
    return <div data-testid="mock-detail-view">Mock Detail View</div>;
  })
}));

vi.mock('./SeoMetadata', () => ({
  default: vi.fn(() => null)
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useParams: (...args) => mockUseParamsGlobal(...args),
    // useNavigate: () => mockNavigateGlobal, // Keep if renderComponent needs it
  };
});

// Test Data (copied from original, ensure it's what these tests need)
const mockUsgsEventPageUrl = 'https://earthquake.usgs.gov/earthquakes/eventpage/testquake123';
const mockDetailViewPayloadFull = {
  id: 'testquake123',
  properties: {
    mag: 6.5,
    place: '10km N of Testville',
    time: new Date('2023-10-26T10:00:00Z').getTime(),
    updated: new Date('2023-10-26T11:00:00Z').getTime(),
    detail: mockUsgsEventPageUrl,
  },
  geometry: {
    coordinates: [-118.456, 35.123, 15.2]
  },
  shakemapIntensityImageUrl: 'https://example.com/shakemap.jpg',
};
const mockDetailViewPayloadMinimal = {
    id: 'testquakeMinimal',
    properties: {
        mag: 5.0,
        place: 'Somewhere',
        time: new Date('2023-11-01T00:00:00Z').getTime(),
    },
    geometry: {
        coordinates: [-100.0, 40.0, 10.0]
    },
};
const mockDetailViewPayloadNullGeo = {
    id: 'testquakeNullGeo',
    properties: {
        mag: 5.1,
        place: 'Near Null Island',
        time: new Date('2023-11-02T00:00:00Z').getTime(),
        updated: new Date('2023-11-02T01:00:00Z').getTime(),
    },
    geometry: {
        coordinates: [null, null, null]
    },
    shakemapIntensityImageUrl: null,
};


describe('EarthquakeDetailModalComponent SEO', () => {
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
    if (SeoMetadata.mockClear) SeoMetadata.mockClear();
    mockOnDataLoadedForSeoCallback = undefined;
    mockOnDetailNotFoundForSeoCallback = undefined;
    if (useEarthquakeDataState && useEarthquakeDataState.mockClear) {
        useEarthquakeDataState.mockClear();
    }
    useEarthquakeDataState.mockReturnValue(defaultEarthquakeContextValue);
  });

  afterEach(() => {
    document.getElementById('root')?.remove();
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelector('meta[name="robots"]')?.remove();
  });

  const renderComponent = (props = {}, path = '/quake/test-detail-url', options = {}) => {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/quake/*" element={<EarthquakeDetailModalComponent {...props} />} />
        </Routes>
      </MemoryRouter>, options
    );
  };

  test('preserves verified crawler metadata through loading and a later API 404', () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('data-prerendered-earthquake-route', '/quake/test-detail-url');
    root.setAttribute('data-prerendered-earthquake-indexable', 'true');
    document.body.appendChild(root);
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = 'https://earthquakeslive.com/quake/id/test-detail-url';
    document.head.appendChild(canonical);
    document.title = 'Verified earthquake | Earthquakes Live';

    renderComponent({}, '/quake/test-detail-url', { container: root });
    expect(root.hasAttribute('data-prerendered-earthquake-route')).toBe(false);
    expect(root.hasAttribute('data-prerendered-earthquake-indexable')).toBe(false);
    expect(SeoMetadata).not.toHaveBeenCalled();
    act(() => mockOnDetailNotFoundForSeoCallback());
    expect(SeoMetadata).not.toHaveBeenCalled();
    expect(document.title).toBe('Verified earthquake | Earthquakes Live');
    expect(document.head.querySelector('link[rel="canonical"]')?.href).toBe(canonical.href);
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();

    act(() => mockOnDataLoadedForSeoCallback({
      ...mockDetailViewPayloadFull,
      properties: { ...mockDetailViewPayloadFull.properties, mag: 3, products: {} },
    }));
    // Stored D1 science flags may qualify a sitemap URL even when its archive
    // omits products; the verified server decision remains authoritative.
    expect(SeoMetadata.mock.lastCall[0].noIndex).toBe(false);
  });

  test('keeps an unverified SPA route noindex and clears inherited canonical until detail loads', () => {
    renderComponent();
    expect(SeoMetadata.mock.lastCall[0]).toMatchObject({ noIndex: true });
    expect(SeoMetadata.mock.lastCall[0].canonicalUrl).toBeUndefined();

    act(() => mockOnDetailNotFoundForSeoCallback());
    expect(SeoMetadata.mock.lastCall[0]).toMatchObject({
      title: 'Earthquake not found | Earthquakes Live', noIndex: true,
    });
    expect(SeoMetadata.mock.lastCall[0].canonicalUrl).toBeUndefined();

    act(() => mockOnDataLoadedForSeoCallback(mockDetailViewPayloadFull));
    expect(SeoMetadata.mock.lastCall[0]).toMatchObject({
      canonicalUrl: 'https://earthquakeslive.com/quake/id/testquake123', noIndex: false,
    });
  });

  test('keeps a stored page excluded when richer archive detail disagrees with D1 eligibility', () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('data-prerendered-earthquake-route', '/quake/test-detail-url');
    root.setAttribute('data-prerendered-earthquake-indexable', 'false');
    document.body.appendChild(root);
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);

    renderComponent({}, '/quake/test-detail-url', { container: root });
    expect(SeoMetadata).not.toHaveBeenCalled();
    expect(robots.content).toBe('noindex');
    act(() => mockOnDataLoadedForSeoCallback(mockDetailViewPayloadFull));
    expect(SeoMetadata.mock.lastCall[0].noIndex).toBe(true);
  });

  test('does not reuse a verified server marker for a different SPA route', () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('data-prerendered-earthquake-route', '/quake/id/previous');
    root.setAttribute('data-prerendered-earthquake-indexable', 'true');
    document.body.appendChild(root);

    renderComponent({}, '/quake/id/next');

    expect(SeoMetadata.mock.lastCall[0]).toMatchObject({ noIndex: true });
    expect(SeoMetadata.mock.lastCall[0].canonicalUrl).toBeUndefined();
    expect(root.hasAttribute('data-prerendered-earthquake-route')).toBe(false);
  });

  test.each([
    { description: 'missing place', properties: { mag: 6.5, place: null } },
    { description: 'empty scientific product', properties: { mag: 3, place: 'Test place', products: { 'moment-tensor': [] } } },
  ])('keeps an unverified $description detail noindex after loading', ({ properties }) => {
    renderComponent();
    act(() => mockOnDataLoadedForSeoCallback({
      ...mockDetailViewPayloadFull,
      properties: { ...mockDetailViewPayloadFull.properties, ...properties },
    }));
    expect(SeoMetadata.mock.lastCall[0].noIndex).toBe(true);
  });

  test('SeoMetadata initially receives undefined eventJsonLd', () => {
    renderComponent();
    expect(SeoMetadata).toHaveBeenCalled();
    const initialSeoMetadataCall = SeoMetadata.mock.calls.find(call => call[0].eventJsonLd === undefined);
    expect(initialSeoMetadataCall).toBeDefined();
    if(initialSeoMetadataCall) {
        expect(initialSeoMetadataCall[0].eventJsonLd).toBeUndefined();
    }
  });

  test('constructs and passes eventJsonLd to SeoMetadata when onDataLoadedForSeo is called', async () => {
    renderComponent();

    act(() => {
      if (mockOnDataLoadedForSeoCallback) {
        mockOnDataLoadedForSeoCallback(mockDetailViewPayloadFull);
      }
    });

    await waitFor(() => {
      expect(SeoMetadata.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    const lastSeoCall = SeoMetadata.mock.calls[SeoMetadata.mock.calls.length - 1][0];
    const { properties: props, geometry: geom, id: usgsEventId, shakemapIntensityImageUrl } = mockDetailViewPayloadFull;
    const titleDate = new Date(props.time).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'});
    const expectedPageTitle = `M ${props.mag} Earthquake - ${props.place} - ${titleDate} | Earthquakes Live`;
    const descriptionTime = new Date(props.time).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
    const expectedDescription = `Detailed report of the M ${props.mag} earthquake that struck near ${props.place} on ${titleDate} at ${descriptionTime} (UTC). Magnitude: ${props.mag}, Depth: ${geom.coordinates[2]} km. Location: ${geom.coordinates[1]?.toFixed(2)}, ${geom.coordinates[0]?.toFixed(2)}. Stay updated with Earthquakes Live.`;
    const expectedKeywords = `earthquake, seismic event, M ${props.mag}, ${props.place.split(', ').join(', ')}, earthquake details, usgs event, ${usgsEventId}`;
    const expectedCanonicalUrl = 'https://earthquakeslive.com/quake/id/testquake123';

    expect(lastSeoCall.eventJsonLd).toEqual({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: `M ${props.mag} - ${props.place}`,
        description: expectedDescription,
        startDate: new Date(props.time).toISOString(),
        endDate: new Date(props.time).toISOString(),
        // eventAttendanceMode removed
        eventStatus: 'https://schema.org/EventHappened', // Corrected
        location: {
          '@type': 'Place',
          name: props.place,
          address: props.place,
          geo: {
            '@type': 'GeoCoordinates',
            latitude: geom.coordinates[1],
            longitude: geom.coordinates[0],
            "elevation": -geom.coordinates[2] * 1000
          },
        },
        image: shakemapIntensityImageUrl, // This will use the actual SVG path in component
        keywords: expectedKeywords.toLowerCase(),
        url: expectedCanonicalUrl,
        identifier: usgsEventId,
        sameAs: props.detail,
        // performer removed
        organizer: { // Corrected
            '@type': 'Organization',
            name: 'Earthquakes Live',
            url: 'https://earthquakeslive.com'
        }
    });
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
        name: expectedNameMinimal,
        startDate: new Date(propsMinimal.time).toISOString(),
        location: expect.objectContaining({
            geo: {
                '@type': 'GeoCoordinates',
                latitude: geomMinimal.coordinates[1],
                longitude: geomMinimal.coordinates[0],
                "elevation": -geomMinimal.coordinates[2] * 1000
            }
        }),
        identifier: usgsEventIdMinimal,
        image: expect.any(String), // Check that it's a string (path to the imported SVG)
        eventStatus: 'https://schema.org/EventHappened', // Added
        organizer: { // Added
            '@type': 'Organization',
            name: 'Earthquakes Live',
            url: 'https://earthquakeslive.com'
        }
      })
    );
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
        name: expectedNameNullGeo,
        location: expect.objectContaining({ name: propsNullGeo.place }),
        identifier: usgsEventIdNullGeo,
      })
    );
    expect(lastSeoCall.eventJsonLd.location.geo).toBeUndefined();
  });
});
