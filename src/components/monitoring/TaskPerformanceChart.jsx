/**
 * @file src/components/monitoring/TaskPerformanceChart.jsx
 * @description Performance chart component showing task execution metrics over time
 */

import React from 'react';

/**
 * TaskPerformanceChart component displays performance trends and metrics
 */
export default function TaskPerformanceChart({ metricsData, timeRange, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Task Performance</h2>
        <div className="animate-pulse">
          <div className="bg-gray-200 rounded h-64 mb-4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-200 rounded h-16"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!metricsData) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Task Performance</h2>
        <div className="text-center py-8 text-gray-500">
          <p>Unable to load performance data</p>
        </div>
      </div>
    );
  }

  const { summary, performance, trends, clustering } = metricsData;

  // Create simple bar chart visualization for daily breakdown
  const dailyData = performance?.dailyBreakdown || [];
  const maxEarthquakes = dailyData.length > 0 ? Math.max(...dailyData.map(d => d.earthquakeCount), 1) : 1;

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'increasing': return 'text-green-600';
      case 'decreasing': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'increasing':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        );
      case 'decreasing':
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Task Performance</h2>
        <div className="text-sm text-gray-500">
          Time Range: {timeRange === 'hour' ? 'Last Hour' : timeRange === 'day' ? 'Last 24 Hours' : 'Last 7 Days'}
        </div>
      </div>

      {/* Performance Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-blue-900">{summary?.totalEarthquakes || 0}</p>
              <p className="text-sm text-blue-700">Total Earthquakes</p>
            </div>
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="mt-2 text-xs text-blue-600">
            Health Score: {summary?.dataHealthScore || 0}%
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-green-900">{summary?.dataFreshnessMinutes || 0}</p>
              <p className="text-sm text-green-700">Minutes Since Update</p>
            </div>
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="mt-2 text-xs text-green-600">
            Span: {summary?.dataSpanHours || 0}h
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-purple-900">{performance?.avgDailyEarthquakes || 0}</p>
              <p className="text-sm text-purple-700">Avg Daily Earthquakes</p>
            </div>
            <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="mt-2 text-xs text-purple-600">
            Locations: {performance?.avgUniqueLocations || 0}
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-orange-900">{clustering?.totalClusters || 0}</p>
              <p className="text-sm text-orange-700">Clusters Analyzed</p>
            </div>
            <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="mt-2 text-xs text-orange-600">
            Recent: {clustering?.recentClusters || 0}
          </div>
        </div>
      </div>

      {/* Daily Activity Chart */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3">Daily Activity Breakdown</h3>
        <div className="bg-gray-50 rounded-lg p-4">
          {dailyData.length > 0 ? (
            <>
              <div className="flex items-end justify-between space-x-1 h-32">
                {dailyData.slice(0, 14).map((day, index) => {
                  const height = (day.earthquakeCount / maxEarthquakes) * 100;
                  const isRecent = index < 3;
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center">
                      <div
                        className={`w-full rounded-t transition-all hover:opacity-80 ${
                          isRecent ? 'bg-blue-500' : 'bg-gray-400'
                        }`}
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${day.date}: ${day.earthquakeCount} earthquakes`}
                      ></div>
                      <div className="text-sm text-gray-700 mt-1 text-center">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-sm text-gray-600 mt-2">
                <span>Recent Days (blue bars)</span>
                <span>Peak: {maxEarthquakes} earthquakes</span>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="mb-2">
                <svg className="w-12 h-12 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600">No daily breakdown data available</p>
              <p className="text-sm text-gray-500">Daily activity will appear as data is collected</p>
            </div>
          )}
        </div>
      </div>

      {/* Trends and Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trend Analysis */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-medium text-gray-900 mb-3">Trend Analysis</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-700 font-medium">Current Period:</span>
              <span className="font-semibold text-gray-900">{trends?.currentPeriodEarthquakes || 0} earthquakes</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-700 font-medium">Previous Period:</span>
              <span className="font-semibold text-gray-900">{trends?.previousPeriodEarthquakes || 0} earthquakes</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-700 font-medium">Change:</span>
              <div className="flex items-center space-x-1">
                {getTrendIcon(trends?.trend)}
                <span className={`font-semibold ${getTrendColor(trends?.trend)}`}>
                  {trends?.percentChange > 0 ? '+' : ''}{trends?.percentChange || 0}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-700 font-medium">Trend:</span>
              <span className={`font-semibold capitalize ${getTrendColor(trends?.trend)}`}>
                {trends?.trend || 'stable'}
              </span>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-medium text-gray-900 mb-3">Performance Metrics</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-700 font-medium">Avg Magnitude:</span>
              <span className="font-semibold text-gray-900">{(performance?.avgMagnitude || 0).toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-700 font-medium">Total Events:</span>
              <span className="font-semibold text-gray-900">{performance?.totalEarthquakesInPeriod || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-700 font-medium">Unique Locations:</span>
              <span className="font-semibold text-gray-900">{performance?.avgUniqueLocations || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-700 font-medium">Active Days:</span>
              <span className="font-semibold text-gray-900">{performance?.activeDaysInRange || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-sm text-gray-600 text-right mt-4">
        Generated: {metricsData.metadata?.generatedAt ? new Date(metricsData.metadata.generatedAt).toLocaleString() : 'Unknown'}
      </div>
    </div>
  );
}