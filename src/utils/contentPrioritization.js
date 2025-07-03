/**
 * Intelligent content prioritization for seismicity descriptions
 * Adapts information based on earthquake characteristics and user context
 */

export const prioritizeSeismicContent = (analysis, earthquakeData, userContext = {}) => {
  const priorities = {
    urgent: [],      // Immediate safety concerns
    important: [],   // Key geological context
    educational: [], // Background information
    technical: []    // Detailed scientific data
  };

  // Check for urgent conditions
  if (analysis?.frequencyAnalysis?.recentActivity) {
    priorities.urgent.push({
      type: 'recent_activity',
      content: `Recent seismic activity detected: ${analysis.frequencyAnalysis.recentCount} earthquake${analysis.frequencyAnalysis.recentCount > 1 ? 's' : ''} in past week`,
      action: 'Monitor for continued activity'
    });
  }

  // High seismicity warning
  if (analysis?.frequencyAnalysis?.level?.label === 'Very High') {
    priorities.urgent.push({
      type: 'high_activity',
      content: 'This region shows very high seismic activity levels',
      action: 'Consider earthquake preparedness measures'
    });
  }

  // Large magnitude potential
  if (analysis?.faultAnalysis?.closestFault?.distance < 15) {
    const faultName = analysis.faultAnalysis.closestFault.name;
    priorities.important.push({
      type: 'fault_proximity',
      content: `Very close to active fault: ${faultName}`,
      relevance: 'high'
    });
  }

  // Mechanism explanation (always important)
  if (analysis?.mechanismAnalysis?.length > 0) {
    const mechanism = analysis.mechanismAnalysis[0];
    priorities.important.push({
      type: 'mechanism',
      content: `Likely ${mechanism.type.toLowerCase()} faulting: ${mechanism.description}`,
      process: mechanism.process,
      relevance: 'high'
    });
  }

  // Educational content based on earthquake magnitude
  const magnitude = earthquakeData?.properties?.mag;
  if (magnitude) {
    if (magnitude >= 6.0) {
      priorities.educational.push({
        type: 'magnitude_significance',
        content: `M${magnitude} earthquakes are considered ${getMagnitudeClass(magnitude)}`,
        context: getMagnitudeContext(magnitude)
      });
    }
  }

  // Technical details (always last priority)
  if (analysis?.faultAnalysis?.faultTypes) {
    priorities.technical.push({
      type: 'fault_distribution',
      content: analysis.faultAnalysis.faultTypes,
      category: 'Fault type distribution'
    });
  }

  return {
    priorities,
    recommendedDisplay: getDisplayRecommendation(priorities, userContext)
  };
};

const getMagnitudeClass = (magnitude) => {
  if (magnitude >= 8.0) return 'great earthquakes';
  if (magnitude >= 7.0) return 'major earthquakes';
  if (magnitude >= 6.0) return 'strong earthquakes';
  if (magnitude >= 5.0) return 'moderate earthquakes';
  if (magnitude >= 4.0) return 'light earthquakes';
  return 'minor earthquakes';
};

const getMagnitudeContext = (magnitude) => {
  if (magnitude >= 8.0) return 'Can cause massive damage across very large areas and trigger tsunamis';
  if (magnitude >= 7.0) return 'Can cause serious damage over large areas';
  if (magnitude >= 6.0) return 'Can cause damage in populated areas';
  if (magnitude >= 5.0) return 'Felt widely, minor damage to buildings';
  if (magnitude >= 4.0) return 'Felt by most people, minimal damage';
  return 'Generally not felt by people';
};

const getDisplayRecommendation = (priorities, userContext) => {
  const hasUrgent = priorities.urgent.length > 0;
  const hasImportant = priorities.important.length > 0;
  
  return {
    defaultExpanded: hasUrgent, // Auto-expand if urgent info
    showTechnical: userContext.expertise === 'advanced',
    highlightUrgent: hasUrgent,
    summarizeIfLong: priorities.educational.length > 3,
    maxDisplayItems: userContext.detailed ? 10 : 5
  };
};

/**
 * Generate adaptive summary based on most important information
 */
export const generateAdaptiveSummary = (analysis, earthquakeData) => {
  const prioritized = prioritizeSeismicContent(analysis, earthquakeData);
  let summary = '';

  // Start with urgent information
  if (prioritized.priorities.urgent.length > 0) {
    const urgent = prioritized.priorities.urgent[0];
    summary += `⚠️ ${urgent.content}. `;
  }

  // Add most important geological context
  if (prioritized.priorities.important.length > 0) {
    const important = prioritized.priorities.important
      .filter(item => item.type === 'mechanism')[0];
    if (important) {
      summary += `${important.content}. `;
    }
  }

  // Add fault proximity if relevant
  const faultProximity = prioritized.priorities.important
    .find(item => item.type === 'fault_proximity');
  if (faultProximity) {
    summary += `${faultProximity.content}. `;
  }

  // Add educational context for significant earthquakes
  const magnitude = earthquakeData?.properties?.mag;
  if (magnitude && magnitude >= 5.0) {
    summary += `${getMagnitudeContext(magnitude)}. `;
  }

  return summary || analysis?.summary || 'Seismic analysis available.';
};

/**
 * Context-aware detail selection
 */
export const selectRelevantDetails = (analysis, earthquakeData, maxItems = 5) => {
  const prioritized = prioritizeSeismicContent(analysis, earthquakeData);
  const details = [];

  // Always include fault information if available
  if (analysis?.faultAnalysis?.count > 0) {
    details.push({
      category: 'Local Faults',
      content: `${analysis.faultAnalysis.count} active fault${analysis.faultAnalysis.count > 1 ? 's' : ''} within region`,
      priority: 'high',
      subcontent: analysis.faultAnalysis.closestFault ? 
        `Closest: ${analysis.faultAnalysis.closestFault.name} (${analysis.faultAnalysis.closestFault.distance.toFixed(1)}km)` : null
    });
  }

  // Include seismic activity level
  if (analysis?.frequencyAnalysis) {
    details.push({
      category: 'Activity Level',
      content: `${analysis.frequencyAnalysis.level.label} seismic activity`,
      priority: analysis.frequencyAnalysis.level.label === 'Very High' ? 'urgent' : 'important',
      subcontent: `${analysis.frequencyAnalysis.count} earthquakes in regional database`
    });
  }

  // Include mechanism if confidence is high
  if (analysis?.mechanismAnalysis?.length > 0) {
    const mechanism = analysis.mechanismAnalysis[0];
    if (mechanism.confidence === 'high') {
      details.push({
        category: 'Earthquake Type',
        content: `${mechanism.type} faulting likely`,
        priority: 'important',
        subcontent: mechanism.description
      });
    }
  }

  // Sort by priority and limit
  const priorityOrder = { urgent: 0, important: 1, educational: 2, technical: 3 };
  return details
    .sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3))
    .slice(0, maxItems);
};