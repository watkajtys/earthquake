import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoadMoreDataButton from './LoadMoreDataButton';

const mockLoadMonthlyData = vi.fn();

describe('LoadMoreDataButton', () => {
  it('renders button when hasAttemptedMonthlyLoad is false', () => {
    render(
      <LoadMoreDataButton
        hasAttemptedMonthlyLoad={false}
        isLoadingMonthly={false}
        loadMonthlyData={mockLoadMonthlyData}
      />
    );
    const button = screen.getByRole('button', { name: 'Load 14 & 30-Day Data' });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('calls loadMonthlyData when button is clicked and not loading', () => {
    render(
      <LoadMoreDataButton
        hasAttemptedMonthlyLoad={false}
        isLoadingMonthly={false}
        loadMonthlyData={mockLoadMonthlyData}
      />
    );
    const button = screen.getByRole('button', { name: 'Load 14 & 30-Day Data' });
    fireEvent.click(button);
    expect(mockLoadMonthlyData).toHaveBeenCalledTimes(1);
  });

  it('renders button as "Loading Extended Data..." and disabled when isLoadingMonthly is true (and not yet attempted)', () => {
    render(
      <LoadMoreDataButton
        hasAttemptedMonthlyLoad={false}
        isLoadingMonthly={true}
        loadMonthlyData={mockLoadMonthlyData}
      />
    );
    const button = screen.getByRole('button', { name: 'Loading Extended Data...' });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('does not render button if hasAttemptedMonthlyLoad is true and isLoadingMonthly is false', () => {
    const { container } = render(
      <LoadMoreDataButton
        hasAttemptedMonthlyLoad={true}
        isLoadingMonthly={false}
        loadMonthlyData={mockLoadMonthlyData}
      />
    );
    // The component renders specific text when loading after attempt, but nothing if not loading and already attempted.
    // So, we check if the button is NOT there.
    expect(screen.queryByRole('button')).toBeNull();
    // And also that the "loading extended data archives..." paragraph is not there.
    expect(screen.queryByText('Loading extended data archives...')).toBeNull();
    // The component should render an empty fragment or null in this case based on its structure.
    expect(container.firstChild).toBeNull();
  });

  it('renders "Loading extended data archives..." message when hasAttemptedMonthlyLoad is true AND isLoadingMonthly is true', () => {
    render(
      <LoadMoreDataButton
        hasAttemptedMonthlyLoad={true}
        isLoadingMonthly={true}
        loadMonthlyData={mockLoadMonthlyData}
      />
    );
    expect(screen.getByText('Loading extended data archives...')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull(); // Button should not be present
  });
});
