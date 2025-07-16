import React, { useState, useEffect } from 'react';
import { MapPinIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

/**
 * FaultExplorer - Component for exploring faults in a given area
 * Museum-friendly interface for discovering local fault information
 */
function FaultExplorer({ 
  initialLat = 37.7749, 
  initialLon = -122.4194, 
  initialRadius = 50,
  className = '' 
}) {
  const [location, setLocation] = useState({
    lat: initialLat,
    lon: initialLon,
    radius: initialRadius
  });
  const [faults, setFaults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    activity_level: '',
    slip_type: ''
  });
  const [expandedFault, setExpandedFault] = useState(null);

  useEffect(() => {
    if (location.lat && location.lon) {
      searchFaults();
    }
  }, [location.lat, location.lon, location.radius, filters.activity_level, filters.slip_type]);

  const searchFaults = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lon: location.lon.toString(),
        radius: location.radius.toString(),
        limit: '20'
      });
      
      if (filters.activity_level) {
        params.append('activity_level', filters.activity_level);
      }
      if (filters.slip_type) {
        params.append('slip_type', filters.slip_type);
      }
      
      const response = await fetch(`/api/get-nearby-faults?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setFaults(data.faults || []);
    } catch (err) {
      console.error('Error searching faults:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationChange = (field, value) => {
    setLocation(prev => ({
      ...prev,
      [field]: field === 'radius' ? parseInt(value) : parseFloat(value)
    }));
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation(prev => ({
            ...prev,
            lat: position.coords.latitude,
            lon: position.coords.longitude
          }));
        },
        (error) => {
          console.error('Error getting current location:', error);
          setError('Unable to get current location. Please enter coordinates manually.');
        }
      );
    } else {
      setError('Geolocation is not supported by this browser');
    }
  };

  const toggleFaultExpansion = (faultId) => {
    setExpandedFault(expandedFault === faultId ? null : faultId);
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <h3 className="text-gray-800 font-semibold mb-4">🔍 Explore Local Faults</h3>
      
      {/* Search Controls */}
      <div className="mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={location.lat}
              onChange={(e) => handleLocationChange('lat', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="37.7749"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={location.lon}
              onChange={(e) => handleLocationChange('lon', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="-122.4194"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Radius (km)
            </label>
            <input
              type="number"
              min="1"
              max="500"
              value={location.radius}
              onChange={(e) => handleLocationChange('radius', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="50"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={getCurrentLocation}
            className="flex items-center px-3 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm"
          >
            <MapPinIcon className="w-4 h-4 mr-1" />
            Use My Location
          </button>
          
          <button
            onClick={searchFaults}
            disabled={loading}
            className="flex items-center px-3 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-sm disabled:opacity-50"
          >
            <MagnifyingGlassIcon className="w-4 h-4 mr-1" />
            {loading ? 'Searching...' : 'Search Faults'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Filters</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Activity Level</label>
            <select
              value={filters.activity_level}
              onChange={(e) => handleFilterChange('activity_level', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Activity Levels</option>
              <option value="Very Active">Very Active</option>
              <option value="Active">Active</option>
              <option value="Moderate">Moderate</option>
              <option value="Slow">Slow</option>
              <option value="Very Slow">Very Slow</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-600 mb-1">Movement Type</label>
            <select
              value={filters.slip_type}
              onChange={(e) => handleFilterChange('slip_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Movement Types</option>
              <option value="Dextral">Dextral (Right-lateral)</option>
              <option value="Sinistral">Sinistral (Left-lateral)</option>
              <option value="Reverse">Reverse (Thrust)</option>
              <option value="Normal">Normal</option>
              <option value="Dextral-Normal">Dextral-Normal</option>
              <option value="Sinistral-Normal">Sinistral-Normal</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      <div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : faults.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No faults found in the specified area.</p>
            <p className="text-sm mt-1">Try expanding the search radius or adjusting filters.</p>
          </div>
        ) : (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              Found {faults.length} fault{faults.length !== 1 ? 's' : ''} within {location.radius}km
            </h4>
            <div className="space-y-3">
              {faults.map(fault => (
                <FaultExplorerCard
                  key={fault.fault_id}
                  fault={fault}
                  isExpanded={expandedFault === fault.fault_id}
                  onToggle={() => toggleFaultExpansion(fault.fault_id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * FaultExplorerCard - Individual fault card for the explorer
 */
function FaultExplorerCard({ fault, isExpanded, onToggle }) {
  const getActivityColor = (level) => {
    switch (level) {
      case 'Very Active': return 'bg-red-500';
      case 'Active': return 'bg-orange-500';
      case 'Moderate': return 'bg-yellow-500';
      case 'Slow': return 'bg-blue-500';
      case 'Very Slow': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getMovementIcon = (slipType) => {
    switch (slipType) {
      case 'Dextral':
      case 'Sinistral':
        return '↔️';
      case 'Reverse':
        return '↗️';
      case 'Normal':
        return '↘️';
      default:
        return '🔄';
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h5 className="font-semibold text-gray-800">{fault.display_name}</h5>
            <span className="text-lg">{getMovementIcon(fault.scientific_details.slip_type)}</span>
          </div>
          <p className="text-blue-600 text-sm font-medium">{fault.proximity_description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getActivityColor(fault.activity_level)}`} title={fault.activity_level}></div>
          <button
            onClick={onToggle}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {/* Always visible content */}
      <div className="mb-2">
        <p className="text-gray-700 text-sm mb-1">
          <strong>Movement:</strong> {fault.movement_description}
        </p>
        <p className="text-gray-700 text-sm mb-1">
          <strong>Activity:</strong> {fault.activity_level} - {fault.speed_description}
        </p>
        <p className="text-gray-700 text-sm">
          <strong>Hazard:</strong> {fault.hazard_description}
        </p>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h6 className="font-semibold text-gray-800 mb-2">Details</h6>
              <div className="text-sm text-gray-700 space-y-1">
                <p><strong>Depth:</strong> {fault.depth_description}</p>
                <p><strong>Distance:</strong> {fault.distance_km} km away</p>
                <p><strong>Length:</strong> {fault.scientific_details.length_km?.toFixed(0) || 'N/A'} km</p>
              </div>
            </div>
            
            <div>
              <h6 className="font-semibold text-gray-800 mb-2">Scientific Data</h6>
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>Type:</strong> {fault.scientific_details.slip_type}</p>
                <p><strong>Slip Rate:</strong> {fault.scientific_details.net_slip_rate_best?.toFixed(1) || 'N/A'} mm/year</p>
                <p><strong>Dip:</strong> {fault.scientific_details.average_dip || 'N/A'}°</p>
                <p><strong>Rake:</strong> {fault.scientific_details.average_rake || 'N/A'}°</p>
                <p><strong>Catalog:</strong> {fault.scientific_details.catalog_name}</p>
              </div>
            </div>
          </div>
          
          {/* Educational explanation */}
          <div className="mt-3 bg-blue-50 rounded-lg p-3">
            <h6 className="font-semibold text-blue-900 mb-1">What This Means</h6>
            <p className="text-blue-800 text-sm">
              This fault {fault.movement_description.toLowerCase()} and is {fault.activity_level.toLowerCase()}. 
              {fault.activity_level === 'Very Active' || fault.activity_level === 'Active' ? 
                ' This makes it an important source of earthquake hazard in the region.' :
                ' While less active than major faults, it still contributes to regional seismic hazard.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default FaultExplorer;