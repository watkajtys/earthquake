/**
 * @file src/components/monitoring/JulesTaskNode.jsx
 * @description Component to display Jules Task data.
 */

import React, { useState, useEffect } from 'react';

export default function JulesTaskNode() {
  const [taskData, setTaskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTaskData = async () => {
      try {
        const response = await fetch('/api/jules-task');
        if (!response.ok) {
          throw new Error(`Failed to fetch Jules Task data: ${response.status}`);
        }
        const data = await response.json();
        setTaskData(data);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTaskData();
  }, []);

  if (loading) {
    return <div>Loading Jules Task data...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="bg-white shadow-sm rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900">{taskData.taskName}</h3>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="px-4 py-5 bg-gray-50 rounded-lg overflow-hidden sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Last Run</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{new Date(taskData.lastRun).toLocaleString()}</dd>
        </div>
        <div className="px-4 py-5 bg-gray-50 rounded-lg overflow-hidden sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Status</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{taskData.status}</dd>
        </div>
        <div className="px-4 py-5 bg-gray-50 rounded-lg overflow-hidden sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Summary</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{taskData.summary}</dd>
        </div>
      </dl>
    </div>
  );
}
