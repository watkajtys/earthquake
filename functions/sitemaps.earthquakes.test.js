// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/worker.js';

const request = path => new Request(`https://earthquakeslive.com${path}`, {
  headers: { 'User-Agent': 'Mozilla/5.0' },
});

function databaseWithRows(rows) {
  const all = vi.fn().mockResolvedValue({ success: true, results: rows });
  const bind = vi.fn().mockReturnValue({ all });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, all };
}

describe('deployed Worker earthquake sitemap', () => {
  it('serves crawler canonical URLs with one shared eligibility query before pagination', async () => {
    const DB = databaseWithRows([{ id: 'eq1' }, { id: 'eq-2' }]);
    const response = await worker.fetch(request('/sitemaps/earthquakes-1.xml'), { DB }, {});
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/xml');
    expect(xml).toContain('<loc>https://earthquakeslive.com/quake/id/eq1</loc>');
    expect(xml).toContain('<loc>https://earthquakeslive.com/quake/id/eq-2</loc>');
    expect(xml).not.toContain('<lastmod>');
    expect(DB.prepare.mock.calls[0][0]).toContain('ORDER BY event_time DESC, id ASC LIMIT ? OFFSET ?');
    expect(DB.prepare.mock.calls[0][0]).not.toContain('>= 3');
    expect(DB.bind).toHaveBeenCalledWith(2.5, 4.5, 40_000, 0);
  });

  it('uses the next offset for page 2', async () => {
    const DB = databaseWithRows([]);
    await worker.fetch(request('/sitemaps/earthquakes-2.xml'), { DB }, {});
    expect(DB.bind).toHaveBeenCalledWith(2.5, 4.5, 40_000, 40_000);
  });

  it('returns an empty URL set when the selected page has no rows', async () => {
    const DB = databaseWithRows([]);
    const response = await worker.fetch(request('/sitemaps/earthquakes-1.xml'), { DB }, {});
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<!-- No events for page 1 -->');
  });

  it('does not publish a partial success if the database fails or returns an invalid ID', async () => {
    const failure = databaseWithRows([]);
    failure.all.mockRejectedValue(new Error('D1 unavailable'));
    const failedResponse = await worker.fetch(request('/sitemaps/earthquakes-1.xml'), { DB: failure }, {});
    expect(failedResponse.status).toBe(500);
    expect(await failedResponse.text()).toContain('Earthquake sitemap unavailable');
    expect(failedResponse.headers.get('Cache-Control')).toBe('no-store');

    const unsuccessful = databaseWithRows([{ id: 'eq1' }]);
    unsuccessful.all.mockResolvedValue({ success: false, results: [{ id: 'eq1' }] });
    const unsuccessfulResponse = await worker.fetch(request('/sitemaps/earthquakes-1.xml'), { DB: unsuccessful }, {});
    expect(unsuccessfulResponse.status).toBe(500);

    const invalid = databaseWithRows([{ id: 'bad/id' }]);
    const invalidResponse = await worker.fetch(request('/sitemaps/earthquakes-1.xml'), { DB: invalid }, {});
    expect(invalidResponse.status).toBe(500);
    expect(await invalidResponse.text()).toContain('Earthquake sitemap unavailable');
  });

  it('rejects missing database and invalid page numbers', async () => {
    expect((await worker.fetch(request('/sitemaps/earthquakes-1.xml'), {}, {})).status).toBe(500);
    expect((await worker.fetch(request('/sitemaps/earthquakes-0.xml'), { DB: databaseWithRows([]) }, {})).status).toBe(400);
    expect((await worker.fetch(request('/sitemaps/earthquakes-abc.xml'), { DB: databaseWithRows([]) }, {})).status).toBe(404);
  });
});
