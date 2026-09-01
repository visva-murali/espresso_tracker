import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShotDetailPage } from './ShotDetailPage';
import { getShot } from '../lib/shots';

vi.mock('../lib/shots', () => ({ getShot: vi.fn() }));

function renderAtShot(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/shots/${id}`]}>
      <Routes>
        <Route path="/shots/:id" element={<ShotDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ShotDetailPage', () => {
  it('renders the shot fields', async () => {
    vi.mocked(getShot).mockResolvedValue({
      id: 'shot-1',
      user_id: 'user-1',
      grind_setting: '18',
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
      bean_name: 'Colombia Huila',
      roast_date: null,
      rating: 4,
      tasting_note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Colombia Huila')).toBeInTheDocument());
    expect(screen.getByText('18 g')).toBeInTheDocument();
    expect(screen.getByText('36 g')).toBeInTheDocument();
  });

  it('shows a not-found message when the shot does not exist', async () => {
    vi.mocked(getShot).mockResolvedValue(null);

    renderAtShot('missing');

    await waitFor(() => expect(screen.getByText(/shot not found/i)).toBeInTheDocument());
  });
});
