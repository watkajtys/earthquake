/**
 * @file src/components/monitoring/LogViewer.jsx
 * @description Log viewer component for displaying system logs and events
 */

import React, { useState, useEffect } from 'react';

/**
 * LogViewer component displays recent system logs and events
 */
export default function LogViewer({ systemHealth, autoRefresh }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  // Fetch real system logs from the Worker logs API
  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/system-logs?limit=50');
        if (response.ok) {
          const data = await response.json();
          setLogs(data.logs || []);
        } else {
          console.error('Failed to fetch logs:', response.status);
          setLogs([]);
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    
    // Auto-refresh logs if autoRefresh is enabled
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 30000); // Refresh every 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const getLevelColor = (level) => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      case 'warn': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'debug': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'warn':
        return (
          <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    return log.level === filter;
  });

  const logLevels = ['all', 'error', 'warn', 'info', 'debug'];
  const logCounts = logLevels.reduce((counts, level) => {
    if (level === 'all') {
      counts[level] = logs.length;
    } else {
      counts[level] = logs.filter(log => log.level === level).length;
    }
    return counts;
  }, {});

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">System Logs</h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {autoRefresh && (
              <span className="inline-flex items-center">
                <span className="animate-pulse w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Live
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Log Level Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {logLevels.map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === level
                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
            }`}
          >
            {level.charAt(0).toUpperCase() + level.slice(1)} ({logCounts[level] || 0})
          </button>
        ))}
      </div>

      {/* Logs Display */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="mb-4">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-600 mb-2">Live Logs Interface</p>
            <p className="text-sm text-gray-500 mb-4">Real-time Worker logs are accessed via external tools</p>
            <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
              <p className="text-sm font-medium text-gray-700 mb-2">No recent logs available</p>
              <div className="space-y-1 text-sm text-gray-600">
                <p>• System activity logs will appear here</p>
                <p>• Based on database and API operations</p>
                <p>• Auto-refreshes when enabled</p>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Additional log access:</p>
                <p className="text-sm text-gray-600">• <code className="bg-gray-200 px-1 rounded">wrangler tail</code> - Complete execution logs</p>
              </div>
            </div>
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={log.id}
              className={`border rounded-lg p-3 transition-all hover:shadow-sm ${getLevelColor(log.level)}`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getLevelIcon(log.level)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium uppercase tracking-wide text-gray-700">
                        {log.component}
                      </span>
                      <span className="text-sm text-gray-600">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      log.level === 'error' ? 'bg-red-100 text-red-700' :
                      log.level === 'warn' ? 'bg-yellow-100 text-yellow-700' :
                      log.level === 'info' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {log.level.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-1">
                    {log.message}
                  </p>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                        View details
                      </summary>
                      <pre className="text-sm text-gray-700 mt-1 p-2 bg-white rounded border overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Log Statistics */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-4 gap-4 text-center text-sm">
          <div>
            <p className="text-2xl font-bold text-red-600">{logCounts.error || 0}</p>
            <p className="text-xs text-gray-600">Errors</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">{logCounts.warn || 0}</p>
            <p className="text-xs text-gray-600">Warnings</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600">{logCounts.info || 0}</p>
            <p className="text-xs text-gray-600">Info</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-600">{logs.length}</p>
            <p className="text-xs text-gray-600">Total</p>
          </div>
        </div>
      </div>

      {/* Note about enhanced logging implementation */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800 mb-2">
          <strong>Real System Logs:</strong> Displaying actual operational logs from your Worker infrastructure.
        </p>
        <div className="text-sm text-blue-700 space-y-1">
          <p><strong>Log Sources:</strong> Database activity, API connectivity, health checks, system events</p>
          <p><strong>Enhanced Logging:</strong> Powered by <code className="bg-blue-100 px-1 rounded mx-1">scheduledTaskLogger.js</code></p>
          <p><strong>Complete Logs:</strong> <code className="bg-blue-100 px-1 rounded">wrangler tail</code> for full execution details</p>
        </div>
      </div>
    </div>
  );
}