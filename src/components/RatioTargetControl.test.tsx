import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RatioTargetControl } from './RatioTargetControl';

describe('RatioTargetControl', () => {
  it('marks the Off button pressed when value is null', () => {
    render(<RatioTargetControl value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'No target' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Target 1:2' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the matching quick pick pressed', () => {
    render(<RatioTargetControl value={2.5} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Target 1:2.5' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onChange with the quick-pick value', () => {
    const onChange = vi.fn();
    render(<RatioTargetControl value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Target 1:3' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('clears the target when the active quick pick is clicked again', () => {
    const onChange = vi.fn();
    render(<RatioTargetControl value={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Target 1:2' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('hides the nudge buttons when there is no target', () => {
    render(<RatioTargetControl value={null} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Increase target' })).not.toBeInTheDocument();
  });

  it('nudges by 0.1 and shows the current value', () => {
    const onChange = vi.fn();
    render(<RatioTargetControl value={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase target' }));
    expect(onChange).toHaveBeenCalledWith(2.1);
    expect(screen.getByText('1:2.0')).toBeInTheDocument();
  });

  it('clamps the low end to 0.6', () => {
    const onChange = vi.fn();
    render(<RatioTargetControl value={0.6} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease target' }));
    expect(onChange).toHaveBeenCalledWith(0.6);
  });

  it('shows no quick pick pressed after nudging off a quick-pick value', () => {
    render(<RatioTargetControl value={2.4} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Target 1:2' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Target 1:2.5' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1:2.4')).toBeInTheDocument();
  });
});
