// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';

const request = () => new Request('https://earthquakeslive.com/sitemap-clusters.xml', {
  headers: { 'User-Agent': 'Googlebot' },
});
const context = { waitUntil: vi.fn() };
const database = (readResult) => {
  const all = vi.fn().mockResolvedValue(readResult);
  const prepare = vi.fn(() => ({ all }));
  return { DB: { prepare }, prepare, all };
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('deployed Worker cluster sitemap', () => {
  it('uses stored canonical slugs and issues no upstream requests for legacy overview slugs', async () => {
    const rows = [
      { slug: 'overview_cluster_us7000test_3', updatedAt: '1750000000000' },
      { slug: '5-quakes-near-test-m4.2-stable', updatedAt: '2025-06-15T00:00:00Z' },
      { slug: 'invalid/slug', updatedAt: '2025-06-15T00:00:00Z' },
    ];
    const { DB, prepare } = database({ success: true, results: rows });
    const upstream = vi.fn(() => { throw new Error('Sitemap must not fetch USGS detail'); });
    vi.stubGlobal('fetch', upstream);

    const response = await worker.fetch(request(), { DB }, context);
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=10800');
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0][0]).toContain('LIMIT 500');
    expect(upstream).not.toHaveBeenCalled();
    expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/overview_cluster_us7000test_3</loc>');
    expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/5-quakes-near-test-m4.2-stable</loc>');
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('invalid/slug');
    expect(xml).not.toContain('up-to-m');
  });

  it('keeps a canonical URL when its stored update time is invalid', async () => {
    const { DB } = database({ success: true, results: [{ slug: 'historic-cluster', updatedAt: 'unknown' }] });
    const response = await worker.fetch(request(), { DB }, context);
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/historic-cluster</loc>');
    expect(xml).not.toContain('<lastmod>');
  });

  it('includes a newer millisecond row ahead of 500 older text rows', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec('CREATE TABLE ClusterDefinitions (id TEXT PRIMARY KEY, slug TEXT, updatedAt DATETIME)');
      const insert = sqlite.prepare('INSERT INTO ClusterDefinitions (id, slug, updatedAt) VALUES (?, ?, ?)');
      for (let index = 0; index < 501; index++) {
        const id = `older-${String(index).padStart(3, '0')}`;
        insert.run(id, id, '2026-09-20 00:00:00.000');
      }
      insert.run('newest-numeric', 'newest-numeric', Date.parse('2026-09-21T00:00:00.000Z'));
      const DB = { prepare: sql => ({ all: async () => ({ success: true, results: sqlite.prepare(sql).all() }) }) };

      const response = await worker.fetch(request(), { DB }, context);
      const xml = await response.text();
      expect(response.status).toBe(200);
      expect(xml).toContain('<loc>https://earthquakeslive.com/cluster/newest-numeric</loc>');
      expect((xml.match(/<url><loc>/gu) || [])).toHaveLength(500);
    } finally {
      sqlite.close();
    }
  });

  it('returns an uncached error rather than an empty sitemap when D1 is unavailable', async () => {
    const missing = await worker.fetch(request(), {}, context);
    expect(missing.status).toBe(503);
    expect(missing.headers.get('Cache-Control')).toBe('no-store');

    const { DB } = database({ success: false, results: [] });
    const failed = await worker.fetch(request(), { DB }, context);
    expect(failed.status).toBe(503);
    expect(failed.headers.get('Cache-Control')).toBe('no-store');
  });
});
