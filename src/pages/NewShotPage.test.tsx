import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NewShotPage } from './NewShotPage';
import { createShot } from '../lib/shots';

vi.mock('../lib/shots', () => ({
  createShot: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('NewShotPage', () => {
  it('creates a shot and navigates to its detail page', async () => {
    vi.mocked(createShot).mockResolvedValue({
      id: 'shot-1',
      user_id: 'user-1',
      grind_setting: '18',
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
      bean_name: null,
      roast_date: null,
      rating: null,
      tasting_note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/dose/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/yield/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/pull time/i), { target: { value: '28' } });
    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() =>
      expect(createShot).toHaveBeenCalledWith(
        expect.objectContaining({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 })
      )
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-1');
  });
});
