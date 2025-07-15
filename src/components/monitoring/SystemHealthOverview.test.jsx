/**
 * @file src/components/monitoring/SystemHealthOverview.test.jsx
 * @description Tests for SystemHealthOverview component
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemHealthOverview from './SystemHealthOverview.jsx';

describe('SystemHealthOverview', () => {
  const mockHealthData = {
    timestamp: '2024-01-15T10:30:00.000Z',
    overall: 'healthy',
    components: {
      database: {
        status: 'healthy',
        message: 'D1 database operational',
        responseTime: 45,
        recentRecords: 156
      },
      usgsApi: {
        status: 'healthy',
        message: 'USGS API operational',
        responseTime: 1250,
        recentEarthquakes: 89
      },
      kvStorage: {
        status: 'healthy',
        message: 'KV storage operational',
        responseTime: 12
      },
      scheduledTasks: {
        status: 'healthy',
        message: 'Recent data updates detected',
        recentUpdates: 25
      }
    },
    metrics: {
      healthScore: 100,
      checkDuration: 1500,
      healthyComponents: 4,
      degradedComponents: 0,
      unhealthyComponents: 0,
      databaseResponseTime: 45,
      usgsApiResponseTime: 1250,
      kvResponseTime: 12
    }
  };

  it('should render loading state', () => {
    render(<SystemHealthOverview loading={true} />);
    
    expect(screen.getByText('System Health Overview')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('System Health Overview');
  });

  it('should render error state when no health data', () => {
    render(<SystemHealthOverview healthData={null} loading={false} />);
    
    expect(screen.getByText('Unable to load system health data')).toBeInTheDocument();
  });

  it('should render health data correctly', () => {
    render(<SystemHealthOverview healthData={mockHealthData} loading={false} />);
    
    // Check main heading
    expect(screen.getByText('System Health Overview')).toBeInTheDocument();
    
    // Check health score
    expect(screen.getByText('Health Score:')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    
    // Check component titles
    expect(screen.getByText('Database (D1)')).toBeInTheDocument();
    expect(screen.getByText('USGS API')).toBeInTheDocument();
    expect(screen.getByText('KV Storage')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Tasks')).toBeInTheDocument();
    
    // Check component messages
    expect(screen.getByText('D1 database operational')).toBeInTheDocument();
    expect(screen.getByText('USGS API operational')).toBeInTheDocument();
  });

  it('should display correct metrics', () => {
    render(<SystemHealthOverview healthData={mockHealthData} loading={false} />);
    
    // Check overall metrics section labels (these should be unique)
    expect(screen.getByText('DB Response')).toBeInTheDocument();
    expect(screen.getByText('API Response')).toBeInTheDocument();
    expect(screen.getByText('KV Response')).toBeInTheDocument();
    
    // Check component status labels
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
  });

  it('should handle degraded status', () => {
    const degradedHealthData = {
      ...mockHealthData,
      overall: 'degraded',
      components: {
        ...mockHealthData.components,
        usgsApi: {
          status: 'degraded',
          message: 'USGS API slow response',
          responseTime: 5000
        }
      },
      metrics: {
        ...mockHealthData.metrics,
        healthScore: 75,
        degradedComponents: 1,
        healthyComponents: 3
      }
    };

    render(<SystemHealthOverview healthData={degradedHealthData} loading={false} />);
    
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('USGS API slow response')).toBeInTheDocument();
  });
});