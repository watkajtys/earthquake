import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import SearchBar from './SearchBar';

describe('SearchBar', () => {
  it('calls onSearch with the correct value', () => {
    const mockOnSearch = jest.fn();
    const { getByPlaceholderText } = render(<SearchBar onSearch={mockOnSearch} />);

    const searchInput = getByPlaceholderText('Search by location...');

    fireEvent.change(searchInput, { target: { value: 'California' } });
    expect(mockOnSearch).toHaveBeenCalledWith('California');
  });
});
