import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Added beforeEach
import QuickFact from './QuickFact';
import InfoSnippet from './InfoSnippet'; // Added import for InfoSnippet

// Mock the InfoSnippet component
vi.mock('./InfoSnippet', () => ({
  default: vi.fn(() => <div data-testid="info-snippet">Mocked InfoSnippet</div>),
}));

const mockNavigate = vi.fn();

describe('QuickFact', () => {
  beforeEach(() => {
    // Clear mock call history before each test
    mockNavigate.mockClear();
    vi.mocked(InfoSnippet).mockClear();
  });

  it('renders correctly with title and InfoSnippet', () => {
    render(<QuickFact navigate={mockNavigate} />);

    expect(screen.getByText('Quick Fact')).toBeInTheDocument();
    expect(screen.getByTestId('info-snippet')).toBeInTheDocument();
    expect(InfoSnippet).toHaveBeenCalledTimes(1);
    expect(InfoSnippet).toHaveBeenCalledWith({ topic: 'magnitude' }, undefined); // Corrected expectation
    expect(screen.getByRole('button', { name: 'Learn More About Earthquakes' })).toBeInTheDocument();
  });

  it('calls navigate with "/learn" when the button is clicked', () => {
    render(<QuickFact navigate={mockNavigate} />);

    const learnMoreButton = screen.getByRole('button', { name: 'Learn More About Earthquakes' });
    fireEvent.click(learnMoreButton);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/learn');
  });
});
