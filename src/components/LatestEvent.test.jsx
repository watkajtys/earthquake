import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LatestEvent from './LatestEvent';

const mockGetMagnitudeColor = vi.fn((mag) => `color-for-mag-${mag}`);
const mockFormatDate = vi.fn((time) => `formatted-date-${time}`);
const mockHandleQuakeClick = vi.fn();

const mockQuakeData = {
  properties: {
    mag: 5.8,
    place: 'Test Location, CA',
    time: 1678886400000, // Example timestamp
  },
  geometry: {
    coordinates: [-122.0, 37.5, 10.2], // lon, lat, depth
  },
};

describe('LatestEvent', () => {
  it('renders correctly with lastMajorQuake data', () => {
    render(
      <LatestEvent
        lastMajorQuake={mockQuakeData}
        getMagnitudeColor={mockGetMagnitudeColor}
        formatDate={mockFormatDate}
        handleQuakeClick={mockHandleQuakeClick}
      />
    );

    expect(screen.getByText('Latest Significant Event')).toBeInTheDocument();
    expect(screen.getByText(`M ${mockQuakeData.properties.mag.toFixed(1)}`)).toBeInTheDocument();
    expect(screen.getByText(mockQuakeData.properties.place)).toBeInTheDocument();
    const expectedText = `formatted-date-${mockQuakeData.properties.time}, Depth: ${mockQuakeData.geometry.coordinates[2].toFixed(1)} km`;
    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Details' })).toBeInTheDocument();

    // Check if functions were called correctly
    expect(mockGetMagnitudeColor).toHaveBeenCalledWith(mockQuakeData.properties.mag);
    expect(mockFormatDate).toHaveBeenCalledWith(mockQuakeData.properties.time);

    // Check style from getMagnitudeColor
    const magnitudeElement = screen.getByText(`M ${mockQuakeData.properties.mag.toFixed(1)}`);
    expect(magnitudeElement).toHaveStyle({ color: `color-for-mag-${mockQuakeData.properties.mag}` });
  });

  it('renders correctly when place or depth is missing', () => {
    const quakeDataNoPlaceOrDepth = {
      properties: {
        mag: 6.1,
        time: 1678886500000,
        // place is missing
      },
      // geometry or geometry.coordinates[2] is missing
    };
    render(
      <LatestEvent
        lastMajorQuake={quakeDataNoPlaceOrDepth}
        getMagnitudeColor={mockGetMagnitudeColor}
        formatDate={mockFormatDate}
        handleQuakeClick={mockHandleQuakeClick}
      />
    );

    expect(screen.getByText('Location details pending...')).toBeInTheDocument();
    // Ensure depth is not displayed if missing
    const dateElement = screen.getByText(`formatted-date-${quakeDataNoPlaceOrDepth.properties.time}`);
    expect(dateElement.textContent).not.toContain('Depth:');
  });

  it('renders null if lastMajorQuake is not provided', () => {
    const { container } = render(
      <LatestEvent
        lastMajorQuake={null}
        getMagnitudeColor={mockGetMagnitudeColor}
        formatDate={mockFormatDate}
        handleQuakeClick={mockHandleQuakeClick}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls handleQuakeClick when "View Details" button is clicked', () => {
    render(
      <LatestEvent
        lastMajorQuake={mockQuakeData}
        getMagnitudeColor={mockGetMagnitudeColor}
        formatDate={mockFormatDate}
        handleQuakeClick={mockHandleQuakeClick}
      />
    );

    const viewDetailsButton = screen.getByRole('button', { name: 'View Details' });
    fireEvent.click(viewDetailsButton);
    expect(mockHandleQuakeClick).toHaveBeenCalledTimes(1);
    expect(mockHandleQuakeClick).toHaveBeenCalledWith(mockQuakeData);
  });
});
