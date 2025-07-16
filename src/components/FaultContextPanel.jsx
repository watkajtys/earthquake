import React, { useState, useEffect } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

/**
 * FaultContextPanel - Museum-friendly display of fault information related to an earthquake
 * Prioritizes human-readable explanations while making technical details available
 */
function FaultContextPanel({ earthquake, className = '' }) {
  const [faultContext, setFaultContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedFaults, setExpandedFaults] = useState(new Set());

  useEffect(() => {
    if (earthquake?.id) {
      fetchFaultContext(earthquake.id);
    }
  }, [earthquake?.id]);

  const fetchFaultContext = async (earthquakeId) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/fault-context/${earthquakeId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setFaultContext(data);
    } catch (err) {
      console.error('Error fetching fault context:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFaultExpansion = (faultId) => {
    const newExpanded = new Set(expandedFaults);
    if (newExpanded.has(faultId)) {
      newExpanded.delete(faultId);
    } else {
      newExpanded.add(faultId);
    }
    setExpandedFaults(newExpanded);
  };

  if (loading) {
    return (
      <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-blue-200 rounded w-3/4 mb-3"></div>
          <div className="h-4 bg-blue-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-blue-200 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <h3 className="text-red-800 font-semibold mb-2">Unable to Load Fault Information</h3>
        <p className="text-red-700 text-sm">
          We couldn't retrieve fault information for this earthquake. Please try again later.
        </p>
      </div>
    );
  }

  if (!faultContext || faultContext.nearby_faults.length === 0) {
    return (
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
        <h3 className="text-gray-800 font-semibold mb-2">🗺️ Fault Context</h3>
        <p className="text-gray-700 text-sm">
          This earthquake occurred in an area with no major mapped faults nearby. 
          It may have happened on a small, unmapped fault or within the broader 
          regional stress field.
        </p>
      </div>
    );
  }

  const { nearby_faults, regional_context, educational_content } = faultContext;

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`}>
      <h3 className="text-blue-800 font-semibold mb-3">🗺️ Fault Context</h3>
      
      {/* Earthquake Story */}
      <div className="mb-4">
        <div className="bg-blue-100 rounded-lg p-3 mb-3">
          <h4 className="font-semibold text-blue-900 mb-2">What Happened?</h4>
          <p className="text-blue-800 text-sm">
            {educational_content.earthquake_story}
          </p>
        </div>
      </div>

      {/* Regional Summary */}
      <div className="mb-4">
        <p className="text-blue-700 text-sm mb-2">
          <strong>Regional Context:</strong> {regional_context.summary}
        </p>
        <p className="text-blue-600 text-xs">
          <strong>Fault Environment:</strong> {regional_context.fault_environment}
        </p>
      </div>

      {/* Nearby Faults */}
      <div className="space-y-3">
        <h4 className="font-semibold text-blue-900 mb-2">Nearby Faults</h4>
        
        {nearby_faults.map((fault) => (
          <FaultCard
            key={fault.fault_id}
            fault={fault}
            isExpanded={expandedFaults.has(fault.fault_id)}
            onToggle={() => toggleFaultExpansion(fault.fault_id)}
          />
        ))}
      </div>

      {/* Educational Content */}
      {educational_content.for_visitors && (
        <div className="mt-4 bg-blue-100 rounded-lg p-3">
          <h4 className="font-semibold text-blue-900 mb-2">For Museum Visitors</h4>
          <p className="text-blue-800 text-sm mb-2">
            <strong>Simple Explanation:</strong> {educational_content.for_visitors.simple_explanation}
          </p>
          <p className="text-blue-800 text-sm mb-2">
            <strong>Key Takeaway:</strong> {educational_content.for_visitors.key_takeaway}
          </p>
          <p className="text-blue-800 text-sm">
            <strong>Size Comparison:</strong> {educational_content.for_visitors.size_comparison}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * FaultCard - Individual fault display component with expandable details
 */
function FaultCard({ fault, isExpanded, onToggle }) {
  const getRelevanceColor = (score) => {
    if (score >= 0.7) return 'bg-green-100 text-green-800';
    if (score >= 0.4) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getActivityColor = (level) => {
    switch (level) {
      case 'Very Active': return 'bg-red-100 text-red-800';
      case 'Active': return 'bg-orange-100 text-orange-800';
      case 'Moderate': return 'bg-yellow-100 text-yellow-800';
      case 'Slow': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="border border-blue-300 rounded-lg p-3 bg-white">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h5 className="font-semibold text-blue-900">{fault.display_name}</h5>
          <p className="text-blue-700 text-sm">{fault.proximity_description}</p>
        </div>
        <button
          onClick={onToggle}
          className="flex items-center text-blue-600 hover:text-blue-800 text-sm"
        >
          {isExpanded ? (
            <>
              Less <ChevronUpIcon className="w-4 h-4 ml-1" />
            </>
          ) : (
            <>
              More <ChevronDownIcon className="w-4 h-4 ml-1" />
            </>
          )}
        </button>
      </div>

      {/* Basic Information */}
      <div className="mb-2">
        <p className="text-gray-700 text-sm mb-1">
          <strong>Movement:</strong> {fault.movement_description}
        </p>
        <p className="text-gray-700 text-sm mb-1">
          <strong>Speed:</strong> {fault.speed_description}
        </p>
        <p className="text-gray-700 text-sm">
          <strong>Relationship:</strong> {fault.relationship_description}
        </p>
      </div>

      {/* Activity Level Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActivityColor(fault.activity_level)}`}>
          {fault.activity_level}
        </span>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRelevanceColor(fault.relevance_score)}`}>
          {fault.relevance_score >= 0.7 ? 'High Relevance' : 
           fault.relevance_score >= 0.4 ? 'Moderate Relevance' : 'Low Relevance'}
        </span>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <h6 className="font-semibold text-gray-800 mb-1">Details</h6>
              <p className="text-gray-700 text-sm mb-1">
                <strong>Depth:</strong> {fault.depth_description}
              </p>
              <p className="text-gray-700 text-sm mb-1">
                <strong>Hazard:</strong> {fault.hazard_description}
              </p>
              <p className="text-gray-700 text-sm">
                <strong>Relevance:</strong> {fault.relevance_explanation}
              </p>
            </div>
            
            <div>
              <h6 className="font-semibold text-gray-800 mb-1">Scientific Data</h6>
              <div className="text-xs text-gray-600 space-y-1">
                <p><strong>Type:</strong> {fault.slip_type}</p>
                <p><strong>Slip Rate:</strong> {fault.net_slip_rate_best?.toFixed(1) || 'N/A'} mm/year</p>
                <p><strong>Length:</strong> {fault.length_km?.toFixed(0) || 'N/A'} km</p>
                <p><strong>Distance:</strong> {fault.distance_km} km</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FaultContextPanel;