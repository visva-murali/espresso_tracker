// src/components/BagSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BagSelector } from './BagSelector';

const bags = [
  { bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' },
  { bean_name: 'Colombia Huila', roast_date: '2026-08-20' },
];

describe('BagSelector', () => {
  it('shows the options after the button is clicked, and calls onSelect', () => {
    const onSelect = vi.fn();
    render(<BagSelector bags={bags} selected={null} onSelect={onSelect} label="Change" />);

    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);

    fireEvent.click(screen.getByRole('option', { name: 'Colombia Huila' }));
    expect(onSelect).toHaveBeenCalledWith(bags[1]);
  });
});
