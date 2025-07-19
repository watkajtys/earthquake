// src/pages/learn/HistoricalDataPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import SeoMetadata from '../../components/SeoMetadata';

const HistoricalDataPage = () => {
    return (
        <>
            <SeoMetadata
                title="Historical Earthquake Data Loading Strategy"
                description="Learn about our strategy for loading and processing historical earthquake data to enrich the application's dataset."
                keywords="historical earthquake data, data ingestion, batch processing, earthquake data strategy"
                pageUrl="https://earthquakeslive.com/learn/historical-data"
                canonicalUrl="https://earthquakeslive.com/learn/historical-data"
                locale="en_US"
                type="article"
            />
            <div className="p-4 md:p-6 text-slate-200">
                <h1 className="text-2xl font-bold text-indigo-400 mb-4">Strategy for Loading Historical Earthquake Data</h1>
                <div className="space-y-4 text-slate-300">
                    <p>To enrich the application with historical data, a dedicated batch ingestion process is required. This page outlines our strategy for populating the application with earthquake data from previous years and months.</p>

                    <h2 className="text-xl font-semibold text-indigo-300 mt-6 mb-2">Objective</h2>
                    <p>The primary objective is to populate our `EarthquakeEvents` D1 table with historical earthquake data from the USGS and generate corresponding `ClusterDefinitions` for significant seismic events.</p>

                    <h2 className="text-xl font-semibold text-indigo-300 mt-6 mb-2">Process</h2>
                    <div className="space-y-3">
                        <div>
                            <h3 className="text-lg font-semibold text-indigo-200">1. Data Acquisition</h3>
                            <p>We will identify and use historical earthquake data archives from the USGS, which are available as yearly or monthly GeoJSON files.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-indigo-200">2. Batch Ingestion Mechanism</h3>
                            <p>A new, secured Cloudflare Worker HTTP function will be created for administrative use. This function will:</p>
                            <ul className="list-disc list-inside pl-4 mt-2">
                                <li>Accept parameters like year, month, or a direct URL to a historical data file.</li>
                                <li>Fetch the specified data file from the USGS.</li>
                                <li>Parse the GeoJSON data.</li>
                                <li>Process earthquakes in manageable chunks (e.g., 100-500 events at a time) to work within Cloudflare Worker limits.</li>
                                <li>Use our existing `upsertEarthquakeFeaturesToD1` function to efficiently load these chunks into our database.</li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-indigo-200">3. Historical Cluster Generation</h3>
                            <p>After loading a significant amount of historical data, a similar batch process will be used to generate cluster definitions. This process will:</p>
                            <ul className="list-disc list-inside pl-4 mt-2">
                                <li>Query the `EarthquakeEvents` table for specific historical periods.</li>
                                <li>Pass the retrieved earthquakes to our clustering logic.</li>
                                <li>Store definitions for significant historical clusters in the `ClusterDefinitions` table.</li>
                            </ul>
                        </div>
                    </div>

                    <h2 className="text-xl font-semibold text-indigo-300 mt-6 mb-2">Important Considerations</h2>
                    <ul className="list-disc list-inside pl-4 space-y-2">
                        <li><strong>USGS Rate Limits:</strong> We will be respectful of USGS servers by implementing appropriate delays between fetching large files.</li>
                        <li><strong>Cloudflare Worker Limits:</strong> Our batch jobs will be designed to operate within the execution time and memory limits of Cloudflare Workers.</li>
                        <li><strong>Idempotency:</strong> The data ingestion process is designed to be idempotent, meaning running it multiple times with the same data will not result in duplicates.</li>
                        <li><strong>Monitoring & Logging:</strong> We will thoroughly log the progress, successes, and failures of our batch operations.</li>
                    </ul>

                    <div className="mt-8">
                        <Link to="/learn" className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">
                            &larr; Back to Learn Page
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
};

export default HistoricalDataPage;
