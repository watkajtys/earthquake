import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import FilterPanel from './FilterPanel';

describe('FilterPanel', () => {
  it('calls onFilterChange with the correct values', () => {
    const mockOnFilterChange = jest.fn();
    const { getByLabelText } = render(<FilterPanel onFilterChange={mockOnFilterChange} />);

    const minMagnitudeInput = getByLabelText('Min Magnitude:');
    const maxDepthInput = getByLabelText('Max Depth (km):');

    fireEvent.change(minMagnitudeInput, { target: { value: '4' } });
    expect(mockOnFilterChange).toHaveBeenCalledWith('minMagnitude', '4');

    fireEvent.change(maxDepthInput, { target: { value: '100' } });
    expect(mockOnFilterChange).toHaveBeenCalledWith('maxDepth', '100');
  });
});
