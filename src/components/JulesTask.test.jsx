// src/components/JulesTask.test.jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import JulesTask from './JulesTask';

test('renders JulesTask component', () => {
    const title = 'Test Title';
    const handleClick = vi.fn();
    const { getByText } = render(<JulesTask title={title} onButtonClick={handleClick} />);

    expect(getByText(title)).toBeInTheDocument();
    expect(getByText('Click Me')).toBeInTheDocument();
});

test('calls onButtonClick when button is clicked', () => {
    const title = 'Test Title';
    const handleClick = vi.fn();
    const { getByText } = render(<JulesTask title={title} onButtonClick={handleClick} />);

    fireEvent.click(getByText('Click Me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
});
