import React, { useState, useEffect, memo } from 'react';
import { analyzeRegionalSeismicity, formatSeismicityDescription } from '../utils/seismicAnalysis.js';

/**
 * Component that provides educational context about regional seismicity,
 * including nearby faults, earthquake frequency, and likely mechanisms.
 * 
 * @component
 * @param {Object} props
 * @param {number} props.centerLat - Latitude of the analysis center point
 * @param {number} props.centerLng - Longitude of the analysis center point  
 * @param {Array} props.regionalQuakes - Array of regional earthquake data
 * @param {number} [props.radiusKm=200] - Analysis radius in kilometers
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.expanded=false] - Whether to show expanded view initially
 */
const RegionalSeismicityDescription = ({ 
  centerLat, 
  centerLng, 
  regionalQuakes = [], 
  radiusKm = 200,
  className = '',
  expanded = false 
}) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(expanded);

  useEffect(() => {
    if (typeof centerLat !== 'number' || typeof centerLng !== 'number') {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadAnalysis = async () => {
      try {
        const result = await analyzeRegionalSeismicity(centerLat, centerLng, regionalQuakes, radiusKm);
        if (isMounted) {
          setAnalysis(result);
        }
      } catch (err) {
        console.error('Error loading seismicity analysis:', err);
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAnalysis();

    return () => {
      isMounted = false;
    };
  }, [centerLat, centerLng, regionalQuakes, radiusKm]);

  if (loading) {
    return (
      <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-blue-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-blue-100 rounded w-full mb-1"></div>
          <div className="h-3 bg-blue-100 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
        <h3 className="text-sm font-medium text-gray-700 mb-1">Regional Seismicity</h3>
        <p className="text-xs text-gray-500">Analysis temporarily unavailable</p>
      </div>
    );
  }

  const formatted = formatSeismicityDescription(analysis);

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">{formatted.title}</h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-600 hover:text-blue-800 text-xs ml-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded px-1"
          aria-label={isExpanded ? 'Show less' : 'Show more'}
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      {/* Summary - always visible */}
      <p className="text-xs text-blue-700 leading-relaxed mb-3">
        {formatted.summary}
      </p>

      {/* Detailed breakdown - collapsible */}
      {isExpanded && (
        <div className="space-y-3 border-t border-blue-200 pt-3">
          {formatted.details.map((detail, index) => (
            <div key={index} className="text-xs">
              <div className="font-medium text-blue-800 mb-1">{detail.category}</div>
              <div className="text-blue-700 ml-2">{detail.content}</div>
              {detail.subcontent && (
                <div className="text-blue-600 ml-4 mt-1">{detail.subcontent}</div>
              )}
            </div>
          ))}

          {/* Technical details for expanded view */}
          {analysis && (
            <div className="mt-4 pt-3 border-t border-blue-200">
              <div className="text-xs text-blue-600">
                <div className="font-medium mb-2">Technical Details</div>
                
                {analysis.faultAnalysis.count > 0 && (
                  <div className="mb-2">
                    <span className="font-medium">Fault Types:</span>{' '}
                    {Object.entries(analysis.faultAnalysis.faultTypes)
                      .map(([type, count]) => `${type} (${count})`)
                      .join(', ')}
                  </div>
                )}
                
                <div className="mb-2">
                  <span className="font-medium">Magnitude Distribution:</span>{' '}
                  {Object.entries(analysis.frequencyAnalysis.magnitudeDistribution)
                    .filter(([, count]) => count > 0)
                    .map(([category, count]) => `${count} ${category}`)
                    .join(', ')}
                </div>

                {analysis.mechanismAnalysis.length > 0 && (
                  <div>
                    <span className="font-medium">Expected Magnitudes:</span>{' '}
                    M{analysis.mechanismAnalysis[0].typical_magnitudes}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      {!isExpanded && (
        <div className="text-xs text-blue-500 mt-2 italic">
          Click + for technical details and fault analysis
        </div>
      )}
    </div>
  );
};

export default memo(RegionalSeismicityDescription);