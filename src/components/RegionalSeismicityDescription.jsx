import React, { useState, useEffect, memo, useMemo } from 'react';
import { analyzeRegionalSeismicity } from '../utils/seismicAnalysis.js';
import { prioritizeSeismicContent, generateAdaptiveSummary, selectRelevantDetails } from '../utils/contentPrioritization.js';
import { analyzeTemporalPatterns, analyzeRegionalStressField, predictMagnitudeFromFault } from '../utils/seismicOptimizations.js';

/**
 * Enhanced seismicity description with intelligent content prioritization,
 * advanced geological analysis, and adaptive user interface.
 * 
 * @component
 * @param {Object} props
 * @param {number} props.centerLat - Latitude of the analysis center point
 * @param {number} props.centerLng - Longitude of the analysis center point  
 * @param {Array} props.regionalQuakes - Array of regional earthquake data
 * @param {Object} [props.earthquakeData] - Specific earthquake data for context
 * @param {number} [props.radiusKm=200] - Analysis radius in kilometers
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.expanded=false] - Whether to show expanded view initially
 * @param {Object} [props.userContext] - User preferences and expertise level
 */
const RegionalSeismicityDescription = ({ 
  centerLat, 
  centerLng, 
  regionalQuakes = [], 
  earthquakeData = null,
  radiusKm = 200,
  className = '',
  expanded = false,
  userContext = {}
}) => {
  const [analysis, setAnalysis] = useState(null);
  const [temporalAnalysis, setTemporalAnalysis] = useState(null);
  const [stressAnalysis, setStressAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(expanded);

  // Memoized prioritization to prevent unnecessary recalculations
  const prioritizedContent = useMemo(() => {
    if (!analysis) return null;
    return prioritizeSeismicContent(analysis, earthquakeData, userContext);
  }, [analysis, earthquakeData, userContext]);

  // Adaptive summary generation
  const adaptiveSummary = useMemo(() => {
    if (!analysis) return '';
    return generateAdaptiveSummary(analysis, earthquakeData);
  }, [analysis, earthquakeData]);

  // Relevant details selection
  const relevantDetails = useMemo(() => {
    if (!analysis) return [];
    return selectRelevantDetails(analysis, earthquakeData, userContext.detailed ? 8 : 5);
  }, [analysis, earthquakeData, userContext]);

  useEffect(() => {
    if (typeof centerLat !== 'number' || typeof centerLng !== 'number') {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadEnhancedAnalysis = async () => {
      try {
        // Run analyses in parallel for better performance
        const [seismicResult, temporalResult] = await Promise.all([
          analyzeRegionalSeismicity(centerLat, centerLng, regionalQuakes, radiusKm),
          Promise.resolve(analyzeTemporalPatterns(regionalQuakes))
        ]);
        
        if (isMounted && seismicResult) {
          setAnalysis(seismicResult);
          setTemporalAnalysis(temporalResult);
          
          // Generate stress analysis if faults are available
          if (seismicResult.faultAnalysis?.count > 0) {
            const stressResult = analyzeRegionalStressField(
              await import('../utils/faultUtils.js').then(module => 
                module.filterNearbyFaults(centerLat, centerLng, radiusKm)
              ),
              regionalQuakes
            );
            setStressAnalysis(stressResult);
          }
        }
      } catch (err) {
        console.error('Error loading enhanced seismicity analysis:', err);
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadEnhancedAnalysis();

    return () => {
      isMounted = false;
    };
  }, [centerLat, centerLng, regionalQuakes, radiusKm]);

  // Auto-expand for urgent information
  useEffect(() => {
    if (prioritizedContent?.recommendedDisplay?.defaultExpanded && !isExpanded) {
      setIsExpanded(true);
    }
  }, [prioritizedContent, isExpanded]);

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
        <p className="text-xs text-gray-500">Enhanced analysis temporarily unavailable</p>
      </div>
    );
  }

  const hasUrgentInfo = prioritizedContent?.priorities?.urgent?.length > 0;
  const borderColor = hasUrgentInfo ? 'border-orange-300' : 'border-blue-200';
  const bgColor = hasUrgentInfo ? 'bg-orange-50' : 'bg-blue-50';
  const textColor = hasUrgentInfo ? 'text-orange-800' : 'text-blue-800';

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center">
          <h3 className={`text-sm font-semibold ${textColor} mb-2`}>
            Regional Seismicity Context
          </h3>
          {hasUrgentInfo && (
            <span className="ml-2 px-2 py-1 bg-orange-200 text-orange-800 text-xs rounded-full">
              ⚠️ Active
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`${hasUrgentInfo ? 'text-orange-600 hover:text-orange-800' : 'text-blue-600 hover:text-blue-800'} text-xs ml-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded px-1`}
          aria-label={isExpanded ? 'Show less' : 'Show more'}
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      {/* Urgent alerts - always visible if present */}
      {hasUrgentInfo && (
        <div className="mb-3 p-2 bg-orange-100 border border-orange-200 rounded">
          {prioritizedContent.priorities.urgent.map((alert, index) => (
            <div key={index} className="text-xs text-orange-800">
              <div className="font-medium">{alert.content}</div>
              {alert.action && (
                <div className="text-orange-700 mt-1">→ {alert.action}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Adaptive summary */}
      <p className={`text-xs ${hasUrgentInfo ? 'text-orange-700' : 'text-blue-700'} leading-relaxed mb-3`}>
        {adaptiveSummary}
      </p>

      {/* Relevant details - prioritized and filtered */}
      {isExpanded && (
        <div className="space-y-3 border-t border-current border-opacity-20 pt-3">
          {relevantDetails.map((detail, index) => (
            <div key={index} className="text-xs">
              <div className={`font-medium ${textColor} mb-1 flex items-center`}>
                {detail.priority === 'urgent' && <span className="mr-1">⚠️</span>}
                {detail.priority === 'important' && <span className="mr-1">●</span>}
                {detail.category}
              </div>
              <div className={`${hasUrgentInfo ? 'text-orange-700' : 'text-blue-700'} ml-2`}>
                {detail.content}
              </div>
              {detail.subcontent && (
                <div className={`${hasUrgentInfo ? 'text-orange-600' : 'text-blue-600'} ml-4 mt-1`}>
                  {detail.subcontent}
                </div>
              )}
            </div>
          ))}

          {/* Enhanced technical details */}
          {userContext.expertise === 'advanced' && analysis && (
            <div className="mt-4 pt-3 border-t border-current border-opacity-20">
              <div className={`text-xs ${hasUrgentInfo ? 'text-orange-600' : 'text-blue-600'}`}>
                <div className="font-medium mb-2">Advanced Analysis</div>
                
                {/* Temporal patterns */}
                {temporalAnalysis && temporalAnalysis.pattern !== 'insufficient_data' && (
                  <div className="mb-2">
                    <span className="font-medium">Temporal Pattern:</span>{' '}
                    {temporalAnalysis.pattern === 'swarm' 
                      ? `Earthquake swarm detected (${temporalAnalysis.swarms.length} swarm${temporalAnalysis.swarms.length > 1 ? 's' : ''})`
                      : `Mainshock sequence (${temporalAnalysis.mainshock.foreshocks} foreshocks, ${temporalAnalysis.mainshock.aftershocks} aftershocks)`
                    }
                  </div>
                )}

                {/* Stress field analysis */}
                {stressAnalysis && (
                  <div className="mb-2">
                    <span className="font-medium">Stress Regime:</span>{' '}
                    {stressAnalysis.interpretation}
                  </div>
                )}

                {/* Magnitude predictions for nearby faults */}
                {analysis.faultAnalysis.closestFault && (
                  <div className="mb-2">
                    <span className="font-medium">Potential Range:</span>{' '}
                    Based on closest fault characteristics: M5.0-7.5 typical
                  </div>
                )}

                {/* Standard technical details */}
                {analysis.faultAnalysis.count > 0 && (
                  <div className="mb-2">
                    <span className="font-medium">Fault Types:</span>{' '}
                    {Object.entries(analysis.faultAnalysis.faultTypes)
                      .map(([type, count]) => `${type} (${count})`)
                      .join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Smart footer */}
      {!isExpanded && (
        <div className={`text-xs ${hasUrgentInfo ? 'text-orange-500' : 'text-blue-500'} mt-2 italic`}>
          {prioritizedContent?.recommendedDisplay?.showTechnical 
            ? 'Click + for advanced geological analysis'
            : 'Click + for technical details and fault analysis'
          }
        </div>
      )}
    </div>
  );
};

export default memo(RegionalSeismicityDescription);