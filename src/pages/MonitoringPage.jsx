/**
 * @file src/pages/MonitoringPage.jsx
 * @description Performance monitoring dashboard page
 * Displays system health, task metrics, and performance analytics
 */

import React, { useState, useEffect, useCallback } from 'react';
import SystemHealthOverview from '../components/monitoring/SystemHealthOverview.jsx';
import TaskPerformanceChart from '../components/monitoring/TaskPerformanceChart.jsx';
import MetricsGrid from '../components/monitoring/MetricsGrid.jsx';
import LogViewer from '../components/monitoring/LogViewer.jsx';

/**
 * MonitoringPage component providing comprehensive system monitoring
 */
export default function MonitoringPage() {
  const [systemHealth, setSystemHealth] = useState(null);
  const [taskMetrics, setTaskMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState('hour');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch system health data
  const fetchSystemHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/system-health');
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const healthData = await response.json();
      setSystemHealth(healthData);
      return healthData;
    } catch (error) {
      console.error('Failed to fetch system health:', error);
      setError(`System health check failed: ${error.message}`);
      return null;
    }
  }, []);

  // Fetch task metrics data
  const fetchTaskMetrics = useCallback(async (timeRange = 'hour') => {
    try {
      const response = await fetch(`/api/task-metrics?timeRange=${timeRange}&includeDetails=true`);
      if (!response.ok) {
        throw new Error(`Task metrics failed: ${response.status}`);
      }
      const metricsData = await response.json();
      setTaskMetrics(metricsData);
      return metricsData;
    } catch (error) {
      console.error('Failed to fetch task metrics:', error);
      setError(`Task metrics failed: ${error.message}`);
      return null;
    }
  }, []);

  // Refresh all data
  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [healthData, metricsData] = await Promise.all([
        fetchSystemHealth(),
        fetchTaskMetrics(selectedTimeRange)
      ]);
      
      if (healthData || metricsData) {
        setLastUpdated(new Date());
      }
    } catch (error) {
      setError(`Failed to refresh monitoring data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [fetchSystemHealth, fetchTaskMetrics, selectedTimeRange]);

  // Initial data load
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, refreshData]);

  // Handle time range changes
  const handleTimeRangeChange = (newTimeRange) => {
    setSelectedTimeRange(newTimeRange);
    fetchTaskMetrics(newTimeRange);
  };

  // Determine overall system status
  const getSystemStatus = () => {
    if (!systemHealth) return 'unknown';
    return systemHealth.overall;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'unhealthy': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'healthy': return 'bg-green-50 border-green-200';
      case 'degraded': return 'bg-yellow-50 border-yellow-200';
      case 'unhealthy': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">
                System Monitoring
              </h1>
              <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusBg(getSystemStatus())}`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                  getSystemStatus() === 'healthy' ? 'bg-green-500' :
                  getSystemStatus() === 'degraded' ? 'bg-yellow-500' :
                  getSystemStatus() === 'unhealthy' ? 'bg-red-500' : 'bg-gray-500'
                }`}></span>
                <span className={getStatusColor(getSystemStatus())}>
                  {getSystemStatus().toUpperCase()}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4 mt-4 lg:mt-0">
              {/* Time Range Selector */}
              <select
                value={selectedTimeRange}
                onChange={(e) => handleTimeRangeChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hour">Last Hour</option>
                <option value="day">Last 24 Hours</option>
                <option value="week">Last 7 Days</option>
              </select>

              {/* Auto-refresh Toggle */}
              <label className="flex items-center space-x-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Auto-refresh</span>
              </label>

              {/* Manual Refresh */}
              <button
                onClick={refreshData}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Last Updated */}
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-2">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* System Health Overview */}
          <SystemHealthOverview 
            healthData={systemHealth}
            loading={loading}
          />

          {/* Performance Metrics Grid */}
          <MetricsGrid 
            metricsData={taskMetrics}
            healthData={systemHealth}
            timeRange={selectedTimeRange}
            loading={loading}
          />

          {/* Task Performance Chart */}
          <TaskPerformanceChart 
            metricsData={taskMetrics}
            timeRange={selectedTimeRange}
            loading={loading}
          />

          {/* Log Viewer */}
          <LogViewer 
            systemHealth={systemHealth}
            autoRefresh={autoRefresh}
          />
        </div>
      </div>
    </div>
  );
}