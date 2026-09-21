// August 2026 frontend assets remain available to pages opened before migration.
// Exact hashed URLs only: HTML and new builds always use the ASSETS binding.
const LEGACY_STATIC_ASSETS = {
  "/assets/ClusterDetailModalWrapper-CMK5bsuw.js":
    "assets/ClusterDetailModalWrapper-CMK5bsuw.a266bbb4fc.js",
  "/assets/EarthquakeDetailModalComponent-fGA-UDVe.js":
    "assets/EarthquakeDetailModalComponent-fGA-UDVe.5029d27153.js",
  "/assets/EarthquakeTimelineSVGChart-DXh99iSR.js":
    "assets/EarthquakeTimelineSVGChart-DXh99iSR.cf52652e6d.js",
  "/assets/FeedsPageLayout-BeSCcFkO.js":
    "assets/FeedsPageLayout-BeSCcFkO.555f6624dc.js",
  "/assets/InteractiveGlobeView-DIAXMe5O.js":
    "assets/InteractiveGlobeView-DIAXMe5O.4f49472ab9.js",
  "/assets/LearnPage-BL31VrrB.js": "assets/LearnPage-BL31VrrB.dd86ed63cf.js",
  "/assets/MagnitudeDepthScatterSVGChart-DHIROrnv.js":
    "assets/MagnitudeDepthScatterSVGChart-DHIROrnv.8c89046a92.js",
  "/assets/MagnitudeDistributionSVGChart-KBTVa4q7.js":
    "assets/MagnitudeDistributionSVGChart-KBTVa4q7.1ecbdb0bca.js",
  "/assets/MagnitudeVsIntensityPage-CZ2qL5s3.js":
    "assets/MagnitudeVsIntensityPage-CZ2qL5s3.42a6e15739.js",
  "/assets/MeasuringEarthquakesPage-s3OLqQly.js":
    "assets/MeasuringEarthquakesPage-s3OLqQly.0d33942b90.js",
  "/assets/OverviewPage-BGlbcMjr.js":
    "assets/OverviewPage-BGlbcMjr.9c947de00e.js",
  "/assets/PaginatedEarthquakeTable-DnVnQ4ds.js":
    "assets/PaginatedEarthquakeTable-DnVnQ4ds.59d6e84a69.js",
  "/assets/PlateTectonicsPage-DKnC-7xR.js":
    "assets/PlateTectonicsPage-DKnC-7xR.24271f4e51.js",
  "/assets/RegionalDistributionList-CZ-0HM0w.js":
    "assets/RegionalDistributionList-CZ-0HM0w.1c3a98c239.js",
  "/assets/TectonicPlateBoundaries-D_0ztLpA.js":
    "assets/TectonicPlateBoundaries-D_0ztLpA.c43486b482.js",
  "/assets/index-CPiVOLY-.css": "assets/index-CPiVOLY-.1e3382384a.css",
  "/assets/index-i3oghYXo.js": "assets/index-i3oghYXo.73aa738cf2.js",
  "/assets/ne_110m_coastline-BmLK7DdU.js":
    "assets/ne_110m_coastline-BmLK7DdU.4a44b57eea.js",
};

export async function handleLegacyStaticAsset(request, env) {
  if (!env.STATIC_KV || !['GET', 'HEAD'].includes(request.method)) return null;

  const pathname = new URL(request.url).pathname;
  const kvKey = LEGACY_STATIC_ASSETS[pathname];
  if (!kvKey) return null;

  const content = await env.STATIC_KV.get(kvKey);
  if (content === null) return null;

  return new Response(request.method === 'HEAD' ? null : content, {
    headers: {
      'Content-Type': pathname.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${kvKey}"`,
    },
  });
}
