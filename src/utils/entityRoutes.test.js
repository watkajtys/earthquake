import { describe, expect, it } from 'vitest';
import { buildEarthquakePath, parseEarthquakePath, buildClusterPath, parseClusterPath, legacyClusterEventId, modalReturnPath, buildModalNavigationState, modalReturnTarget } from './entityRoutes.js';

describe('shared entity routes', () => {
  it.each([
    ['/quake/m6.3-synthetic-preview-california-event-previewquake001', 'previewquake001'],
    ['/quake/m-0.5-test-location-nc123', 'nc123'], ['/quake/munknown-test-location-nc123', 'nc123'],
    ['/quake/nc123', 'nc123'], ['/quake/us-test_1', 'us-test_1'], ['/quake/id/us-test_1', 'us-test_1'],
    [`/quake/${encodeURIComponent('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/nc123.geojson')}`, 'nc123'],
  ])('resolves %s to the validated ID %s', (path, id) => {
    expect(parseEarthquakePath(path)).toMatchObject({ ok: true, eventId: id, canonicalPath: `/quake/id/${id}` });
  });
  it.each(['/quake/%E0%A4%A', '/quake/%252F', '/quake/id/a/b', '/quake/', '/quake/m-0.5-place-',
    `/quake/${encodeURIComponent('https://attacker.example/detail/nc123.geojson')}`,
    `/quake/${encodeURIComponent('https://user:secret@earthquake.usgs.gov/earthquakes/feed/v1.0/detail/nc123.geojson')}`,
  ])('rejects %s without throwing or producing an upstream destination', (path) => {
    expect(parseEarthquakePath(path)).toMatchObject({ ok: false });
    expect(parseEarthquakePath(path)).not.toHaveProperty('detailUrl');
  });
  it.each([-0.5, null, 0, 6.3])('round-trips identity regardless of display magnitude %s', (mag) => {
    const feature = { id: 'us-test_1', properties: { mag, place: 'Revised place' } };
    expect(parseEarthquakePath(buildEarthquakePath(feature)).eventId).toBe(feature.id);
  });
  it('keeps cluster route text opaque and canonical paths tied to stored identity', () => {
    const slug = '3-quakes-near-local-test-m6.3-12345-40d0--100d0';
    expect(parseClusterPath(`/cluster/${slug}`)).toEqual({ ok: true, route: slug });
    expect(legacyClusterEventId(slug)).toBeNull();
    expect(buildClusterPath({ id: 'uuid', slug, strongestQuakeId: 'changed' })).toBe(`/cluster/${slug}`);
    expect(buildClusterPath({ id: 'legacy_id' })).toBe('/cluster/legacy_id');
  });
  it.each([
    ['overview_cluster_us-test_1_3', 'us-test_1'],
    ['15-quakes-near-southern-sumatra-up-to-m5.8-us7000mfp9', 'us7000mfp9'],
    ['3-quakes-near-place-up-to-m-0.5-us-test_1', 'us-test_1'],
    ['3-quakes-near-place-up-to-mNaN-us123', 'us123'],
  ])('recognizes documented legacy cluster form %s', (value, id) => expect(legacyClusterEventId(value)).toBe(id));
  it('rejects malformed cluster segments and untrusted return locations', () => {
    expect(parseClusterPath('/cluster/%E0%A4%A').ok).toBe(false);
    expect(parseClusterPath('/cluster/%252F').ok).toBe(false);
    expect(modalReturnPath({ inAppNavigation: true, returnTo: '//attacker.example' })).toBe('/');
    expect(modalReturnPath({ returnTo: '/overview' })).toBe('/');
    expect(modalReturnPath({ inAppNavigation: true, returnTo: '/cluster/stored?view=map' })).toBe('/cluster/stored?view=map');
  });
  it('retains only one validated parent state when opening a nested detail', () => {
    const state = buildModalNavigationState({ pathname: '/cluster/stored', search: '?view=map', hash: '#events',
      state: { inAppNavigation: true, returnTo: '/overview?sort=recent', secret: 'discard', returnState: { inAppNavigation: true, returnTo: '/deeper' } } });
    expect(state).toEqual({ inAppNavigation: true, returnTo: '/cluster/stored?view=map#events',
      returnState: { inAppNavigation: true, returnTo: '/overview?sort=recent' } });
    expect(modalReturnTarget(state)).toEqual({ path: '/cluster/stored?view=map#events', state: { inAppNavigation: true, returnTo: '/overview?sort=recent' } });
  });
  it.each(['https://attacker.example', '//attacker.example', '/\\attacker.example', `/${'a'.repeat(2048)}`, '/bad\npath'])('discards unsafe nested return path %j', returnTo => {
    expect(modalReturnTarget({ inAppNavigation: true, returnTo: '/cluster/stored', returnState: { inAppNavigation: true, returnTo } }))
      .toEqual({ path: '/cluster/stored', state: null });
    expect(modalReturnTarget({ inAppNavigation: true, returnTo })).toEqual({ path: '/', state: null });
  });
  it('bounds cyclic state and drops unrelated properties', () => {
    const cycle = { inAppNavigation: true, returnTo: '/overview', unrelated: { arbitrary: true } };
    cycle.returnState = cycle;
    expect(buildModalNavigationState({ pathname: '/cluster/stored', state: cycle })).toEqual({
      inAppNavigation: true, returnTo: '/cluster/stored', returnState: { inAppNavigation: true, returnTo: '/overview' },
    });
  });
});
