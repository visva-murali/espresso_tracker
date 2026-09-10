import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PullTimeTargetControl } from './PullTimeTargetControl';

describe('PullTimeTargetControl', () => {
  it('marks the Off button pressed when value is null', () => {
    render(<PullTimeTargetControl value={null} onChange={vi.fn()} currentPullTime={30} />);
    expect(screen.getByRole('button', { name: 'No pull time target' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('turning it on seeds a window around the current pull time', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={null} onChange={onChange} currentPullTime={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'No pull time target' }));
    expect(onChange).toHaveBeenCalledWith([28, 32]);
  });

  it('seeds [25, 32] when the current pull time is not a positive number', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={null} onChange={onChange} currentPullTime={NaN} />);
    fireEvent.click(screen.getByRole('button', { name: 'No pull time target' }));
    expect(onChange).toHaveBeenCalledWith([25, 32]);
  });

  it('clicking Off while a range is set clears it', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={[26, 31]} onChange={onChange} currentPullTime={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'No pull time target' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('nudges each end by 1s', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={[26, 31]} onChange={onChange} currentPullTime={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase low' }));
    expect(onChange).toHaveBeenCalledWith([27, 31]);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease high' }));
    expect(onChange).toHaveBeenCalledWith([26, 30]);
  });

  it('keeps low below high when nudging', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={[30, 31]} onChange={onChange} currentPullTime={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase low' }));
    expect(onChange).toHaveBeenCalledWith([30, 31]);
  });

  it('shows the live position of the current pull time', () => {
    const { rerender } = render(
      <PullTimeTargetControl value={[26, 31]} onChange={vi.fn()} currentPullTime={30} />
    );
    expect(screen.getByText(/30s in range/)).toBeInTheDocument();
    rerender(<PullTimeTargetControl value={[26, 31]} onChange={vi.fn()} currentPullTime={34} />);
    expect(screen.getByText(/34s \+3s/)).toBeInTheDocument();
  });

  it('hides the steppers when there is no range', () => {
    render(<PullTimeTargetControl value={null} onChange={vi.fn()} currentPullTime={30} />);
    expect(screen.queryByRole('button', { name: 'Increase low' })).not.toBeInTheDocument();
  });
});
