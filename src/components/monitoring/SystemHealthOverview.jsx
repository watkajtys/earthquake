/**
 * @file src/components/monitoring/SystemHealthOverview.jsx
 * @description System health overview component showing status of all system components
 */

import React from 'react';

/**
 * SystemHealthOverview component displays high-level system health status
 */
export default function SystemHealthOverview({ healthData, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 rounded-lg p-4 h-24"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!healthData) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health Overview</h2>
        <div className="text-center py-8 text-gray-500">
          <p>Unable to load system health data</p>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy':
        return (
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'degraded':
        return (
          <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'unhealthy':
        return (
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'border-green-200 bg-green-50';
      case 'degraded': return 'border-yellow-200 bg-yellow-50';
      case 'unhealthy': return 'border-red-200 bg-red-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getTextColor = (status) => {
    switch (status) {
      case 'healthy': return 'text-green-800';
      case 'degraded': return 'text-yellow-800';
      case 'unhealthy': return 'text-red-800';
      default: return 'text-gray-800';
    }
  };

  const components = healthData.components || {};
  const metrics = healthData.metrics || {};

  // Component cards data
  const componentCards = [
    {
      title: 'Database (D1)',
      status: components.database?.status || 'unknown',
      message: components.database?.message || 'Status unknown',
      metrics: {
        'Response Time': components.database?.responseTime ? `${components.database.responseTime}ms` : 'N/A',
        'Recent Records': components.database?.recentRecords || 'N/A'
      }
    },
    {
      title: 'USGS API',
      status: components.usgsApi?.status || 'unknown',
      message: components.usgsApi?.message || 'Status unknown',
      metrics: {
        'Response Time': components.usgsApi?.responseTime ? `${components.usgsApi.responseTime}ms` : 'N/A',
        'Recent Data': components.usgsApi?.recentEarthquakes ? `${components.usgsApi.recentEarthquakes} earthquakes` : 'N/A'
      }
    },
    {
      title: 'KV Storage',
      status: components.kvStorage?.status || 'unknown',
      message: components.kvStorage?.message || 'Status unknown',
      metrics: {
        'Response Time': components.kvStorage?.responseTime ? `${components.kvStorage.responseTime}ms` : 'N/A',
        'Status': components.kvStorage?.status === 'healthy' ? 'Operational' : 'Check Required'
      }
    },
    {
      title: 'Scheduled Tasks',
      status: components.scheduledTasks?.status || 'unknown',
      message: components.scheduledTasks?.message || 'Status unknown',
      metrics: {
        'Data Freshness': metrics.dataFreshnessMinutes ? `${Math.round(metrics.dataFreshnessMinutes)}min ago` : 'N/A',
        'Recent Updates': components.scheduledTasks?.recentUpdates || 'N/A'
      }
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">System Health Overview</h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            Health Score: <span className="font-medium">{metrics.healthScore || 0}%</span>
          </div>
          <div className="text-sm text-gray-500">
            Check Duration: {metrics.checkDuration || 0}ms
          </div>
        </div>
      </div>

      {/* Component Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {componentCards.map((component, index) => (
          <div
            key={index}
            className={`rounded-lg border-2 p-4 transition-all hover:shadow-md ${getStatusColor(component.status)}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">{component.title}</h3>
              {getStatusIcon(component.status)}
            </div>
            
            <p className={`text-sm mb-3 ${getTextColor(component.status)}`}>
              {component.message}
            </p>
            
            <div className="space-y-1">
              {Object.entries(component.metrics).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs text-gray-600">
                  <span>{key}:</span>
                  <span className="font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Overall System Metrics */}
      <div className="border-t border-gray-200 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{metrics.healthyComponents || 0}</p>
            <p className="text-xs text-green-600 font-medium">Healthy</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{metrics.degradedComponents || 0}</p>
            <p className="text-xs text-yellow-600 font-medium">Degraded</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{metrics.unhealthyComponents || 0}</p>
            <p className="text-xs text-red-600 font-medium">Unhealthy</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{metrics.databaseResponseTime || 0}ms</p>
            <p className="text-xs text-gray-600 font-medium">DB Response</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{metrics.usgsApiResponseTime || 0}ms</p>
            <p className="text-xs text-gray-600 font-medium">API Response</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{metrics.kvResponseTime || 0}ms</p>
            <p className="text-xs text-gray-600 font-medium">KV Response</p>
          </div>
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-xs text-gray-500 text-right mt-4">
        Last checked: {healthData.timestamp ? new Date(healthData.timestamp).toLocaleString() : 'Unknown'}
      </div>
    </div>
  );
}