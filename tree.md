.
├── CLAUDE.md
├── ENHANCED_LOGGING.md
├── README.md
├── apple.md
├── benchmark-results
│   ├── benchmark-2025-07-12T16-29-09.json
│   ├── benchmark-2025-07-12T16-44-15.json
│   └── benchmark-2025-07-12T17-13-36.json
├── common
│   └── mathUtils.js
├── comprehensive-results.json
├── docs
│   └── jsdoc
│       ├── ErrorBoundary.html
│       ├── fonts
│       │   ├── Montserrat
│       │   │   ├── Montserrat-Bold.eot
│       │   │   ├── Montserrat-Bold.ttf
│       │   │   ├── Montserrat-Bold.woff
│       │   │   ├── Montserrat-Bold.woff2
│       │   │   ├── Montserrat-Regular.eot
│       │   │   ├── Montserrat-Regular.ttf
│       │   │   ├── Montserrat-Regular.woff
│       │   │   └── Montserrat-Regular.woff2
│       │   └── Source-Sans-Pro
│       │       ├── sourcesanspro-light-webfont.eot
│       │       ├── sourcesanspro-light-webfont.svg
│       │       ├── sourcesanspro-light-webfont.ttf
│       │       ├── sourcesanspro-light-webfont.woff
│       │       ├── sourcesanspro-light-webfont.woff2
│       │       ├── sourcesanspro-regular-webfont.eot
│       │       ├── sourcesanspro-regular-webfont.svg
│       │       ├── sourcesanspro-regular-webfont.ttf
│       │       ├── sourcesanspro-regular-webfont.woff
│       │       └── sourcesanspro-regular-webfont.woff2
│       ├── global.html
│       ├── index.html
│       ├── scripts
│       │   ├── collapse.js
│       │   ├── commonNav.js
│       │   ├── linenumber.js
│       │   ├── nav.js
│       │   ├── polyfill.js
│       │   ├── prettify
│       │   │   ├── Apache-License-2.0.txt
│       │   │   ├── lang-css.js
│       │   │   └── prettify.js
│       │   └── search.js
│       └── styles
│           ├── jsdoc.css
│           └── prettify.css
├── eslint.config.js
├── functions
│   ├── [[catchall]].js
│   ├── [[catchall]].test.js
│   ├── api
│   │   ├── batch-usgs-fetch.js
│   │   ├── cache-stats.js
│   │   ├── calculate-clusters.POST.js
│   │   ├── calculate-clusters.endpoint.test.js
│   │   ├── calculate-clusters.logic.test.js
│   │   ├── cluster-definition.js
│   │   ├── cluster-definition.test.js
│   │   ├── cluster-detail-with-quakes.js
│   │   ├── get-earthquakes.js
│   │   ├── get-earthquakes.test.js
│   │   ├── system-health.js
│   │   ├── system-logs.js
│   │   ├── task-metrics.js
│   │   └── usgs-proxy.test.js
│   ├── background
│   │   └── process-clusters.js
│   ├── prerender-cluster.integration.test.js
│   ├── prerender-quake.integration.test.js
│   ├── routes
│   │   ├── api
│   │   │   └── usgs-proxy.js
│   │   ├── prerender
│   │   │   ├── cluster-detail.js
│   │   │   ├── cluster-detail.test.js
│   │   │   ├── quake-detail.js
│   │   │   └── quake-detail.test.js
│   │   └── sitemaps
│   │       ├── clusters-sitemap.js
│   │       ├── earthquakes-sitemap.js
│   │       ├── index-sitemap.js
│   │       └── static-pages-sitemap.js
│   ├── sitemaps.clusters.test.js
│   ├── sitemaps.earthquakes.test.js
│   ├── sitemaps.index_static.test.js
│   ├── usgs-proxy.integration.test.js
│   └── utils
│       ├── clusterBenchmark.js
│       ├── clusterBenchmark.test.js
│       ├── crawler-utils.js
│       ├── crawler-utils.test.js
│       ├── d1ClusterUtils.js
│       ├── mathUtils.js
│       ├── spatialClusterUtils.js
│       ├── spatialClusterUtils.test.js
│       ├── xml-utils.js
│       └── xml-utils.test.js
├── index.html
├── jsdoc.json
├── migrations
│   ├── 0001_create_cluster_cache_table.sql
│   ├── 0002_create_earthquake_events_table.sql
│   ├── 0003_add_requestparams_to_clustercache.sql
│   ├── 0004_create_cluster_definitions_table.sql
│   ├── 0005_add_indexes_to_cluster_definitions.sql
│   ├── 0006_add_trigger_to_cluster_definitions.sql
│   ├── 0009_add_stablekey_to_clusterdefinitions.sql
│   └── 0010_fix_updatedat_trigger.sql
├── package-lock.json
├── package.json
├── postcss.config.js
├── public
│   ├── default-earthquake-logo.svg
│   ├── robots.txt
│   └── vite.svg
├── scripts
│   ├── benchmark-api.js
│   ├── benchmark-d1.js
│   ├── benchmark-database.js
│   └── run-benchmark.js
├── src
│   ├── App.css
│   ├── assets
│   │   ├── TectonicPlateBoundaries.json
│   │   ├── default-earthquake-logo.svg
│   │   ├── gem_active_faults_harmonized.json
│   │   ├── local_active_faults.json
│   │   ├── natural_earth_countries.json
│   │   ├── ne_110m_coastline.json
│   │   └── react.svg
│   ├── components
│   │   ├── ActiveRegionDisplay.jsx
│   │   ├── ActiveRegionDisplay.test.jsx
│   │   ├── ActivityList.jsx
│   │   ├── ActivityList.test.jsx
│   │   ├── AlertDisplay.jsx
│   │   ├── AlertDisplay.test.jsx
│   │   ├── BottomNav.jsx
│   │   ├── ClusterDetailModal.jsx
│   │   ├── ClusterDetailModal.test.jsx
│   │   ├── ClusterDetailModalWrapper.jsx
│   │   ├── ClusterDetailModalWrapper.parsing.test.jsx
│   │   ├── ClusterDetailModalWrapper.test.jsx
│   │   ├── ClusterMiniMap.jsx
│   │   ├── ClusterMiniMap.test.jsx
│   │   ├── ClusterSummaryItem.jsx
│   │   ├── EarthquakeDetailModalComponent.common.test.jsx
│   │   ├── EarthquakeDetailModalComponent.data.test.jsx
│   │   ├── EarthquakeDetailModalComponent.jsx
│   │   ├── EarthquakeDetailModalComponent.navigation.test.jsx
│   │   ├── EarthquakeDetailModalComponent.seo.test.jsx
│   │   ├── EarthquakeDetailView.jsx
│   │   ├── EarthquakeDetailView.test.jsx
│   │   ├── EarthquakeMap.jsx
│   │   ├── EarthquakeMap.test.jsx
│   │   ├── EarthquakeSequenceChart.jsx
│   │   ├── EarthquakeSequenceChart.test.jsx
│   │   ├── EarthquakeTimelineSVGChart.jsx
│   │   ├── EarthquakeTimelineSVGChart.test.jsx
│   │   ├── ErrorBoundary.jsx
│   │   ├── ErrorBoundary.test.jsx
│   │   ├── FeedSelector.jsx
│   │   ├── FeedSelector.test.jsx
│   │   ├── FeedsPageLayout.jsx
│   │   ├── FeedsPageLayout.test.jsx
│   │   ├── GlobalLastMajorQuakeTimer.jsx
│   │   ├── GlobalLastMajorQuakeTimer.test.jsx
│   │   ├── InfoSnippet.jsx
│   │   ├── InteractiveGlobeView.jsx
│   │   ├── InteractiveGlobeView.test.jsx
│   │   ├── LatestEvent.jsx
│   │   ├── LatestEvent.test.jsx
│   │   ├── LoadMoreDataButton.jsx
│   │   ├── LoadMoreDataButton.test.jsx
│   │   ├── MagnitudeDepthScatterSVGChart.jsx
│   │   ├── MagnitudeDepthScatterSVGChart.test.jsx
│   │   ├── MagnitudeDistributionSVGChart.jsx
│   │   ├── MagnitudeDistributionSVGChart.test.jsx
│   │   ├── NotableQuakeFeature.jsx
│   │   ├── NotableQuakeFeature.test.jsx
│   │   ├── PreviousNotableQuakeFeature.jsx
│   │   ├── QuickFact.jsx
│   │   ├── QuickFact.test.jsx
│   │   ├── RegionalDistributionList.jsx
│   │   ├── RegionalDistributionList.test.jsx
│   │   ├── RegionalSeismicityChart.jsx
│   │   ├── RegionalSeismicityChart.test.jsx
│   │   ├── SeoMetadata.jsx
│   │   ├── SeoMetadata.test.jsx
│   │   ├── SimplifiedDepthProfile.jsx
│   │   ├── SimplifiedDepthProfile.test.jsx
│   │   ├── SummaryStatisticsCard.jsx
│   │   ├── TimeSinceLastMajorQuakeBanner.jsx
│   │   ├── TimeSinceLastMajorQuakeBanner.test.jsx
│   │   ├── earthquakeDetail
│   │   │   ├── EarthquakeBeachballPanel.jsx
│   │   │   ├── EarthquakeCitizenSciencePanel.jsx
│   │   │   ├── EarthquakeDepthProfilePanel.jsx
│   │   │   ├── EarthquakeDetailHeader.jsx
│   │   │   ├── EarthquakeEnergyPanel.jsx
│   │   │   ├── EarthquakeFaultDiagramPanel.jsx
│   │   │   ├── EarthquakeFaultParamsPanel.jsx
│   │   │   ├── EarthquakeFurtherInfoPanel.jsx
│   │   │   ├── EarthquakeImpactPanel.jsx
│   │   │   ├── EarthquakeLocationPanel.jsx
│   │   │   ├── EarthquakeMagnitudeComparisonPanel.jsx
│   │   │   ├── EarthquakeMwwPanel.jsx
│   │   │   ├── EarthquakeRegionalMapPanel.jsx
│   │   │   ├── EarthquakeRegionalSeismicityPanel.jsx
│   │   │   ├── EarthquakeRegionalSeismicityPanel.test.jsx
│   │   │   ├── EarthquakeSeismicWavesPanel.jsx
│   │   │   ├── EarthquakeSeismicWavesPanel.test.jsx
│   │   │   ├── EarthquakeSnapshotPanel.jsx
│   │   │   ├── EarthquakeStressAxesPanel.jsx
│   │   │   ├── InteractiveFaultDiagram.jsx
│   │   │   └── __snapshots__
│   │   │       └── EarthquakeSeismicWavesPanel.test.jsx.snap
│   │   ├── monitoring
│   │   │   ├── LogViewer.jsx
│   │   │   ├── MetricsGrid.jsx
│   │   │   ├── SystemHealthOverview.jsx
│   │   │   ├── SystemHealthOverview.test.jsx
│   │   │   └── TaskPerformanceChart.jsx
│   │   ├── simplifiedDepthProfileUtils.js
│   │   └── skeletons
│   │       ├── EarthquakeSequenceChartSkeleton.jsx
│   │       ├── EarthquakeTimelineSVGChartSkeleton.jsx
│   │       ├── MagnitudeDepthScatterSVGChartSkeleton.jsx
│   │       ├── MagnitudeDistributionSVGChartSkeleton.jsx
│   │       ├── SkeletonBlock.jsx
│   │       ├── SkeletonListItem.jsx
│   │       ├── SkeletonTableRow.jsx
│   │       └── SkeletonText.jsx
│   ├── constants
│   │   └── appConstants.js
│   ├── contexts
│   │   ├── EarthquakeDataContext.jsx
│   │   ├── UIStateContext.jsx
│   │   ├── earthquakeDataContextUtils.js
│   │   └── uiStateContextUtils.js
│   ├── features
│   ├── hooks
│   ├── index.css
│   ├── main.jsx
│   ├── mocks
│   │   ├── handlers.js
│   │   └── server.js
│   ├── pages
│   │   ├── HomePage.clusterLogic.test.jsx
│   │   ├── HomePage.jsx
│   │   ├── HomePage.rendering.test.jsx
│   │   ├── LearnPage.jsx
│   │   ├── MonitoringPage.jsx
│   │   ├── OverviewPage.jsx
│   │   └── learn
│   │       ├── MagnitudeVsIntensityPage.jsx
│   │       ├── MeasuringEarthquakesPage.jsx
│   │       └── PlateTectonicsPage.jsx
│   ├── services
│   │   ├── clusterApiService.js
│   │   ├── clusterApiService.test.js
│   │   ├── usgsApiService.js
│   │   └── usgsApiService.test.js
│   ├── setupTests.js
│   ├── tests
│   │   └── contexts
│   │       ├── EarthquakeDataContext.initialLoad.test.jsx
│   │       ├── EarthquakeDataContext.monthlyLoad.test.jsx
│   │       ├── EarthquakeDataContext.reducer.test.jsx
│   │       ├── EarthquakeDataContext.refresh.test.jsx
│   │       ├── EarthquakeDataContext.selectors.test.jsx
│   │       └── UIStateContext.test.jsx
│   ├── utils
│   │   ├── __mocks__
│   │   │   └── fetchUtils.js
│   │   ├── clusterUtils.js
│   │   ├── clusterUtils.test.js
│   │   ├── d1Utils.js
│   │   ├── d1Utils.test.js
│   │   ├── detailViewUtils.js
│   │   ├── detailViewUtils.test.js
│   │   ├── fetchUtils.js
│   │   ├── fetchUtils.test.js
│   │   ├── formatDate.test.js
│   │   ├── formatLargeNumber.test.js
│   │   ├── formatNumber.test.js
│   │   ├── formatTimeAgo.test.js
│   │   ├── geoJsonUtils.js
│   │   ├── geoSpatialUtils.js
│   │   ├── getMagnitudeColor.test.js
│   │   ├── isValidNumber.test.js
│   │   ├── isValidString.test.js
│   │   ├── isValuePresent.test.js
│   │   ├── kvUtils.js
│   │   ├── kvUtils.test.js
│   │   ├── scheduledTaskLogger.js
│   │   ├── scheduledTaskLogger.test.js
│   │   ├── seismicUtils.js
│   │   ├── seismicUtils.test.js
│   │   └── utils.js
│   └── worker.js
├── tailwind.config.js
├── test-spatial-integration.js
├── update.md
├── update_todo.md
├── vite.config.js
└── wrangler.toml

41 directories, 274 files
