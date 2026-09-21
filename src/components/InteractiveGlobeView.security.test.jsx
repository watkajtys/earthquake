import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { afterEach, test, expect, vi } from 'vitest';
import FloatTooltip from 'float-tooltip';
import GlobeView from './InteractiveGlobeView.jsx';

const state = vi.hoisted(() => ({ globeProps: null, clusters: [], context: {
  globeEarthquakes: [{ id: 'testquake', properties: { mag: 2, place: '<span data-test-markup="inert">literal place</span>', time: 1 }, geometry: { coordinates: [0, 0, 1] } }],
  lastMajorQuake: null, previousMajorQuake: null,
} }));
vi.mock('react-globe.gl', () => ({ default: props => { state.globeProps = props; return <div>Mock globe</div>; } }));
vi.mock('../contexts/EarthquakeDataContext.jsx', () => ({ useEarthquakeDataState: () => state.context }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

test('upstream place markup remains literal through the installed tooltip dependency', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} });
  render(<GlobeView onQuakeClick={() => {}} getMagnitudeColorFunc={() => '#fff'} activeClusters={state.clusters} />);
  await waitFor(() => expect(state.globeProps?.pointsData?.length).toBe(1));
  const point = state.globeProps.pointsData[0];
  const label = state.globeProps.pointLabel(point);
  expect(label).toBeInstanceOf(HTMLElement);
  const container = document.createElement('div');
  document.body.append(container);
  const tooltip = FloatTooltip()(container);
  tooltip.content(label);
  await waitFor(() => expect(container.textContent).toContain('<span data-test-markup="inert">literal place</span>'));
  expect(container.querySelector('[data-test-markup]')).toBeNull();
  tooltip.content(null);
});
