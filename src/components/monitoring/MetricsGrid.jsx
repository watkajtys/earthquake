/**
 * @file src/components/monitoring/MetricsGrid.jsx
 * @description Metrics grid component showing key performance indicators
 */

import React from 'react';

/**
 * MetricsGrid component displays key metrics in a grid layout
 */
export default function MetricsGrid({ metricsData, healthData, timeRange, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 rounded-lg p-4 h-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const metrics = metricsData?.summary || {};
  const errors = metricsData?.errors || {};
  const health = healthData?.metrics || {};

  const metricCards = [
    {
      title: 'System Health',
      value: health.healthScore || 0,
      unit: '%',
      color: 'bg-green-50 border-green-200 text-green-800',
      icon: (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      title: 'Data Freshness',
      value: metrics.dataFreshnessMinutes || 0,
      unit: 'min',
      color: metrics.dataFreshnessMinutes < 10 ? 'bg-green-50 border-green-200 text-green-800' : 
             metrics.dataFreshnessMinutes < 30 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
             'bg-red-50 border-red-200 text-red-800',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      title: 'Error Rate',
      value: errors.errorRate || 0,
      unit: '%',
      color: errors.errorRate < 5 ? 'bg-green-50 border-green-200 text-green-800' :
             errors.errorRate < 15 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
             'bg-red-50 border-red-200 text-red-800',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      )
    },
    {
      title: 'API Response',
      value: health.usgsApiResponseTime || 0,
      unit: 'ms',
      color: health.usgsApiResponseTime < 1000 ? 'bg-green-50 border-green-200 text-green-800' :
             health.usgsApiResponseTime < 3000 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
             'bg-red-50 border-red-200 text-red-800',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    {
      title: 'DB Response',
      value: health.databaseResponseTime || 0,
      unit: 'ms',
      color: health.databaseResponseTime < 100 ? 'bg-green-50 border-green-200 text-green-800' :
             health.databaseResponseTime < 500 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
             'bg-red-50 border-red-200 text-red-800',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
      )
    },
    {
      title: 'Active Days',
      value: metrics.activeDays || 0,
      unit: 'days',
      color: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: (
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Key Metrics</h2>
        <div className="text-sm text-gray-500">
          {timeRange === 'hour' ? 'Last Hour' : timeRange === 'day' ? 'Last 24 Hours' : 'Last 7 Days'}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metricCards.map((metric, index) => (
          <div
            key={index}
            className={`rounded-lg border p-4 transition-all hover:shadow-md ${metric.color}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-700">
                {metric.title}
              </div>
              {metric.icon}
            </div>
            <div className="flex items-baseline">
              <div className="text-2xl font-bold">
                {typeof metric.value === 'number' ? Math.round(metric.value) : metric.value}
              </div>
              <div className="text-sm font-medium ml-1 text-gray-600">
                {metric.unit}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Additional Details */}
      {metricsData && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-base">
            <div className="flex justify-between">
              <span className="text-gray-700 font-medium">Total Earthquakes:</span>
              <span className="font-semibold text-gray-900">{metrics.totalEarthquakes || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 font-medium">Data Span:</span>
              <span className="font-semibold text-gray-900">{metrics.dataSpanHours || 0} hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 font-medium">Last Update:</span>
              <span className="font-semibold text-gray-900">
                {metrics.lastUpdate ? new Date(metrics.lastUpdate).toLocaleTimeString() : 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}