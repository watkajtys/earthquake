# Release 4 — Frontend correctness, route compatibility and crawler pages

This is an implementation work package for another coding model. It is a plan, not a record of completed fixes. The audit baseline was commit `aca32df` on September 21, 2026; begin from the current integrated branch and recheck the behavior because earlier remediation releases may have changed these files. Work in `/Users/theair/Projects/earthquake`, or the corresponding repository root on another machine.

The outcome is a live monitor whose routes open the intended records, refreshed views remain consistent, keyboard interactions work once, and browser/crawler pages resolve the same canonical entities. This release must preserve already-published URLs. It does not change the clustering algorithm, merge production data, replace the storage schema, or claim that the separate performance problems are solved.

## 1. Prerequisites and ownership

Read `docs/remediation/README.md` and package 1 first, then `DEPLOYMENT.md`, `wrangler.toml`, the current CI workflow and repository instructions. Before any branch push or deployment, verify trigger containment and package 1's release path; the old manual runbook alone does not establish automatic deployment safety. The deployed entry point is `src/worker.js`; legacy `functions/[[catchall]].js` and standalone prerender copies are not evidence that the deployed Worker is fixed. Use the project-pinned tools and the isolated preview resources identified in `wrangler.toml`.

Security changes from release 2 must remain intact: upstream restrictions, administrative authorization, safe cache variation and error-response policy. A rollback for this release must not undo those protections. Release 3 establishes canonical cluster identity, revision and aliases. Implement the cluster resolver against that agreed contract; do not invent a second identity policy.

| Area | Release 4 owns | Coordinate with other work |
| --- | --- | --- |
| `src/contexts/EarthquakeDataContext.jsx`, `earthquakeDataContextUtils.js`, API services | Request lifecycle, stale-response prevention, opt-in monthly refresh/retry, revised-major reconciliation, compatibility of context values | Release 5 owns R2 snapshot eligibility, source selection, transfer-size reductions and broader scheduling/performance optimization. Agree on the lifecycle interface first; do not independently rewrite this provider in two branches. |
| `src/pages/HomePage.jsx`, `ClusterDetailModalWrapper.jsx` | Routes, terminal detail states, cluster polling state/error handling, responsive shell | Release 5 owns F7: adopting authoritative canonical cluster summaries, removing weekly-feed approximations, bounded card rendering and associated payload contracts. Release 4 must not present a locally reconstructed weekly subset as a fixed authoritative summary. |
| Cluster APIs and resolver | Explicit exact-ID/slug selectors, browser/crawler compatibility, canonical response metadata | Release 3 owns immutable UUIDs, aliases, duplicate reconciliation, schema/index migrations and revision/timestamp repair. Preserve `ClusterAliases` semantics and use its resolver if one already exists. |
| `src/components/InteractiveGlobeView.jsx` | Safe text tooltip content | This isolated security fix may move to release 2 by explicit ownership agreement. Do not implement it twice. Release 5 owns WebGL loading and rendering optimization. |
| `src/worker.js`, `SeoMetadata.jsx`, Vite asset shell | Entity resolution and metadata correctness, production asset references | Keep release 2 cache/security behavior. Release 5 owns larger sitemap/query/payload performance work; release 4 only requires that emitted links resolve. |

Recommended order within this release: shared route/resolver contracts; lifecycle and refresh corrections; pagination and modal behavior; responsive/accessibility fixes; tooltip escaping; crawler/build integration; combined verification. Keep these as reviewable commits with tests. A focused release can ship before release 5, but F7 must remain explicitly open until canonical summaries are integrated.

## 2. Findings this package must resolve

| ID | Reproducible baseline behavior | Primary files |
| --- | --- | --- |
| F1 | `/quake/m-0.5-test-location-nc123` and `munknown-…` are treated as whole event IDs because the parser requires `m` followed by a digit. | `src/components/EarthquakeDetailModalComponent.jsx`, `src/pages/HomePage.jsx`, `src/components/AlertDisplay.jsx`, `src/components/EarthquakeMap.jsx`, `src/worker.js` |
| F2 | Advance to page 2 of a 16-event feed, replace it with one event: the list becomes blank and both pagination controls disappear. | `src/components/PaginatedEarthquakeTable.jsx`, `src/components/FeedsPageLayout.jsx` |
| F3 | An unmatched `overview_cluster_<id>_<count>` route enters placeholder reconstruction/monthly states and never completes. | `src/components/ClusterDetailModalWrapper.jsx` |
| F4 | Escape from inside a cluster modal bubbles through two listeners and calls `navigate(-1)` twice; quake details have the same listener pattern. | `src/components/ClusterDetailModal.jsx`, `src/components/EarthquakeDetailView.jsx`, both wrappers |
| F5 | After five minutes, day/week have fetched six times but month only once. Once month loads, significant/feelable/detail context uses that stale data; a first monthly failure removes the retry button. | Data provider/reducer, `LoadMoreDataButton.jsx`, `FeedsPageLayout.jsx`, `EarthquakeDetailModalComponent.jsx` |
| F6 | `/api/get-clusters` runs only on mount. New definitions and recovery after an initial failure require a full reload. | `src/pages/HomePage.jsx`, `src/services/clusterApiService.js` |
| F8 | Feed revision of event A from M5 to M4 leaves the old M5 object in `lastMajorQuake`. | `src/contexts/earthquakeDataContextUtils.js` |
| F9 | At desktop width 1280, `/overview` has a blank black main pane: its content is `lg:hidden`, and the globe is mounted only on `/`. `/feeds` has the same hiding pattern. | `src/pages/HomePage.jsx`, `src/pages/OverviewPage.jsx`, `src/components/FeedsPageLayout.jsx` |
| F10 | A place value containing inert `<span>` markup becomes an actual tooltip element; it passes through the globe label string into float-tooltip's HTML setter. | `src/components/InteractiveGlobeView.jsx` |
| B6 | A cron-generated stored cluster slug is emitted by the sitemap, but crawler resolution invents a different `overview_cluster_*` value and returns 404. Crawler HTML also references unbuilt `/src/main.jsx`. | `src/worker.js`, shared cluster resolver, `functions/api/cluster-detail-with-quakes.js`, production asset shell |

Additional required corrections in the same touched flows: event rows need native keyboard-operable controls; error cluster metadata uses `noindex` although `SeoMetadata` expects `noIndex`; `noIndex` is missing from that component's effect dependencies; detail views label weekly fallback as 30-day coverage after merely attempting monthly loading.

These descriptions stand alone. Optional local audit probes live under ignored `.reconciliation.local/audit-2026-09-21/`; they assert the old erroneous behavior and must not be copied unchanged as tests of the corrected behavior. Their absence on another machine does not block implementation.

## 3. Establish URL and entity contracts before changing components

### Earthquakes

Create or reuse one pure, shared builder/parser usable by both browser code and `src/worker.js`. Return a structured result such as a validated event ID or an explicit invalid-route result; do not pass a partly parsed slug onward as an ID. Keep validation separate from fetching.

Support these existing forms deliberately:

| Input | Required interpretation |
| --- | --- |
| `/quake/m6.3-synthetic-preview-california-event-previewquake001` | Event `previewquake001` |
| `/quake/m-0.5-test-location-nc123` | Event `nc123`, irrespective of the signed display magnitude |
| `/quake/munknown-test-location-nc123` | Event `nc123`; unavailable magnitude must not prevent resolution |
| `/quake/nc123` | Plain legacy event ID `nc123` for browser and crawler |
| Legacy encoded USGS detail URL under `/quake/*` | Extract its validated event ID; never turn it into an arbitrary backend fetch target |
| Malformed percent encoding, missing ID, unsupported external URL | Controlled invalid/not-found result, with no render exception and no arbitrary upstream request |

Keep the current descriptive URL shape if it can round-trip every supported existing ID. Inspect current persisted IDs and upstream fixtures before choosing an identifier alphabet; do not tighten it below real data. If an ID can contain the separator used by descriptive slugs, use an explicit unambiguous canonical ID field/route and retain descriptive URLs as aliases. Record that decision and tests instead of blindly taking the last hyphen-delimited token. The event ID, not magnitude or location text, determines identity. An upstream magnitude/place revision must not break old links.

Decode exactly once at the boundary appropriate to the router; React Router and `URL` parsing may already decode parts. Catch decoding failures. Validate legacy embedded detail URLs against the trusted USGS host/path policy from release 2, then extract the ID rather than forwarding the URL. All card, alert, table, globe, Leaflet popup, sitemap and crawler code must use the same canonical builder or resolver. Maintain old aliases with canonical metadata; add redirects only where they preserve an unambiguous entity and existing query-state behavior.

### Clusters

Use release 3's immutable canonical UUID and alias policy. The agreed foundation is an unchanged canonical `id`, a separate integer `revision`, preserved stored slugs, and explicit `ClusterAliases(alias_kind, alias_value → canonical_id)` records for verified superseded identities. A shared strongest event alone is not proof that two clusters are the same. Release 5's summary contract will expose `id`/`clusterId` as that UUID plus `slug`, `canonicalPath`, authoritative statistics and revision.

Recommended additive detail selectors:

- `?clusterId=<uuid>` resolves an exact canonical ID, then a documented verified ID alias where applicable.
- `?slug=<encoded stored slug>` resolves an exact stored slug or explicit slug alias. Preserve case/normalization behavior established by release 3.
- Existing `?id=<value>` keeps its legacy strongest-earthquake-first, canonical-ID-fallback behavior until its callers are migrated. Do not silently reinterpret this parameter. If multiple current definitions have the same legacy strongest ID, use the documented deterministic ordering from release 3, return canonical metadata, and do not merge records.
- Reject conflicting explicit selectors with a clear 400 response rather than choosing one invisibly. Missing/invalid selectors are 400; a valid selector without a record is 404; an unavailable database is a bounded 5xx. Avoid exposing internal SQL errors.

Prefer a shared resolver over copying query/alias logic into the Worker and each API. Use bound parameters, explicit projected columns and existing member batching; any new index or alias migration remains release 3's responsibility. Verify selector precedence with a fixture where a canonical ID string also matches another row's legacy strongest ID.

For `/cluster/:slug`, attempt exact stored slug/alias resolution first. Do not split a current stable-key slug into a purported earthquake ID. Only recognize a documented legacy pattern after exact resolution fails. Support `overview_cluster_<strongest>_<count>` and previously emitted descriptive strongest-event slugs as explicit aliases/fallbacks. The count is descriptive historical context, not identity. Return a canonical ID and canonical path in the resolved model.

Replace the wrapper's unfinished reconstruction stages with a small terminal state machine: `loading → success | notFound | error`, plus retry. Direct links must resolve independently of HomePage's weekly/monthly context. A prop/cache hit may be used only when its canonical identity matches; it cannot substitute a coincidental strongest-event match or incomplete weekly approximation. Abort or ignore responses for an old route after navigation. Every failure/loading view must provide a usable route back and retry where meaningful.

This includes a minimal shell change in this package: HomePage's global feed loader must not block direct quake/cluster route rendering while day/week requests are pending or failed. Render the detail route's own loading/error shell independently, without waiting for global feed initialization. Test a direct link through the whole application with both feeds unresolved, not only the wrapper in isolation. Package 5 retains ownership of broader static-route loading and network optimization.

Release 4 fixes compatibility and resolution; it does not claim to fix F7's summary counts/cards. Release 5 must switch HomePage to canonical API summaries and pass exact identity through links. Agree on response metadata now so that release 5 does not require another route migration.

## 4. Implement refresh and interaction corrections

### 4.1 Request state, retries and cancellation

Define consistent lifecycle behavior for day, week, month, active clusters and route details. Preserve existing consumer-facing context fields during refactoring, or migrate all consumers and their tests in the same commit. At minimum retain data, a successful-source timestamp, loading/refreshing status, the latest error and whether an initial attempt occurred. A failed refresh must retain the last successful data and expose its stale/error state; it must not display “no events” or “no clusters” as if the request succeeded.

Use a per-resource in-flight controller or equivalent single-flight mechanism. Repeated clicks or timers must not create duplicate concurrent requests for the same resource. Use an AbortSignal and a bounded timeout; a proposed starting bound is 30 seconds, to be adjusted once against preview slow-network results. Aborted superseded/unmounted requests are not user-visible errors. A request generation/identity check must prevent an older successful response or its `finally` block from overwriting newer data, error or loading state. Unmount and route changes must clean up timers and pending detail requests.

Do not add uncontrolled retry loops on top of the existing internal-feed → USGS fallback. Permit explicit retry and recovery on the next scheduled refresh; if an automatic transient retry is added, cap it, use backoff and document the resulting maximum attempts. Honor the source's actual generated/update time: a new HTTP attempt is not proof of fresher observations.

Keep day/week's currently intended cadence for this release. Once monthly loading has been requested successfully, refresh it on a separate configurable interval; five minutes is a reasonable initial target rather than downloading a month every minute. Monthly failure must leave a visible retry action even when `hasAttemptedMonthlyLoad` is true. When monthly data is missing or failed, label the actual weekly fallback as seven-day data; do not advertise 30-day coverage based only on intent. A historical event's preceding-window visualization must distinguish absent historical coverage from observed zero events.

Poll active cluster summaries on a bounded cadence aligned with the background job, initially five minutes, with a refresh on return to visibility if stale. Keep a last-good result and display loading/error/empty states distinctly. Coordinate visibility handling and cadence constants with release 5 rather than adding an unrelated second scheduler. A manual retry must recover an initial failure without page reload.

Release 5 owns whether data arrives as a new R2 snapshot contract or a USGS fallback and how payloads are reduced/parallelized. This release should expose lifecycle/source-freshness fields that remain valid for either transport. It must not weaken metadata validation simply to make refresh tests pass.

### 4.2 Reconcile significant-event state with revisions

Reconcile a previously retained major event against the full newly received authoritative feature list before filtering candidates by M4.5. If the same ID is explicitly revised to M4, replace/remove its old major candidate. Prefer the newest upstream revision (`updated` where available); an older monthly or late network response must not restore stale magnitude/place/alert values from before a fresh daily update.

Distinguish an event missing because it is outside a feed's coverage from an event missing from a complete successfully fetched authoritative window that should contain it. Preserve older known major history where coverage cannot disprove it; remove a known deleted/merged/revised event when supported by authoritative data. Do not infer deletion from a partial response or failed fetch. Recompute latest/previous major, elapsed interval, card/globe highlights and dependent state together. Document what “complete” and `asOf` mean for the selected data source.

### 4.3 Pagination and native controls

Reset pagination when the selected feed/filter identity changes, and clamp it when a refreshed result shrinks. Do not reset the user to page 1 on every same-feed refresh when the selected page remains valid. Handle 0, 1, 15 and 16 records and changes to `itemsPerPage`. Make out-of-range state unobservable even during the render before an effect runs: derive a safe effective page, or reset using a keyed feed boundary plus clamping. Sort changes can retain the existing page-reset behavior.

Use a native link for an event navigation when a stable href is available, or a native button for an action. Remove clickable plain-div rows. Enter must activate once; buttons also support Space normally, while links should retain native Space behavior. Do not duplicate browser activation with custom key handlers. Associate every repeated sort selector with a unique label/control ID, using `useId` or a stable equivalent rather than repeated `sort-key-select` IDs. Preserve visible focus indication and usable touch targets.

### 4.4 Modal dismissal and focus

Choose one Escape owner for each open dialog. Either a single document listener or one scoped listener plus an explicitly guarded fallback is acceptable; one Escape must produce one dismissal/navigation. Avoid layering native-button Enter/Space handling on a second explicit activation path. Use stable callbacks so polling/metadata updates do not repeatedly steal focus back to the close button.

Handle loading-to-content transitions: the trap must attach after the dialog exists and account for focusable controls that appear after data loads. Restore focus to the initiating control when it still exists; use a sensible fallback when it does not. A direct link must always have a working close/home action. Do not decide whether to navigate back solely from `window.history.length`, which can include other origins. Record a validated in-app return location/background entry during navigation, and fall back to home for a direct entry. Test quake-from-cluster → back-to-cluster as well as ordinary card → detail → close.

If extracting a shared dialog primitive materially reduces duplicate listener/trap bugs, keep it narrowly scoped to these dialogs. Do not introduce a broad UI library migration in this release.

### 4.5 Responsive routes

Choose and document one deliberate desktop route policy. The minimal default is to render meaningful `/overview` and `/feeds` route content at desktop widths too, adapting the sidebar to avoid duplicated panels. Keeping a persistent desktop globe in a shared layout is also valid if the selected feed/overview remains accessible and accurately reflected. Do not merely redirect every route to `/` or copy large competing desktop/mobile component trees.

Direct load, navigation, refresh and resizing across the `lg` breakpoint must preserve the selected route/feed and produce a nonempty main landmark. Home still renders the globe; quake/cluster routes retain a functional background and dialog. Learn pages must continue to render their article content. Keep the change limited to shell visibility/layout; release 5 owns lazy-loading and heavy-renderer optimizations.

### 4.6 Tooltip text safety

Replace interpolated HTML strings containing `properties.place` with safe text rendering. For example, return an HTMLElement whose `textContent` is the whole label, or use a supported React element/text renderer. Handle highlighted, normal and previous-major points consistently. Do not modify `node_modules`, use regex stripping as sanitization, or weaken CSP to preserve the old implementation.

The confirmed issue is an HTML-capable sink, not a proven live stored-XSS incident. The local proof used only an inert span. The obvious arbitrary-proxy → D1 → current globe chain was not established because normal fallback URLs are fixed and sparse D1-derived R2 lists fail the current freshness gate. Repair ingestion trust and output handling separately; do not rely on that incidental gate as a security boundary. Regression checks should use inert markup-as-text and local mocks, with no payload written to production.

## 5. Browser metadata and crawler production shell

Unify `noIndex` spelling and include it in the metadata update dependencies. Test a change where only `noIndex` toggles. Loading, not-found and error states must not leave stale entity metadata behind, and closing a detail route must restore the destination route's title/canonical/robots/JSON-LD. Ensure nested route components do not race to overwrite the same head tags; give the active route a clear metadata owner.

Resolve quake and cluster entities using the shared contracts above in the exported Worker's crawler branches. An exact canonical cluster slug emitted by the sitemap must load the same canonical record for a normal browser and an allowed crawler. Handle legacy quake ID/detail-URL forms consistently. Return actual 404/5xx states with appropriate metadata when an entity is absent/unavailable; a JSON error or an empty HTML shell is not a successful detail page.

Replace literal `/src/main.jsx` references with the production shell/assets from the same build as the Worker. Prefer obtaining the current `index.html` through the `ASSETS` binding and injecting escaped entity metadata/content, or a build-generated manifest/template with an automated freshness guarantee. Do not hard-code a current hashed filename. A binding fetch must bypass the Worker router and avoid recursive public fetches. Preserve stylesheet and module-preload references, CSP/nonces if release 2 added them, SPA bootstrap behavior and old hashed-asset compatibility.

Escape HTML text/attributes and serialize JSON-LD safely for a script element, including `<`/`</script>` handling. Do not treat `JSON.stringify` alone as HTML-context escaping. A crawler page should include meaningful entity content and also boot the production app if viewed by a human. Avoid duplicated visible headings/content outside the root after the app mounts.

Preserve release 2's response-variant/cache controls. Verify both browser-first and crawler-first access sequences locally/preview without attempting production cache poisoning. Do not change cache key policy in this package without coordination. The same-origin sitemap test should read a real emitted URL and follow it with a crawler user agent; constructing an unrelated synthetic route is insufficient to prove B6 resolved.

## 6. Regression and browser verification

Add focused tests beside the affected implementation. Run the relevant existing suites, then the full repository suite once the integrated changes settle. The baseline's excluded globe/notable-event files and four skips are not a correctness certificate; report exclusions honestly and use a narrow mocked renderer or direct browser verification for the changed globe behavior. Do not silently exclude failing suites to obtain a green result.

| Test group | Required cases and observable outcomes |
| --- | --- |
| Shared quake URLs | Positive, zero, negative and null magnitude; revised place/magnitude; plain ID; legacy encoded USGS detail URL; valid supported ID alphabet; malformed encoding; untrusted external detail URL. Browser and Worker return the same event ID or controlled failure. |
| Cluster resolution | Stored current slug containing signed coordinates/stable-key suffix; exact canonical ID; verified old-ID/slug aliases; old `overview_cluster_*`; old descriptive strongest-ID link; ambiguous legacy anchor; conflicting selectors; missing row; DB error. No invented ID from the end of a current slug. |
| Detail lifecycle | Direct link with no global feed ready; route A request slower than route B; retry after transient failure; timeout; unmount cancellation; missing members/strongest event handled as a bounded integrity state. No infinite reconstruction/loading branch. |
| Provider lifecycle | Fake timers for multiple refresh intervals, monthly opt-in, first-month failure and retry, last-good data retained on refresh failure, no overlapping calls, aborted/late responses ignored, hidden/visible recovery, actual-source freshness shown. |
| Revised majors | M5→M4 for same ID; M4→M5; place/time revision; older monthly response after newer daily response; deletion within a known complete window; record outside shorter-feed coverage retained appropriately. Card/timer/globe select the corrected record. |
| Pagination | Page 2 of 16→one event; page 5→two pages; same-feed refresh keeping a valid page; switch period/filter; empty feed; items-per-page change; sort changes. No blank populated list or inaccessible recovery. |
| Dialogs/controls | Escape from close button, content and outside focus invokes one close; Enter/Space activation once; loading then loaded trap; focus restoration; direct-link close; quake from cluster then return. Every event row works without a mouse. |
| Tooltip | Inert `<span data-audit-marker>` and `&`, quotes, Unicode place text are literal text, with no injected DOM descendants. All point types follow the same rule. |
| Metadata/crawler | `noIndex`-only update; missing/error page noindex; canonical restored after close; safely embedded JSON-LD; sitemap-produced canonical slug resolves; production HTML has current built JS/CSS and no `/src/main.jsx`; each referenced entry asset returns JavaScript/CSS, not SPA HTML. |

For Worker behavior, import and call the default export of `src/worker.js` with realistic mocked bindings or the actual local Worker, not only a legacy Pages handler. Use repository migrations and release 3 fixture schema for resolver integration tests. Avoid an implementation-mirroring mock that simply returns any row regardless of the bound selector.

Build and package using the current npm scripts:

```bash
npm ci
npm test
npm run check:deploy
npm run seed:preview
npm run dev
```

In a second terminal, with the local Worker running:

```bash
npm run smoke -- http://localhost:8787 --preview
```

Extend safe preview fixtures/tests as needed for negative/null magnitude, 16-to-one pagination, a canonical cron-shaped slug and a legacy alias. Never seed these into production. Preview has no cron, so timer-refresh scenarios need controlled local responses or explicit fixture updates. The current fixture metadata expires after ten minutes and triggers fallback; keep fixtures fresh or deliberately test expiration rather than misinterpreting live USGS data as the fixture.

Browser matrix: 390×844 mobile, 768-wide tablet, 1280×900 desktop, and a resize across the `lg` breakpoint. Check `/`, `/overview`, `/feeds`, a quake direct link, a canonical and legacy cluster direct link, and one Learn page. Run the complete route/keyboard flow on desktop and mobile layouts; actual mobile device or a second browser engine is desirable for focus and viewport behavior when available. Inspect rendered content, network/console errors and focus order. Confirm a refreshed feed/cluster changes without a hard reload, with no lost selected page when still valid. Existing smoke checks are useful but do not prove WebGL rendering, focus behavior or responsive layout.

## 7. Acceptance, release scope and recovery

The release is ready for review when:

- F1–F6 and F8–F10 have corrected-behavior tests and preview evidence; legacy routes either resolve or terminate clearly.
- B6 is tested from sitemap URL through the exported Worker crawler branch to a real canonical fixture, and the returned HTML boots built assets.
- Month/cluster refresh and failure recovery occur without reload, stale responses cannot overwrite newer results, and revised-major views agree.
- Keyboard-only event navigation and one-time dialog dismissal work, direct-entry close is usable, and the desktop overview/main pane is no longer blank.
- F7 is explicitly assigned to release 5 with compatible canonical resolver/summary contracts. Do not mark all cluster correctness fixed while cards still reconstruct a weekly subset.
- Release 2 protections and release 3 identity/schema contracts remain covered by their regression tests. No extra production schema or data change was introduced here.
- The change report names the exact commit, tests, meaningful remaining limits and preview observations. It does not present planned commands as executed checks.

Ship additive selectors and legacy readers before removing or changing callers. New metadata fields should be additive. Keep old assets available for already-open clients; do not delete `STATIC_KV` or legacy allowlists as incidental cleanup. Avoid dependency-major upgrades, unrelated component rewrites, data merges, broad lint cleanup and renderer replacement in this release.

For an authorized remote preview, follow `DEPLOYMENT.md`, re-seed the isolated resources if required, deploy the reviewed revision and run preview smoke plus browser checks. A future handoff's authorization controls production publication; this planning document does not itself authorize deployment. If production release is authorized, first record the immediately preceding known-good Worker version, deploy the same verified commit, then check representative real quake/cluster links, browser and crawler responses, built assets, feeds, retry/refresh behavior and layout. Do not test attacks, synthetic records, administrative mutations or cache poisoning against production.

Rollback on broken entity resolution, recurring blank screens, repeated request loops, lost security controls, mismatched production assets or a material increase in client errors. Restore the immediately prior verified **post-security** Worker release; the August reconciliation baseline is not an appropriate default. This release should not require a production data rollback. If release 3 introduced an additive alias schema, keep it in place when rolling back UI code. Worker rollback does not restore D1/KV/R2; do not drop aliases or rewrite canonical records to accommodate an old frontend. Record recovery checks and retained limitations.

## 8. Copyable implementation handoff

```text
Implement release 4 from docs/remediation/04-frontend-correctness.md in the earthquake repository. Treat this document as a work package, not as evidence that fixes or deployments already happened. Read docs/remediation/README.md and package 1 first; verify trigger containment before pushing and the verified release path before deployment. Then inspect the current integrated branch, repository instructions, DEPLOYMENT.md and the completed security/database contracts.

Resolve F1-F6 and F8-F10: shared backward-compatible earthquake URLs, terminal cluster detail resolution, safe pagination, single modal dismissal and focus behavior, monthly/cluster refresh and retry/cancellation, significant-event revision handling, desktop route layouts, native keyboard controls and safe tooltip text. Resolve B6 with the same exact canonical cluster resolver in browser/API/crawler flows, correct noIndex metadata and production-built asset references. Write focused regression tests that assert corrected behavior, including direct links and route races, and verify mobile/desktop preview interactions.

Preserve release 2 security/cache controls and release 3 canonical UUID/revision/alias semantics. Keep legacy ?id behavior, add explicit exact slug/clusterId selectors if the integrated API has not already done so, and return canonical metadata. Coordinate F7 with release 5: do not fix authoritative 30-day cluster summaries by recomputing partial weekly approximations. Release 5 owns source-selection/payload/rendering performance; agree on provider lifecycle and shared component ownership before overlapping edits.

Use local and isolated preview data. No production synthetic payloads, data repair or schema rewrite belongs to this package. Run relevant tests, the full suite and packaging checks, then preview smoke plus real browser/keyboard checks. Report the exact commit, validation evidence, remaining F7/performance work and rollback target. Deploy production only if the current user/session authorizes that action; otherwise leave a concrete reviewed release candidate with exact commands and recovery notes.
```
