import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet, onRequestPost } from './backfill-earthquake-details.js';

import { extractProductFlags } from './backfill-earthquake-details.js';

describe('extractProductFlags', () => {
  it('should return all flags as true and has_enhanced_data as true when all products are present', () => {
    const detailData = {
      properties: {
        products: {
          shakemap: [{}],
          'moment-tensor': [{}],
          'focal-mechanism': [{}],
          dyfi: [{}],
          losspager: [{}],
          'finite-fault': [{}],
        },
      },
    };
    const flags = extractProductFlags(detailData);
    expect(flags).toEqual({
      has_shakemap: true,
      has_moment_tensor: true,
      has_focal_mechanism: true,
      has_dyfi: true,
      has_losspager: true,
      has_finite_fault: true,
      has_enhanced_data: true,
      products_json: JSON.stringify(['shakemap', 'moment-tensor', 'focal-mechanism', 'dyfi', 'losspager', 'finite-fault']),
    });
  });

  it('should return some flags as true and has_enhanced_data as true when only some products are present', () => {
    const detailData = {
      properties: {
        products: {
          shakemap: [{}],
          dyfi: [{}],
        },
      },
    };
    const flags = extractProductFlags(detailData);
    expect(flags).toEqual({
      has_shakemap: true,
      has_moment_tensor: false,
      has_focal_mechanism: false,
      has_dyfi: true,
      has_losspager: false,
      has_finite_fault: false,
      has_enhanced_data: true,
      products_json: JSON.stringify(['shakemap', 'dyfi']),
    });
  });

  it('should return all flags as false when no products are present', () => {
    const detailData = {
      properties: {
        products: {},
      },
    };
    const flags = extractProductFlags(detailData);
    expect(flags).toEqual({
      has_shakemap: false,
      has_moment_tensor: false,
      has_focal_mechanism: false,
      has_dyfi: false,
      has_losspager: false,
      has_finite_fault: false,
      has_enhanced_data: false,
      products_json: '[]',
    });
  });

  it('should return all flags as false for null or undefined input', () => {
    const defaultFlags = {
      has_shakemap: false,
      has_moment_tensor: false,
      has_focal_mechanism: false,
      has_dyfi: false,
      has_losspager: false,
      has_finite_fault: false,
      has_enhanced_data: false,
      products_json: null,
    };
    expect(extractProductFlags(null)).toEqual(defaultFlags);
    expect(extractProductFlags(undefined)).toEqual(defaultFlags);
    expect(extractProductFlags({})).toEqual(defaultFlags);
    expect(extractProductFlags({ properties: {} })).toEqual(defaultFlags);
  });
});

describe('backfill-earthquake-details', () => {

  let mockDb;
  let mockKv;
  let context;

  beforeEach(() => {
    global.fetch = vi.fn();

    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };

    mockKv = {
      put: vi.fn(),
    };

    context = {
      request: new Request('http://localhost'),
      env: {
        DB: mockDb,
        USGS_LAST_RESPONSE_KV: mockKv,
      },
    };

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onRequestGet', () => {
    it('should return an error if DB is not configured', async () => {
      context.env.DB = undefined;
      const response = await onRequestGet(context);
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.error).toBe('Database not configured');
    });

    it('should return a message if no earthquakes need backfilling', async () => {
      mockDb.all.mockResolvedValue({ results: [] });
      const response = await onRequestGet(context);
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.message).toBe('No earthquakes to backfill');
    });

    it('should process a batch of earthquakes successfully', async () => {
      const mockEarthquakes = [
        { id: 'eq1', magnitude: 5.0, usgs_detail_url: 'http://example.com/eq1' },
        { id: 'eq2', magnitude: 4.5, usgs_detail_url: 'http://example.com/eq2' },
      ];
      mockDb.all.mockResolvedValue({ results: mockEarthquakes });
      mockDb.first.mockResolvedValue({ total: 10, fetched: 2, with_shakemap: 1, with_moment_tensor: 0 });

      global.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { products: { shakemap: [{}] } } }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { products: {} } }), { status: 200 }));

      const response = await onRequestGet(context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.processed).toBe(2);
      expect(json.errors).toBe(0);
      expect(json.processed_earthquakes.length).toBe(2);
      expect(json.processed_earthquakes[0].products_found.shakemap).toBe(true);
      expect(json.processed_earthquakes[1].products_found.shakemap).toBe(false);
      expect(mockDb.run).toHaveBeenCalledTimes(2);
    });

    it('should handle errors during fetch for a single earthquake and continue', async () => {
      const mockEarthquakes = [
        { id: 'eq1', magnitude: 5.0, usgs_detail_url: 'http://example.com/eq1' },
        { id: 'eq2', magnitude: 4.5, usgs_detail_url: 'http://example.com/eq2' },
      ];
      mockDb.all.mockResolvedValue({ results: mockEarthquakes });
      mockDb.first.mockResolvedValue({ total: 10, fetched: 1, with_shakemap: 0, with_moment_tensor: 0 });

      global.fetch
        .mockRejectedValueOnce(new Error('Network Failure'))
        .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { products: {} } }), { status: 200 }));

      const response = await onRequestGet(context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.processed).toBe(1);
      expect(json.errors).toBe(1);
      expect(json.error_earthquakes[0].id).toBe('eq1');
      expect(json.error_earthquakes[0].error).toBe('Network Failure');
      expect(json.processed_earthquakes[0].id).toBe('eq2');
    });

    it('should correctly use query parameters', async () => {
      context.request = new Request('http://localhost?batch_size=50&min_magnitude=4.5&continue_from=eq100');
      mockDb.all.mockResolvedValue({ results: [] });

      await onRequestGet(context);

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'));
      expect(mockDb.bind).toHaveBeenCalledWith(4.5, expect.any(Number), 'eq100', 50);
    });
  });

  describe('onRequestPost', () => {
    it('should return an error if DB is not configured', async () => {
      context.env.DB = undefined;
      const response = await onRequestPost(context);
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.error).toBe('Database not configured');
    });

    it('should return a message if all earthquakes are already fetched', async () => {
      mockDb.first.mockResolvedValue({ total: 0 });
      const response = await onRequestPost(context);
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.message).toBe('All earthquakes already have detail data');
    });

    it('should initiate a backfill job successfully', async () => {
      mockDb.first.mockResolvedValue({ total: 100 });
      const response = await onRequestPost(context);
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.message).toBe('Backfill job initiated');
      expect(json.total_to_process).toBe(100);
      expect(mockKv.put).toHaveBeenCalledWith('backfill_status', expect.any(String), { expirationTtl: 86400 });
    });

    it('should work correctly if KV is not configured', async () => {
      context.env.USGS_LAST_RESPONSE_KV = undefined;
      mockDb.first.mockResolvedValue({ total: 100 });
      const response = await onRequestPost(context);
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.message).toBe('Backfill job initiated');
      expect(mockKv.put).not.toHaveBeenCalled();
    });
  });
});
