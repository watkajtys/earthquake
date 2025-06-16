import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import ActivityList from './ActivityList';

const mockQuake = {
  id: 'testquake1',
  properties: {
    mag: 5.5,
    place: 'Test Location 1',
    time: Date.now() - 1000 * 60 * 5, // 5 minutes ago
  },
};

const mockQuake2 = {
  id: 'testquake2',
  properties: {
    mag: 4.0,
    place: 'Test Location 2',
    time: Date.now() - 1000 * 60 * 60, // 1 hour ago
  },
};

const getMagnitudeColor = (mag) => {
  if (mag >= 5) return 'red';
  return 'green';
};

const formatTimeAgo = (ms) => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
};

describe('ActivityList', () => {
  it('renders null if latestFeelableQuakesSnippet is null or empty', () => {
    const { container: containerNull } = render(
      <ActivityList latestFeelableQuakesSnippet={null} />
    );
    expect(containerNull.firstChild).toBeNull();

    const { container: containerEmpty } = render(
      <ActivityList latestFeelableQuakesSnippet={[]} />
    );
    expect(containerEmpty.firstChild).toBeNull();
  });

  it('renders list of activities', () => {
    const quakes = [mockQuake, mockQuake2];
    render(
      <ActivityList
        latestFeelableQuakesSnippet={quakes}
        getMagnitudeColorStyle={getMagnitudeColor}
        formatTimeAgo={formatTimeAgo}
        handleQuakeClick={vi.fn()}
        navigate={vi.fn()}
      />
    );
    expect(screen.getByText('M 5.5')).toBeInTheDocument();
    expect(screen.getByText('Test Location 1')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument(); // Adjusted based on formatTimeAgo

    expect(screen.getByText('M 4.0')).toBeInTheDocument();
    expect(screen.getByText('Test Location 2')).toBeInTheDocument();
    expect(screen.getByText('1h ago')).toBeInTheDocument(); // Adjusted based on formatTimeAgo
  });

  it('calls handleQuakeClick when an activity is clicked', () => {
    const handleQuakeClickMock = vi.fn();
    const quakes = [mockQuake];
    render(
      <ActivityList
        latestFeelableQuakesSnippet={quakes}
        getMagnitudeColorStyle={getMagnitudeColor}
        formatTimeAgo={formatTimeAgo}
        handleQuakeClick={handleQuakeClickMock}
        navigate={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('M 5.5'));
    expect(handleQuakeClickMock).toHaveBeenCalledWith(mockQuake);
  });

  it('calls navigate when "View All Recent Activity" button is clicked', () => {
    const navigateMock = vi.fn();
    const quakes = [mockQuake];
    render(
      <ActivityList
        latestFeelableQuakesSnippet={quakes}
        getMagnitudeColorStyle={getMagnitudeColor}
        formatTimeAgo={formatTimeAgo}
        handleQuakeClick={vi.fn()}
        navigate={navigateMock}
      />
    );
    fireEvent.click(screen.getByText('View All Recent Activity'));
    expect(navigateMock).toHaveBeenCalledWith('/feeds?activeFeedPeriod=last_24_hours');
  });

  it('renders placeholder for place if not available', () => {
    const quakeWithoutPlace = {
      ...mockQuake,
      properties: { ...mockQuake.properties, place: null },
    };
    render(
      <ActivityList
        latestFeelableQuakesSnippet={[quakeWithoutPlace]}
        getMagnitudeColorStyle={getMagnitudeColor}
        formatTimeAgo={formatTimeAgo}
        handleQuakeClick={vi.fn()}
        navigate={vi.fn()}
      />
    );
    expect(screen.getByText('Location details pending...')).toBeInTheDocument();
  });
});
