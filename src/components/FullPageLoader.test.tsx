import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FullPageLoader } from './FullPageLoader';

describe('FullPageLoader', () => {
  it('exposes an accessible loading status for screen readers', () => {
    render(<FullPageLoader />);
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows the app mark while loading', () => {
    const { container } = render(<FullPageLoader />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
