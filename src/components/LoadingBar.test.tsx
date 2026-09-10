import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LoadingBar } from './LoadingBar';

describe('LoadingBar', () => {
  it('exposes an accessible loading status for screen readers', () => {
    render(<LoadingBar />);
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });
});
