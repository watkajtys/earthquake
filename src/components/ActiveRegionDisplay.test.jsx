import React from 'react';
import { render, screen } from '@testing-library/react';
import ActiveRegionDisplay from './ActiveRegionDisplay';

const REGIONS = [
  { name: 'Region A', color: '#FF0000' },
  { name: 'Region B', color: '#00FF00' },
  { name: 'Region C', color: '#0000FF' },
];

describe('ActiveRegionDisplay', () => {
  it('renders loading state', () => {
    render(
      <ActiveRegionDisplay
        isLoadingDaily={true}
        earthquakesLast24Hours={null}
        REGIONS={REGIONS}
      />
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders list of active regions', () => {
    const topActiveRegionsOverview = [
      { name: 'Region A', count: 5 },
      { name: 'Region B', count: 3 },
    ];
    render(
      <ActiveRegionDisplay
        topActiveRegionsOverview={topActiveRegionsOverview}
        REGIONS={REGIONS}
        isLoadingDaily={false}
        earthquakesLast24Hours={[]}
      />
    );
    expect(screen.getByText('1. Region A')).toBeInTheDocument();
    expect(screen.getByText('- 5 events')).toBeInTheDocument();
    expect(screen.getByText('2. Region B')).toBeInTheDocument();
    expect(screen.getByText('- 3 events')).toBeInTheDocument();
  });

  it('renders no significant activity message', () => {
    render(
      <ActiveRegionDisplay
        topActiveRegionsOverview={[]}
        REGIONS={REGIONS}
        isLoadingDaily={false}
        earthquakesLast24Hours={[]}
      />
    );
    expect(
      screen.getByText('(No significant regional activity in the last 24 hours)')
    ).toBeInTheDocument();
  });

  it('renders region name with color', () => {
    const topActiveRegionsOverview = [{ name: 'Region A', count: 5 }];
    render(
      <ActiveRegionDisplay
        topActiveRegionsOverview={topActiveRegionsOverview}
        REGIONS={REGIONS}
        isLoadingDaily={false}
        earthquakesLast24Hours={[]}
      />
    );
    const regionElement = screen.getByText('1. Region A');
    expect(regionElement).toHaveStyle('color: #FF0000');
  });

  it('renders region with default color if not found in REGIONS prop', () => {
    const topActiveRegionsOverview = [{ name: 'Region D', count: 2 }];
    render(
      <ActiveRegionDisplay
        topActiveRegionsOverview={topActiveRegionsOverview}
        REGIONS={REGIONS}
        isLoadingDaily={false}
        earthquakesLast24Hours={[]}
      />
    );
    const regionElement = screen.getByText('1. Region D');
    expect(regionElement).toHaveStyle('color: #9CA3AF');
  } );

  it('renders multiple regions correctly', () => {
    const topActiveRegionsOverview = [
      { name: 'Region C', count: 1 },
      { name: 'Region A', count: 8 },
    ];
    render(
      <ActiveRegionDisplay
        topActiveRegionsOverview={topActiveRegionsOverview}
        REGIONS={REGIONS}
        isLoadingDaily={false}
        earthquakesLast24Hours={[]}
      />
    );
    expect(screen.getByText('1. Region C')).toBeInTheDocument();
    expect(screen.getByText('- 1 events')).toBeInTheDocument();
    expect(screen.getByText('2. Region A')).toBeInTheDocument();
    expect(screen.getByText('- 8 events')).toBeInTheDocument();
  });
});
