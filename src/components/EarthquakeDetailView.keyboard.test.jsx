import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EarthquakeDetailView from './EarthquakeDetailView';

// Keep the real detail lifecycle/dialog and substitute its expensive panel bodies.
vi.mock('./earthquakeDetail/EarthquakeSnapshotPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeRegionalMapPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeEnergyPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeRegionalSeismicityPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeDepthProfilePanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeSeismicWavesPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeLocationPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeImpactPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeCitizenSciencePanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeFaultDiagramPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeFaultParamsPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeMwwPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeMagnitudeComparisonPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeStressAxesPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeBeachballPanel', () => ({ default: () => null }));
vi.mock('./earthquakeDetail/EarthquakeDetailHeader', () => ({ default: () => <h2 id="earthquake-detail-title">Loaded earthquake</h2> }));
vi.mock('./earthquakeDetail/EarthquakeFurtherInfoPanel', () => ({ default: () => <a href="https://earthquake.usgs.gov/">Source details</a> }));

const detail = { id: 'us123', properties: { mag: 4, title: 'Test event', place: 'Test place', time: 1700000000000, products: {} }, geometry: { coordinates: [0, 0, 10] } };
const props = { detailUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us123.geojson', broaderEarthquakeData: [], hasAttemptedMonthlyLoad: true, onClose: vi.fn() };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('EarthquakeDetailView keyboard lifecycle', () => {
  it('provides a focused, trapped close control during loading and dismisses once', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EarthquakeDetailView {...props} onClose={onClose} />);
    const close = screen.getByRole('button', { name: 'Close detail view' });
    expect(screen.getByRole('dialog', { name: 'Loading earthquake details' })).toBeInTheDocument();
    expect(close).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves the focus trap to loaded controls and keeps focus through callback updates', async () => {
    let resolveFetch;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveFetch = resolve; })));
    const user = userEvent.setup();
    const oldClose = vi.fn();
    const newClose = vi.fn();
    const { rerender } = render(<EarthquakeDetailView {...props} onClose={oldClose} />);
    await act(async () => resolveFetch(Response.json(detail)));
    const close = screen.getByRole('button', { name: 'Close detail view' });
    const lastControl = screen.getByRole('link', { name: 'Source details' });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(lastControl).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    lastControl.focus();
    rerender(<EarthquakeDetailView {...props} onClose={newClose} />);
    expect(lastControl).toHaveFocus();
    fireEvent.keyDown(lastControl, { key: 'Escape' });
    expect(oldClose).not.toHaveBeenCalled();
    expect(newClose).toHaveBeenCalledTimes(1);
  });

  it('keeps error states keyboard dismissible and native activation invokes close once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: 'Unavailable' }) })));
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EarthquakeDetailView {...props} onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Error Loading Details' });
    const close = screen.getByRole('button', { name: 'Close detail view' });
    expect(close).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('restores focus to the initiating control after a loading dialog unmounts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { rerender } = render(<><button>Open event</button></>);
    screen.getByRole('button', { name: 'Open event' }).focus();
    rerender(<><button>Open event</button><EarthquakeDetailView {...props} /></>);
    expect(screen.getByRole('button', { name: 'Close detail view' })).toHaveFocus();
    rerender(<><button>Open event</button></>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open event' })).toHaveFocus());
  });
});


it('requests initial monthly context once even if the callback identity changes, and does not auto-retry errors', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  const load = vi.fn();
  const replacement = vi.fn();
  const { rerender } = render(<EarthquakeDetailView {...props} hasAttemptedMonthlyLoad={false} isLoadingMonthly={false} handleLoadMonthlyData={load} />);
  expect(load).toHaveBeenCalledTimes(1);
  rerender(<EarthquakeDetailView {...props} hasAttemptedMonthlyLoad={false} isLoadingMonthly={false} handleLoadMonthlyData={replacement} />);
  expect(replacement).not.toHaveBeenCalled();
  rerender(<EarthquakeDetailView {...props} hasAttemptedMonthlyLoad isLoadingMonthly={false} monthlyError="Unavailable" handleLoadMonthlyData={replacement} />);
  expect(replacement).not.toHaveBeenCalled();
});

describe('detail navigation and retry controls', () => {
  it('aborts the previous event and suppresses its late SEO update', async () => {
    const resolveRequests = [];
    const fetchMock = vi.fn(() => new Promise(resolve => { resolveRequests.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    const seo = vi.fn();
    const { rerender } = render(<EarthquakeDetailView {...props} onDataLoadedForSeo={seo} />);
    rerender(<EarthquakeDetailView {...props} detailUrl="https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us456.geojson" onDataLoadedForSeo={seo} />);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveRequests[0](Response.json(detail)));
    expect(seo).not.toHaveBeenCalled();
    await act(async () => resolveRequests[1](Response.json({ ...detail, id: 'us456' })));
    expect(seo).toHaveBeenCalledOnce(); expect(seo.mock.calls[0][0].id).toBe('us456');
  });
  it('aborts an active detail request when the view unmounts', () => {
    const fetchMock = vi.fn(() => new Promise(() => {})); vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<EarthquakeDetailView {...props} />);
    unmount(); expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('offers manual retry after bounded transient recovery is exhausted', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ message: 'Unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ message: 'Unavailable' }, { status: 503 })).mockResolvedValueOnce(Response.json(detail));
    vi.stubGlobal('fetch', fetchMock);
    const seo = vi.fn(); render(<EarthquakeDetailView {...props} onDataLoadedForSeo={seo} />);
    const retry = await screen.findByRole('button', { name: 'Retry details' });
    fireEvent.click(retry);
    await screen.findByRole('link', { name: 'Source details' });
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(seo).toHaveBeenCalledOnce();
  });
  it('shows deleted events as terminal without claiming a404 for SEO', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}, { status: 410 })); vi.stubGlobal('fetch', fetchMock);
    const notFound = vi.fn(); render(<EarthquakeDetailView {...props} onDetailNotFoundForSeo={notFound} />);
    await screen.findByText(/removed from the USGS catalog/);
    expect(screen.queryByRole('button', { name: 'Retry details' })).not.toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('replaces an indefinitely loading request with a retry control after15seconds', async () => {
    vi.useFakeTimers(); const fetchMock = vi.fn(() => new Promise(() => {})); vi.stubGlobal('fetch', fetchMock);
    render(<EarthquakeDetailView {...props} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole('button', { name: 'Retry details' })).toBeInTheDocument();
    expect(screen.getByText(/detail request timed out/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
