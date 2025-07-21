import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AdvancedFilterPanel from './AdvancedFilterPanel';

describe('AdvancedFilterPanel', () => {
  it('renders all filter inputs', () => {
    render(<AdvancedFilterPanel />);
    expect(screen.getByLabelText('Min:')).toBeInTheDocument();
    expect(screen.getByLabelText('Max:')).toBeInTheDocument();
    expect(screen.getByLabelText('Min:')).toBeInTheDocument();
    expect(screen.getByLabelText('Max:')).toBeInTheDocument();
    expect(screen.getByLabelText('Latitude:')).toBeInTheDocument();
    expect(screen.getByLabelText('Longitude:')).toBeInTheDocument();
    expect(screen.getByLabelText('Radius (km):')).toBeInTheDocument();
  });

  it('allows input values to be changed', () => {
    render(<AdvancedFilterPanel />);
    const minMagInput = screen.getAllByLabelText('Min:')[0];
    fireEvent.change(minMagInput, { target: { value: '2.5' } });
    expect(minMagInput.value).toBe('2.5');
  });
});
