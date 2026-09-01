import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditShotPage } from './EditShotPage';
import { getShot, updateShot } from '../lib/shots';

vi.mock('../lib/shots', () => ({ getShot: vi.fn(), updateShot: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('EditShotPage', () => {
  it('pre-fills the form and saves changes', async () => {
    vi.mocked(getShot).mockResolvedValue({
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
    vi.mocked(updateShot).mockResolvedValue({} as any);

    render(
      <MemoryRouter initialEntries={['/shots/shot-1/edit']}>
        <Routes>
          <Route path="/shots/:id/edit" element={<EditShotPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText(/grind setting/i)).toHaveValue('18'));

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateShot).toHaveBeenCalledWith(
        'shot-1',
        expect.objectContaining({ grind_setting: '20' })
      )
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-1');
  });
});
