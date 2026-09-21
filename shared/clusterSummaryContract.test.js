// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  projectSummaryItem, sha256Hex, compareSummaryItems, validateSummaryItem, validateSummaryEnvelope,
  validateSummaryDescriptor, validateSummaryPointer, validateSummaryManifest, validateSummaryPage,
  generationManifestKey, generationPageKey, summaryEnvelopeMetadata, MAX_SUMMARY_ITEM_BYTES,
} from './clusterSummaryContract.js';

const generationId = '11111111-1111-4111-8111-111111111111';
const row = overrides => ({ id: 'cluster-a', slug: 'cluster-slug', title: 'Cluster near Example',
  locationName: 'Example', quakeCount: 10, maxMagnitude: 5, startTime: 1000, endTime: 2000,
  strongestQuakeId: 'quake1', ...overrides });
const descriptor = overrides => ({ schemaVersion: 2, source: 'stored-cluster-definitions', sourceWatermarkMs: null,
  view: 'overview', generationId, snapshotSequence: 1, generatedAtMs: 3000, sourceObservedAtMs: 2500,
  totalCount: 1, pageCount: 1, manifestKey: generationManifestKey(generationId), ...overrides });
async function objects() {
  const d = descriptor();
  const page = { ...summaryEnvelopeMetadata(d), pageIndex: 0, items: [await projectSummaryItem(row())] };
  const text = JSON.stringify(page);
  const manifest = { ...d, pageSize: 200, cursorSecret: 'a'.repeat(64), pages: [{
    key: generationPageKey(generationId, 0), count: 1, sha256: await sha256Hex(text), byteLength: new TextEncoder().encode(text).byteLength,
  }] };
  return { d, page, manifest };
}

describe('stored cluster scalar projection', () => {
  it('hashes only the deterministic scalar projection and never reads membership or legacy revision', async () => {
    const source = row();
    Object.defineProperty(source, 'earthquakeIds', { get() { throw new Error('membership read'); } });
    Object.defineProperty(source, 'version', { get() { throw new Error('legacy version read'); } });
    const item = await projectSummaryItem(source);
    expect(Object.keys(item)).toEqual([...Object.keys(row()), 'summaryRevision']);
    expect(item.summaryRevision).toBe(await sha256Hex(JSON.stringify(row())));
    expect((await projectSummaryItem({ ...row(), membershipRevision: 'different' })).summaryRevision).toBe(item.summaryRevision);
    expect((await projectSummaryItem(row({ quakeCount: 11 }))).summaryRevision).not.toBe(item.summaryRevision);
  });

  it('retains explicit unknown values without inventing display metadata', async () => {
    const item = await projectSummaryItem(row({ title: null, locationName: null, quakeCount: null, startTime: null, endTime: null, strongestQuakeId: null }));
    expect(item).toMatchObject({ title: null, locationName: null, quakeCount: null, startTime: null, endTime: null, strongestQuakeId: null });
  });

  it.each([
    { id: '../other' }, { slug: '' }, { maxMagnitude: 4.49 }, { maxMagnitude: Infinity },
    { quakeCount: -1 }, { quakeCount: 1.5 }, { startTime: '2026-01-01' }, { endTime: 500 },
    { title: 'a'.repeat(1025) }, { locationName: undefined }, { strongestQuakeId: 'invalid/event' },
  ])('rejects malformed or ineligible projection values: %j', async change => {
    await expect(projectSummaryItem(row(change))).rejects.toThrow('Invalid cluster summary');
  });

  it('bounds UTF-8 bytes, including the revision, rather than only characters', async () => {
    await expect(projectSummaryItem(row({ title: '🌎'.repeat(400), locationName: '🌎'.repeat(400) }))).rejects.toThrow('item byte limit');
    const item = await projectSummaryItem(row({ title: 'é'.repeat(200), locationName: 'é'.repeat(200) }));
    expect(new TextEncoder().encode(JSON.stringify(item)).byteLength).toBeLessThan(MAX_SUMMARY_ITEM_BYTES);
    expect(() => validateSummaryItem({ ...item, earthquakeIds: ['quake1'] })).toThrow('fields');
  });

  it('uses end/magnitude/count descending with null last, then code-point ID ordering', async () => {
    const inputs = [row({ id: 'z', endTime: null }), row({ id: 'b', quakeCount: null }),
      row({ id: 'a', quakeCount: 9 }), row({ id: 'Z' }), row({ id: 'A' }),
      row({ id: 'm', maxMagnitude: 6 }), row({ id: 'late', endTime: 3000 })];
    const items = await Promise.all(inputs.map(projectSummaryItem));
    expect(items.sort(compareSummaryItems).map(item => item.id)).toEqual(['late', 'm', 'A', 'Z', 'a', 'b', 'z']);
  });
});

describe('bounded snapshot metadata and public envelope', () => {
  it('validates matching pointer, manifest, page and public envelope without exposing signing material', async () => {
    const { d, manifest, page } = await objects();
    expect(validateSummaryDescriptor(d)).toBe(d);
    expect(validateSummaryPointer({ schemaVersion: 2, current: d, history: [] }).current).toBe(d);
    expect(validateSummaryManifest(manifest, d)).toBe(manifest);
    expect(validateSummaryPage(page, manifest, 0)).toBe(page);
    const envelope = { ...summaryEnvelopeMetadata(manifest), items: page.items, nextCursor: null, stale: true };
    expect(validateSummaryEnvelope(envelope)).toBe(envelope);
    expect(envelope).not.toHaveProperty('cursorSecret');
  });

  it.each([{ sourceWatermarkMs: 3000 }, { snapshotSequence: 0 }, { snapshotSequence: Number.MAX_SAFE_INTEGER + 1 },
    { generatedAtMs: 1000 }, { totalCount: 20_001 }, { pageCount: 2 }, { manifestKey: 'arbitrary-key' },
    { generationId: '../escape' }, { revision: 1 }])('rejects invalid descriptor: %j', change => {
    expect(() => validateSummaryDescriptor(descriptor(change))).toThrow('Invalid cluster summary');
  });

  it('rejects duplicate or nondecreasing retained generations', () => {
    expect(() => validateSummaryPointer({ schemaVersion: 2, current: descriptor(), history: [descriptor()] })).toThrow('history sequence');
  });

  it.each(['key', 'count', 'sha256', 'byteLength', 'cursorSecret'])('rejects corrupted manifest %s', async key => {
    const { d, manifest } = await objects();
    if (key === 'cursorSecret') manifest.cursorSecret = 'bad';
    else manifest.pages[0][key] = 'bad';
    expect(() => validateSummaryManifest(manifest, d)).toThrow('Invalid cluster summary');
  });

  it('rejects pages from a different generation and public secret leakage', async () => {
    const { manifest, page } = await objects();
    expect(() => validateSummaryPage({ ...page, snapshotSequence: 2 }, manifest, 0)).toThrow('mismatch');
    expect(() => validateSummaryEnvelope({ ...summaryEnvelopeMetadata(manifest), items: page.items, nextCursor: null, cursorSecret: manifest.cursorSecret })).toThrow('fields');
  });
});
