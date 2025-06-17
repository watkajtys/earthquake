// import { onRequest, isCrawler, escapeXml, handleClustersSitemapRequest, handlePrerenderCluster } from './[[catchall]]';
// The main [[catchall]].js exports `onRequest` as the default export if it's a module, or named if not.
// Assuming `onRequest` is the primary handler for routing.
// Specific handlers like `isCrawler`, `escapeXml` are tested here if they are exported.
// `handleClustersSitemapRequest`, `handlePrerenderCluster` might be internal or also tested via `onRequest`.
import { onRequest, isCrawler, escapeXml } from './[[catchall]]';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// --- Mocks for Cloudflare Environment ---

// Mock 'fetch' global - can be removed if no remaining tests use fetch
global.fetch = vi.fn();


// --- Helper to create mock context ---
// This helper is used by many tests. It should be kept or moved to a common test utility file.
const createMockContext = (request, env = {}, cf = {}) => {
  const waitUntilPromises = [];

  return {
    request,
    env: {
      ASSETS: {
          fetch: vi.fn().mockResolvedValue(new Response("SPA fallback", { headers: { 'Content-Type': 'text/html'}}))
      },
      ...env,
    },
    params: {},
    waitUntil: vi.fn((promise) => { waitUntilPromises.push(promise); }),
    next: vi.fn().mockResolvedValue(new Response("Fallback to env.ASSETS.fetch for static assets", { status: 200 })),
    cf,
    _awaitWaitUntilPromises: async () => { await Promise.all(waitUntilPromises); }
  };
};

// --- Tests for Helper Functions ---
describe('Helper Functions from [[catchall]].js', () => {
  describe('isCrawler', () => {
    it('should return true for Googlebot', () => {
      const req = new Request('/', { headers: { 'User-Agent': 'Googlebot/2.1' } });
      expect(isCrawler(req)).toBe(true);
    });
    it('should return false for a normal browser', () => {
      const req = new Request('/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
      expect(isCrawler(req)).toBe(false);
    });
  });

  describe('escapeXml', () => {
    it('should escape XML special characters', () => {
      expect(escapeXml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&apos;');
    });
    it('should return empty string for non-string input', () => {
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
      expect(escapeXml(123)).toBe('');
    });
  });
});


// --- Tests for Main Request Handler (Routing) ---
describe('onRequest (Main Router Remaining Tests)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fetch.mockReset();
  });

  // -- Prerendering Handlers --
  describe('Prerendering Handlers (Fallback Logic)', () => {
    // Keep tests for fallback logic for crawlers on non-prerenderable paths or empty IDs

    it('should fall through for crawler on non-prerenderable path', async () => {
      const request = new Request('http://localhost/some/other/page', { headers: { 'User-Agent': 'Googlebot' }});
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled(); // Should call next() to serve static asset or SPA
    });

    it('should fall through for crawler if quakeIdPathSegment is empty', async () => {
      const request = new Request('http://localhost/quake/', { headers: { 'User-Agent': 'Googlebot' }});
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled();
    });

    it('should fall through for crawler if clusterId is empty', async () => {
      const request = new Request('http://localhost/cluster/', { headers: { 'User-Agent': 'Googlebot' }});
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled();
    });
  });

  // -- Fallback / SPA Routing --
  describe('Fallback and SPA Routing', () => {
    it('should call context.next() for unhandled non-API, non-sitemap, non-prerender paths if context.next is defined for non-crawler', async () => {
      const request = new Request('http://localhost/some/spa/route'); // Non-crawler
      const context = createMockContext(request);
      await onRequest(context);
      expect(context.next).toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled(); // Should not try to proxy if it's a normal SPA route
    });

    it('should log unhandled path and attempt ASSETS.fetch if context.next is not defined and not an API/Sitemap/Prerender path', async () => {
      const request = new Request('http://localhost/very/unknown/path');
      const context = createMockContext(request);
      delete context.next;
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(()=>{});
      context.env.ASSETS.fetch.mockResolvedValueOnce(new Response("Asset from ASSETS.fetch", {status: 200}));


      const response = await onRequest(context);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[worker-router] Path /very/unknown/path not handled by explicit routing in worker. Will attempt to serve from static assets (env.ASSETS) or SPA index.html.")
      );
      expect(context.env.ASSETS.fetch).toHaveBeenCalledWith(request);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Asset from ASSETS.fetch");
      consoleLogSpy.mockRestore();
    });

    it('should return 404 for a generic unhandled path when context.next and ASSETS.fetch are undefined/fail', async () => {
      const requestPath = '/a/truly/unhandled/generic/path';
      const request = new Request(`http://localhost${requestPath}`);
      const context = createMockContext(request);
      delete context.next;
      context.env.ASSETS.fetch.mockRejectedValueOnce(new Error("ASSETS.fetch failed")); // Simulate ASSETS.fetch also failing

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const response = await onRequest(context);

      expect(consoleWarnSpy).toHaveBeenCalledWith(`No route matched for "${requestPath}" and no next() function available. env.ASSETS.fetch also failed or not configured. Returning 404.`);
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');

      consoleWarnSpy.mockRestore();
    });
  });
});
